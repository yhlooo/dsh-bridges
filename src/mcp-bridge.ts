/**
 * Shared MCP-server bridge manager used by every agent-tool subsystem.
 *
 * Upstream MCP configuration files are parsed per workspace and each server
 * becomes one dynamically instantiated `@deepseek-ai/dsh-mcp-client` plugin
 * (`ctx.plugin` — the client registers `mcp__<serverName>__<tool>` tools on
 * the shared tool registry and its disposal disconnects and unregisters).
 *
 * A tool supplies its config-file lists (user files broadest first, project
 * files later — a project server overrides a same-name user server), a
 * project-server approval policy reader, and a per-entry normalizer for its
 * own file format. Instances are keyed by workspace (LRU-capped), reconciled
 * at session start, and re-reconciled when any config file changes. Startup
 * failures fail open (warn + skip that server), matching the bridge-wide
 * fail-open philosophy.
 * @module dsh-bridges/mcp-bridge
 */
import { watch } from 'chokidar'
import type { Context } from '@deepseek-ai/cordis'
import { apply as applyMcpClient, Config as McpClientConfig, inject as mcpClientInject, name as mcpClientName } from '@deepseek-ai/dsh-mcp-client'
import type { FsAdapter } from './fs-adapter.js'
import type { BridgeLogger } from './util.js'
import { isPlainObject } from './util.js'

/** Approval policy for project-level MCP servers. */
export interface ProjectMcpPolicy {
  enableAll: boolean
  enabled: ReadonlySet<string>
  disabled: ReadonlySet<string>
}

/** One upstream MCP server entry, normalized to the dsh client config. */
export interface DesiredServer {
  name: string
  config: McpClientConfig
}

export interface McpBridgeOptions {
  /** serverName namespace prefix, e.g. `claude` → `claude__<name>`. */
  prefix: string
  toolCallTimeoutMs: number
  /** Read the desired servers for one workspace (user + project scopes). */
  readServers(cwd: string): Promise<{ user: Map<string, DesiredServer>; project: Map<string, DesiredServer> }>
  /** Approval policy for the project servers of one workspace. */
  readPolicy(cwd: string): Promise<ProjectMcpPolicy>
  /** Files whose changes re-trigger reconciliation. */
  watchFiles(cwd: string): string[] | Promise<string[]>
}

/** Maximum distinct workspaces whose MCP instances stay alive. */
const MAX_WORKSPACES = 16
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200

type Fiber = Awaited<ReturnType<Context['plugin']>>

export class McpManager {
  private readonly workspaces = new Map<string, { servers: Map<string, { fiber: Fiber; config: McpClientConfig }> }>()
  private readonly watchers = new Map<string, ReturnType<typeof watch>>()
  private closed = false

  constructor(
    private readonly ctx: Context,
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly options: McpBridgeOptions,
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
    void this.ensureWatched(cwd)
  }

  private startServer(server: DesiredServer): Fiber | undefined {
    try {
      const fiber = this.ctx.plugin({ apply: applyMcpClient, Config: McpClientConfig, inject: mcpClientInject, name: mcpClientName }, server.config)
      void fiber.then(undefined, (error: unknown) => {
        this.logger.warn(`MCP server ${server.name} failed to start: ${errorMessage(error)}`)
      })
      return fiber
    } catch (error) {
      this.logger.warn(`cannot start MCP server ${server.name}: ${errorMessage(error)}`)
      return undefined
    }
  }

  private async disposeFiber(fiber: Fiber): Promise<void> {
    try {
      await fiber.dispose()
    } catch (error) {
      this.logger.debug(`MCP server disposal failed: ${errorMessage(error)}`)
    }
  }

  /** The desired server set for one workspace (user scope, project overrides). */
  private async desiredServers(cwd: string): Promise<Map<string, DesiredServer>> {
    const { user, project } = await this.options.readServers(cwd)
    const servers = new Map<string, DesiredServer>(user)
    for (const [name, server] of project) servers.set(name, server)
    const policy = await this.options.readPolicy(cwd)
    for (const name of project.keys()) {
      if (policy.disabled.has(name)) {
        servers.delete(name)
        this.logger.warn(`skipping project MCP server ${JSON.stringify(name)}: disabled via settings`)
        continue
      }
      if (!policy.enableAll && !policy.enabled.has(name)) {
        servers.delete(name)
        this.logger.warn(`skipping project MCP server ${JSON.stringify(name)}: not approved (enableAllProjectMcpServers / enabledMcpjsonServers)`)
      }
    }
    return servers
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private async ensureWatched(cwd: string) {
    const files = new Set(await this.options.watchFiles(cwd))
    for (const file of files) {
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
        if (ready) this.logger.warn(`MCP config watcher for ${file} failed: ${errorMessage(error)}`)
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

/** Register a manager on the plugin fiber and reconcile at session start. */
export function createMcpBridge(ctx: Context, manager: McpManager): void {
  ctx.on('agent/session-start', (payload) => {
    const cwd = payload.agent.session.header.cwd
    if (cwd !== undefined) void manager.reconcile(cwd)
  })
  ctx.effect(() => () => {
    void manager.dispose()
  }, 'bridge mcp instances')
}

/** dsh MCP server names must be `[A-Za-z0-9_-]{1,32}` and globally unique. */
export function sanitizeServerName(name: string, prefix: string): string | undefined {
  const sanitized = `${prefix}__${name.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 32)
  if (sanitized === `${prefix}__`) return undefined
  return sanitized
}

/** `${VAR}` references expand from the process environment. */
export function expandEnvReferences(value: string): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name: string) => process.env[name] ?? match)
}

/**
 * Claude-Code-shaped entry normalizer: `command`/`args`/`env`/`cwd` for stdio,
 * or `url` (+ optional `type: "http"`/`"sse"`, `headers`) for HTTP transport.
 */
export function normalizeClaudeStyleEntry(name: string, entry: Record<string, unknown>, prefix: string, toolCallTimeoutMs: number): DesiredServer | undefined {
  const serverName = sanitizeServerName(name, prefix)
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

/**
 * Read `mcpServers` maps from JSON files (Claude Code / CodeBuddy Code
 * formats) into desired servers, broadest file first (later files override).
 */
export async function readJsonServerFiles(
  fs: FsAdapter,
  logger: BridgeLogger,
  files: readonly string[],
  normalize: (name: string, entry: Record<string, unknown>) => DesiredServer | undefined,
): Promise<Map<string, DesiredServer>> {
  const servers = new Map<string, DesiredServer>()
  for (const file of files) {
    let value: unknown
    try {
      if (!(await fs.fileExists(file))) continue
      value = JSON.parse(await fs.readText(file))
    } catch (error) {
      logger.warn(`ignoring invalid MCP config ${file}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    if (!isPlainObject(value) || !isPlainObject(value['mcpServers'])) continue
    for (const [name, entry] of Object.entries(value['mcpServers'])) {
      if (!isPlainObject(entry)) continue
      const normalized = normalize(name, entry)
      if (normalized !== undefined) servers.set(name, normalized)
    }
  }
  return servers
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
