/**
 * opencode rules (AGENTS.md / CLAUDE.md) and `instructions` memory bridging.
 *
 * opencode loads, with first-match-wins per category:
 *
 * - a global rules file: `~/.config/opencode/AGENTS.md`, falling back to
 *   `~/.claude/CLAUDE.md` when absent (Claude Code compatibility, unless
 *   disabled by config)
 * - one project rules file: the closest `AGENTS.md` walking up from the
 *   working directory to the git root, falling back to the closest
 *   `CLAUDE.md` (compatibility)
 * - `instructions` entries from `opencode.json(c)`: local file paths and glob
 *   patterns, resolved against the config file's directory (remote URLs are
 *   skipped — the bridge does not fetch them)
 *
 * DSH's own instruction loader already reads the workspace-root `AGENTS.md`
 * and root-level `CLAUDE.md`, so the bridge skips a project file whose
 * content duplicates the root `AGENTS.md` DSH loads. The framing matches
 * DSH's workspace-instruction `<system-reminder>` style.
 * @module dsh-bridges/agents/opencode/memory
 */
import { dirname, isAbsolute, join, normalize } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose, expandHome } from '../../util.js'
import type { OpencodeSettingsLoader } from './settings.js'

export interface MemoryConfig {
  userOpencodeDir: string
  /** User-level Claude Code directory for the CLAUDE.md fallback. */
  userClaudeDir: string
  /** Whether the Claude Code fallbacks (CLAUDE.md) are consulted. */
  claudeCompat: boolean
  maxBytes: number
}

const PLUGIN_SOURCE = 'opencode-memory'
const MAX_READ_CHARS = 1024 * 1024
/** Recursion bound for the upward project walk (also breaks symlink cycles). */
const MAX_WALK_DEPTH = 32

interface MemorySection {
  kind: 'user' | 'project'
  label: string
  content: string
}

export function registerMemory(
  ctx: Context,
  logger: BridgeLogger,
  fs: FsAdapter,
  loader: OpencodeSettingsLoader,
  config: MemoryConfig,
): void {
  ctx.on('agent/session-start', (payload) => {
    // On resume the original injection is still part of the durable session
    // history; re-adding it would duplicate the block. Fresh starts, clears,
    // and compactions re-seed the instructions.
    if (payload.source === 'resume') return
    void injectMemory(payload.agent, logger, fs, loader, config)
  })
}

