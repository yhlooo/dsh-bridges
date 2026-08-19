/**
 * Codex AGENTS.md instruction-chain memory bridging.
 *
 * Codex builds an instruction chain on session start: the global file
 * (`$CODEX_HOME/AGENTS.override.md` if present, else `$CODEX_HOME/AGENTS.md`,
 * first non-empty wins), then one file per directory walking from the
 * repository root down to the working directory (per directory:
 * `AGENTS.override.md` > `AGENTS.md` > `project_doc_fallback_filenames`,
 * first non-empty wins). Files are concatenated root-first; ones closer to
 * the working directory override earlier guidance. Empty files are skipped
 * and project accumulation stops at `project_doc_max_bytes` (32 KiB by
 * default).
 *
 * DSH's own instruction loader already reads the workspace-root `AGENTS.md`,
 * so the bridge skips the root-level section when it is exactly that file.
 * The framing matches DSH's workspace-instruction `<system-reminder>` style.
 * @module dsh-bridges/agents/codex/memory
 */
import { dirname, join, normalize, sep } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose, expandHome } from '../../util.js'
import type { CodexSettingsLoader } from './settings.js'

export interface MemoryConfig {
  userCodexDir: string
  maxBytes: number
}

const PLUGIN_SOURCE = 'dsh-bridges:AGENTS.md'
const MAX_READ_CHARS = 1024 * 1024
/** Cap on the upward repository-root walk (also breaks symlink cycles). */
const MAX_WALK_DEPTH = 32

interface MemorySection {
  kind: 'user' | 'project' | 'developer'
  label: string
  content: string
}

export function registerMemory(ctx: Context, logger: BridgeLogger, fs: FsAdapter, loader: CodexSettingsLoader, config: MemoryConfig): void {
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
  loader: CodexSettingsLoader,
  config: MemoryConfig,
): Promise<void> {
  try {
    const cwd = agent.session.header.cwd
    const sections = await collectMemorySections(cwd, logger, fs, loader, config)
    if (sections.length === 0) return
    let rendered = renderSections(sections)
    if (rendered.length > config.maxBytes) {
      // Budget: drop the broader (user) file first, then truncate the most
      // specific ones — the same strategy as DSH's own instruction loader.
      const projectOnly = sections.filter((section) => section.kind === 'project')
      rendered = renderSections(projectOnly)
      if (rendered.length > config.maxBytes) {
        const marker = '\n\n[workspace instructions truncated by the codex bridge]\n'
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
    logger.warn(`codex: failed to load AGENTS.md memory: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Collect the memory sections for one working directory (exported for tests). */
export async function collectMemorySections(
  cwd: string | undefined,
  logger: BridgeLogger,
  fs: FsAdapter,
  loader: CodexSettingsLoader,
  config: MemoryConfig,
): Promise<MemorySection[]> {
  const sections: MemorySection[] = []
  const userDir = expandHome(config.userCodexDir)
  const settings = await loader.load(cwd)

  // developer_instructions are injected before the AGENTS.md chain upstream.
  if (settings.developerInstructions !== undefined && settings.developerInstructions.trim() !== '') {
    sections.push({ kind: 'developer', label: 'config.toml developer_instructions', content: settings.developerInstructions })
  }

  // Global scope: AGENTS.override.md wins over AGENTS.md; the first
  // non-empty file at this level is the only one used.
  const override = await readOptional(fs, join(userDir, 'AGENTS.override.md'))
  const global = await readOptional(fs, join(userDir, 'AGENTS.md'))
  const globalText = override && override.trim() !== '' ? override : global && global.trim() !== '' ? global : undefined
  if (globalText !== undefined) {
    sections.push({ kind: 'user', label: join(userDir, 'AGENTS.md'), content: globalText })
  }

  if (cwd) {
    const chain = await collectProjectChain(cwd, settings.projectRootMarkers, settings.projectDocFallbackFilenames, fs)
    // DSH's own instruction loader reads AGENTS.md (and CLAUDE.md) at every
    // directory from its project root down to the cwd; skip those files so
    // the block is not injected twice. The dedup boundary assumes DSH's
    // default `.git` root marker.
    const dshRoot = await findRepositoryRoot(cwd, ['.git'], fs)
    let budget = settings.projectDocMaxBytes
    for (const entry of chain.entries) {
      if (entry.name === 'AGENTS.md' && isWithinChain(dirname(entry.path), dshRoot)) continue
      const bytes = entry.content.length
      if (budget <= 0) break // Codex stops adding files once the combined size reaches the limit
      sections.push({ kind: 'project', label: relativeLabel(cwd, entry.path), content: entry.content.slice(0, budget) })
      budget -= bytes
    }
  }

  return sections
}

interface ChainEntry {
  path: string
  content: string
  /** The file's basename (used for the DSH-native skip). */
  name: string
}

/**
 * Walk from the repository root down to `cwd`, collecting the first
 * non-empty instruction file per directory (override > AGENTS.md > fallback
 * filenames), root first.
 */
async function collectProjectChain(
  cwd: string,
  markers: readonly string[],
  fallbackFilenames: readonly string[],
  fs: FsAdapter,
): Promise<{ rootDir: string; entries: ChainEntry[] }> {
  const effectiveMarkers = markers.length > 0 ? markers : ['.git']
  const rootDir = await findRepositoryRoot(cwd, effectiveMarkers, fs)
  const dirs = directoriesBetween(rootDir, cwd)
  const entries: ChainEntry[] = []
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i]!
    for (const name of ['AGENTS.override.md', 'AGENTS.md', ...fallbackFilenames]) {
      const path = join(dir, name)
      const content = await readOptional(fs, path)
      if (content === undefined || content.trim() === '') continue // Codex skips empty files
      entries.push({ path, content, name })
      break // at most one file per directory
    }
  }
  return { rootDir, entries }
}

/** The repository root: the first directory on the upward walk containing a marker. */
async function findRepositoryRoot(cwd: string, markers: readonly string[], fs: FsAdapter): Promise<string> {
  let dir: string = cwd
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    for (const marker of markers) {
      if (await fs.dirExists(join(dir, marker))) return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return cwd // no project root found: Codex only checks the current directory
}

/** True when `dir` sits on DSH's instruction chain (`root` down to `cwd`). */
function isWithinChain(dir: string, root: string): boolean {
  const d = normalize(dir)
  const r = normalize(root)
  return d === r || d.startsWith(`${r}${sep}`)
}

/** The directory list from `root` down to `cwd` (both inclusive), root first. */
function directoriesBetween(root: string, cwd: string): string[] {
  const result: string[] = [cwd]
  let dir: string = cwd
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (normalize(dir) === normalize(root)) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
    result.unshift(dir)
  }
  return result
}

function relativeLabel(cwd: string, path: string): string {
  const normalized = normalize(path)
  const base = normalize(cwd)
  return normalized.startsWith(base + '/') ? normalized.slice(base.length + 1) : normalized
}

function renderSections(sections: MemorySection[]): string {
  const body = sections.map((section) => `Instructions from: ${section.label}\n\n${escapeReminderClose(section.content)}`).join('\n\n')
  return (
    '<system-reminder>\n' +
    'The following Codex instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.\n\n' +
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
