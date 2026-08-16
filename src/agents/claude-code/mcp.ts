/**
 * Claude Code MCP servers (`.mcp.json` + `~/.claude.json`) bridged into DSH.
 *
 * Upstream MCP configuration files are parsed per workspace and each server
 * becomes one dynamically instantiated `@deepseek-ai/dsh-mcp-client` plugin
 * (`ctx.plugin` — the client registers `mcp__<serverName>__<tool>` tools on
 * the shared tool registry and its disposal disconnects and unregisters).
 *
 * Semantics:
 * - `~/.claude.json` `mcpServers` (user scope) are always registered; a
 *   project `.mcp.json` server with the same name overrides the user one
 *   (Claude Code precedence).
 * - Project `.mcp.json` servers need approval upstream
 *   (`enableAllProjectMcpServers` / `enabledMcpjsonServers`); without it
 *   Claude Code does not connect them. The bridge honors that: unapproved
 *   project servers are skipped with a warning. `disabledMcpjsonServers`
 *   always skip.
 * - stdio entries (`command`/`args`/`env`) map onto the stdio transport;
 *   `type: "http"`/`"sse"` entries with a `url` map onto the streamable-http
 *   transport (SSE degrades, a warning is logged). `${VAR}` references in
 *   `env` expand from the process environment.
 *
 * Instances are keyed by workspace (LRU-capped), reconciled at
 * `agent/session-start`, and re-reconciled when a config file changes.
 * Startup failures fail open (warn + skip that server), matching the
 * bridge-wide fail-open philosophy.
 * @module dsh-bridges/agents/claude-code/mcp
 */
import { dirname, join } from 'node:path'
import { watch } from 'chokidar'
import type { Context } from '@deepseek-ai/cordis'
import { apply as applyMcpClient, Config as McpClientConfig, inject as mcpClientInject, name as mcpClientName } from '@deepseek-ai/dsh-mcp-client'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { expandHome, isPlainObject } from '../../util.js'
import type { SettingsLoader } from './hooks/settings.js'

export interface ClaudeMcpConfig {
  userClaudeDir: string
  /** Per-tool-call timeout for bridged MCP servers (ms). */
  toolCallTimeoutMs: number
}

/** One upstream MCP server entry, normalized from either config file. */
interface DesiredServer {
  name: string
  config: McpClientConfig
}

/** Maximum distinct workspaces whose MCP instances stay alive. */
const MAX_WORKSPACES = 16
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200

export class ClaudeMcpManager {
  private readonly workspaces = new Map<string, { servers: Map<string, { fiber: Awaited<ReturnType<Context['plugin']>>; config: McpClientConfig }> }>()
  private readonly watchers = new Map<string, ReturnType<typeof watch>>()
  private closed = false

  constructor(
    private readonly ctx: Context,
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: ClaudeMcpConfig,
    private readonly settingsLoader: SettingsLoader,
  ) {}

  /** Reconcile the MCP instances for one working directory. */
  async reconcile(cwd: string): Promise<void> {
    if (this.closed) return
    const desired = await this.desiredServers(cwd)
    let entry = this.workspaces.get(cwd)
    if (entry === undefined) {
      entry = { servers: new Map() }
      this.workspaces.set(cwd, entry)
      this.evictIfNeeded()
    }
    // Dispose removed / changed servers.
    for (const [name, running] of [...entry.servers]) {
      const next = desired.get(name)
      if (next === undefined || JSON.stringify(next) !== JSON.stringify(running.config)) {
        await this.disposeFiber(running.fiber)
        entry.servers.delete(name)
      }
    }
    // Start missing servers.
    for (const [name, server] of desired) {
      if (entry.servers.has(name)) continue
      const fiber = this.startServer(server)
      if (fiber !== undefined) entry.servers.set(name, { fiber, config: server.config })
    }
    this.ensureWatched(cwd)
  }

  private startServer(server: DesiredServer): Awaited<ReturnType<Context['plugin']>> | undefined {
    try {
      // ctx.plugin returns Fiber & PromiseLike<Fiber>; awaiting it surfaces
      // startup failures, and the fiber's own dispose() disconnects the
      // client and unregisters its tools.
      const fiber = this.ctx.plugin({ apply: applyMcpClient, Config: McpClientConfig, inject: mcpClientInject, name: mcpClientName }, server.config)
      void fiber.then(undefined, (error: unknown) => {
        this.logger.warn(`claude-code: MCP server ${server.name} failed to start: ${errorMessage(error)}`)
      })
      return fiber
    } catch (error) {
      this.logger.warn(`claude-code: cannot start MCP server ${server.name}: ${errorMessage(error)}`)
      return undefined
    }
  }

  private async disposeFiber(fiber: Awaited<ReturnType<Context['plugin']>>): Promise<void> {
    try {
      await fiber.dispose()
    } catch (error) {
      this.logger.debug(`claude-code: MCP server disposal failed: ${errorMessage(error)}`)
    }
  }

  /** The desired server set for one workspace (user scope, project overrides). */
  private async desiredServers(cwd: string): Promise<Map<string, DesiredServer>> {
    const servers = new Map<string, DesiredServer>()
    const userFile = join(dirname(expandHome(this.config.userClaudeDir)), '.claude.json')
    await this.readServerFile(userFile, servers)
    await this.readServerFile(join(cwd, '.mcp.json'), servers)
    // Approval policy for project `.mcp.json` servers.
    const settings = await this.settingsLoader.load(cwd)
    const policy = settings.mcpjsonServers
    const projectServers = await this.readServerNames(join(cwd, '.mcp.json'))
    for (const name of projectServers) {
      if (policy.disabled.has(name)) {
        servers.delete(name)
        this.logger.warn(`claude-code: skipping .mcp.json server ${JSON.stringify(name)}: disabled via settings`)
        continue
      }
      if (!policy.enableAll && !policy.enabled.has(name)) {
        // Upstream only connects approved project servers; unapproved ones
        // are skipped rather than silently connected.
        servers.delete(name)
        this.logger.warn(
          `claude-code: skipping .mcp.json server ${JSON.stringify(name)}: not approved (enableAllProjectMcpServers / enabledMcpjsonServers)`,
        )
      }
    }
    return servers
  }