async function injectMemory(
  agent: Agent,
  logger: BridgeLogger,
  fs: FsAdapter,
  loader: OpencodeSettingsLoader,
  config: MemoryConfig,
): Promise<void> {
  try {
    const cwd = agent.session.header.cwd
    const sections = await collectMemorySections(cwd, logger, fs, loader, config)
    if (sections.length === 0) return
    let rendered = renderSections(sections)
    if (rendered.length > config.maxBytes) {
      // Budget: drop the broader (user) files first, then truncate the most
      // specific ones — the same strategy as DSH's own instruction loader.
      const projectOnly = sections.filter((section) => section.kind === 'project')
      rendered = renderSections(projectOnly)
      if (rendered.length > config.maxBytes) {
        const marker = '\n\n[workspace instructions truncated by the opencode bridge]\n'
        rendered = rendered.slice(0, Math.max(0, config.maxBytes - marker.length)) + marker
      }
    }
    agent.inject(
      createUserMessage({
        content: [{ type: 'text', text: rendered }],
        source: { kind: 'plugin', plugin: PLUGIN_SOURCE },
      }),
    )
  } catch (error) {
    logger.warn(`opencode: failed to load rules memory: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Collect the memory sections for one working directory (exported for tests). */
export async function collectMemorySections(
  cwd: string | undefined,
  logger: BridgeLogger,
  fs: FsAdapter,
  loader: OpencodeSettingsLoader,
  config: MemoryConfig,
): Promise<MemorySection[]> {
  const sections: MemorySection[] = []
  const userDir = expandHome(config.userOpencodeDir)

  // Global rules: opencode's own AGENTS.md wins; CLAUDE.md is the
  // compatibility fallback (the claude-code bridge also injects it when
  // enabled — see the README note about overlapping bridges).
  const globalFile = await readOptional(fs, join(userDir, 'AGENTS.md'))
  if (globalFile !== undefined) {
    sections.push({ kind: 'user', label: join(userDir, 'AGENTS.md'), content: globalFile })
  } else if (config.claudeCompat) {
    const fallback = await readOptional(fs, join(expandHome(config.userClaudeDir), 'CLAUDE.md'))
    if (fallback !== undefined) {
      sections.push({ kind: 'user', label: join(expandHome(config.userClaudeDir), 'CLAUDE.md'), content: fallback })
    }
  }

  if (cwd) {
    // Project rules: the closest AGENTS.md walking up to the git root, then
    // the closest CLAUDE.md as the compatibility fallback. First match wins
    // per category, exactly like opencode.
    const projectFile =
      (await findClosestRuleFile(fs, cwd, 'AGENTS.md')) ??
      (config.claudeCompat ? await findClosestRuleFile(fs, cwd, 'CLAUDE.md') : undefined)
    if (projectFile !== undefined) {
      // DSH's own instruction loader reads the workspace root's AGENTS.md
      // and CLAUDE.md (the session cwd), so skip exactly those two files.
      const dshLoaded = projectFile.path === join(cwd, 'AGENTS.md') || projectFile.path === join(cwd, 'CLAUDE.md')
      if (!dshLoaded) sections.push({ kind: 'project', label: relativeLabel(cwd, projectFile.path), content: projectFile.content })
    }

    // Extra instruction files from opencode.json(c), in listed order.
    try {
      const settings = await loader.load(cwd)
      for (const section of await collectInstructionSections(fs, settings.instructions.entries, settings.instructions.baseDir, logger)) {
        sections.push({ kind: 'project', ...section })
      }
    } catch (error) {
      logger.warn(`opencode: cannot read instructions config: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return dedupeSections(sections)
}

/** The closest `<name>` file walking up from `dir` until the git root (or a depth cap). */
async function findClosestRuleFile(fs: FsAdapter, start: string, name: string): Promise<{ path: string; content: string } | undefined> {
  let dir: string = start
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    const candidate = join(dir, name)
    const text = await readOptional(fs, candidate)
    if (text !== undefined) return { path: candidate, content: text }
    if (await isGitRoot(fs, dir)) return undefined
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
  return undefined
}

async function isGitRoot(fs: FsAdapter, dir: string): Promise<boolean> {
  return fs.dirExists(join(dir, '.git'))
}

/** Expand the `instructions` entries into readable local files; URLs are skipped. */
async function collectInstructionSections(
  fs: FsAdapter,
  entries: readonly string[],
  baseDir: string,
  logger: BridgeLogger,
): Promise<{ label: string; content: string }[]> {
  const sections: { label: string; content: string }[] = []
  for (const entry of entries) {
    if (/^https?:\/\//i.test(entry)) {
      logger.debug(`opencode: skipping remote instructions URL ${entry} (not bridged)`)
      continue
    }
    const resolved = entry.startsWith('~') ? expandHome(entry) : entry
    const absolute = resolveAgainstBase(resolved, baseDir)
    if (hasGlob(absolute)) {
      for (const file of await expandGlob(fs, absolute)) {
        const content = await readOptional(fs, file)
        if (content !== undefined && content.trim() !== '') sections.push({ label: file, content })
      }
      continue
    }
    const content = await readOptional(fs, absolute)
    if (content !== undefined && content.trim() !== '') sections.push({ label: absolute, content })
  }
  return sections
}

function resolveAgainstBase(entry: string, baseDir: string): string {
  return isAbsolute(entry) ? entry : join(baseDir, entry)
}

function hasGlob(path: string): boolean {
  return /[*?[\]]/.test(path)
}

/** Minimal `*`/`**`/`?` glob expansion over directory entries (no character classes). */
async function expandGlob(fs: FsAdapter, pattern: string): Promise<string[]> {
  const absolute = isAbsolute(pattern) ? pattern : join(process.cwd(), pattern)
  const parts = absolute.split(/[\\/]+/).filter((part) => part !== '' && part !== '.')
  let current = [absolute.startsWith('/') ? '/' : /^[A-Za-z]:/.test(parts[0] ?? '') ? (parts.shift() ?? '') + '\\' : '']
  for (const part of parts) {
    const next: string[] = []
    const isDoubleStar = part === '**'
    const partRegex = part === '*' || isDoubleStar ? null : new RegExp(`^${globToRegex(part)}$`)
    for (const dir of current) {
      let entries
      try {
        entries = await fs.listDir(dir)
      } catch {
        continue
      }
      if (isDoubleStar) {
        next.push(dir)
        for (const entry of entries) {
          if (entry.isDir) next.push(join(dir, entry.name))
        }
        continue
      }
      for (const entry of entries) {
        if (partRegex === null || partRegex.test(entry.name)) next.push(join(dir, entry.name))
      }
    }
    current = next
    if (current.length === 0) return []
  }
  const files: string[] = []
  for (const path of current) {
    try {
      if (await fs.fileExists(path)) files.push(path)
    } catch {
      // skip unreadable candidates
    }
  }
  return files
}

function globToRegex(part: string): string {
  let regex = ''
  for (const char of part) {
    if (char === '*') regex += '.*'
    else if (char === '?') regex += '.'
    else regex += char.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')
  }
  return regex
}

function relativeLabel(cwd: string, path: string): string {
  const normalized = normalize(path)
  const base = normalize(cwd)
  return normalized.startsWith(base + '/') ? normalized.slice(base.length + 1) : normalized
}

/** Collapse sections whose trimmed content already appeared (e.g. both CLAUDE.md fallback positions). */
function dedupeSections(sections: MemorySection[]): MemorySection[] {
  const seen = new Set<string>()
  const result: MemorySection[] = []
  for (const section of sections) {
    const key = section.content.trim()
    if (key === '' || seen.has(key)) continue
    seen.add(key)
    result.push(section)
  }
  return result
}

function renderSections(sections: MemorySection[]): string {
  const body = sections.map((section) => `Instructions from: ${section.label}\n\n${escapeReminderClose(section.content)}`).join('\n\n')
  return (
    '<system-reminder>\n' +
    'The following opencode instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.\n\n' +
    body +
    '\n</system-reminder>'
  )
}

async function readOptional(fs: FsAdapter, path: string): Promise<string | undefined> {
  try {
    if (!(await fs.fileExists(path))) return undefined
    const text = await fs.readText(path)
    return text.length > MAX_READ_CHARS ? text.slice(0, MAX_READ_CHARS) : text
  } catch {
    return undefined
  }
}
