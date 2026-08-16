/**
 * The Codex bridge subsystem: skills provider, AGENTS.md instruction-chain
 * memory, and lifecycle hooks.
 *
 * One `dsh-bridges` plugin hosts one bridge subsystem per supported agent
 * tool; this one mirrors the Claude Code / CodeBuddy Code subsystems against
 * Codex's asset layout (`~/.codex/`, `~/.agents/skills/`,
 * `$CWD/.agents/skills/`, `.codex/config.toml` + `hooks.json`). Each
 * subsystem receives the shared filesystem adapter and logger and registers
 * its own providers and event listeners under the plugin's fiber.
 *
 * `CODEX_HOME` is honored like Codex does: when set in the environment, it
 * replaces the configured `userCodexDir`.
 * @module dsh-bridges/agents/codex
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { createHookBridge } from './hooks/bridge.js'
import { createMcpBridge } from './mcp.js'
import { registerMemory } from './memory.js'
import { createPermissionsBridge } from './permissions.js'
import { CodexSettingsLoader } from './settings.js'
import { CodexSkillProvider } from './skills/provider.js'

export interface CodexConfig {
  /** Master switch for the whole Codex bridge. */
  enabled?: boolean
  /** Discover and register Codex skills (`.agents/skills`, `~/.agents/skills`, `/etc/codex/skills`). */
  skills?: boolean
  /** Inject the Codex AGENTS.md instruction chain at session start. */
  memory?: boolean
  /** Run Codex hooks from hooks.json / config.toml at DSH lifecycle seams. */
  hooks?: boolean
  /** Apply config.toml `approval_policy` / `sandbox_mode` / `default_permissions` at session start. */
  permissions?: boolean
  /** Bridge config.toml `[mcp_servers]` entries into DSH tools. */
  mcp?: boolean
  /** User-level Codex directory (usually `~/.codex`; `CODEX_HOME` wins when set). */
  userCodexDir?: string
  /** User-level skills directory (Codex uses `~/.agents/skills`). */
  userSkillsDir?: string
  /** Watch existing skill roots and settings files, republishing on change. */
  watch?: boolean
  /** Default hook timeout (ms), mirroring Codex's 600-second default. */
  hookTimeoutMs?: number
  /** Cap on context-bound hook output characters. */
  maxHookOutputChars?: number
  /** Cap on the rendered AGENTS.md memory block, in characters. */
  memoryMaxBytes?: number
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  mcpToolCallTimeoutMs?: number
}

export const CODEX_DEFAULTS: Required<CodexConfig> = {
  enabled: true,
  skills: true,
  memory: true,
  hooks: true,
  permissions: true,
  mcp: true,
  userCodexDir: '~/.codex',
  userSkillsDir: '~/.agents/skills',
  watch: true,
  hookTimeoutMs: 600_000,
  maxHookOutputChars: 10_000,
  memoryMaxBytes: 32_768,
  mcpToolCallTimeoutMs: 120_000,
}

/** Register every Codex bridge piece on the shared plugin context. */
export function registerCodexBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: CodexConfig = {}): void {
  const resolved = { ...CODEX_DEFAULTS, ...config }
  if (!resolved.enabled) return

  // Codex honors CODEX_HOME for its user-level directory; the bridge does
  // the same so sessions inside `CODEX_HOME=... codex` keep their assets.
  const userCodexDir =
    process.env['CODEX_HOME'] && process.env['CODEX_HOME'].trim() !== '' ? process.env['CODEX_HOME'] : resolved.userCodexDir

  // The settings loader is shared between the hook bridge, the skill
  // provider, and the memory bridge: all three read config.toml /
  // hooks.json (hooks, [[skills.config]], project_doc_*).
  const loader = new CodexSettingsLoader(logger, fs, { userCodexDir })

  if (resolved.skills) {
    let provider: CodexSkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new CodexSkillProvider(
        logger,
        fs,
        { userCodexDir, userSkillsDir: resolved.userSkillsDir, watch: resolved.watch },
        loader,
        control.invalidate,
      )
      return provider
    })
    ctx.effect(
      () => () => {
        void provider?.dispose()
      },
      'codex skill watchers',
    )
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, loader, { userCodexDir, maxBytes: resolved.memoryMaxBytes })
  }

  if (resolved.hooks) {
    createHookBridge(ctx, logger, loader, {
      hookTimeoutMs: resolved.hookTimeoutMs,
      maxHookOutputChars: resolved.maxHookOutputChars,
    })
  }

  if (resolved.permissions) {
    createPermissionsBridge(ctx, logger, loader)
  }

  if (resolved.mcp) {
    createMcpBridge(ctx, logger, fs, { toolCallTimeoutMs: resolved.mcpToolCallTimeoutMs }, loader)
  }
}
