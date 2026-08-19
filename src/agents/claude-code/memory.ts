/**
 * CLAUDE.md memory bridging.
 *
 * DSH's own instruction loader reads `AGENTS.md`, `CLAUDE.md`, and their
 * `.local` variants at every directory from the project root down to the
 * working directory. Claude Code additionally reads `~/.claude/CLAUDE.md`
 * (user), `./.claude/CLAUDE.md` (project), `CLAUDE.local.md` files in the
 * directory hierarchy above the project root, and the
 * `permissions.additionalDirectories` memory files; this module injects those
 * at session start with the same framing DSH uses for workspace instructions.
 * @module dsh-bridges/agents/claude-code/memory
 */
import { dirname, join, normalize, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose, expandHome } from '../../util.js'
import type { SettingsLoader } from './hooks/settings.js'

export interface MemoryConfig {
  userClaudeDir: string
  maxBytes: number
  /** Settings loader for `permissions.additionalDirectories` memory files. */
  settingsLoader?: SettingsLoader
}

const PLUGIN_SOURCE = 'dsh-bridges:CLAUDE.md'
const MAX_READ_CHARS = 1024 * 1024
/** Cap on the upward hierarchy walk (also breaks symlink cycles). */
const MAX_WALK_DEPTH = 32

export interface MemorySection {
  kind: 'user' | 'project' | 'hierarchy' | 'additional' | 'output-style' | 'auto-memory'
  label: string
  content: string
}

export function registerMemory(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: MemoryConfig): void {
  ctx.on('agent/session-start', (payload) => {
    // On resume the original injection is still part of the durable session
    // history; re-adding it would duplicate the block. Fresh starts, clears,
    // and compactions re-seed the instructions.
    if (payload.source === 'resume') return
    void injectMemory(payload.agent, logger, fs, config)
  })
}

