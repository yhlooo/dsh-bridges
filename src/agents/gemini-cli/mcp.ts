/**
 * Gemini CLI MCP servers (settings.json `mcpServers`) bridged into DSH.
 *
 * Transport precedence per entry follows Gemini: `httpUrl` (streamable-http)
 * > `url` (SSE, degraded to streamable-http with a warning) > `command`
 * (stdio). `${VAR}` / `${VAR:-DEFAULT}` references in `env` expand from the
 * process environment; relative `cwd` resolves against the declaring settings
 * file's directory. `mcp.allowed` filters the connected set (undefined =
 * everything allowed), `mcp.excluded` always skips.
 *
 * Recorded limitations: `includeTools` / `excludeTools` (no per-tool filter
 * seam), `trust` gating (read but not enforced — the DSH tool approval stack
 * gates the tools), OAuth (`targetAudience` / `targetServiceAccount`), and
 * the admin-tier enterprise controls.
 * @module dsh-bridges/agents/gemini-cli/mcp
 */
import { isAbsolute, join } from 'node:path'
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
import type { GeminiSettingsLoader, RawGeminiMcpServer } from './settings.js'

export interface GeminiMcpConfig {
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  toolCallTimeoutMs: number
}

/** Normalize one `mcpServers.<name>` entry (exported for tests). */
export function normalizeGeminiServer(
  name: string,
  entry: RawGeminiMcpServer,
  toolCallTimeoutMs: number,
  logger: BridgeLogger,
): DesiredServer | undefined {
  const serverName = sanitizeServerName(name, 'gemini')
  if (serverName === undefined) return undefined
  const base = { serverName, toolCallTimeoutMs, failOnStartupError: true as const }
  if (entry.trust === false) {
    logger.warn(
      `gemini-cli: MCP server ${JSON.stringify(name)} is marked untrusted upstream; the DSH tool approval stack gates its tools instead`,
    )
  }
  if (entry.httpUrl !== undefined) {
    return {
      name,
      config: { transport: 'streamable-http', ...base, url: expandEnvReferences(entry.httpUrl), headers: entry.headers ?? {} },
    }
  }
  if (entry.url !== undefined) {
    // Gemini's `url` is an SSE endpoint; the bridge degrades it to the
    // streamable-http transport (the claude-code precedent).
    logger.warn(`gemini-cli: MCP server ${JSON.stringify(name)} uses the SSE "url" field; connecting over streamable-http instead`)
    return {
      name,
      config: { transport: 'streamable-http', ...base, url: expandEnvReferences(entry.url), headers: entry.headers ?? {} },
    }
  }
  if (entry.command !== undefined) {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(entry.env ?? {})) env[key] = expandEnvReferences(value)
    const cwd = entry.cwd !== undefined ? resolveRelative(entry.cwd, entry.baseDir) : process.cwd()
    return {
      name,
      config: {
        transport: 'stdio',
        ...base,
        command: expandEnvReferences(entry.command),
        args: (entry.args ?? []).map((arg) => expandEnvReferences(arg)),
        env,
        cwd,
      },
    }
  }
  return undefined
}

function resolveRelative(path: string, baseDir: string): string {
  if (isAbsolute(path)) return path
  return join(baseDir, path)
}

export class GeminiMcpManager {
  readonly manager: McpManager

  constructor(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: GeminiMcpConfig, settingsLoader: GeminiSettingsLoader) {
    const options: McpBridgeOptions = {
      prefix: 'gemini',
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      readServers: async (cwd) => {
        const settings = await settingsLoader.load(cwd)
        const user = new Map<string, DesiredServer>()
        for (const [name, entry] of settings.mcpServers) {
          if (settings.mcpExcluded.includes(name)) continue
          if (settings.mcpAllowed !== undefined && !settings.mcpAllowed.includes(name)) continue
          const normalized = normalizeGeminiServer(name, entry, config.toolCallTimeoutMs, logger)
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
  config: GeminiMcpConfig,
  settingsLoader: GeminiSettingsLoader,
): void {
  const manager = new GeminiMcpManager(ctx, logger, fs, config, settingsLoader)
  createSharedMcpBridge(ctx, manager.manager)
}
