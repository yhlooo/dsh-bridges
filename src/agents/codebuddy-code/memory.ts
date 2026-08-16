/**
 * CODEBUDDY.md memory bridging.
 *
 * DSH's own instruction loader reads `AGENTS.md` and root-level `CLAUDE.md`;
 * it does not read CodeBuddy Code's memory files. This module injects the
 * CodeBuddy Code memory surface at session start:
 *
 * - `~/.codebuddy/CODEBUDDY.md` (user memory)
 * - `~/.codebuddy/rules/**` (user rules, recursive; only rules that always
 *   apply — `enabled`/`alwaysApply` not false — are injected)
 * - `<cwd>/CODEBUDDY.md` and `<cwd>/.codebuddy/CODEBUDDY.md` (project memory)
 * - `<cwd>/CODEBUDDY.local.md` (local project memory)
 * - `<cwd>/.codebuddy/rules/**` (project rules, recursive)
 *
 * The framing matches DSH's workspace-instruction `<system-reminder>` style.
 * Conditional rules (`alwaysApply: false` plus `paths`), `@import`
 * expansion, upward-directory discovery, and nested-subtree dynamic loading
 * are not bridged yet (see the README limitations).
 * @module dsh-bridges/agents/codebuddy-code/memory
 */
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose, expandHome, isPlainObject } from '../../util.js'
import { splitFrontmatter } from './skills/parse.js'

export interface MemoryConfig {
  userCodebuddyDir: string
  maxBytes: number
}

const PLUGIN_SOURCE = 'codebuddy-code-memory'
const MAX_READ_CHARS = 1024 * 1024
/** Recursion bound for rule-directory walks (also breaks symlink cycles). */
const MAX_RULE_DEPTH = 16

interface MemorySection {
  kind: 'user' | 'project'
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
    const cwd = agent.session.header.cwd
    const sections = await collectMemorySections(cwd, logger, fs, config)
    if (sections.length === 0) return
    let rendered = renderSections(sections)
    if (rendered.length > config.maxBytes) {
      // Budget: drop the broader (user) files first, then truncate the most
      // specific ones — the same strategy as DSH's own instruction loader.
      const projectOnly = sections.filter((section) => section.kind === 'project')
      rendered = renderSections(projectOnly)
      if (rendered.length > config.maxBytes) {
        const marker = '\n\n[workspace instructions truncated by the codebuddy-code bridge]\n'
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
    logger.warn(`codebuddy-code: failed to load CODEBUDDY.md memory: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * Collect the memory sections (user memory, user rules, project memory,
 * project-local memory, project rules) for one working directory, broadest
 * first, content-deduplicated.
 */
export async function collectMemorySections(
  cwd: string | undefined,
  logger: BridgeLogger,
  fs: FsAdapter,
  config: MemoryConfig,
): Promise<MemorySection[]> {
  const sections: MemorySection[] = []
  const userCodebuddyDir = expandHome(config.userCodebuddyDir)

  // User level: main memory file, then always-apply rules.
  const userFile = join(userCodebuddyDir, 'CODEBUDDY.md')
  const userText = await readOptional(fs, userFile)
  if (userText !== undefined) {
    sections.push({ kind: 'user', label: userFile, content: userText })
  }
  const userRules = await collectRules(fs, join(userCodebuddyDir, 'rules'), logger)
  for (const rule of userRules) sections.push({ kind: 'user', ...rule })

  if (cwd) {
    // Project level: both documented CODEBUDDY.md positions, the local
    // overlay, then always-apply rules.
    for (const [path, label] of [
      [join(cwd, 'CODEBUDDY.md'), 'CODEBUDDY.md'],
      [join(cwd, '.codebuddy', 'CODEBUDDY.md'), '.codebuddy/CODEBUDDY.md'],
    ] as const) {
      const text = await readOptional(fs, path)
      if (text !== undefined) sections.push({ kind: 'project', label, content: text })
    }
    const localText = await readOptional(fs, join(cwd, 'CODEBUDDY.local.md'))
    if (localText !== undefined) sections.push({ kind: 'project', label: 'CODEBUDDY.local.md', content: localText })
    const projectRules = await collectRules(fs, join(cwd, '.codebuddy', 'rules'), logger)
    for (const rule of projectRules) sections.push({ kind: 'project', ...rule })
  }

  return dedupeSections(sections)
}

/**
 * Collect always-applying rule files from a rules directory (recursive).
 *
 * Rule frontmatter follows CodeBuddy Code: `enabled: false` and
 * `alwaysApply: false` rules are not loaded (conditional `paths` rules are
 * not bridged either, and `alwaysApply: false` rules are skipped entirely).
 * Malformed frontmatter falls open — the rule is still loaded, because
 * memory is guidance and CodeBuddy Code treats memory files best-effort.
 */
async function collectRules(fs: FsAdapter, dir: string, logger: BridgeLogger): Promise<{ label: string; content: string }[]> {
  const rules: { label: string; content: string }[] = []
  await walkRules(fs, dir, 0, logger, rules)
  return rules
}

async function walkRules(
  fs: FsAdapter,
  dir: string,
  depth: number,
  logger: BridgeLogger,
  rules: { label: string; content: string }[],
): Promise<void> {
  if (depth > MAX_RULE_DEPTH) return
  let entries
  try {
    entries = await fs.listDir(dir)
  } catch {
    return // absent or unreadable rules root: a valid empty state
  }
  const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of sorted) {
    const path = join(dir, entry.name)
    if (entry.isDir) {
      await walkRules(fs, path, depth + 1, logger, rules)
      continue
    }
    if (!entry.isFile || !entry.name.toLowerCase().endsWith('.md')) continue
    let text: string
    try {
      text = await fs.readText(path)
    } catch (error) {
      logger.warn(`codebuddy-code: cannot read rule ${path}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (text.length > MAX_READ_CHARS) text = text.slice(0, MAX_READ_CHARS)
    const { frontmatter, content } = resolveRule(text)
    if (!frontmatter) {
      if (content.trim() !== '') rules.push({ label: path, content })
      continue
    }
    const enabled = readBooleanField(frontmatter, 'enabled', true)
    const alwaysApply = readBooleanField(frontmatter, 'alwaysApply', true)
    if (enabled && alwaysApply && content.trim() !== '') rules.push({ label: path, content })
    // Conditional (`alwaysApply: false` + `paths`) and disabled rules are
    // intentionally skipped; see the README limitations.
  }
}

function resolveRule(text: string): { frontmatter: Record<string, unknown> | undefined; content: string } {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) return { frontmatter: undefined, content: body }
  try {
    const parsed: unknown = parseYaml(raw)
    return { frontmatter: isPlainObject(parsed) ? parsed : undefined, content: body }
  } catch {
    return { frontmatter: undefined, content: text } // malformed frontmatter: keep the whole file
  }
}

function readBooleanField(frontmatter: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = frontmatter[key]
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', 'on', '1'].includes(normalized)) return true
    if (['false', 'no', 'off', '0'].includes(normalized)) return false
  }
  return fallback // best-effort for memory files
}

/** Collapse sections whose trimmed content already appeared (e.g. CODEBUDDY.md at both project positions). */
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
    'The following CodeBuddy Code instructions may be relevant to your work. Use them as guidance when applicable. More specific instructions take precedence over broader ones. They do not override system, developer, or direct user instructions.\n\n' +
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
