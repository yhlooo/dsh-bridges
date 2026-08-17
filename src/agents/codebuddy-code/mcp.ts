/**
 * CodeBuddy Code MCP servers bridged into DSH.
 *
 * Thin CodeBuddy-specific wiring over the shared `src/mcp-bridge.ts` manager.
 * Config files, broadest first: `~/.codebuddy/.mcp.json` (current user form),
 * `~/.codebuddy/mcp.json` (deprecated), `~/.codebuddy.json` (legacy), then
 * the project `<cwd>/.mcp.json` (current) and `<cwd>/mcp.json` (deprecated) —
 * a project server overrides a same-name user server. Project servers follow
 * the approval settings (`enableAllProjectMcpServers` /
 * `enabledMcpjsonServers` / `disabledMcpjsonServers`), as in CodeBuddy Code.
 * @module dsh-bridges/agents/codebuddy-code/mcp
 */
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import {
  createMcpBridge as createSharedMcpBridge,
  McpManager,
  normalizeClaudeStyleEntry,
  readJsonServerFiles,
  type McpBridgeOptions,
} from '../../mcp-bridge.js'
import type { BridgeLogger } from '../../util.js'
import { expandHome } from '../../util.js'
import type { CodebuddySettingsLoader } from './settings.js'

export interface CodebuddyMcpConfig {
  userCodebuddyDir: string
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  toolCallTimeoutMs: number
}

export class CodebuddyMcpManager {
  readonly manager: McpManager

  constructor(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: CodebuddyMcpConfig, settingsLoader: CodebuddySettingsLoader) {
    const userDir = expandHome(config.userCodebuddyDir)
    const userFiles = [join(userDir, '.mcp.json'), join(userDir, 'mcp.json'), join(dirname(userDir), '.codebuddy.json')]
    const options: McpBridgeOptions = {
      prefix: 'codebuddy',
      toolCallTimeoutMs: config.toolCallTimeoutMs,
      readServers: async (cwd) => {
        // settings.json `env` applies to every session upstream; the bridge
        // merges it under MCP server child env.
        const env = (await settingsLoader.load(cwd)).env
        const normalize = (name: string, entry: Record<string, unknown>) =>
          normalizeClaudeStyleEntry(name, entry, 'codebuddy', config.toolCallTimeoutMs, env, cwd)
        return {
          user: await readJsonServerFiles(fs, logger, userFiles, normalize),
          project: await readJsonServerFiles(fs, logger, [join(cwd, '.mcp.json'), join(cwd, 'mcp.json')], normalize),
        }
      },
      readPolicy: async (cwd) => (await settingsLoader.load(cwd)).mcpjsonServers,
      watchFiles: (cwd) => [...userFiles, join(cwd, '.mcp.json'), join(cwd, 'mcp.json')],
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
  config: CodebuddyMcpConfig,
  settingsLoader: CodebuddySettingsLoader,
): void {
  const manager = new CodebuddyMcpManager(ctx, logger, fs, config, settingsLoader)
  createSharedMcpBridge(ctx, manager.manager)
}
