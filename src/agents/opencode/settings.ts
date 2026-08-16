/**
 * opencode config (`opencode.json` / `opencode.jsonc`) discovery and merge.
 *
 * Sources, broadest first: `~/.config/opencode/opencode.json(c)` (global),
 * then `<cwd>/opencode.json(c)` (project). opencode merges config layers —
 * later sources override earlier ones for conflicting keys — and supports
 * JSONC (JSON with comments). The bridge reads two fields:
 *
 * - `command`: JSON-defined custom commands (`{ name: { template, ... } }`);
 *   a project command with the same name overrides the global one.
 * - `instructions`: an array of instruction file paths / glob patterns (the
 *   project array replaces the global one, as opencode treats the key as
 *   conflicting); entries resolve against the config file's own directory.
 *
 * Managed config files (`/etc/opencode/`, macOS MDM preferences) have no
 * discoverable file path for this bridge and are out of scope.
 *
 * The loader is shared by the skill/command provider and the memory bridge;
 * results are cached per working directory and invalidated by file stamps.
 * @module dsh-bridges/agents/opencode/settings
 */
import { join } from 'node:path'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { expandHome, isPlainObject } from '../../util.js'

export interface SettingsLoaderConfig {
  userOpencodeDir: string
}

/** One JSON-configured custom command (`command.<name>` in opencode.json). */
export interface OpencodeJsonCommand {
  /** Prompt template sent to the model when the command runs. */
  template: string
  /** TUI description, when present. */
  description?: string
}

export interface LoadedOpencodeSettings {
  /** JSON-configured commands, project overriding global per name. */
  commands: ReadonlyMap<string, OpencodeJsonCommand>
  /** The subset of `commands` defined by the project config layer. */
  projectCommands: ReadonlyMap<string, OpencodeJsonCommand>
  /** Effective `instructions` entries plus the directory they resolve against. */
  instructions: { entries: readonly string[]; baseDir: string }
  /** Effective `permission` rules; undefined when no config defines them. */
  permissions?: OpencodePermissionConfig
}

export type OpencodeAction = 'allow' | 'ask' | 'deny'

/** One family's permission entry: a plain action and/or ordered rules. */
export interface OpencodePermissionFamily {
  /** Family-level action for non-matching inputs (string form). */
  action?: OpencodeAction
  /** Ordered `pattern → action` rules; the LAST matching rule wins. */
  rules: [pattern: string, action: OpencodeAction][]
}

/**
 * Merged opencode `permission` config. Per family, the most specific config
 * layer that defines the family wins entirely (opencode overrides conflicting
 * keys per layer). The special `external_directory` family keeps its own slot
 * because it evaluates against paths outside the working directory.
 */
export interface OpencodePermissionConfig {
  /** `permission: "allow" | "ask" | "deny"` string form (default for all). */
  defaultAction?: OpencodeAction
  /** family name → family entry (includes `external_directory`). */
  families: ReadonlyMap<string, OpencodePermissionFamily>
}

interface SettingsSource {
  path: string
  kind: 'user' | 'project'
  dir: string
}

