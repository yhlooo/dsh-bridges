/**
 * The Cursor bridge subsystem: skills/subagent provider, rules memory,
 * hooks, CLI permission rules, and MCP servers.
 *
 * One `dsh-bridges` plugin hosts one bridge subsystem per supported agent
 * tool; this one mirrors the Claude Code / Gemini subsystems against
 * Cursor's asset layout (`~/.cursor/`, `.cursor/`). Each subsystem receives
 * the shared filesystem adapter and logger and registers its own providers
 * and event listeners under the plugin's fiber.
 *
 * `CURSOR_CONFIG_DIR` is honored like Cursor does: when set in the
 * environment, it replaces the configured `userCursorDir`.
 * @module dsh-bridges/agents/cursor
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { createHookBridge } from './hooks/bridge.js'
import { registerMemory } from './memory.js'
import { createPermissionsEvaluator } from './permissions.js'
import { CursorSettingsLoader } from './settings.js'
import { CursorSkillProvider } from './skills/provider.js'
import { createMcpBridge } from './mcp.js'

export interface CursorConfig {
  /** Master switch for the whole Cursor bridge. */
  enabled?: boolean
  /** Discover and register `.cursor` / `~/.cursor` skills. */
  skills?: boolean
  /** Discover and register `.cursor` / `~/.cursor` subagent definitions. */
  agents?: boolean
  /** Inject `.cursor/rules` always-apply rules and subdirectory AGENTS.md files. */
  memory?: boolean
  /** Run Cursor hooks from hooks.json at DSH lifecycle seams. */
  hooks?: boolean
  /** Enforce cli.json / cli-config.json permission rules at the tools seam. */
  permissions?: boolean
  /** Bridge .cursor/mcp.json / ~/.cursor/mcp.json servers into DSH tools. */
  mcp?: boolean
  /** User-level Cursor directory (usually `~/.cursor`; `CURSOR_CONFIG_DIR` wins). */
  userCursorDir?: string
  /** Watch existing asset roots and config files, republishing on change. */
  watch?: boolean
  /** Default hook timeout (ms); Cursor's own default is 30 seconds. */
  hookTimeoutMs?: number
  /** Cap on context-bound hook output characters. */
  maxHookOutputChars?: number
  /** Cap on the rendered rules-memory block, in characters. */
  memoryMaxBytes?: number
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  mcpToolCallTimeoutMs?: number
}

export const CURSOR_DEFAULTS: Required<CursorConfig> = {
  enabled: true,
  skills: true,
  agents: true,
  memory: true,
  hooks: true,
  permissions: true,
  mcp: true,
  userCursorDir: '~/.cursor',
  watch: true,
  hookTimeoutMs: 30_000,
  maxHookOutputChars: 10_000,
  memoryMaxBytes: 32_768,
  mcpToolCallTimeoutMs: 120_000,
}

/** Register every Cursor bridge piece on the shared plugin context. */
export function registerCursorBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: CursorConfig = {}): void {
  const resolved = { ...CURSOR_DEFAULTS, ...config }
  if (!resolved.enabled) return

  const loader = new CursorSettingsLoader(logger, fs, { userCursorDir: resolved.userCursorDir })

  if (resolved.skills || resolved.agents) {
    let provider: CursorSkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new CursorSkillProvider(
        logger,
        fs,
        { userCursorDir: resolved.userCursorDir, watch: resolved.watch, agents: resolved.agents },
        loader,
        control.invalidate,
      )
      return provider
    })
    ctx.effect(
      () => () => {
        void provider?.dispose()
      },
      'cursor skill watchers',
    )
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, { maxBytes: resolved.memoryMaxBytes })
  }

  const evaluator = resolved.permissions
    ? createPermissionsEvaluator(ctx, logger, async (cwd) => {
        const settings = await loader.load(cwd)
        return { allow: settings.permissionAllow, deny: settings.permissionDeny }
      })
    : undefined

  if (resolved.hooks || evaluator !== undefined) {
    createHookBridge(
      ctx,
      logger,
      loader,
      { hookTimeoutMs: resolved.hookTimeoutMs, maxHookOutputChars: resolved.maxHookOutputChars },
      evaluator,
    )
  }

  if (resolved.mcp) {
    createMcpBridge(ctx, logger, fs, { toolCallTimeoutMs: resolved.mcpToolCallTimeoutMs }, loader)
  }
}
