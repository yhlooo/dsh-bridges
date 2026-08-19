/**
 * Gemini CLI GEMINI.md memory bridging.
 *
 * Gemini concatenates context files on session start: the global
 * `~/.gemini/GEMINI.md` (user), then the workspace's `GEMINI.md` and the same
 * file in every parent directory up to a memory boundary (the first directory
 * containing a `context.memoryBoundaryMarkers` entry — default `[" .git"]`),
 * root-first. `context.fileName` renames the file (string or list, default
 * `GEMINI.md`), and `context.discoveryMaxDirs` caps the walk (default 200).
 *
 * `@./relative/path.md` and `@/absolute/path.md` imports are expanded inline
 * (deduplicated by canonical path, depth-capped against cycles). Gemini's
 * JIT loading — context files discovered when a tool touches a directory —
 * has no DSH seam and is recorded as a limitation: only the startup set is
 * injected.
 *
 * The framing matches DSH's workspace-instruction `<system-reminder>` style.
 * @module dsh-bridges/agents/gemini-cli/memory
 */
import { dirname, isAbsolute, join, normalize } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose } from '../../util.js'
import type { GeminiSettingsLoader } from './settings.js'

export interface MemoryConfig {
  userGeminiDir: string
  maxBytes: number
}

const PLUGIN_SOURCE = 'dsh-bridges:GEMINI.md'
const MAX_READ_CHARS = 1024 * 1024
/** Cap on the upward context-file walk and the import expansion depth. */
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
  loader: GeminiSettingsLoader,
  config: MemoryConfig,
): void {
  ctx.on('agent/session-start', (payload) => {
    if (payload.source === 'resume') return
    void injectMemory(payload.agent, logger, fs, loader, config)
  })
}