async function injectMemory(agent: Agent, logger: BridgeLogger, fs: FsAdapter, config: MemoryConfig): Promise<void> {
  try {
    const sections = await collectMemorySections(agent.session.header.cwd, logger, fs, config)
    if (sections.length === 0) return
    let rendered = renderSections(sections)
    if (rendered.length > config.maxBytes) {
      // Budget: drop the broader (user) file first, then truncate the most
      // specific one — the same strategy as DSH's own instruction loader.
      const withoutUser = sections.filter((section) => section.kind !== 'user')
      rendered = renderSections(withoutUser)
      if (rendered.length > config.maxBytes) {
        const marker = '\n\n[workspace instructions truncated by the claude-code bridge]\n'
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
    logger.warn(`claude-code: failed to load CLAUDE.md memory: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Collect the memory sections for one workspace, broadest first: the user
 * `~/.claude/CLAUDE.md`, then the ancestor hierarchy above DSH's project
 * root (filesystem-root first, `CLAUDE.md` then `CLAUDE.local.md` per
 * directory), then the `permissions.additionalDirectories` files, then the
 * project `.claude/CLAUDE.md`. `CLAUDE.md` / `CLAUDE.local.md` files DSH's
 * own loader reads (every directory from the project root down to the cwd)
 * are skipped.
 */
export async function collectMemorySections(
  cwd: string | undefined,
  logger: BridgeLogger,
  fs: FsAdapter,
  config: MemoryConfig,
): Promise<MemorySection[]> {
  const sections: MemorySection[] = []
  const userClaudeDir = expandHome(config.userClaudeDir)
  const userText = await readOptional(fs, join(userClaudeDir, 'CLAUDE.md'))
  if (userText !== undefined) {
    sections.push({ kind: 'user', label: join(userClaudeDir, 'CLAUDE.md'), content: userText })
  }
  if (!cwd) return sections
  const rootText = await readOptional(fs, join(cwd, 'CLAUDE.md'))
  const isRootDuplicate = (text: string | undefined): boolean =>
    text !== undefined && rootText !== undefined && text.trim() === rootText.trim()

  // DSH's own instruction loader reads AGENTS.md / CLAUDE.md (plus the
  // `.local` variants) at every directory from its project root down to the
  // cwd; skip those files instead of injecting the same block twice.
  const dshRoot = await findRepositoryRoot(cwd, fs)
  const dshLoaded = (dir: string, name: string): boolean =>
    (name === 'CLAUDE.md' || name === 'CLAUDE.local.md') && isWithinChain(dir, dshRoot)

  // Ancestors above the working directory, filesystem-root first.
  for (const dir of ancestorDirs(cwd)) {
    for (const name of ['CLAUDE.md', 'CLAUDE.local.md']) {
      const text = await readOptional(fs, join(dir, name))
      if (text === undefined) continue
      if (dshLoaded(dir, name)) continue
      if (name === 'CLAUDE.md' && isRootDuplicate(text)) continue // core already loaded identical content
      sections.push({ kind: 'hierarchy', label: join(dir, name), content: text })
    }
  }

  const projectText = await readOptional(fs, join(cwd, '.claude', 'CLAUDE.md'))
  if (projectText !== undefined && !isRootDuplicate(projectText)) {
    // Collapse with the root-level CLAUDE.md DSH already loads when the
    // contents are identical, mirroring the sibling-dedup of the core loader.
    sections.push({ kind: 'project', label: '.claude/CLAUDE.md', content: projectText })
  }

  // `permissions.additionalDirectories` memory files.
  if (config.settingsLoader !== undefined) {
    const settings = await config.settingsLoader.load(cwd)
    for (const dir of settings.permissions.additionalDirectories) {
      const base = dir.startsWith('~') ? expandHome(dir) : join(cwd, dir)
      for (const name of ['CLAUDE.md', 'CLAUDE.local.md']) {
        const text = await readOptional(fs, join(base, name))
        if (text === undefined) continue
        if (dshLoaded(base, name)) continue
        if (name === 'CLAUDE.md' && isRootDuplicate(text)) continue
        sections.push({ kind: 'additional', label: join(base, name), content: text })
      }
    }
  }

  // The cwd-level CLAUDE.local.md: DSH's own loader reads it, so the bridge
  // never re-injects it.

  // `outputStyle`: the named style's prompt section (project file first, then
  // user file — the upstream lookup order).
  if (config.settingsLoader !== undefined) {
    const loadedSettings = await config.settingsLoader.load(cwd)
    const styleName = loadedSettings.outputStyle
    if (styleName !== undefined) {
      // Upstream looks the style up as a plain file name in a fixed
      // directory; reject anything path-like so a hostile settings.json
      // cannot read arbitrary files outside the style roots.
      if (!/^[\w-]+$/.test(styleName)) {
        logger.warn(`claude-code: ignoring outputStyle ${JSON.stringify(styleName)}: style names must be plain file names`)
      } else {
        const styleText =
          (await readOptional(fs, join(cwd, '.claude', 'output-styles', `${styleName}.md`))) ??
          (await readOptional(fs, join(userClaudeDir, 'output-styles', `${styleName}.md`)))
        if (styleText !== undefined) sections.push({ kind: 'output-style', label: `outputStyle: ${styleName}`, content: styleText })
      }
    }
    // Auto memory: with an explicit `autoMemoryDirectory`, the MEMORY.md
    // index (plus topic files it references are loaded by the agent's reads)
    // is injected. The default per-project hashed directory cannot be
    // derived, so only the explicit form is bridged (documented limitation).
    if (loadedSettings.autoMemoryDirectory !== undefined) {
      const memoryFile = join(expandHome(loadedSettings.autoMemoryDirectory), 'MEMORY.md')
      const memoryText = await readOptional(fs, memoryFile)
      if (memoryText !== undefined)
        sections.push({ kind: 'auto-memory', label: `${loadedSettings.autoMemoryDirectory}/MEMORY.md`, content: memoryText })
    }
  }
  return sections
}

/** Ancestor directories above `cwd`, filesystem-root first (excluding cwd). */
function ancestorDirs(cwd: string): string[] {
  const dirs: string[] = []
  let dir = dirname(cwd)
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    dirs.unshift(dir)
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return dirs
}

/** The dsh project root: the first directory on the upward walk containing `.git`. */
async function findRepositoryRoot(cwd: string, fs: FsAdapter): Promise<string> {
  let dir: string = cwd
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (await fs.dirExists(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return cwd // no repository root: DSH's chain starts at the cwd
}

/** True when `dir` sits on DSH's instruction chain (`root` down to `cwd`). */
function isWithinChain(dir: string, root: string): boolean {
  const d = normalize(dir)
  const r = normalize(root)
  return d === r || d.startsWith(`${r}${sep}`)
}

function renderSections(sections: MemorySection[]): string {
  const body = sections.map((section) => `Instructions from: ${section.label}\n\n${escapeReminderClose(section.content)}`).join('\n\n')
  return (
    '<system-reminder>\n' +
    'The following Claude Code instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.\n\n' +
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
