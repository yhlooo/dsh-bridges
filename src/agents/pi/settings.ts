/**
 * pi settings discovery and merge (`settings.json` + `trust.json`).
 *
 * Sources: the global `settings.json` under the pi config directory
 * (`PI_CODING_AGENT_DIR`, default `~/.pi/agent`), the project
 * `<cwd>/.pi/settings.json`, and the trust decisions in
 * `<configDir>/trust.json`. Project settings override global settings and
 * nested objects merge (pi semantics); array keys (`skills`, `prompts`)
 * replace the global array when the project layer defines them.
 *
 * Project `.pi/` resources load only when pi trusts the project. In a
 * non-interactive session (like DeepSeek Harness) pi never prompts, so the
 * decision chain is: the closest saved decision for the working directory or
 * a parent in `trust.json`, else the global `defaultProjectTrust` (`ask`
 * default and `never` skip project resources, `always` trusts them). The
 * `project_trust` extension event is not bridged (extensions are out of
 * scope).
 *
 * The loader is shared by the skill/prompt provider and the memory bridge;
 * results are cached per working directory and invalidated by file stamps.
 * @module dsh-bridges/agents/pi/settings
 */
import { dirname, isAbsolute, join } from 'node:path'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { expandHome, isPlainObject } from '../../util.js'

export interface SettingsLoaderConfig {
  /** pi config directory (`~/.pi/agent` by default; `PI_CODING_AGENT_DIR` wins). */
  userPiDir: string
}

/** A settings-declared asset path (`skills` / `prompts` arrays). */
export interface PiAssetPath {
  /** Absolute path; relative entries resolve against their settings file's directory. */
  path: string
  /** True when declared by the project `.pi/settings.json` (vs. the global file). */
  project: boolean
}

export interface LoadedPiSettings {
  /** `skills` array entries (absolute paths), global entries first. */
  skillPaths: readonly PiAssetPath[]
  /** `prompts` array entries (absolute paths), global entries first. */
  promptPaths: readonly PiAssetPath[]
  /** `defaultProjectTrust` from the global settings (`ask` default). */
  defaultProjectTrust: PiTrustDefault
  /** `enableSkillCommands` (read for documentation parity; DSH `/name` always works). */
  enableSkillCommands: boolean
  /** True when the project `.pi/` resources load for the resolved working directory. */
  projectTrusted: boolean
}

export type PiTrustDefault = 'ask' | 'always' | 'never'

interface SettingsSource {
  path: string
  kind: 'global' | 'project'
  dir: string
}

interface RawLayer {
  skillPaths?: string[]
  promptPaths?: string[]
  defaultProjectTrust?: PiTrustDefault
  enableSkillCommands?: boolean
}

/** Cap on the upward trust-decision walk (also breaks symlink cycles). */
const MAX_WALK_DEPTH = 32