export class OpencodeSettingsLoader {
  private readonly cache = new Map<string, { stamp: string; loaded: LoadedOpencodeSettings }>()

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SettingsLoaderConfig,
  ) {}

  /** The config files consulted for a working directory (watchers use this). */
  sourcePaths(cwd?: string): string[] {
    return this.sources(cwd).map((source) => source.path)
  }

  private sources(cwd?: string): SettingsSource[] {
    const userDir = expandHome(this.config.userOpencodeDir)
    const sources: SettingsSource[] = [
      { path: join(userDir, 'opencode.json'), kind: 'user', dir: userDir },
      { path: join(userDir, 'opencode.jsonc'), kind: 'user', dir: userDir },
    ]
    if (cwd) {
      sources.push(
        { path: join(cwd, 'opencode.json'), kind: 'project', dir: cwd },
        { path: join(cwd, 'opencode.jsonc'), kind: 'project', dir: cwd },
      )
    }
    return sources
  }

  async load(cwd?: string): Promise<LoadedOpencodeSettings> {
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

  private async loadFresh(sources: SettingsSource[]): Promise<LoadedOpencodeSettings> {
    const parsed: { source: SettingsSource; value: Record<string, unknown> }[] = []
    for (const source of sources) {
      let text: string
      try {
        if (!(await this.fs.fileExists(source.path))) continue
        text = await this.fs.readText(source.path)
      } catch (error) {
        this.logger.warn(`opencode: cannot read config ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      let value: unknown
      try {
        value = JSON.parse(stripJsoncComments(text))
      } catch (error) {
        this.logger.warn(`opencode: ignoring invalid config file ${source.path}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      if (!isPlainObject(value)) {
        this.logger.warn(`opencode: ignoring config file ${source.path}: top level must be an object`)
        continue
      }
      parsed.push({ source, value })
    }

    // Broadest to most specific: the project layer overrides the global one
    // per key (commands per name, instructions as a whole array, permission
    // per family).
    const commands = new Map<string, OpencodeJsonCommand>()
    let projectCommands = new Map<string, OpencodeJsonCommand>()
    let instructions: { entries: readonly string[]; baseDir: string } | undefined
    const permissions = new Map<string, OpencodePermissionFamily>()
    let defaultAction: OpencodeAction | undefined
    let permissionConfigured = false
    for (const { source, value } of parsed) {
      if (source.kind === 'project') projectCommands = readJsonCommands(value['command'], new Map(), this.logger, source.path)
      else readJsonCommands(value['command'], commands, this.logger, source.path)
      const entries = readStringArray(value['instructions'])
      if (entries !== undefined) instructions = { entries, baseDir: source.dir }
      const layerPermission = readPermission(value['permission'], this.logger, source.path)
      if (layerPermission !== undefined) {
        permissionConfigured = true
        if (layerPermission.defaultAction !== undefined) defaultAction = layerPermission.defaultAction
        for (const [family, entry] of layerPermission.families) permissions.set(family, entry)
      }
    }
    for (const [name, command] of projectCommands) commands.set(name, command)

    return {
      commands,
      projectCommands,
      instructions: instructions ?? { entries: [], baseDir: process.cwd() },
      permissions: permissionConfigured
        ? {
            defaultAction,
            families: permissions,
          }
        : undefined,
    }
  }
}

const OPENCODE_ACTIONS: readonly OpencodeAction[] = ['allow', 'ask', 'deny']

/** Parse the `permission` field: a bare action or a family → rules object. */
function readPermission(value: unknown, logger: BridgeLogger, path: string): { defaultAction?: OpencodeAction; families: Map<string, OpencodePermissionFamily> } | undefined {
  if (value === undefined) return undefined
  if (typeof value === 'string') {
    if ((OPENCODE_ACTIONS as readonly string[]).includes(value)) return { families: new Map(), defaultAction: value as OpencodeAction }
    logger.warn(`opencode: ignoring unsupported permission action in ${path}: ${JSON.stringify(value)}`)
    return undefined
  }
  if (!isPlainObject(value)) {
    logger.warn(`opencode: ignoring malformed permission field in ${path}: must be a string or an object`)
    return undefined
  }
  const families = new Map<string, OpencodePermissionFamily>()
  for (const [family, entry] of Object.entries(value)) {
    const parsed = readPermissionFamily(entry, logger, path, family)
    if (parsed !== undefined) families.set(family, parsed)
  }
  return { families }
}

function readPermissionFamily(value: unknown, logger: BridgeLogger, path: string, family: string): OpencodePermissionFamily | undefined {
  if (typeof value === 'string') {
    if (!(OPENCODE_ACTIONS as readonly string[]).includes(value)) {
      logger.warn(`opencode: ignoring unsupported permission action for ${family} in ${path}: ${JSON.stringify(value)}`)
      return undefined
    }
    return { action: value as OpencodeAction, rules: [] }
  }
  if (!isPlainObject(value)) {
    logger.warn(`opencode: ignoring malformed permission entry for ${family} in ${path}: must be a string or an object`)
    return undefined
  }
  const rules: [string, OpencodeAction][] = []
  for (const [pattern, entry] of Object.entries(value)) {
    if (typeof entry !== 'string' || !(OPENCODE_ACTIONS as readonly string[]).includes(entry)) continue
    rules.push([pattern, entry as OpencodeAction])
  }
  return { rules }
}

function readJsonCommands(value: unknown, commands: Map<string, OpencodeJsonCommand>, logger: BridgeLogger, path: string): Map<string, OpencodeJsonCommand> {
  if (value === undefined) return commands
  if (!isPlainObject(value)) {
    logger.warn(`opencode: ignoring malformed command field in ${path}: must be an object`)
    return commands
  }
  for (const [name, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) continue
    const template = entry['template']
    if (typeof template !== 'string' || template.trim() === '') {
      logger.warn(`opencode: ignoring command ${JSON.stringify(name)} in ${path}: template must be a non-empty string`)
      continue
    }
    commands.set(name, {
      template,
      description: typeof entry['description'] === 'string' ? entry['description'] : undefined,
    })
  }
  return commands
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/**
 * Strip JSONC comments (`//` and `/* *\/`) outside of strings.
 *
 * opencode accepts JSON with comments in `opencode.json` and `opencode.jsonc`;
 * a small state machine removes them without touching string contents.
 */
export function stripJsoncComments(text: string): string {
  let result = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
        result += char
      }
      continue
    }
    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }
    if (char === '"') {
      inString = true
      result += char
      continue
    }
    if (char === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }
    if (char === '/' && next === '*') {
      inBlockComment = true
      i++
      continue
    }
    result += char
  }
  return result
}
