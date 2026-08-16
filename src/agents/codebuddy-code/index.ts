/**
 * The CodeBuddy Code bridge subsystem: skills/commands provider,
 * CODEBUDDY.md memory, and lifecycle hooks.
 *
 * One `dsh-bridges` plugin hosts one bridge subsystem per supported agent
 * tool; this subsystem mirrors the Claude Code one against CodeBuddy Code's
 * asset layout (`~/.codebuddy`, `.codebuddy/`). Each subsystem receives the
 * shared filesystem adapter and logger and registers its own providers and
 * event listeners under the plugin's fiber.
 * @module dsh-bridges/agents/codebuddy-code
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { createHookBridge } from './hooks/bridge.js'
import { createMcpBridge } from './mcp.js'
import { registerMemory } from './memory.js'
import { createPermissionEvaluator, createPermissionsOnlyBridge } from './permissions.js'
import { CodebuddySettingsLoader } from './settings.js'
import { CodebuddySkillProvider } from './skills/provider.js'

export interface CodebuddyCodeConfig {
  /** Master switch for the whole CodeBuddy Code bridge. */
  enabled?: boolean
  /** Discover and register CodeBuddy Code skills and commands. */
  skills?: boolean
  /** Discover `.codebuddy/agents` / `~/.codebuddy/agents` subagent definitions (as skills with a delegation spec). */
  agents?: boolean
  /** Bridge `.mcp.json` / `~/.codebuddy/.mcp.json` MCP servers into DSH tools. */
  mcp?: boolean
  /** Inject CODEBUDDY.md memory and always-apply rules at session start. */
  memory?: boolean
  /** Run CodeBuddy Code hooks from settings.json at DSH lifecycle seams. */
  hooks?: boolean
  /** Enforce `permissions.allow/ask/deny` rules from settings.json. */
  permissions?: boolean
  /** User-level CodeBuddy Code directory (usually `~/.codebuddy`). */
  userCodebuddyDir?: string
  /** Watch existing skill roots and settings files, republishing on change. */
  watch?: boolean
  /** Default hook timeout (ms), mirroring CodeBuddy Code's 60-second limit. */
  hookTimeoutMs?: number
  /** Cap on context-bound hook output characters. */
  maxHookOutputChars?: number
  /** Cap on the rendered CODEBUDDY.md memory block, in characters. */
  memoryMaxBytes?: number
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  mcpToolCallTimeoutMs?: number
}

export const CODEBUDDY_CODE_DEFAULTS: Required<CodebuddyCodeConfig> = {
  enabled: true,
  skills: true,
  agents: true,
  mcp: true,
  memory: true,
  hooks: true,
  permissions: true,
  userCodebuddyDir: '~/.codebuddy',
  watch: true,
  hookTimeoutMs: 60_000,
  maxHookOutputChars: 10_000,
  memoryMaxBytes: 32_768,
  mcpToolCallTimeoutMs: 120_000,
}

/** Register every CodeBuddy Code bridge piece on the shared plugin context. */
export function registerCodebuddyCodeBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: CodebuddyCodeConfig = {}): void {
  const resolved = { ...CODEBUDDY_CODE_DEFAULTS, ...config }
  if (!resolved.enabled) return

  // The settings loader is shared between the hook bridge and the skill
  // provider: both read the same settings files (hooks, env, skillOverrides).
  const loader = new CodebuddySettingsLoader(logger, fs, { userCodebuddyDir: resolved.userCodebuddyDir })

  if (resolved.skills) {
    let provider: CodebuddySkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new CodebuddySkillProvider(
        logger,
        fs,
        { userCodebuddyDir: resolved.userCodebuddyDir, watch: resolved.watch, agents: resolved.agents },
        loader,
        control.invalidate,
      )
      return provider
    })
    ctx.effect(
      () => () => {
        void provider?.dispose()
      },
      'codebuddy-code skill watchers',
    )
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, { userCodebuddyDir: resolved.userCodebuddyDir, maxBytes: resolved.memoryMaxBytes })
  }

  if (resolved.mcp) {
    const mcpLoader = new CodebuddySettingsLoader(logger, fs, { userCodebuddyDir: resolved.userCodebuddyDir })
    createMcpBridge(
      ctx,
      logger,
      fs,
      { userCodebuddyDir: resolved.userCodebuddyDir, toolCallTimeoutMs: resolved.mcpToolCallTimeoutMs },
      mcpLoader,
    )
  }

  if (resolved.hooks || resolved.permissions) {
    if (resolved.hooks) {
      // The hook bridge owns the PreToolUse composition: hook decisions run
      // first and the permission evaluator is consulted with upstream
      // precedence (deny rules always win; ask rules outrank a hook allow).
      createHookBridge(
        ctx,
        logger,
        loader,
        {
          hookTimeoutMs: resolved.hookTimeoutMs,
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
