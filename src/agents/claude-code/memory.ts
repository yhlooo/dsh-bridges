/**
 * CLAUDE.md memory bridging.
 *
 * DSH's own instruction loader reads `AGENTS.md` and root-level `CLAUDE.md`.
 * Claude Code additionally reads `~/.claude/CLAUDE.md` (user) and
 * `./.claude/CLAUDE.md` (project); this module injects those two files at
 * session start with the same framing DSH uses for workspace instructions.
 * @module dsh-bridges/agents/claude-code/memory
 */
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose, expandHome } from '../../util.js'

export interface MemoryConfig {
  userClaudeDir: string
  maxBytes: number
}

const PLUGIN_SOURCE = 'claude-code-memory'
const MAX_READ_CHARS = 1024 * 1024

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
    const sections: MemorySection[] = []
    const userClaudeDir = expandHome(config.userClaudeDir)
    const userFile = join(userClaudeDir, 'CLAUDE.md')
    const userText = await readOptional(fs, userFile)
    if (userText !== undefined) {
      sections.push({ kind: 'user', label: `${userClaudeDir}/CLAUDE.md`, content: userText })
    }
    if (cwd) {
      const projectFile = join(cwd, '.claude', 'CLAUDE.md')
      const projectText = await readOptional(fs, projectFile)
      if (projectText !== undefined) {
        // Collapse with the root-level CLAUDE.md DSH already loads when the
        // contents are identical, mirroring the sibling-dedup of the core loader.
        const rootText = await readOptional(fs, join(cwd, 'CLAUDE.md'))
        const duplicate = rootText !== undefined && rootText.trim() === projectText.trim()
        if (!duplicate) sections.push({ kind: 'project', label: '.claude/CLAUDE.md', content: projectText })
      }
    }
    if (sections.length === 0) return
    let rendered = renderSections(sections)
    if (rendered.length > config.maxBytes) {
      // Budget: drop the broader (user) file first, then truncate the most
      // specific one — the same strategy as DSH's own instruction loader.
      const projectOnly = sections.filter((section) => section.kind === 'project')
      rendered = renderSections(projectOnly)
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
