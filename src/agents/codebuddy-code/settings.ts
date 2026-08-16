/**
 * CodeBuddy Code settings discovery and merge.
 *
 * Sources, broadest first: `~/.codebuddy/settings.json` (user), then
 * `<cwd>/.codebuddy/settings.json` (project), then
 * `<cwd>/.codebuddy/settings.local.json` (local) — the opposite specificity
 * order of precedence CodeBuddy Code documents (local > project > user).
 *
 * Merge rules follow CodeBuddy Code: hook groups merge additively across
 * sources and identical handlers collapse to their first occurrence; scalar
 * settings such as `disableAllHooks` come from the most specific source that
 * defines them; `skillOverrides` are resolved per skill name with the most
 * specific valid value winning (invalid values are filtered out per file, so
 * they fall back to the previous valid file; all-invalid means `on`).
 * Managed (enterprise) settings have no discoverable file path and are out of
 * scope for this bridge.
 *
 * The loader is shared by the hooks bridge and the skill provider, which both
 * read the same settings files; results are cached per working directory and
 * invalidated by file stamps.
 * @module dsh-bridges/agents/codebuddy-code/settings
 */
import { join } from 'node:path'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { expandHome, isPlainObject } from '../../util.js'
import { SKILL_OVERRIDE_STATES, type HookDef, type MatcherGroup, type SkillOverrideState } from './hooks/types.js'

export interface SettingsLoaderConfig {
  userCodebuddyDir: string
}

export interface LoadedCodebuddySettings {
  disabled: boolean
  byEvent: ReadonlyMap<string, readonly MatcherGroup[]>
  env: Readonly<Record<string, string>>
  skillOverrides: ReadonlyMap<string, SkillOverrideState>
}

interface SettingsSource {
  path: string
  kind: 'user' | 'project' | 'local'
}

interface RawSettings {
  hooks?: Record<string, MatcherGroup[]>
  disableAllHooks?: boolean
  env?: Record<string, string>
  skillOverrides?: Record<string, SkillOverrideState>
}

export class CodebuddySettingsLoader {
  private readonly cache = new Map<string, { stamp: string; loaded: LoadedCodebuddySettings }>()

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SettingsLoaderConfig,
  ) {}

  /** The settings files consulted for a working directory (watchers use this). */
  sourcePaths(cwd?: string): string[] {
    return this.sources(cwd).map((source) => source.path)
  }

  private sources(cwd?: string): SettingsSource[] {
    const sources: SettingsSource[] = [{ path: join(expandHome(this.config.userCodebuddyDir), 'settings.json'), kind: 'user' }]
    if (cwd) {
      sources.push(
        { path: join(cwd, '.codebuddy', 'settings.json'), kind: 'project' },
        { path: join(cwd, '.codebuddy', 'settings.local.json'), kind: 'local' },
      )
    }
    return sources
  }

  async load(cwd?: string): Promise<LoadedCodebuddySettings> {
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

  private async loadFresh(sources: SettingsSource[]): Promise<LoadedCodebuddySettings> {
    const parsed: { source: SettingsSource; settings: RawSettings }[] = []
    for (const source of sources) {
      let text: string
      try {
        if (!(await this.fs.fileExists(source.path))) continue
        text = await this.fs.readText(source.path)
      } catch (error) {
        this.logger.warn(`codebuddy-code: cannot read settings ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      let value: unknown
      try {
        value = JSON.parse(text)
      } catch (error) {
        this.logger.warn(
          `codebuddy-code: ignoring invalid JSON settings file ${source.path}: ${error instanceof Error ? error.message : String(error)}`,
        )
        continue
      }
      if (!isPlainObject(value)) {
        this.logger.warn(`codebuddy-code: ignoring settings file ${source.path}: top level must be an object`)
        continue
      }
      parsed.push({ source, settings: normalizeSettings(value, this.logger, source.path) })
    }

    // Broadest to most specific.
    const byEvent = new Map<string, MatcherGroup[]>()
    const seenHandlers = new Set<string>()
    const env: Record<string, string> = {}
    let disableAllHooks: boolean | undefined
    let skillOverrides: Map<string, SkillOverrideState> | undefined

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
      if (settings.disableAllHooks !== undefined) disableAllHooks = settings.disableAllHooks
      if (settings.skillOverrides !== undefined) {
        // Most-specific valid value per name wins; each file is already
        // filtered to valid states, so a later file simply overwrites.
        skillOverrides = new Map([...(skillOverrides ?? []), ...Object.entries(settings.skillOverrides)])
      }
    }

    return {
      disabled: disableAllHooks === true,
      byEvent,
      env,
      skillOverrides: skillOverrides ?? new Map(),
    }
  }
}

function normalizeSettings(value: Record<string, unknown>, logger: BridgeLogger, path: string): RawSettings {
  const result: RawSettings = {
    env: readEnv(value['env'], logger, path),
    disableAllHooks: typeof value['disableAllHooks'] === 'boolean' ? value['disableAllHooks'] : undefined,
  }
  const hooks = value['hooks']
  if (hooks !== undefined && isPlainObject(hooks)) {
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
    if (Object.keys(normalized).length > 0) result.hooks = normalized
  } else if (hooks !== undefined) {
    logger.warn(`codebuddy-code: ignoring malformed hooks field in ${path}: must be an object`)
  }
  const overrides = value['skillOverrides']
  if (overrides !== undefined && isPlainObject(overrides)) {
    const valid: Record<string, SkillOverrideState> = {}
    for (const [name, state] of Object.entries(overrides)) {
      if (typeof state === 'string' && (SKILL_OVERRIDE_STATES as readonly string[]).includes(state)) {
        valid[name] = state as SkillOverrideState
      }
    }
    if (Object.keys(valid).length > 0) result.skillOverrides = valid
  }
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
      (value['method'] === undefined || value['method'] === 'POST' || value['method'] === 'PUT' || value['method'] === 'PATCH') &&
      (value['timeout'] === undefined || typeof value['timeout'] === 'number') &&
      (value['if'] === undefined || typeof value['if'] === 'string') &&
      (value['headers'] === undefined || isPlainObject(value['headers']))
    )
  }
  return false
}

function readEnv(value: unknown, logger: BridgeLogger, path: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    logger.warn(`codebuddy-code: ignoring malformed env field in ${path}: must be an object`)
    return undefined
  }
  const env: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') env[key] = entry
  }
  return env
}
