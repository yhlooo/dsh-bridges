/**
 * Codex MCP servers (`[mcp_servers.<id>]` in `config.toml` layers) bridged
 * into DSH.
 *
 * The Codex settings loader already parses the `[mcp_servers.<id>]` tables
 * across every active layer (most-specific layer per id), so this manager
 * only normalizes each entry onto the dsh client config:
 *
 * - `url` → streamable-http transport with `http_headers` plus a bearer token
 *   from `bearer_token_env_var`; `auth` (oauth/chatgpt) has no DSH seam and is
 *   recorded as a limitation.
 * - `command` → stdio transport with `args`, `env` (plus `env_vars`
 *   whitelisted from the process environment), and `cwd`.
 * - `enabled = false` skips the server; `required` servers that fail to start
 *   still fail open with a warning (the bridge-wide policy).
 * - `enabled_tools` / `disabled_tools` / approval modes / `scopes` have no
 *   per-tool filter seam and are recorded as limitations.
 *
 * Codex trusts project `.codex/` layers before loading them; the bridge has
 * no trust state and reads them unconditionally (documented limitation), so
 * project `[mcp_servers]` connect without an approval gate (the dsh tool
 * approval stack gates their tools instead).
 * @module dsh-bridges/agents/codex/mcp
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import {
  createMcpBridge as createSharedMcpBridge,
  expandEnvReferences,
  McpManager,
  sanitizeServerName,
  type DesiredServer,
  type McpBridgeOptions,
} from '../../mcp-bridge.js'
import type { BridgeLogger } from '../../util.js'
import type { CodexSettingsLoader, RawCodexMcpServer } from './settings.js'

export interface CodexMcpConfig {
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  toolCallTimeoutMs: number
}

/** Normalize one `[mcp_servers.<id>]` table (exported for tests). */
export function normalizeCodexServer(
  name: string,
  entry: RawCodexMcpServer,
  toolCallTimeoutMs: number,
  sessionCwd?: string,
): DesiredServer | undefined {
  if (entry.enabled === false) return undefined
  const serverName = sanitizeServerName(name, 'codex')
  if (serverName === undefined) return undefined
  const base = { serverName, toolCallTimeoutMs, failOnStartupError: true as const }
  if (entry.url !== undefined) {
    const headers: Record<string, string> = { ...(entry.http_headers ?? {}) }
    if (entry.bearer_token_env_var !== undefined) {
      const token = process.env[entry.bearer_token_env_var]
      if (token !== undefined) headers['Authorization'] = `Bearer ${token}`
    }
    return { name, config: { transport: 'streamable-http', ...base, url: entry.url, headers } }
  }
  if (entry.command !== undefined) {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(entry.env ?? {})) env[key] = expandEnvReferences(value)
    for (const key of entry.env_vars ?? []) {
      const value = process.env[key]
      if (value !== undefined) env[key] = value
    }
    return {
      name,
      config: {
        transport: 'stdio',
        ...base,
        command: entry.command,
        args: entry.args ?? [],
        env,
        cwd: entry.cwd ?? sessionCwd ?? process.cwd(),
      },
    }
  }
  return undefined
}

export class CodexMcpManager {
  readonly manager: McpManager

  constructor(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: CodexMcpConfig, settingsLoader: CodexSettingsLoader) {
    const options: McpBridgeOptions = {
      prefix: 'codex',
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      readServers: async (cwd) => {
        const settings = await settingsLoader.load(cwd)
        const project = new Map<string, DesiredServer>()
        const user = new Map<string, DesiredServer>()
        for (const [name, entry] of settings.mcpServers) {
          const normalized = normalizeCodexServer(name, entry, config.toolCallTimeoutMs, cwd)
          if (normalized === undefined) continue
          // The Codex loader does not track which layer defined a server;
          // the bridge treats every configured server as user-scope (always
          // connected) — project trust gating is a documented limitation.
          user.set(name, normalized)
        }
        return { user, project }
      },
      readPolicy: async () => ({ enableAll: true, enabled: new Set(), disabled: new Set() }),
      watchFiles: (cwd) => settingsLoader.sourcePaths(cwd),
    }
    this.manager = new McpManager(ctx, logger, fs, options)
  }

  async reconcile(cwd: string): Promise<void> {
    return this.manager.reconcile(cwd)
  }

  async dispose(): Promise<void> {
    return this.manager.dispose()
  }
}

/** Register the manager on the plugin fiber and reconcile at session start. */
export function createMcpBridge(
  ctx: Context,
  logger: BridgeLogger,
  fs: FsAdapter,
  config: CodexMcpConfig,
  settingsLoader: CodexSettingsLoader,
): void {
  const manager = new CodexMcpManager(ctx, logger, fs, config, settingsLoader)
  createSharedMcpBridge(ctx, manager.manager)
}
