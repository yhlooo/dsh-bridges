/**
 * Claude Code hook settings discovery and merge.
 *
 * Sources, broadest first: `~/.claude/settings.json` (user), then
 * `<cwd>/.claude/settings.json` (project), then
 * `<cwd>/.claude/settings.local.json` (local). Hook groups merge additively;
 * identical handlers collapse to their first occurrence; scalar settings such
 * as `disableAllHooks` come from the most specific source that defines them.
 * Managed (enterprise) settings have no discoverable file path and are out of
 * scope for this bridge.
 * @module dsh-bridges/agents/claude-code/hooks/settings
 */
import { join } from 'node:path'
import { parseToolSpecifierRules } from '../../../permissions/parse.js'
import type { MergedPermissionConfig } from '../../../permissions/types.js'
import type { FsAdapter } from '../../../fs-adapter.js'
import type { BridgeLogger } from '../../../util.js'
import { expandHome, isPlainObject } from '../../../util.js'
import type { HookDef, HookSettings, LoadedHookSettings, MatcherGroup, RawPermissionSettings } from './types.js'

export interface SettingsLoaderConfig {
  userClaudeDir: string
}

interface SettingsSource {
  path: string
  kind: 'user' | 'project' | 'local'
}

export class SettingsLoader {
  private readonly cache = new Map<string, { stamp: string; loaded: LoadedHookSettings }>()

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SettingsLoaderConfig,
  ) {}

  private sources(cwd?: string): SettingsSource[] {
    const sources: SettingsSource[] = [{ path: join(expandHome(this.config.userClaudeDir), 'settings.json'), kind: 'user' }]
    if (cwd) {
      sources.push(
        { path: join(cwd, '.claude', 'settings.json'), kind: 'project' },
        { path: join(cwd, '.claude', 'settings.local.json'), kind: 'local' },
      )
    }
    return sources
  }

  async load(cwd?: string): Promise<LoadedHookSettings> {
    const sources = this.sources(cwd)
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

  private async loadFresh(sources: SettingsSource[]): Promise<LoadedHookSettings> {
    const parsed: { source: SettingsSource; settings: HookSettings }[] = []
    for (const source of sources) {
      let text: string
      try {
        if (!(await this.fs.fileExists(source.path))) continue
        text = await this.fs.readText(source.path)
      } catch (error) {
        this.logger.warn(`claude-code: cannot read hook settings ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      let value: unknown
      try {
        value = JSON.parse(text)
      } catch (error) {
        this.logger.warn(
          `claude-code: ignoring invalid JSON settings file ${source.path}: ${error instanceof Error ? error.message : String(error)}`,
        )
        continue
      }
      if (!isPlainObject(value)) {
        this.logger.warn(`claude-code: ignoring settings file ${source.path}: top level must be an object`)
        continue
      }
      parsed.push({ source, settings: normalizeSettings(value, this.logger, source.path) })
    }

    // Broadest to most specific.
    const byEvent = new Map<string, MatcherGroup[]>()
    const seenHandlers = new Set<string>()
    const env: Record<string, string> = {}
    const allowedHttpHookUrls = new Set<string>()
    const httpHookAllowedEnvVars = new Set<string>()
    let disableAllHooks: boolean | undefined
    const permissionBuckets = { allow: new Set<string>(), ask: new Set<string>(), deny: new Set<string>() }
    const additionalDirectories = new Set<string>()
    let defaultMode: string | undefined
    let disableBypassPermissionsMode: boolean | undefined
    let enableAllProjectMcpServers = false
    let enabledMcpjsonServers: Set<string> | undefined
    let disabledMcpjsonServers = new Set<string>()
    let outputStyle: string | undefined
    let autoMemoryDirectory: string | undefined

    for (const { settings } of parsed) {
      for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
        const merged = byEvent.get(event) ?? []
        for (const group of groups) {
          const handlers: HookDef[] = []
          for (const handler of group.hooks) {
            const key = JSON.stringify(handler)
            if (seenHandlers.has(key)) continue // same handler from several files runs once
            seenHandlers.add(key)
            handlers.push(handler)
          }
          if (handlers.length > 0) merged.push({ matcher: group.matcher, hooks: handlers })
        }
        byEvent.set(event, merged)
      }
      Object.assign(env, settings.env)
      for (const url of settings.allowedHttpHookUrls ?? []) allowedHttpHookUrls.add(url)
      for (const name of settings.httpHookAllowedEnvVars ?? []) httpHookAllowedEnvVars.add(name)
      if (settings.disableAllHooks !== undefined) disableAllHooks = settings.disableAllHooks
      if (settings.enableAllProjectMcpServers !== undefined) enableAllProjectMcpServers = settings.enableAllProjectMcpServers
      if (settings.enabledMcpjsonServers !== undefined) enabledMcpjsonServers = new Set(settings.enabledMcpjsonServers)
      if (settings.disabledMcpjsonServers !== undefined) disabledMcpjsonServers = new Set(settings.disabledMcpjsonServers)
      if (settings.outputStyle !== undefined) outputStyle = settings.outputStyle
      if (settings.autoMemoryDirectory !== undefined) autoMemoryDirectory = settings.autoMemoryDirectory
      const permissions = settings.permissions
      if (permissions !== undefined) {
        for (const rule of permissions.allow ?? []) permissionBuckets.allow.add(rule)
        for (const rule of permissions.ask ?? []) permissionBuckets.ask.add(rule)
        for (const rule of permissions.deny ?? []) permissionBuckets.deny.add(rule)
        for (const dir of permissions.additionalDirectories ?? []) additionalDirectories.add(dir)
        if (permissions.defaultMode !== undefined) defaultMode = permissions.defaultMode
        if (permissions.disableBypassPermissionsMode !== undefined) disableBypassPermissionsMode = permissions.disableBypassPermissionsMode
      }
    }

    return {
      disabled: disableAllHooks === true,
      byEvent,
      env,
      allowedHttpHookUrls: allowedHttpHookUrls.size > 0 ? [...allowedHttpHookUrls] : undefined,
      httpHookAllowedEnvVars: httpHookAllowedEnvVars.size > 0 ? [...httpHookAllowedEnvVars] : undefined,
      permissions: {
        allow: parseToolSpecifierRules('allow', [...permissionBuckets.allow]),
        ask: parseToolSpecifierRules('ask', [...permissionBuckets.ask]),
        deny: parseToolSpecifierRules('deny', [...permissionBuckets.deny]),
        defaultMode,
        disableBypassPermissionsMode,
        additionalDirectories: [...additionalDirectories],
      },
      mcpjsonServers: {
        enableAll: enableAllProjectMcpServers,
        enabled: enabledMcpjsonServers ?? new Set(),
        disabled: disabledMcpjsonServers,
      },
      outputStyle,
      autoMemoryDirectory,
    }
  }
}

function normalizeSettings(value: Record<string, unknown>, logger: BridgeLogger, path: string): HookSettings {
  const result: HookSettings = {
    env: readEnv(value['env'], logger, path),
    disableAllHooks: typeof value['disableAllHooks'] === 'boolean' ? value['disableAllHooks'] : undefined,
    allowedHttpHookUrls: readStringArray(value['allowedHttpHookUrls']),
    httpHookAllowedEnvVars: readStringArray(value['httpHookAllowedEnvVars']),
    permissions: readPermissions(value['permissions'], logger, path),
    enableAllProjectMcpServers: typeof value['enableAllProjectMcpServers'] === 'boolean' ? value['enableAllProjectMcpServers'] : undefined,
    enabledMcpjsonServers: readStringArray(value['enabledMcpjsonServers']),
    disabledMcpjsonServers: readStringArray(value['disabledMcpjsonServers']),
    outputStyle: typeof value['outputStyle'] === 'string' && value['outputStyle'].trim() !== '' ? value['outputStyle'].trim() : undefined,
    autoMemoryDirectory: typeof value['autoMemoryDirectory'] === 'string' && value['autoMemoryDirectory'].trim() !== '' ? value['autoMemoryDirectory'].trim() : undefined,
  }
  const hooks = value['hooks']
  if (hooks === undefined) return result
  if (!isPlainObject(hooks)) {
    logger.warn(`claude-code: ignoring malformed hooks field in ${path}: must be an object`)
    return result
  }
  const normalized: Record<string, MatcherGroup[]> = {}
  for (const [event, groups] of Object.entries(hooks)) {
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
  result.hooks = normalized
  return result
}

function isValidHandler(value: unknown): value is HookDef {
  if (!isPlainObject(value)) return false
  const type = value['type']
  if (type === 'command' && typeof value['command'] === 'string') {
    return (
      (value['args'] === undefined || (Array.isArray(value['args']) && value['args'].every((arg) => typeof arg === 'string'))) &&
      (value['timeout'] === undefined || typeof value['timeout'] === 'number') &&
      (value['if'] === undefined || typeof value['if'] === 'string')
    )
  }
  if (type === 'http' && typeof value['url'] === 'string') {
    return (
      (value['timeout'] === undefined || typeof value['timeout'] === 'number') &&
      (value['if'] === undefined || typeof value['if'] === 'string')
    )
  }
  return false
}

function readEnv(value: unknown, logger: BridgeLogger, path: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    logger.warn(`claude-code: ignoring malformed env field in ${path}: must be an object`)
    return undefined
  }
  const env: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') env[key] = entry
  }
  return env
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function readPermissions(value: unknown, logger: BridgeLogger, path: string): RawPermissionSettings | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    logger.warn(`claude-code: ignoring malformed permissions field in ${path}: must be an object`)
    return undefined
  }
  return {
    allow: readStringArray(value['allow']),
    ask: readStringArray(value['ask']),
    deny: readStringArray(value['deny']),
    defaultMode: typeof value['defaultMode'] === 'string' ? value['defaultMode'] : undefined,
    additionalDirectories: readStringArray(value['additionalDirectories']),
    disableBypassPermissionsMode: typeof value['disableBypassPermissionsMode'] === 'boolean' ? value['disableBypassPermissionsMode'] : undefined,
  }
}
