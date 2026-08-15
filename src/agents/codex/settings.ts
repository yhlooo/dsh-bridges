/**
 * Codex settings discovery and merge (`config.toml` + `hooks.json`).
 *
 * Sources, broadest first: `/etc/codex/` (system), `~/.codex/` (user), then
 * the project layers — every `<dir>/.codex/config.toml` and
 * `<dir>/.codex/hooks.json` walking from the repository root down to the
 * working directory (Codex loads every `.codex/` layer it finds, closest
 * wins for scalar keys). Inline `[hooks]` tables in `config.toml` use the
 * same event structure as `hooks.json`.
 *
 * Merge rules follow Codex:
 *
 * - Hooks merge **additively** across every layer ("higher-precedence config
 *   layers don't replace lower-precedence hooks"); identical handlers
 *   collapse to their first occurrence.
 * - Scalar settings come from the most specific layer that defines them:
 *   `[features].hooks = false` disables all hooks, `[[skills.config]]`
 *   entries with `enabled = false` disable specific skills, and
 *   `project_doc_max_bytes` / `project_doc_fallback_filenames` /
 *   `project_root_markers` tune AGENTS.md discovery. The repository root
 *   itself is found with `project_root_markers` from the system/user layers
 *   (default `['.git']`).
 *
 * Project-local layers load only when Codex trusts the project; the bridge
 * has no trust state and reads them unconditionally (see the README
 * limitations). Managed `requirements.toml` hooks are out of scope.
 *
 * The loader is shared by the hooks bridge, the skill provider, and the
 * memory bridge, which all read the same files; results are cached per
 * working directory and invalidated by file stamps.
 * @module dsh-bridges/agents/codex/settings
 */
