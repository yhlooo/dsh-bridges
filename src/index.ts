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
 * - **opencode** (implemented): skills/commands (files + opencode.json) →
 *   `ctx.skills` provider, AGENTS.md rules + `instructions` memory.
 * - **codex** (implemented): `.agents/skills` → `ctx.skills` provider,
 *   AGENTS.md instruction-chain memory, config.toml/hooks.json hooks → dsh
 *   lifecycle events.
 * - **pi** (implemented): `.pi` skills/prompt templates → `ctx.skills`
 *   provider (project side trust-gated), AGENTS.md / CLAUDE.md chain memory.
 * - **gemini-cli** (implemented): skills/commands/subagents →
 *   `ctx.skills` provider, GEMINI.md memory, settings.json hooks, policy
 *   engine permissions, settings.json MCP servers.
 * - **cursor** (implemented): skills/subagents → `ctx.skills` provider,
 *   always-apply rules memory, hooks.json hooks, cli.json permission rules,
 *   mcp.json MCP servers.
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
import { registerCodexBridge, type CodexConfig } from './agents/codex/index.js'
import { registerCursorBridge, type CursorConfig } from './agents/cursor/index.js'
import { registerGeminiCliBridge, type GeminiCliConfig } from './agents/gemini-cli/index.js'
import { registerOpencodeBridge, type OpencodeConfig } from './agents/opencode/index.js'
import { registerPiBridge, type PiConfig } from './agents/pi/index.js'
import { createFsAdapter, type FsAdapter } from './fs-adapter.js'
import type { BridgeLogger } from './util.js'

export const name = 'dsh-bridges'

export const inject = ['skills'] as const

export const Config = z.object({
  claudeCode: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    agents: z.boolean().default(true),
    memory: z.boolean().default(true),
    hooks: z.boolean().default(true),
    permissions: z.boolean().default(true),
    mcp: z.boolean().default(true),
    userClaudeDir: z.string().default('~/.claude'),
    watch: z.boolean().default(true),
    hookTimeoutMs: z.number().default(600_000),
    userPromptHookTimeoutMs: z.number().default(30_000),
    maxHookOutputChars: z.number().default(10_000),
    memoryMaxBytes: z.number().default(32_768),
    mcpToolCallTimeoutMs: z.number().default(120_000),
  }),
  codebuddyCode: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    agents: z.boolean().default(true),
    memory: z.boolean().default(true),
    hooks: z.boolean().default(true),
    permissions: z.boolean().default(true),
    mcp: z.boolean().default(true),
    userCodebuddyDir: z.string().default('~/.codebuddy'),
    watch: z.boolean().default(true),
    hookTimeoutMs: z.number().default(60_000),
    maxHookOutputChars: z.number().default(10_000),
    memoryMaxBytes: z.number().default(32_768),
    mcpToolCallTimeoutMs: z.number().default(120_000),
  }),
  opencode: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    memory: z.boolean().default(true),
    permissions: z.boolean().default(true),
    mcp: z.boolean().default(true),
    userOpencodeDir: z.string().default('~/.config/opencode'),
    userClaudeDir: z.string().default('~/.claude'),
    claudeCompat: z.boolean().default(true),
    watch: z.boolean().default(true),
    memoryMaxBytes: z.number().default(32_768),
    mcpToolCallTimeoutMs: z.number().default(120_000),
  }),
  codex: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    memory: z.boolean().default(true),
    hooks: z.boolean().default(true),
    permissions: z.boolean().default(true),
    mcp: z.boolean().default(true),
    userCodexDir: z.string().default('~/.codex'),
    userSkillsDir: z.string().default('~/.agents/skills'),
    watch: z.boolean().default(true),
    hookTimeoutMs: z.number().default(600_000),
    maxHookOutputChars: z.number().default(10_000),
    memoryMaxBytes: z.number().default(32_768),
    mcpToolCallTimeoutMs: z.number().default(120_000),
  }),
  pi: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    memory: z.boolean().default(true),
    userPiDir: z.string().default('~/.pi/agent'),
    watch: z.boolean().default(true),
    memoryMaxBytes: z.number().default(32_768),
  }),
  geminiCli: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    agents: z.boolean().default(true),
    memory: z.boolean().default(true),
    hooks: z.boolean().default(true),
    permissions: z.boolean().default(true),
    mcp: z.boolean().default(true),
    userGeminiDir: z.string().default('~/.gemini'),
    watch: z.boolean().default(true),
    hookTimeoutMs: z.number().default(60_000),
    maxHookOutputChars: z.number().default(10_000),
    memoryMaxBytes: z.number().default(32_768),
    mcpToolCallTimeoutMs: z.number().default(120_000),
  }),
  cursor: z.object({
    enabled: z.boolean().default(true),
    skills: z.boolean().default(true),
    agents: z.boolean().default(true),
    memory: z.boolean().default(true),
    hooks: z.boolean().default(true),
    permissions: z.boolean().default(true),
    mcp: z.boolean().default(true),
    userCursorDir: z.string().default('~/.cursor'),
    watch: z.boolean().default(true),
    hookTimeoutMs: z.number().default(30_000),
    maxHookOutputChars: z.number().default(10_000),
    memoryMaxBytes: z.number().default(32_768),
    mcpToolCallTimeoutMs: z.number().default(120_000),
  }),
})

export interface BridgesConfig {
  claudeCode?: ClaudeCodeConfig
  codebuddyCode?: CodebuddyCodeConfig
  opencode?: OpencodeConfig
  codex?: CodexConfig
  pi?: PiConfig
  geminiCli?: GeminiCliConfig
  cursor?: CursorConfig
}

/**
 * Bridge subsystems by agent tool. Every entry receives the shared context,
 * logger, and filesystem adapter and must register its effects through
 * ctx.effect / ctx.on / service registration so plugin teardown reverses them.
 */
export function registerBridgeSubsystems(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: BridgesConfig): void {
  registerClaudeCodeBridge(ctx, logger, fs, config.claudeCode)
  registerCodebuddyCodeBridge(ctx, logger, fs, config.codebuddyCode)
  registerOpencodeBridge(ctx, logger, fs, config.opencode)
  registerCodexBridge(ctx, logger, fs, config.codex)
  registerPiBridge(ctx, logger, fs, config.pi)
  registerGeminiCliBridge(ctx, logger, fs, config.geminiCli)
  registerCursorBridge(ctx, logger, fs, config.cursor)
}

export function apply(ctx: Context, config: BridgesConfig = {}): void {
  const logger = ctx.logger
  const fs = createFsAdapter(ctx.get('fs'))
  registerBridgeSubsystems(ctx, logger, fs, config)
}
