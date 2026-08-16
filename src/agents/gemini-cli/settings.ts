/**
 * Gemini CLI settings discovery and merge (`settings.json`).
 *
 * Sources, broadest first: `/etc/gemini-cli/settings.json` (system),
 * `~/.gemini/settings.json` (user; `GEMINI_CLI_HOME` wins over the configured
 * directory), then the project `<cwd>/.gemini/settings.json`. The full
 * upstream precedence chain (defaults < system-defaults < user < project <
 * system overrides < env/.env < CLI flags) degrades to these three files:
 * system overrides, env, and CLI flags are runtime concerns with no
 * persistent config the bridge can read.
 *
 * Merge rules follow Gemini CLI:
 *
 * - Hooks merge **additively** across layers (project → user → system);
 *   identical handlers collapse to their first occurrence.
 * - `mcpServers.<name>` entries come from the most specific layer that
 *   defines the name; within an entry the transport picks
 *   `httpUrl` > `url` > `command` (Gemini's own precedence).
 * - Scalar keys (`skills.enabled`, `context.*`, `mcp.allowed`/`excluded`)
 *   come from the most specific layer that defines them.
 *
 * The loader is shared by the skills/commands provider, the memory bridge,
 * the hooks bridge, the permissions bridge, and the MCP bridge; results are
 * cached per working directory and invalidated by file stamps.
 * @module dsh-bridges/agents/gemini-cli/settings
 */
import { dirname, join, resolve } from 'node:path'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { expandHome, isPlainObject } from '../../util.js'
import type { CommandHook, MatcherGroup } from './hooks/types.js'

export interface SettingsLoaderConfig {
  userGeminiDir: string
}

export interface LoadedGeminiSettings {
  byEvent: ReadonlyMap<string, readonly MatcherGroup[]>
  /** `skills.enabled` (default true). */
  skillsEnabled: boolean
  /** `skills.disabled` skill names (exact). */
  skillsDisabled: ReadonlySet<string>
  /** `context.fileName` (default `['GEMINI.md']`). */
  contextFileName: readonly string[]
  /** `context.memoryBoundaryMarkers` (default `['.git']`). */
  memoryBoundaryMarkers: readonly string[]
  /** `context.discoveryMaxDirs` (default 200). */
  discoveryMaxDirs: number
  /** `mcp.allowed` allowlist (undefined = everything allowed). */
  mcpAllowed?: readonly string[]
  /** `mcp.excluded` blocklist. */
  mcpExcluded: readonly string[]
  /** `mcpServers.<name>` entries, most-specific layer per name. */
  mcpServers: ReadonlyMap<string, RawGeminiMcpServer>
}

/** One `mcpServers.<name>` entry (raw, unvalidated fields). */
export interface RawGeminiMcpServer {
  command?: string
  url?: string
  httpUrl?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  headers?: Record<string, string>
  timeout?: number
  trust?: boolean
  includeTools?: string[]
  excludeTools?: string[]
  /** Directory of the settings file that declared the entry (relative-path base). */
  baseDir: string
}

/** Gemini's system settings file (`/etc/gemini-cli`, Unix-only upstream). */
const SYSTEM_GEMINI_DIR = resolve('/etc/gemini-cli')

const GEMINI_DEFAULTS = {
  contextFileName: ['GEMINI.md'] as string[],
  memoryBoundaryMarkers: ['.git'] as string[],
  discoveryMaxDirs: 200,
}

interface SettingsSource {
  path: string
  kind: 'system' | 'user' | 'project'
}

interface RawLayer {
  hooks?: Record<string, MatcherGroup[]>
  skillsEnabled?: boolean
  skillsDisabled?: Set<string>
  contextFileName?: string[]
  memoryBoundaryMarkers?: string[]
  discoveryMaxDirs?: number
  mcpAllowed?: string[]
  mcpExcluded?: string[]
  mcpServers?: Map<string, RawGeminiMcpServer>
}