import { dirname, isAbsolute, join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { expandHome, isPlainObject } from '../../util.js'
import type { CommandHook, MatcherGroup } from './hooks/types.js'

export interface SettingsLoaderConfig {
  userCodexDir: string
}

export interface LoadedCodexSettings {
  /** True when the most specific `[features].hooks = false` disables hooks. */
  hooksDisabled: boolean
  byEvent: ReadonlyMap<string, readonly MatcherGroup[]>
  /** Normalized skill folder paths disabled via `[[skills.config]]`. */
  skillDisabledPaths: ReadonlySet<string>
  /** `project_doc_max_bytes` (Codex default 32 KiB). */
  projectDocMaxBytes: number
  /** `project_doc_fallback_filenames` (empty by default). */
  projectDocFallbackFilenames: readonly string[]
  /** `project_root_markers` (defaults to `['.git']`). */
  projectRootMarkers: readonly string[]
}

interface SettingsSource {
  path: string
  format: 'toml' | 'json'
  kind: 'system' | 'user' | 'project'
  dir: string
}

interface RawLayer {
  hooks?: Record<string, MatcherGroup[]>
  hooksDisabled?: boolean
  disabledSkillPaths?: Set<string>
  projectDocMaxBytes?: number
  projectDocFallbackFilenames?: string[]
  projectRootMarkers?: string[]
}

const SYSTEM_CODEX_DIR = '/etc/codex'
const CODEX_DEFAULTS: { projectDocMaxBytes: number; projectDocFallbackFilenames: string[]; projectRootMarkers: string[] } = {
  projectDocMaxBytes: 32 * 1024,
  projectDocFallbackFilenames: [],
  projectRootMarkers: ['.git'],
}
/** Cap on the upward repository-root walk (also breaks symlink cycles). */
const MAX_WALK_DEPTH = 32

export class CodexSettingsLoader {
  private readonly cache = new Map<string, { stamp: string; loaded: LoadedCodexSettings }>()
  private rootMarkers: readonly string[] | undefined

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SettingsLoaderConfig,
  ) {}

  /** The settings files consulted for a working directory (watchers use this). */
  async sourcePaths(cwd?: string): Promise<string[]> {
    return (await this.sources(cwd)).map((source) => source.path)
  }

  private async sources(cwd?: string): Promise<SettingsSource[]> {
    const userDir = expandHome(this.config.userCodexDir)
    const sources: SettingsSource[] = [
      { path: join(SYSTEM_CODEX_DIR, 'config.toml'), format: 'toml', kind: 'system', dir: SYSTEM_CODEX_DIR },
      { path: join(SYSTEM_CODEX_DIR, 'hooks.json'), format: 'json', kind: 'system', dir: SYSTEM_CODEX_DIR },
      { path: join(userDir, 'config.toml'), format: 'toml', kind: 'user', dir: userDir },
      { path: join(userDir, 'hooks.json'), format: 'json', kind: 'user', dir: userDir },
    ]
    if (cwd) {
      // Project layers: every `.codex/` folder from the repository root down
      // to the working directory, root first.
      for (const dir of await this.projectDirs(cwd)) {
        sources.push(
          { path: join(dir, '.codex', 'config.toml'), format: 'toml', kind: 'project', dir: join(dir, '.codex') },
          { path: join(dir, '.codex', 'hooks.json'), format: 'json', kind: 'project', dir: join(dir, '.codex') },
        )
      }
    }
    return sources
  }

  /** The directory chain from the repository root down to `cwd`, root first. */
  private async projectDirs(cwd: string): Promise<string[]> {
    const markers = await this.readRootMarkers()
    const dirs: string[] = []
    let dir: string = cwd
    let found = false
    for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
      dirs.unshift(dir)
      if (await this.hasMarker(dir, markers)) {
        found = true
        break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    // Without a project root, Codex checks only the current directory.
    return found ? dirs : dirs.slice(-1)
  }

  /** `project_root_markers` from the system/user layers, cached (default `.git`). */
  private async readRootMarkers(): Promise<readonly string[]> {
    if (this.rootMarkers !== undefined) return this.rootMarkers
    const markers = new Set<string>(CODEX_DEFAULTS.projectRootMarkers)
    const userDir = expandHome(this.config.userCodexDir)
    for (const path of [join(SYSTEM_CODEX_DIR, 'config.toml'), join(userDir, 'config.toml')]) {
      let text: string
      try {
        if (!(await this.fs.fileExists(path))) continue
        text = await this.fs.readText(path)
      } catch {
        continue
      }
      let value: unknown
      try {
        value = parseToml(text)
      } catch {
        continue
      }
      if (!isPlainObject(value)) continue
      const rootMarkers = value['project_root_markers']
      if (Array.isArray(rootMarkers)) {
        const entries = rootMarkers.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
        if (entries.length > 0) {
          markers.clear()
          for (const entry of entries) markers.add(entry)
        }
      }
    }
    this.rootMarkers = [...markers]
    return this.rootMarkers
  }

  private async hasMarker(dir: string, markers: readonly string[]): Promise<boolean> {
    for (const marker of markers) {
      if (await this.fs.dirExists(join(dir, marker))) return true
    }
    return false
  }

  async load(cwd?: string): Promise<LoadedCodexSettings> {
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

  private async loadFresh(sources: SettingsSource[]): Promise<LoadedCodexSettings> {
    const layers: RawLayer[] = []
    for (const source of sources) {
      let text: string
      try {
        if (!(await this.fs.fileExists(source.path))) continue
        text = await this.fs.readText(source.path)
      } catch (error) {
        this.logger.warn(`codex: cannot read settings ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      let value: unknown
      try {
        value = source.format === 'toml' ? parseToml(text) : JSON.parse(text)
      } catch (error) {
        this.logger.warn(`codex: ignoring invalid ${source.format.toUpperCase()} settings file ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      if (!isPlainObject(value)) {
        this.logger.warn(`codex: ignoring settings file ${source.path}: top level must be an object`)
        continue
      }
      layers.push(normalizeLayer(value, source, this.logger))
    }

    // Broadest to most specific.
    const byEvent = new Map<string, MatcherGroup[]>()
    const seenHandlers = new Set<string>()
    const disabledSkillPaths = new Set<string>()
    let hooksDisabled: boolean | undefined
    let projectDocMaxBytes: number | undefined
    let projectDocFallbackFilenames: string[] | undefined
    let projectRootMarkers: string[] | undefined

    for (const layer of layers) {
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
      if (layer.hooksDisabled !== undefined) hooksDisabled = layer.hooksDisabled
      if (layer.disabledSkillPaths !== undefined) {
        for (const path of layer.disabledSkillPaths) disabledSkillPaths.add(path)
      }
      if (layer.projectDocMaxBytes !== undefined) projectDocMaxBytes = layer.projectDocMaxBytes
      if (layer.projectDocFallbackFilenames !== undefined) projectDocFallbackFilenames = layer.projectDocFallbackFilenames
      if (layer.projectRootMarkers !== undefined) projectRootMarkers = layer.projectRootMarkers
    }

    return {
      hooksDisabled: hooksDisabled === true,
      byEvent,
      skillDisabledPaths: disabledSkillPaths,
      projectDocMaxBytes: projectDocMaxBytes ?? CODEX_DEFAULTS.projectDocMaxBytes,
      projectDocFallbackFilenames: projectDocFallbackFilenames ?? CODEX_DEFAULTS.projectDocFallbackFilenames,
      projectRootMarkers: projectRootMarkers ?? CODEX_DEFAULTS.projectRootMarkers,
    }
  }
}

function normalizeLayer(value: Record<string, unknown>, source: SettingsSource, logger: BridgeLogger): RawLayer {
  const layer: RawLayer = {}
  layer.hooks = normalizeHooks(value['hooks'], logger, source.path)
  const features = value['features']
  if (isPlainObject(features) && typeof features['hooks'] === 'boolean') layer.hooksDisabled = !features['hooks']
  const skillsConfig = value['skills']
  if (isPlainObject(skillsConfig) && Array.isArray(skillsConfig['config'])) {
    const disabled = new Set<string>()
    for (const entry of skillsConfig['config']) {
      if (!isPlainObject(entry)) continue
      const enabled = entry['enabled']
      if (enabled !== false) continue
      const path = entry['path']
      if (typeof path !== 'string' || path.trim() === '') continue
      disabled.add(isAbsolute(path) ? path : join(source.dir, path))
    }
    if (disabled.size > 0) layer.disabledSkillPaths = disabled
  }
  if (typeof value['project_doc_max_bytes'] === 'number' && value['project_doc_max_bytes'] >= 0) {
    layer.projectDocMaxBytes = value['project_doc_max_bytes']
  }
  const fallbackFilenames = value['project_doc_fallback_filenames']
  if (Array.isArray(fallbackFilenames)) {
    layer.projectDocFallbackFilenames = fallbackFilenames.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  }
  const rootMarkers = value['project_root_markers']
  if (Array.isArray(rootMarkers)) {
    layer.projectRootMarkers = rootMarkers.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  }
  return layer
}

/** Normalize the `hooks` table from either representation into matcher groups. */
function normalizeHooks(value: unknown, logger: BridgeLogger, path: string): Record<string, MatcherGroup[]> | undefined {
  if (value === undefined) return undefined
  if (!isPlainObject(value)) {
    logger.warn(`codex: ignoring malformed hooks field in ${path}: must be an object`)
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
  if (value['type'] !== 'command' || typeof value['command'] !== 'string' || value['command'].trim() === '') return false
  return (
    (value['commandWindows'] === undefined || typeof value['commandWindows'] === 'string') &&
    (value['timeout'] === undefined || typeof value['timeout'] === 'number') &&
    (value['statusMessage'] === undefined || typeof value['statusMessage'] === 'string') &&
    (value['additionalContextLimit'] === undefined || typeof value['additionalContextLimit'] === 'number') &&
    (value['async'] === undefined || typeof value['async'] === 'boolean')
  )
}
