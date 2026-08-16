/**
 * Cursor MCP servers (`.cursor/mcp.json` + `~/.cursor/mcp.json`) bridged
 * into DSH.
 *
 * Entries: `type: "stdio"` (command/args/env/envFile) or remote (`url` +
 * headers; `type` "http"/"sse" degrade to streamable-http like the other
 * bridges). `${env:VAR}` and `${workspaceFolder}` references interpolate
 * (workspaceFolder = the session working directory). Project entries
 * override user entries per name. `auth` OAuth flows are recorded as a
 * limitation.
 * @module dsh-bridges/agents/cursor/mcp
 */
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import {
  createMcpBridge as createSharedMcpBridge,
  McpManager,
  sanitizeServerName,
  type DesiredServer,
  type McpBridgeOptions,
} from '../../mcp-bridge.js'
import type { BridgeLogger } from '../../util.js'
import type { CursorSettingsLoader, RawCursorMcpServer } from './settings.js'

export interface CursorMcpConfig {
  toolCallTimeoutMs: number
}

/** Interpolate `${env:VAR}` and `${workspaceFolder}` references. */
export function interpolateCursor(value: string, workspaceFolder: string): string {
  return value
    .replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => process.env[name] ?? '')
    .replace(/\$\{workspaceFolder\}/g, workspaceFolder)
}

async function readEnvFile(fs: FsAdapter, path: string): Promise<Record<string, string>> {
  const env: Record<string, string> = {}
  try {
    if (!(await fs.fileExists(path))) return env
    const text = await fs.readText(path)
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const index = trimmed.indexOf('=')
      if (index <= 0) continue
      env[trimmed.slice(0, index).trim()] = trimmed.slice(index + 1).trim()
    }
  } catch {
    // envFile failures fail soft (like the other startup failures)
  }
  return env
}

/** Normalize one `mcpServers.<name>` entry (exported for tests). */
export async function normalizeCursorServer(
  fs: FsAdapter,
  name: string,
  entry: RawCursorMcpServer,
  workspaceFolder: string,
  toolCallTimeoutMs: number,
): Promise<DesiredServer | undefined> {
  const serverName = sanitizeServerName(name, 'cursor')
  if (serverName === undefined) return undefined
  const base = { serverName, toolCallTimeoutMs, failOnStartupError: true as const }
  if (entry.url !== undefined) {
    return {
      name,
      config: {
        transport: 'streamable-http',
        ...base,
        url: interpolateCursor(entry.url, workspaceFolder),
        headers: Object.fromEntries(
          Object.entries(entry.headers ?? {}).map(([key, value]) => [key, interpolateCursor(value, workspaceFolder)]),
        ),
      },
    }
  }
  if (entry.command !== undefined) {
    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(entry.env ?? {})) env[key] = interpolateCursor(value, workspaceFolder)
    if (entry.envFile !== undefined) {
      const envFilePath = resolveRelative(entry.envFile, entry.baseDir)
      Object.assign(env, await readEnvFile(fs, envFilePath))
    }
    const cwd = entry.cwd !== undefined ? resolveRelative(entry.cwd, entry.baseDir) : workspaceFolder
    return {
      name,
      config: {
        transport: 'stdio',
        ...base,
        command: interpolateCursor(entry.command, workspaceFolder),
        args: (entry.args ?? []).map((arg) => interpolateCursor(arg, workspaceFolder)),
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

export class CursorMcpManager {
  readonly manager: McpManager

  constructor(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: CursorMcpConfig, settingsLoader: CursorSettingsLoader) {
    const options: McpBridgeOptions = {
      prefix: 'cursor',
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      readServers: async (cwd) => {
        const settings = await settingsLoader.load(cwd)
        const user = new Map<string, DesiredServer>()
        for (const [name, entry] of settings.mcpServers) {
          const normalized = await normalizeCursorServer(fs, name, entry, cwd ?? process.cwd(), config.toolCallTimeoutMs)
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
  config: CursorMcpConfig,
  settingsLoader: CursorSettingsLoader,
): void {
  const manager = new CursorMcpManager(ctx, logger, fs, config, settingsLoader)
  createSharedMcpBridge(ctx, manager.manager)
}
