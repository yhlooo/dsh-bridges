/**
 * The Gemini CLI bridge subsystem: skills/commands/subagent provider,
 * GEMINI.md memory, settings.json hooks, Policy Engine permission rules, and
 * MCP servers.
 *
 * One `dsh-bridges` plugin hosts one bridge subsystem per supported agent
 * tool; this one mirrors the Claude Code / Codex subsystems against Gemini's
 * asset layout (`~/.gemini/`, `.gemini/`, `/etc/gemini-cli/`). Each subsystem
 * receives the shared filesystem adapter and logger and registers its own
 * providers and event listeners under the plugin's fiber.
 *
 * `GEMINI_CLI_HOME` is honored like Gemini does: when set in the environment,
 * it replaces the configured `userGeminiDir`.
 * @module dsh-bridges/agents/gemini-cli
 */
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { createHookBridge } from './hooks/bridge.js'
import { registerMemory } from './memory.js'
import { evaluatePolicy, GeminiPolicyLoader } from './permissions.js'
import { GeminiSettingsLoader } from './settings.js'
import { GeminiSkillProvider } from './skills/provider.js'
import { createMcpBridge } from './mcp.js'

export interface GeminiCliConfig {
  /** Master switch for the whole Gemini CLI bridge. */
  enabled?: boolean
  /** Discover and register `.gemini` / `~/.gemini` skills and commands. */
  skills?: boolean
  /** Discover and register `.gemini` / `~/.gemini` subagent definitions. */
  agents?: boolean
  /** Inject the GEMINI.md context chain at session start. */
  memory?: boolean
  /** Run Gemini hooks from settings.json at DSH lifecycle seams. */
  hooks?: boolean
  /** Enforce `~/.gemini/policies/*.toml` rules at the tools seam. */
  permissions?: boolean
  /** Bridge settings.json `mcpServers` into DSH tools. */
  mcp?: boolean
  /** User-level Gemini directory (usually `~/.gemini`; `GEMINI_CLI_HOME` wins). */
  userGeminiDir?: string
  /** Watch existing asset roots and config files, republishing on change. */
  watch?: boolean
  /** Default hook timeout (ms), mirroring Gemini's 60,000 ms default. */
  hookTimeoutMs?: number
  /** Cap on context-bound hook output characters. */
  maxHookOutputChars?: number
  /** Cap on the rendered GEMINI.md memory block, in characters. */
  memoryMaxBytes?: number
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  mcpToolCallTimeoutMs?: number
}

export const GEMINI_CLI_DEFAULTS: Required<GeminiCliConfig> = {
  enabled: true,
  skills: true,
  agents: true,
  memory: true,
  hooks: true,
  permissions: true,
  mcp: true,
  userGeminiDir: '~/.gemini',
  watch: true,
  hookTimeoutMs: 60_000,
  maxHookOutputChars: 10_000,
  memoryMaxBytes: 32_768,
  mcpToolCallTimeoutMs: 120_000,
}

/** Register every Gemini CLI bridge piece on the shared plugin context. */
export function registerGeminiCliBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: GeminiCliConfig = {}): void {
  const resolved = { ...GEMINI_CLI_DEFAULTS, ...config }
  if (!resolved.enabled) return

  // The settings loader is shared by every piece: skills/commands discovery,
  // memory, hooks, permission policies, and MCP all read settings.json.
  const loader = new GeminiSettingsLoader(logger, fs, { userGeminiDir: resolved.userGeminiDir })

  if (resolved.skills || resolved.agents) {
    let provider: GeminiSkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new GeminiSkillProvider(
        logger,
        fs,
        { userGeminiDir: resolved.userGeminiDir, watch: resolved.watch, agents: resolved.agents },
        loader,
        control.invalidate,
      )
      return provider
    })
    ctx.effect(
      () => () => {
        void provider?.dispose()
      },
      'gemini-cli skill watchers',
    )
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, loader, { userGeminiDir: resolved.userGeminiDir, maxBytes: resolved.memoryMaxBytes })
  }

  if (resolved.permissions) {
    // The policy loader is shared with the hook bridge so hook decisions and
    // policy rules compose at the same tools/pre-execute seam.
    const policies = new GeminiPolicyLoader(logger, fs, loader.userDir())
    if (resolved.hooks) {
      createHookBridge(
        ctx,
        logger,
        loader,
        { hookTimeoutMs: resolved.hookTimeoutMs, maxHookOutputChars: resolved.maxHookOutputChars },
        (exec) => evaluatePolicies(policies, exec),
      )
    } else {
      ctx.on('tools/pre-execute', (exec, next) => evaluatePoliciesThenNext(policies, exec, logger, next))
    }
  } else if (resolved.hooks) {
    createHookBridge(ctx, logger, loader, { hookTimeoutMs: resolved.hookTimeoutMs, maxHookOutputChars: resolved.maxHookOutputChars })
  }

  if (resolved.mcp) {
    createMcpBridge(ctx, logger, fs, { toolCallTimeoutMs: resolved.mcpToolCallTimeoutMs }, loader)
  }
}

async function evaluatePolicies(policies: GeminiPolicyLoader, exec: ToolExecution) {
  const rules = await policies.load()
  if (rules.length === 0) return undefined
  return evaluatePolicy(rules, exec)
}

async function evaluatePoliciesThenNext(
  policies: GeminiPolicyLoader,
  exec: ToolExecution,
  logger: BridgeLogger,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  try {
    const verdict = await evaluatePolicies(policies, exec)
    if (verdict === undefined) return next()
    return verdict
  } catch (error) {
    logger.warn(`gemini-cli: permission rules failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}