export class GeminiSettingsLoader {
  private readonly cache = new Map<string, { stamp: string; loaded: LoadedGeminiSettings }>()

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SettingsLoaderConfig,
  ) {}

  /** The user-level Gemini directory: `GEMINI_CLI_HOME` wins, else the config. */
  userDir(): string {
    const envHome = process.env['GEMINI_CLI_HOME']
    if (envHome !== undefined && envHome.trim() !== '') return expandHome(envHome.trim())
    return expandHome(this.config.userGeminiDir)
  }

  /** The settings files consulted for a working directory (watchers use this). */
  async sourcePaths(cwd?: string): Promise<string[]> {
    return (await this.sources(cwd)).map((source) => source.path)
  }

  private async sources(cwd?: string): Promise<SettingsSource[]> {
    const sources: SettingsSource[] = [
      { path: join(SYSTEM_GEMINI_DIR, 'settings.json'), kind: 'system' },
      { path: join(this.userDir(), 'settings.json'), kind: 'user' },
    ]
    if (cwd) {
      sources.push({ path: join(cwd, '.gemini', 'settings.json'), kind: 'project' })
    }
    return sources
  }

  async load(cwd?: string): Promise<LoadedGeminiSettings> {
    const sources = await this.sources(cwd)
    const stamps: string[] = []
    for (const source of sources) {
      try {
        stamps.push(`${source.path}:${(await this.fs.stamp(source.path)) ?? 'absent'}`)
      } catch {
        stamps.push(`${source.path}:unreadable`)
      }
    }
    const cacheKey = cwd ?? '<none>'
    const stamp = stamps.join('|')
    const cached = this.cache.get(cacheKey)
    if (cached && cached.stamp === stamp) return cached.loaded

    const loaded = await this.loadFresh(sources)
    this.cache.set(cacheKey, { stamp, loaded })
    return loaded
  }

  private async loadFresh(sources: SettingsSource[]): Promise<LoadedGeminiSettings> {
    // Broadest to most specific (system → user → project), like Gemini's
    // merge order for settings files.
    const byEvent = new Map<string, MatcherGroup[]>()
    const seenHandlers = new Set<string>()
    let skillsEnabled: boolean | undefined
    const skillsDisabled = new Set<string>()
    let contextFileName: string[] | undefined
    let memoryBoundaryMarkers: string[] | undefined
    let discoveryMaxDirs: number | undefined
    let mcpAllowed: string[] | undefined
    let mcpExcluded: string[] | undefined
    const mcpServers = new Map<string, RawGeminiMcpServer>()

    for (const source of sources) {
      const layer = await this.readLayer(source)
      if (layer === undefined) continue
      for (const [event, groups] of Object.entries(layer.hooks ?? {})) {
        const merged = byEvent.get(event) ?? []
        for (const group of groups) {
          const handlers: CommandHook[] = []
          for (const handler of group.hooks) {
            const key = JSON.stringify(handler)
            if (seenHandlers.has(key)) continue // same handler from several layers runs once
            seenHandlers.add(key)
            handlers.push(handler)
          }
          if (handlers.length > 0) merged.push({ matcher: group.matcher, hooks: handlers })
        }
        byEvent.set(event, merged)
      }
      if (layer.skillsEnabled !== undefined) skillsEnabled = layer.skillsEnabled
      if (layer.skillsDisabled !== undefined) {
        for (const name of layer.skillsDisabled) skillsDisabled.add(name)
      }
      if (layer.contextFileName !== undefined) contextFileName = layer.contextFileName
      if (layer.memoryBoundaryMarkers !== undefined) memoryBoundaryMarkers = layer.memoryBoundaryMarkers
      if (layer.discoveryMaxDirs !== undefined) discoveryMaxDirs = layer.discoveryMaxDirs
      if (layer.mcpAllowed !== undefined) mcpAllowed = layer.mcpAllowed
      if (layer.mcpExcluded !== undefined) mcpExcluded = layer.mcpExcluded
      if (layer.mcpServers !== undefined) {
        for (const [name, entry] of layer.mcpServers) mcpServers.set(name, entry)
      }
    }

    return {
      byEvent,
      skillsEnabled: skillsEnabled ?? true,
      skillsDisabled,
      contextFileName: contextFileName ?? GEMINI_DEFAULTS.contextFileName,
      memoryBoundaryMarkers: memoryBoundaryMarkers ?? GEMINI_DEFAULTS.memoryBoundaryMarkers,
      discoveryMaxDirs: discoveryMaxDirs ?? GEMINI_DEFAULTS.discoveryMaxDirs,
      mcpAllowed,
      mcpExcluded: mcpExcluded ?? [],
      mcpServers,
    }
  }

  private async readLayer(source: SettingsSource): Promise<RawLayer | undefined> {
    let text: string
    try {
      if (!(await this.fs.fileExists(source.path))) return undefined
      text = await this.fs.readText(source.path)
    } catch (error) {
      this.logger.warn(`gemini-cli: cannot read settings ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch (error) {
      this.logger.warn(
        `gemini-cli: ignoring invalid JSON settings file ${source.path}: ${error instanceof Error ? error.message : String(error)}`,
      )
      return undefined
    }
    if (!isPlainObject(value)) {
      this.logger.warn(`gemini-cli: ignoring settings file ${source.path}: top level must be an object`)
      return undefined
    }
    const layer: RawLayer = {}
    layer.hooks = normalizeHooks(value['hooks'], this.logger, source.path)
    const skills = value['skills']
    if (isPlainObject(skills)) {
      if (typeof skills['enabled'] === 'boolean') layer.skillsEnabled = skills['enabled']
      if (Array.isArray(skills['disabled'])) {
        const disabled = new Set(skills['disabled'].filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== ''))
        if (disabled.size > 0) layer.skillsDisabled = disabled
      }
    }
    const context = value['context']
    if (isPlainObject(context)) {
      if (typeof context['fileName'] === 'string' && context['fileName'].trim() !== '') {
        layer.contextFileName = [context['fileName'].trim()]
      } else if (Array.isArray(context['fileName'])) {
        const names = context['fileName'].filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
        if (names.length > 0) layer.contextFileName = names
      }
      if (Array.isArray(context['memoryBoundaryMarkers'])) {
        const markers = context['memoryBoundaryMarkers'].filter(
          (entry): entry is string => typeof entry === 'string' && entry.trim() !== '',
        )
        if (markers.length > 0) layer.memoryBoundaryMarkers = markers
      }
      if (typeof context['discoveryMaxDirs'] === 'number' && context['discoveryMaxDirs'] >= 0) {
        layer.discoveryMaxDirs = context['discoveryMaxDirs']
      }
    }
    const mcp = value['mcp']
    if (isPlainObject(mcp)) {
      if (Array.isArray(mcp['allowed']))
        layer.mcpAllowed = mcp['allowed'].filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      if (Array.isArray(mcp['excluded']))
        layer.mcpExcluded = mcp['excluded'].filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    }
    const mcpServers = value['mcpServers']
    if (isPlainObject(mcpServers)) {
      const parsed = new Map<string, RawGeminiMcpServer>()
      const baseDir = dirname(source.path)
      for (const [name, entry] of Object.entries(mcpServers)) {
        if (!isPlainObject(entry)) continue
        const server: RawGeminiMcpServer = { baseDir }
        if (typeof entry['command'] === 'string' && entry['command'].trim() !== '') server.command = entry['command']
        if (typeof entry['url'] === 'string' && entry['url'].trim() !== '') server.url = entry['url']
        if (typeof entry['httpUrl'] === 'string' && entry['httpUrl'].trim() !== '') server.httpUrl = entry['httpUrl']
        if (Array.isArray(entry['args'])) server.args = entry['args'].filter((arg): arg is string => typeof arg === 'string')
        if (isPlainObject(entry['env'])) {
          const env: Record<string, string> = {}
          for (const [key, envValue] of Object.entries(entry['env'])) {
            if (typeof envValue === 'string') env[key] = envValue
          }
          server.env = env
        }
        if (typeof entry['cwd'] === 'string' && entry['cwd'].trim() !== '') server.cwd = entry['cwd']
        if (isPlainObject(entry['headers'])) {
          const headers: Record<string, string> = {}
          for (const [key, headerValue] of Object.entries(entry['headers'])) {
            if (typeof headerValue === 'string') headers[key] = headerValue
          }
          server.headers = headers
        }
        if (typeof entry['timeout'] === 'number' && entry['timeout'] >= 0) server.timeout = entry['timeout']
        if (typeof entry['trust'] === 'boolean') server.trust = entry['trust']
        if (Array.isArray(entry['includeTools']))
          server.includeTools = entry['includeTools'].filter((tool): tool is string => typeof tool === 'string')
        if (Array.isArray(entry['excludeTools']))
          server.excludeTools = entry['excludeTools'].filter((tool): tool is string => typeof tool === 'string')
        if (server.command === undefined && server.url === undefined && server.httpUrl === undefined) continue
        parsed.set(name, server)
      }
      if (parsed.size > 0) layer.mcpServers = parsed
    }
    return layer
  }
}

/** Normalize the `hooks` object into matcher groups. */
function normalizeHooks(value: unknown, logger: BridgeLogger, path: string): Record<string, MatcherGroup[]> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    logger.warn(`gemini-cli: ignoring malformed hooks field in ${path}: must be an object`)
    return undefined
  }
  const normalized: Record<string, MatcherGroup[]> = {}
  for (const [event, groups] of Object.entries(value)) {
    if (!Array.isArray(groups)) continue
    const validGroups: MatcherGroup[] = []
    for (const group of groups) {
      if (!isPlainObject(group) || !Array.isArray(group['hooks'])) continue
      const handlers = group['hooks'].filter(isValidHandler)
      if (handlers.length === 0) continue
      validGroups.push({ matcher: typeof group['matcher'] === 'string' ? group['matcher'] : undefined, hooks: handlers })
    }
    if (validGroups.length > 0) normalized[event] = validGroups
  }
  return normalized
}

function isValidHandler(value: unknown): value is CommandHook {
  if (!isPlainObject(value)) return false
  if (value['type'] !== undefined && value['type'] !== 'command') return false // only command hooks exist upstream
  if (typeof value['command'] !== 'string' || value['command'].trim() === '') return false
  return (
    (value['name'] === undefined || typeof value['name'] === 'string') &&
    (value['timeout'] === undefined || (typeof value['timeout'] === 'number' && value['timeout'] >= 0)) &&
    (value['description'] === undefined || typeof value['description'] === 'string')
  )
}
