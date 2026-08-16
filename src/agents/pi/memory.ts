/**
 * pi context-file memory bridging.
 *
 * pi loads context files at startup regardless of project trust: the global
 * `$PI_DIR/AGENTS.md`, then one file per directory walking from the
 * filesystem root down to the working directory (per directory the first
 * non-empty of `AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` >
 * `CLAUDE.md` > `CLAUDE.MD` wins — pi's source-verified candidate order).
 * `AGENTS.override.md` replaces that directory's `AGENTS.md`/`CLAUDE.md`
 * entirely. Files are concatenated root-first and deduplicated by canonical
 * path.
 *
 * `APPEND_SYSTEM.md` appends to the system prompt (global `$PI_DIR/`, then
 * the trusted project `.pi/`); the bridge injects it as an extra memory
 * section. `SYSTEM.md` (whole system-prompt replacement) has no DSH seam and
 * is recorded as a limitation.
 *
 * DSH's own instruction loader already reads the repository-root `AGENTS.md`,
 * so the bridge skips that section when it is exactly that file (the codex
 * precedent). The framing matches DSH's workspace-instruction
 * `<system-reminder>` style.
 * @module dsh-bridges/agents/pi/memory
 */
import { dirname, join, normalize } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose } from '../../util.js'
import type { PiSettingsLoader } from './settings.js'

export interface MemoryConfig {
  userPiDir: string
  maxBytes: number
}

const PLUGIN_SOURCE = 'pi-memory'
const MAX_READ_CHARS = 1024 * 1024
/** Cap on the upward context-file walk (also breaks symlink cycles). */
const MAX_WALK_DEPTH = 32

/** pi's per-directory candidate order (source-verified, case variants included). */
const CONTEXT_FILE_NAMES = ['AGENTS.override.md', 'AGENTS.md', 'AGENTS.MD', 'CLAUDE.md', 'CLAUDE.MD'] as const

interface MemorySection {
  kind: 'user' | 'project' | 'append-system'
  label: string
  content: string
}

interface ChainEntry {
  path: string
  content: string
  /** True when the entry is the repository root's plain `AGENTS.md`. */
  isRootAgents: boolean
}

export function registerMemory(ctx: Context, logger: BridgeLogger, fs: FsAdapter, loader: PiSettingsLoader, config: MemoryConfig): void {
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
  loader: PiSettingsLoader,
  config: MemoryConfig,
): Promise<void> {
  try {
    const cwd = agent.session.header.cwd
    const sections = await collectMemorySections(cwd, logger, fs, loader)
    if (sections.length === 0) return
    let rendered = renderSections(sections)
    if (rendered.length > config.maxBytes) {
      // Budget: drop the broader (user) file first, then truncate the most
      // specific ones — the same strategy as DSH's own instruction loader.
      const specificOnly = sections.filter((section) => section.kind !== 'user')
      rendered = renderSections(specificOnly)
      if (rendered.length > config.maxBytes) {
        const marker = '\n\n[workspace instructions truncated by the pi bridge]\n'
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
    logger.warn(`pi: failed to load context-file memory: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Collect the memory sections for one working directory (exported for tests). */
export async function collectMemorySections(
  cwd: string | undefined,
  logger: BridgeLogger,
  fs: FsAdapter,
  loader: PiSettingsLoader,
): Promise<MemorySection[]> {
  const sections: MemorySection[] = []
  const piDir = loader.piDir()

  // Global scope: the global AGENTS.md (the override name applies per pi's
  // candidate order, but the global file is documented as AGENTS.md).
  const globalOverride = await readOptional(fs, join(piDir, 'AGENTS.override.md'))
  const global = await readOptional(fs, join(piDir, 'AGENTS.md'))
  const globalText = globalOverride && globalOverride.trim() !== '' ? globalOverride : global && global.trim() !== '' ? global : undefined
  if (globalText !== undefined) {
    sections.push({ kind: 'user', label: join(piDir, 'AGENTS.md'), content: globalText })
  }

  if (cwd) {
    const chain = await collectContextChain(cwd, fs)
    const rootAgents = await readOptional(fs, join(chain.rootDir, 'AGENTS.md'))
    const seenPaths = new Set<string>()
    for (const entry of chain.entries) {
      if (seenPaths.has(normalize(entry.path))) continue // canonical-path dedup (pi)
      seenPaths.add(normalize(entry.path))
      // The repository root's plain AGENTS.md is the file DSH already
      // injects; skip it to avoid duplicating the block.
      if (entry.isRootAgents && rootAgents !== undefined && rootAgents.trim() === entry.content.trim()) continue
      sections.push({ kind: 'project', label: relativeLabel(cwd, entry.path), content: entry.content })
    }
  }

  // APPEND_SYSTEM.md appends to the system prompt: global first, then the
  // trusted project file (`.pi` resources load only for trusted projects).
  const globalAppend = await readOptional(fs, join(piDir, 'APPEND_SYSTEM.md'))
  if (globalAppend !== undefined && globalAppend.trim() !== '') {
    sections.push({ kind: 'append-system', label: join(piDir, 'APPEND_SYSTEM.md'), content: globalAppend })
  }
  if (cwd) {
    let trusted = false
    try {
      trusted = (await loader.load(cwd)).projectTrusted
    } catch (error) {
      logger.warn(`pi: cannot resolve project trust for APPEND_SYSTEM.md: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (trusted) {
      const projectAppend = await readOptional(fs, join(cwd, '.pi', 'APPEND_SYSTEM.md'))
      if (projectAppend !== undefined && projectAppend.trim() !== '') {
        sections.push({ kind: 'append-system', label: join(cwd, '.pi', 'APPEND_SYSTEM.md'), content: projectAppend })
      }
    }
  }

  return sections
}

/**
 * Walk from the filesystem root down to `cwd`, collecting the first
 * non-empty context file per directory (pi's candidate order), root first.
 */
async function collectContextChain(cwd: string, fs: FsAdapter): Promise<{ rootDir: string; entries: ChainEntry[] }> {
  const dirs = directoriesFromRoot(cwd)
  const entries: ChainEntry[] = []
  const repoRoot = await findRepositoryRoot(cwd, fs)
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i]!
    for (const name of CONTEXT_FILE_NAMES) {
      const path = join(dir, name)
      const content = await readOptional(fs, path)
      if (content === undefined || content.trim() === '') continue // pi skips empty files
      entries.push({ path, content, isRootAgents: name === 'AGENTS.md' && normalize(dir) === normalize(repoRoot) })
      break // at most one file per directory
    }
  }
  return { rootDir: repoRoot, entries }
}

/** The directory list from the filesystem root down to `cwd`, root first. */
function directoriesFromRoot(cwd: string): string[] {
  const result: string[] = [cwd]
  let dir: string = cwd
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
    result.unshift(dir)
  }
  return result
}

/** The repository root: the first directory on the upward walk containing `.git`. */
async function findRepositoryRoot(cwd: string, fs: FsAdapter): Promise<string> {
  let dir: string = cwd
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (await fs.dirExists(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return cwd // no repository root found: nothing to dedup against DSH's loader
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
    'The following pi instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.\n\n' +
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
