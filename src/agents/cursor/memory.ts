/**
 * Cursor rules memory bridging.
 *
 * Cursor's persistent instructions are `.cursor/rules/*.mdc` files
 * (frontmatter `description` / `globs` / `alwaysApply`) plus plain
 * `AGENTS.md` files (project root and any subdirectory, more specific
 * directories win) and a root `CLAUDE.md` that always applies. The bridge
 * injects at session start, in the same system-reminder framing DSH uses
 * for workspace instructions:
 *
 * - every `.cursor/rules` `.mdc` file with `alwaysApply: true` (relevance-
 *   based and glob-scoped rules cannot be evaluated statically — recorded
 *   as a limitation; files without frontmatter are ignored upstream)
 * - `AGENTS.md` files in subdirectories below the working directory's
 *   repository root (the root `AGENTS.md` is the file DSH already loads and
 *   is skipped; subdirectory files follow Cursor's more-specific-wins
 *   semantics)
 *
 * The root `CLAUDE.md` is left to the claude-code bridge (it already
 * injects the CLAUDE.md chain); user rules live in Cursor settings, not
 * files, and are recorded as a limitation.
 * @module dsh-bridges/agents/cursor/memory
 */
import { dirname, join, normalize } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose } from '../../util.js'
import { FrontmatterError, parseRuleFile } from './skills/parse.js'

export interface MemoryConfig {
  maxBytes: number
}

const PLUGIN_SOURCE = 'dsh-bridges:.cursor/rules'
const MAX_READ_CHARS = 1024 * 1024
/** Cap on the upward repository-root walk and the rules subtree walk. */
const MAX_WALK_DEPTH = 32

interface MemorySection {
  kind: 'rules' | 'agents'
  label: string
  content: string
}

export function registerMemory(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: MemoryConfig): void {
  ctx.on('agent/session-start', (payload) => {
    if (payload.source === 'resume') return
    void injectMemory(payload.agent, logger, fs, config)
  })
}

async function injectMemory(agent: Agent, logger: BridgeLogger, fs: FsAdapter, config: MemoryConfig): Promise<void> {
  try {
    const cwd = agent.session.header.cwd
    const sections = await collectMemorySections(cwd, logger, fs)
    if (sections.length === 0) return
    let rendered = renderSections(sections)
    if (rendered.length > config.maxBytes) {
      const marker = '\n\n[workspace instructions truncated by the cursor bridge]\n'
      rendered = rendered.slice(0, Math.max(0, config.maxBytes - marker.length)) + marker
    }
    agent.inject(
      createUserMessage({
        content: [{ type: 'text', text: rendered }],
        source: { kind: 'plugin', plugin: PLUGIN_SOURCE },
      }),
    )
  } catch (error) {
    logger.warn(`cursor: failed to load rules memory: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** Collect the memory sections for one working directory (exported for tests). */
export async function collectMemorySections(cwd: string | undefined, logger: BridgeLogger, fs: FsAdapter): Promise<MemorySection[]> {
  const sections: MemorySection[] = []
  if (cwd === undefined) return sections

  const repoRoot = await findRepositoryRoot(cwd, fs)
  // `.cursor/rules` anchors at the repository root (Cursor's project asset
  // layout), not at the working directory.
  const rulesDir = join(repoRoot, '.cursor', 'rules')
  const rules = await collectRules(rulesDir, cwd, fs, logger, 0)
  sections.push(...rules)

  const agents = await collectSubdirAgents(repoRoot, cwd, fs, logger)
  sections.push(...agents)
  return sections
}

/** Recursively collect `alwaysApply: true` `.mdc` files (skip hidden dirs). */
async function collectRules(dir: string, cwd: string, fs: FsAdapter, logger: BridgeLogger, depth: number): Promise<MemorySection[]> {
  if (depth > MAX_WALK_DEPTH) return []
  let entries
  try {
    entries = await fs.listDir(dir)
  } catch {
    return [] // confirmed-absent rules root is a valid empty state
  }
  const sections: MemorySection[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDir) {
      sections.push(...(await collectRules(join(dir, entry.name), cwd, fs, logger, depth + 1)))
    } else if (entry.name.toLowerCase().endsWith('.mdc')) {
      const file = join(dir, entry.name)
      try {
        const text = await fs.readText(file)
        const rule = parseRuleFile(text)
        if (!rule.alwaysApply) continue // glob-scoped/relevance rules cannot be evaluated statically
        sections.push({ kind: 'rules', label: relativeLabel(cwd, file), content: rule.body })
      } catch (error) {
        if (error instanceof FrontmatterError) {
          logger.warn(`cursor: skipping invalid rule ${file}: ${error.message}`)
        } else {
          logger.warn(`cursor: cannot read rule ${file}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
  return sections
}

/** `AGENTS.md` files in subdirectories between the repo root (exclusive) and cwd (inclusive). */
async function collectSubdirAgents(repoRoot: string, cwd: string, fs: FsAdapter, logger: BridgeLogger): Promise<MemorySection[]> {
  const dirs: string[] = [cwd]
  let dir: string = cwd
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (normalize(dir) === normalize(repoRoot)) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
    dirs.unshift(dir)
  }
  // dirs is now root-first from repoRoot (exclusive already handled by the
  // break above) down to cwd — drop the repoRoot itself.
  if (dirs.length > 0 && normalize(dirs[0]!) === normalize(repoRoot)) dirs.shift()
  const sections: MemorySection[] = []
  for (const dirEntry of dirs) {
    const file = join(dirEntry, 'AGENTS.md')
    try {
      if (!(await fs.fileExists(file))) continue
      const text = await fs.readText(file)
      if (text.trim() === '') continue
      sections.push({
        kind: 'agents',
        label: relativeLabel(cwd, file),
        content: text.length > MAX_READ_CHARS ? text.slice(0, MAX_READ_CHARS) : text,
      })
    } catch (error) {
      logger.warn(`cursor: cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return sections
}

async function findRepositoryRoot(cwd: string, fs: FsAdapter): Promise<string> {
  let dir: string = cwd
  for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
    if (await fs.dirExists(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return cwd
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
    'The following Cursor instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.\n\n' +
    body +
    '\n</system-reminder>'
  )
}
