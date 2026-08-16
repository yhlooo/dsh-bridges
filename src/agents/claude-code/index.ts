/**
 * The Claude Code bridge subsystem: skills/commands provider, CLAUDE.md
 * memory, and lifecycle hooks.
 *
 * One `dsh-bridges` plugin hosts one bridge subsystem per supported agent
 * tool; this is the first and currently the only implemented one. Each
 * subsystem receives the shared filesystem adapter and logger and registers
 * its own providers and event listeners under the plugin's fiber.
 * @module dsh-bridges/agents/claude-code
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { createHookBridge } from './hooks/bridge.js'
import { SettingsLoader } from './hooks/settings.js'
import { createMcpBridge } from './mcp.js'
import { registerMemory } from './memory.js'
import { createPermissionEvaluator, createPermissionsOnlyBridge } from './permissions.js'
import { ClaudeSkillProvider } from './skills/provider.js'

export interface ClaudeCodeConfig {
  /** Master switch for the whole Claude Code bridge. */
  enabled?: boolean
  /** Discover and register Claude Code skills and commands. */
  skills?: boolean
  /** Discover `.claude/agents` / `~/.claude/agents` subagent definitions (as skills with a delegation spec). */
  agents?: boolean
  /** Bridge `.mcp.json` / `~/.claude.json` MCP servers into DSH tools. */
  mcp?: boolean
  /** Inject `~/.claude/CLAUDE.md` and `.claude/CLAUDE.md` at session start. */
  memory?: boolean
  /** Run Claude Code hooks from settings.json at DSH lifecycle seams. */
  hooks?: boolean
  /** Enforce `permissions.allow/ask/deny` rules from settings.json. */
  permissions?: boolean
  /** User-level Claude Code directory (usually `~/.claude`). */
  userClaudeDir?: string
  /** Watch existing skill roots and republish the catalog on change. */
  watch?: boolean
  /** Default hook timeout (ms). */
  hookTimeoutMs?: number
  /** UserPromptSubmit hook timeout, mirroring Claude Code's 30-second default. */
  userPromptHookTimeoutMs?: number
  /** Cap on context-bound hook output characters (Claude Code caps at 10,000). */
  maxHookOutputChars?: number
  /** Cap on the rendered CLAUDE.md memory block, in characters. */
  memoryMaxBytes?: number
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  mcpToolCallTimeoutMs?: number
}

export const CLAUDE_CODE_DEFAULTS: Required<ClaudeCodeConfig> = {
  enabled: true,
  skills: true,
  agents: true,
  mcp: true,
  memory: true,
  hooks: true,
  permissions: true,
  userClaudeDir: '~/.claude',
  watch: true,
  hookTimeoutMs: 600_000,
  userPromptHookTimeoutMs: 30_000,
  maxHookOutputChars: 10_000,
  memoryMaxBytes: 32_768,
  mcpToolCallTimeoutMs: 120_000,
}

/** Register every Claude Code bridge piece on the shared plugin context. */
export function registerClaudeCodeBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: ClaudeCodeConfig = {}): void {
  const resolved = { ...CLAUDE_CODE_DEFAULTS, ...config }
  if (!resolved.enabled) return

  if (resolved.skills) {
    let provider: ClaudeSkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new ClaudeSkillProvider(logger, fs, { userClaudeDir: resolved.userClaudeDir, watch: resolved.watch, agents: resolved.agents }, control.invalidate)
      return provider
    })
    ctx.effect(
      () => () => {
        void provider?.dispose()
      },
      'claude-code skill watchers',
    )
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, { userClaudeDir: resolved.userClaudeDir, maxBytes: resolved.memoryMaxBytes })
  }

  if (resolved.mcp) {
    const mcpLoader = new SettingsLoader(logger, fs, { userClaudeDir: resolved.userClaudeDir })
    createMcpBridge(ctx, logger, fs, { userClaudeDir: resolved.userClaudeDir, toolCallTimeoutMs: resolved.mcpToolCallTimeoutMs }, mcpLoader)
  }

  if (resolved.hooks || resolved.permissions) {
    const loader = new SettingsLoader(logger, fs, { userClaudeDir: resolved.userClaudeDir })
    if (resolved.hooks) {
      // The hook bridge owns the PreToolUse composition: hook decisions run
      // first and the permission evaluator is consulted with upstream
      // precedence (deny rules always win; ask rules outrank a hook allow).
      createHookBridge(
        ctx,
        logger,
        fs,
        loader,
        {
          hookTimeoutMs: resolved.hookTimeoutMs,
          userPromptHookTimeoutMs: resolved.userPromptHookTimeoutMs,
          maxHookOutputChars: resolved.maxHookOutputChars,
        },
        resolved.permissions ? createPermissionEvaluator(logger, loader) : undefined,
      )
    } else {
      // Permissions without hooks: a standalone pre-execute listener.
      createPermissionsOnlyBridge(ctx, logger, loader)
    }
  }
}
