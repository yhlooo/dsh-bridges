/**
 * `@dsh-bridges/claude-code` — bridge Claude Code project assets into dsh.
 *
 * One plugin, three bridges:
 *
 * - **skills**: registers a `claude-code` provider on `ctx.skills` that reads
 *   `~/.claude/skills`, `~/.claude/commands`, `<cwd>/.claude/skills`, and
 *   `<cwd>/.claude/commands`, mapping Claude Code frontmatter onto DSH skill
 *   summaries and loading bodies on demand.
 * - **memory**: injects `~/.claude/CLAUDE.md` and `.claude/CLAUDE.md` at
 *   session start (DSH already loads root-level `CLAUDE.md` itself).
 * - **hooks**: loads the merged `hooks` field of `~/.claude/settings.json`,
 *   `<cwd>/.claude/settings.json`, and `<cwd>/.claude/settings.local.json`
 *   and runs `command`/`http` handlers at the DSH lifecycle seams mapped in
 *   `hooks/bridge.ts`.
 * @module @dsh-bridges/claude-code
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createFsAdapter } from './fs-adapter.js'
import { createHookBridge } from './hooks/bridge.js'
import { SettingsLoader } from './hooks/settings.js'
import { registerMemory } from './memory.js'
import { ClaudeSkillProvider } from './skills/provider.js'

export const name = 'claude-code'

export const inject = ['skills'] as const

export const Config = z.object({
  /** Discover and register Claude Code skills and commands. */
  skills: z.boolean().default(true),
  /** Inject `~/.claude/CLAUDE.md` and `.claude/CLAUDE.md` at session start. */
  memory: z.boolean().default(true),
  /** Run Claude Code hooks from settings.json at DSH lifecycle seams. */
  hooks: z.boolean().default(true),
  /** User-level Claude Code directory (usually `~/.claude`). */
  userClaudeDir: z.string().default('~/.claude'),
  /** Watch existing skill roots and republish the catalog on change. */
  watch: z.boolean().default(true),
  /** Default hook timeout (ms); `SessionStart` uses it verbatim. */
  hookTimeoutMs: z.number().default(600_000),
  /** UserPromptSubmit hook timeout, mirroring Claude Code's 30-second default. */
  userPromptHookTimeoutMs: z.number().default(30_000),
  /** Cap on context-bound hook output characters (Claude Code caps at 10,000). */
  maxHookOutputChars: z.number().default(10_000),
  /** Cap on the rendered CLAUDE.md memory block, in characters. */
  memoryMaxBytes: z.number().default(32_768),
})

export interface ClaudeCodeConfig {
  skills?: boolean
  memory?: boolean
  hooks?: boolean
  userClaudeDir?: string
  watch?: boolean
  hookTimeoutMs?: number
  userPromptHookTimeoutMs?: number
  maxHookOutputChars?: number
  memoryMaxBytes?: number
}

const DEFAULTS: Required<ClaudeCodeConfig> = {
  skills: true,
  memory: true,
  hooks: true,
  userClaudeDir: '~/.claude',
  watch: true,
  hookTimeoutMs: 600_000,
  userPromptHookTimeoutMs: 30_000,
  maxHookOutputChars: 10_000,
  memoryMaxBytes: 32_768,
}

export function apply(ctx: Context, config: ClaudeCodeConfig = {}): void {
  const resolved = { ...DEFAULTS, ...config }
  const logger = ctx.logger
  const fs = createFsAdapter(ctx.get('fs'))

  if (resolved.skills) {
    let provider: ClaudeSkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new ClaudeSkillProvider(logger, fs, { userClaudeDir: resolved.userClaudeDir, watch: resolved.watch }, control.invalidate)
      return provider
    })
    ctx.effect(() => () => {
      void provider?.dispose()
    }, 'claude-code skill watchers')
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, { userClaudeDir: resolved.userClaudeDir, maxBytes: resolved.memoryMaxBytes })
  }

  if (resolved.hooks) {
    const loader = new SettingsLoader(logger, fs, { userClaudeDir: resolved.userClaudeDir })
    createHookBridge(ctx, logger, fs, loader, {
      hookTimeoutMs: resolved.hookTimeoutMs,
      userPromptHookTimeoutMs: resolved.userPromptHookTimeoutMs,
      maxHookOutputChars: resolved.maxHookOutputChars,
    })
  }
}