async function injectMemory(
  agent: Agent,
  logger: BridgeLogger,
  fs: FsAdapter,
  loader: GeminiSettingsLoader,
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
      const projectOnly = sections.filter((section) => section.kind === 'project')
      rendered = renderSections(projectOnly)
      if (rendered.length > config.maxBytes) {
        const marker = '\n\n[workspace instructions truncated by the gemini-cli bridge]\n'
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
    logger.warn(`gemini-cli: failed to load GEMINI.md memory: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Collect the memory sections for one working directory (exported for tests). */
export async function collectMemorySections(
  cwd: string | undefined,
  logger: BridgeLogger,
  fs: FsAdapter,
  loader: GeminiSettingsLoader,
): Promise<MemorySection[]> {
  const sections: MemorySection[] = []
  const settings = await loader.load(cwd)
  // `context.fileName` must be a plain basename: it is joined onto the user
  // directory and every walked ancestor, so anything path-like could read
  // arbitrary files (fail closed — drop with a warning).
  const configured = settings.contextFileName.filter(isSafeContextFileName)
  if (configured.length !== settings.contextFileName.length) {
    logger.warn('gemini-cli: ignoring path-like context.fileName entries; only plain file names are supported')
  }
  const fileNames = configured.length > 0 ? configured : ['GEMINI.md']

  const userDir = loader.userDir()
  const globalContent = await readFirstOptional(
    fs,
    fileNames.map((name) => join(userDir, name)),
  )
  if (globalContent !== undefined) {
    const expanded = await expandImports(globalContent.content, globalContent.path, fs, logger)
    sections.push({ kind: 'user', label: globalContent.path, content: expanded })
  }

  if (cwd) {
    const chain = await collectContextChain(cwd, settings.memoryBoundaryMarkers, settings.discoveryMaxDirs, fileNames, fs)
    for (const entry of chain) {
      const expanded = await expandImports(entry.content, entry.path, fs, logger)
      sections.push({ kind: 'project', label: relativeLabel(cwd, entry.path), content: expanded })
    }
  }
  return sections
}

/**
 * Walk from the workspace up to the memory boundary (exclusive): every
 * directory from `cwd` up to (and including) the first directory containing
 * a boundary marker yields its context file, root-first.
 */
async function collectContextChain(
  cwd: string,
  markers: readonly string[],
  maxDirs: number,
  fileNames: readonly string[],
  fs: FsAdapter,
): Promise<{ path: string; content: string }[]> {
  const effectiveMarkers = markers.length > 0 ? markers : ['.git']
  const effectiveMax = maxDirs > 0 ? maxDirs : 200
  const dirs: string[] = []
  let dir: string = cwd
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    dirs.push(dir)
    if (dirs.length >= effectiveMax) break
    let boundary = false
    for (const marker of effectiveMarkers) {
      if (await fs.dirExists(join(dir, marker))) {
        boundary = true
        break
      }
    }
    if (boundary) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const entries: { path: string; content: string }[] = []
  for (let i = dirs.length - 1; i >= 0; i--) {
    const candidate = await readFirstOptional(
      fs,
      fileNames.map((name) => join(dirs[i]!, name)),
    )
    if (candidate !== undefined) entries.push(candidate)
  }
  return entries
}

async function readFirstOptional(fs: FsAdapter, paths: string[]): Promise<{ path: string; content: string } | undefined> {
  for (const path of paths) {
    try {
      if (!(await fs.fileExists(path))) continue
      const text = await fs.readText(path)
      return { path, content: text.length > MAX_READ_CHARS ? text.slice(0, MAX_READ_CHARS) : text }
    } catch {
      continue
    }
  }
  return undefined
}

/**
 * Expand `@./relative` / `@/absolute` imports in a context file. Each import
 * is a line of the form `@<path>`; missing files are skipped with a warning
 * (fail soft), canonical paths deduplicate, and the depth cap breaks cycles.
 */
export async function expandImports(content: string, filePath: string, fs: FsAdapter, logger: BridgeLogger): Promise<string> {
  const lines = content.split(/\r?\n/)
  const result: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('@') || trimmed === '@' || trimmed.startsWith('@@')) {
      result.push(line)
      continue
    }
    const target = trimmed.slice(1).trim()
    const resolved = target.startsWith('./')
      ? join(dirname(filePath), target.slice(2))
      : isAbsolute(target)
        ? target
        : join(dirname(filePath), target)
    const imported = await readImport(resolved, fs, logger, new Set([normalize(filePath)]), 0)
    if (imported === undefined) {
      result.push(line) // keep the import line so users can see what was referenced
      continue
    }
    result.push(imported)
  }
  return result.join('\n')
}

async function readImport(
  path: string,
  fs: FsAdapter,
  logger: BridgeLogger,
  seen: Set<string>,
  depth: number,
): Promise<string | undefined> {
  const key = normalize(path)
  if (seen.has(key) || depth >= MAX_WALK_DEPTH) return undefined
  let text: string
  try {
    if (!(await fs.fileExists(path))) return undefined
    text = await fs.readText(path)
  } catch {
    return undefined
  }
  const nextSeen = new Set(seen)
  nextSeen.add(key)
  const lines = text.split(/\r?\n/)
  const result: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('@') || trimmed === '@' || trimmed.startsWith('@@')) {
      result.push(line)
      continue
    }
    const target = trimmed.slice(1).trim()
    const resolved = target.startsWith('./')
      ? join(dirname(path), target.slice(2))
      : isAbsolute(target)
        ? target
        : join(dirname(path), target)
    const imported = await readImport(resolved, fs, logger, nextSeen, depth + 1)
    if (imported === undefined) {
      result.push(line)
      continue
    }
    result.push(imported)
  }
  return result.join('\n')
}

function relativeLabel(cwd: string, path: string): string {
  const normalized = normalize(path)
  const base = normalize(cwd)
  return normalized.startsWith(base + '/') ? normalized.slice(base.length + 1) : normalized
}

/** A context file name may be any basename, but never a path (`..`, separators, absolute). */
function isSafeContextFileName(name: string): boolean {
  return name !== '' && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\') && !isAbsolute(name)
}

function renderSections(sections: MemorySection[]): string {
  const body = sections.map((section) => `Instructions from: ${section.label}\n\n${escapeReminderClose(section.content)}`).join('\n\n')
  return (
    '<system-reminder>\n' +
    'The following Gemini CLI instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.\n\n' +
    body +
    '\n</system-reminder>'
  )
}
