/**
 * Claude Code MCP servers (`.mcp.json` + `~/.claude.json`) bridged into DSH.
 *
 * Thin Claude-specific wiring over the shared `src/mcp-bridge.ts` manager:
 * `~/.claude.json` `mcpServers` (user scope, always connected) and
 * `<cwd>/.mcp.json` (project scope, subject to the approval policy) — a
 * project server overrides a same-name user server, as in Claude Code.
 *
 * Project `.mcp.json` servers need approval upstream
 * (`enableAllProjectMcpServers` / `enabledMcpjsonServers`); unapproved
 * project servers are skipped with a warning, and `disabledMcpjsonServers`
 * always skip — matching Claude Code's connect-on-approval behavior.
 * @module dsh-bridges/agents/claude-code/mcp
 */
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import {
  createMcpBridge as createSharedMcpBridge,
  expandEnvReferences,
  McpManager,
  normalizeClaudeStyleEntry,
  readJsonServerFiles,
  sanitizeServerName,
  type McpBridgeOptions,
} from '../../mcp-bridge.js'
import type { BridgeLogger } from '../../util.js'
import { expandHome } from '../../util.js'
import type { SettingsLoader } from './hooks/settings.js'

export { expandEnvReferences, sanitizeServerName }

export interface ClaudeMcpConfig {
  userClaudeDir: string
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  toolCallTimeoutMs: number
}

/** Normalize one `.mcp.json` / `~/.claude.json` entry (exported for tests). */
export function normalizeServer(name: string, entry: Record<string, unknown>, toolCallTimeoutMs: number) {
  return normalizeClaudeStyleEntry(name, entry, 'claude', toolCallTimeoutMs)
}

export class ClaudeMcpManager {
  readonly manager: McpManager

  constructor(
    ctx: Context,
    logger: BridgeLogger,
    fs: FsAdapter,
    config: ClaudeMcpConfig,
    settingsLoader: SettingsLoader,
  ) {
    const userFile = join(dirname(expandHome(config.userClaudeDir)), '.claude.json')
    const normalize = (name: string, entry: Record<string, unknown>, baseEnv?: Readonly<Record<string, string>>) =>
      normalizeClaudeStyleEntry(name, entry, 'claude', config.toolCallTimeoutMs, baseEnv)
    const options: McpBridgeOptions = {
      prefix: 'claude',
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      readServers: async (cwd) => {
        // settings.json `env` applies to every session and subprocess Claude
        // Code spawns; the bridge merges it under MCP server child env.
        const env = (await settingsLoader.load(cwd)).env
        return {
          user: await readJsonServerFiles(fs, logger, [userFile], (name, entry) => normalize(name, entry, env)),
          project: await readJsonServerFiles(fs, logger, [join(cwd, '.mcp.json')], (name, entry) => normalize(name, entry, env)),
        }
      },
      readPolicy: async (cwd) => (await settingsLoader.load(cwd)).mcpjsonServers,
      watchFiles: (cwd) => [userFile, join(cwd, '.mcp.json')],
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
export function createMcpBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: ClaudeMcpConfig, settingsLoader: SettingsLoader): void {
  const manager = new ClaudeMcpManager(ctx, logger, fs, config, settingsLoader)
  createSharedMcpBridge(ctx, manager.manager)
}
