/**
 * `dsh-bridges` — bridge projects configured for other coding agents into dsh.
 *
 * The whole project is one DeepSeek Harness plugin. Inside, one bridge
 * subsystem per supported agent tool reads that tool's assets (skills,
 * commands, memory, hooks, …) and registers them on dsh's shared registries:
 *
 * - **claude-code** (implemented): skills/commands → `ctx.skills` provider,
 *   CLAUDE.md memory, settings.json hooks → dsh lifecycle events.
 * - **codebuddy-code** (implemented): skills/commands → `ctx.skills` provider,
 *   CODEBUDDY.md memory + rules, settings.json hooks → dsh lifecycle events.
 * - **codex / opencode**: planned; each will add one directory under
 *   `agents/<tool>/` and one entry in {@link registerBridgeSubsystems}.
 *
 * A subsystem registers under this plugin's single bundle row (`id: bridges`
 * in `cordis.patch.yml`), so one installation covers every supported tool and
 * each tool can be toggled through its own config section.
 * @module dsh-bridges
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { registerClaudeCodeBridge, type ClaudeCodeConfig } from './agents/claude-code/index.js'
import { registerCodebuddyCodeBridge, type CodebuddyCodeConfig } from './agents/codebuddy-code/index.js'
import { createFsAdapter, type FsAdapter } from './fs-adapter.js'
import type { BridgeLogger } from './util.js'

export const name = 'dsh-bridges'

export const inject = ['skills'] as const

export const Config = z.object({
  claudeCode: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    memory: z.boolean().default(true),
    hooks: z.boolean().default(true),
    userClaudeDir: z.string().default('~/.claude'),
    watch: z.boolean().default(true),
    hookTimeoutMs: z.number().default(600_000),
    userPromptHookTimeoutMs: z.number().default(30_000),
    maxHookOutputChars: z.number().default(10_000),
    memoryMaxBytes: z.number().default(32_768),
  }),
  codebuddyCode: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    memory: z.boolean().default(true),
    hooks: z.boolean().default(true),
    userCodebuddyDir: z.string().default('~/.codebuddy'),
    watch: z.boolean().default(true),
    hookTimeoutMs: z.number().default(60_000),
    maxHookOutputChars: z.number().default(10_000),
    memoryMaxBytes: z.number().default(32_768),
  }),
})

export interface BridgesConfig {
  claudeCode?: ClaudeCodeConfig
  codebuddyCode?: CodebuddyCodeConfig
}

/**
 * Bridge subsystems by agent tool. Every entry receives the shared context,
 * logger, and filesystem adapter and must register its effects through
 * ctx.effect / ctx.on / service registration so plugin teardown reverses them.
 */
export function registerBridgeSubsystems(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: BridgesConfig): void {
  registerClaudeCodeBridge(ctx, logger, fs, config.claudeCode)
  registerCodebuddyCodeBridge(ctx, logger, fs, config.codebuddyCode)
  // Planned: registerCodexBridge(ctx, logger, fs, config.codex)
  // Planned: registerOpencodeBridge(ctx, logger, fs, config.opencode)
}

export function apply(ctx: Context, config: BridgesConfig = {}): void {
  const logger = ctx.logger
  const fs = createFsAdapter(ctx.get('fs'))
  registerBridgeSubsystems(ctx, logger, fs, config)
}
