/**
 * opencode MCP servers (`mcp` in `opencode.json(c)`) bridged into DSH.
 *
 * The opencode settings loader already reads the `mcp` object across the
 * global + project layers (project overrides per name), so this manager only
 * normalizes each entry onto the dsh client config:
 *
 * - `type: "local"` → stdio transport; `command` is an array (executable +
 *   args) per opencode's format, `environment` becomes the child env.
 * - `type: "remote"` → streamable-http transport with `url` (+ optional
 *   `headers`); OAuth flows have no DSH seam and are recorded as a
 *   limitation.
 * - `enabled: false` skips the server.
 *
 * opencode connects every configured server without an approval list; the
 * dsh tool approval stack gates their tools instead.
 * @module dsh-bridges/agents/opencode/mcp
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
import type { OpencodeMcpEntry, OpencodeSettingsLoader } from './settings.js'

export interface OpencodeMcpConfig {
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  toolCallTimeoutMs: number
}

/** Normalize one `mcp.<name>` entry (exported for tests). */
export function normalizeOpencodeServer(name: string, entry: OpencodeMcpEntry, toolCallTimeoutMs: number): DesiredServer | undefined {
  if (!entry.enabled) return undefined
  const serverName = sanitizeServerName(name, 'opencode')
  if (serverName === undefined) return undefined
  const base = { serverName, toolCallTimeoutMs, failOnStartupError: true as const }
  if (entry.type === 'remote' && entry.url !== undefined) {
    return { name, config: { transport: 'streamable-http', ...base, url: entry.url, headers: entry.headers ?? {} } }
  }
  if (entry.type === 'local' && entry.command !== undefined) {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(entry.environment ?? {})) env[key] = expandEnvReferences(value)
    const [command, ...args] = entry.command
    return { name, config: { transport: 'stdio', ...base, command: command ?? '', args, env, cwd: process.cwd() } }
  }
  return undefined
}

export class OpencodeMcpManager {
  readonly manager: McpManager

  constructor(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: OpencodeMcpConfig, settingsLoader: OpencodeSettingsLoader) {
    const options: McpBridgeOptions = {
      prefix: 'opencode',
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      readServers: async (cwd) => {
        const settings = await settingsLoader.load(cwd)
        const user = new Map<string, DesiredServer>()
        for (const [name, entry] of settings.mcp) {
          const normalized = normalizeOpencodeServer(name, entry, config.toolCallTimeoutMs)
          if (normalized !== undefined) user.set(name, normalized)
        }
        return { user, project: new Map() }
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
  config: OpencodeMcpConfig,
  settingsLoader: OpencodeSettingsLoader,
): void {
  const manager = new OpencodeMcpManager(ctx, logger, fs, config, settingsLoader)
  createSharedMcpBridge(ctx, manager.manager)
}