  private async readServerNames(file: string): Promise<string[]> {
    try {
      if (!(await this.fs.fileExists(file))) return []
      const value = JSON.parse(await this.fs.readText(file)) as unknown
      if (!isPlainObject(value) || !isPlainObject(value['mcpServers'])) return []
      return Object.keys(value['mcpServers'])
    } catch {
      return []
    }
  }

  /** Parse one `mcpServers` map file into normalized desired servers. */
  private async readServerFile(file: string, into: Map<string, DesiredServer>): Promise<void> {
    let value: unknown
    try {
      if (!(await this.fs.fileExists(file))) return
      value = JSON.parse(await this.fs.readText(file))
    } catch (error) {
      this.logger.warn(`claude-code: ignoring invalid MCP config ${file}: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    if (!isPlainObject(value) || !isPlainObject(value['mcpServers'])) return
    for (const [name, entry] of Object.entries(value['mcpServers'])) {
      if (!isPlainObject(entry)) continue
      const normalized = normalizeServer(name, entry, this.config.toolCallTimeoutMs)
      if (normalized !== undefined) into.set(name, normalized)
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private ensureWatched(cwd: string) {
    for (const file of [join(cwd, '.mcp.json'), join(dirname(expandHome(this.config.userClaudeDir)), '.claude.json')]) {
      if (this.watchers.has(file)) continue
      const watcher = watch(file, {
        persistent: true,
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: { stabilityThreshold: WATCH_STABILITY_MS, pollInterval: 100 },
      })
      this.watchers.set(file, watcher)
      let ready = false
      watcher.on('error', (error) => {
        if (ready) this.logger.warn(`claude-code: MCP config watcher for ${file} failed: ${errorMessage(error)}`)
      })
      for (const event of ['add', 'change', 'unlink'] as const) {
        watcher.on(event, () => {
          if (!ready || this.closed) return
          void this.reconcile(cwd)
        })
      }
      void new Promise<void>((resolve) => {
        watcher.once('ready', () => {
          ready = true
          resolve()
        })
      })
    }
  }

  private evictIfNeeded() {
    if (this.workspaces.size <= MAX_WORKSPACES) return
    const oldest = this.workspaces.keys().next().value
    if (oldest === undefined) return
    const entry = this.workspaces.get(oldest)
    if (entry !== undefined) {
      for (const running of entry.servers.values()) void this.disposeFiber(running.fiber)
    }
    this.workspaces.delete(oldest)
  }

  async dispose(): Promise<void> {
    this.closed = true
    for (const entry of this.workspaces.values()) {
      for (const running of entry.servers.values()) await this.disposeFiber(running.fiber)
    }
    this.workspaces.clear()
    await Promise.all([...this.watchers.values()].map((watcher) => watcher.close().catch(() => {})))
    this.watchers.clear()
  }
}

/** Register the manager on the plugin fiber and reconcile at session start. */
export function createMcpBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: ClaudeMcpConfig, settingsLoader: SettingsLoader): void {
  const manager = new ClaudeMcpManager(ctx, logger, fs, config, settingsLoader)
  ctx.on('agent/session-start', (payload) => {
    const cwd = payload.agent.session.header.cwd
    if (cwd !== undefined) void manager.reconcile(cwd)
  })
  ctx.effect(() => () => {
    void manager.dispose()
  }, 'claude-code mcp instances')
}

/** Map one upstream server entry onto the dsh MCP client config. */
export function normalizeServer(name: string, entry: Record<string, unknown>, toolCallTimeoutMs: number): DesiredServer | undefined {
  const serverName = sanitizeServerName(name)
  if (serverName === undefined) return undefined
  const base = { serverName, toolCallTimeoutMs, failOnStartupError: true as const }
  const type = entry['type']
  const url = typeof entry['url'] === 'string' ? entry['url'] : undefined
  if (url !== undefined && (type === undefined || type === 'http' || type === 'sse')) {
    const headers: Record<string, string> = {}
    if (isPlainObject(entry['headers'])) {
      for (const [key, value] of Object.entries(entry['headers'])) {
        if (typeof value === 'string') headers[key] = value
      }
    }
    return { name, config: { transport: 'streamable-http', ...base, url, headers } }
  }
  if (typeof entry['command'] === 'string' && entry['command'].trim() !== '') {
    const args = Array.isArray(entry['args']) ? entry['args'].filter((arg): arg is string => typeof arg === 'string') : []
    const env: Record<string, string> = {}
    if (isPlainObject(entry['env'])) {
      for (const [key, value] of Object.entries(entry['env'])) {
        if (typeof value === 'string') env[key] = expandEnvReferences(value)
      }
    }
    const cwd = typeof entry['cwd'] === 'string' && entry['cwd'].trim() !== '' ? entry['cwd'] : process.cwd()
    return { name, config: { transport: 'stdio', ...base, command: entry['command'], args, env, cwd } }
  }
  return undefined
}

/** `${VAR}` references expand from the process environment. */
export function expandEnvReferences(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name: string) => process.env[name] ?? match)
}

/** dsh MCP server names must be `[A-Za-z0-9_-]{1,32}` and globally unique. */
export function sanitizeServerName(name: string): string | undefined {
  const sanitized = `claude__${name.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 32)
  if (sanitized === 'claude__') return undefined
  return sanitized
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