export class PiSettingsLoader {
  private readonly cache = new Map<string, { stamp: string; loaded: LoadedPiSettings }>()

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SettingsLoaderConfig,
  ) {}

  /** The pi config directory: `PI_CODING_AGENT_DIR` wins, else the config. */
  piDir(): string {
    const envDir = process.env['PI_CODING_AGENT_DIR']
    if (envDir !== undefined && envDir.trim() !== '') return expandHome(envDir.trim())
    return expandHome(this.config.userPiDir)
  }

  /** The settings/trust files consulted for a working directory (watchers use this). */
  async sourcePaths(cwd?: string): Promise<string[]> {
    return (await this.sources(cwd)).map((source) => source.path)
  }

  private async sources(cwd?: string): Promise<SettingsSource[]> {
    const piDir = this.piDir()
    const sources: SettingsSource[] = [
      { path: join(piDir, 'settings.json'), kind: 'global', dir: piDir },
      { path: join(piDir, 'trust.json'), kind: 'global', dir: piDir },
    ]
    if (cwd) {
      sources.push({ path: join(cwd, '.pi', 'settings.json'), kind: 'project', dir: join(cwd, '.pi') })
    }
    return sources
  }

  async load(cwd?: string): Promise<LoadedPiSettings> {
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

    const loaded = await this.loadFresh(sources, cwd)
    this.cache.set(cacheKey, { stamp, loaded })
    return loaded
  }

  private async loadFresh(sources: SettingsSource[], cwd: string | undefined): Promise<LoadedPiSettings> {
    // Parse global settings first: `defaultProjectTrust` gates the project
    // `.pi/settings.json` layer (pi does not load project resources before
    // the project is trusted).
    const globalSource = sources.find((source) => source.kind === 'global' && source.path.endsWith('settings.json'))
    const projectSource = sources.find((source) => source.kind === 'project')
    const globalLayer = await this.readLayer(globalSource)
    const trusted = await this.resolveTrust(cwd, globalLayer)

    const layers: { layer: RawLayer; source: SettingsSource }[] = []
    if (globalLayer !== undefined && globalSource !== undefined) {
      layers.push({ layer: globalLayer, source: globalSource })
    }
    if (cwd && trusted) {
      const projectLayer = await this.readLayer(projectSource)
      if (projectLayer !== undefined && projectSource !== undefined) {
        layers.push({ layer: projectLayer, source: projectSource })
      }
    }

    let defaultProjectTrust: PiTrustDefault = 'ask'
    let enableSkillCommands = true
    const skillPaths: PiAssetPath[] = []
    const promptPaths: PiAssetPath[] = []
    for (const { layer, source } of layers) {
      if (layer.defaultProjectTrust !== undefined) defaultProjectTrust = layer.defaultProjectTrust
      if (layer.enableSkillCommands !== undefined) enableSkillCommands = layer.enableSkillCommands
      // Array keys replace the broader layer's array (pi: project overrides
      // global; nested *objects* merge, arrays do not).
      if (layer.skillPaths !== undefined) {
        skillPaths.length = 0
        for (const entry of layer.skillPaths)
          skillPaths.push({ path: resolveAssetPath(entry, source.dir), project: source.kind === 'project' })
      }
      if (layer.promptPaths !== undefined) {
        promptPaths.length = 0
        for (const entry of layer.promptPaths)
          promptPaths.push({ path: resolveAssetPath(entry, source.dir), project: source.kind === 'project' })
      }
    }

    return { skillPaths, promptPaths, defaultProjectTrust, enableSkillCommands, projectTrusted: trusted }
  }

  private async readLayer(source: SettingsSource | undefined): Promise<RawLayer | undefined> {
    if (source === undefined) return undefined
    let text: string
    try {
      if (!(await this.fs.fileExists(source.path))) return undefined
      text = await this.fs.readText(source.path)
    } catch (error) {
      this.logger.warn(`pi: cannot read settings ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch (error) {
      this.logger.warn(`pi: ignoring invalid JSON settings file ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
    if (!isPlainObject(value)) {
      this.logger.warn(`pi: ignoring settings file ${source.path}: top level must be an object`)
      return undefined
    }
    const layer: RawLayer = {}
    if (Array.isArray(value['skills'])) {
      layer.skillPaths = value['skills'].filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    }
    if (Array.isArray(value['prompts'])) {
      layer.promptPaths = value['prompts'].filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    }
    const trust = value['defaultProjectTrust']
    if (trust === 'ask' || trust === 'always' || trust === 'never') {
      layer.defaultProjectTrust = trust
    } else if (trust !== undefined) {
      this.logger.warn(`pi: ignoring unsupported defaultProjectTrust in ${source.path}: ${JSON.stringify(trust)}`)
    }
    if (typeof value['enableSkillCommands'] === 'boolean') layer.enableSkillCommands = value['enableSkillCommands']
    return layer
  }

  /**
   * Resolve project trust the way pi's non-interactive mode does: the
   * closest saved decision for the working directory or a parent wins, then
   * the global `defaultProjectTrust` (`ask` counts as untrusted — there is no
   * prompt in a non-interactive session).
   */
  private async resolveTrust(cwd: string | undefined, globalLayer: RawLayer | undefined): Promise<boolean> {
    if (cwd === undefined) return false
    const decisions = await this.readTrustDecisions()
    let dir: string = cwd
    for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
      const decision = decisions.get(dir)
      if (decision !== undefined) return decision
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    const fallback = globalLayer?.defaultProjectTrust ?? 'ask'
    return fallback === 'always'
  }

  /** `trust.json`: canonical directory → decision; defensive about the format. */
  private async readTrustDecisions(): Promise<Map<string, boolean>> {
    const decisions = new Map<string, boolean>()
    const path = join(this.piDir(), 'trust.json')
    let text: string
    try {
      if (!(await this.fs.fileExists(path))) return decisions
      text = await this.fs.readText(path)
    } catch {
      return decisions
    }
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch (error) {
      this.logger.warn(`pi: ignoring invalid trust.json ${path}: ${error instanceof Error ? error.message : String(error)}`)
      return decisions
    }
    if (!isPlainObject(value)) return decisions
    for (const [dir, decision] of Object.entries(value)) {
      const parsed = parseTrustDecision(decision)
      if (parsed !== undefined) decisions.set(dir, parsed)
    }
    return decisions
  }
}

function parseTrustDecision(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['yes', 'true', 'always', 'trust', 'trusted'].includes(normalized)) return true
    if (['no', 'false', 'never', 'untrusted'].includes(normalized)) return false
  }
  return undefined
}

/** pi resolves relative asset paths against the declaring settings file's directory. */
function resolveAssetPath(path: string, baseDir: string): string {
  if (isAbsolute(path)) return path
  if (path.startsWith('~/')) return expandHome(path)
  return join(baseDir, path)
}
