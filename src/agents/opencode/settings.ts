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
import { isAbsolute, join } from 'node:path'
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
  /** `mcp` servers, project overriding global per name. */
  mcp: ReadonlyMap<string, OpencodeMcpEntry>
  /** `references` aliases, project overriding global; paths resolved absolute. */
  references: ReadonlyMap<string, OpencodeReference>
  /** `skills.paths` extra skill roots (resolved against their config file). */
  skillPaths: readonly { path: string }[]
  /** `agent.<id>` custom agents (subagent/all modes), project overriding global. */
  agents: ReadonlyMap<string, OpencodeAgentEntry>
}

/** One `agent.<id>` entry usable as a subagent. */
export interface OpencodeAgentEntry {
  description: string
  /** `primary` agents are main assistants and are not bridged. */
  mode: 'primary' | 'subagent' | 'all'
  /** Inline prompt text, when `prompt` was a string. */
  prompt?: string
  /** Resolved path for `prompt: { file: ... }` entries. */
  promptFile?: string
  model?: string
  /** Layer that defined the entry (project ranks win). */
  project: boolean
}

/** One `references.<alias>` entry with a resolved local path or repository. */
export interface OpencodeReference {
  alias: string
  /** Absolute path for local `path` references (already resolved). */
  path?: string
  /** Git repository reference (not fetched by the bridge). */
  repository?: string
  description?: string
  hidden?: boolean
}

/** One `mcp.<name>` entry (local stdio or remote HTTP). */
export interface OpencodeMcpEntry {
  type: 'local' | 'remote'
  command?: string[]
  environment?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  enabled: boolean
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
    const mcp = new Map<string, OpencodeMcpEntry>()
    const references = new Map<string, OpencodeReference>()
    const agents = new Map<string, OpencodeAgentEntry>()
    const skillPaths: { path: string }[] = []
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
      const layerMcp = readMcp(value['mcp'], this.logger, source.path)
      for (const [name, entry] of layerMcp) mcp.set(name, entry)
      for (const [alias, entry] of readReferences(value['references'], source.dir, this.logger, source.path)) references.set(alias, entry)
      for (const [id, entry] of readAgents(value['agent'], source.dir, source.kind === 'project', this.logger, source.path))
        agents.set(id, entry)
      for (const path of readSkillPaths(value['skills'], source.dir)) skillPaths.push(path)
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
      mcp,
      references,
      skillPaths,
      agents,
    }
  }
}

const OPENCODE_ACTIONS: readonly OpencodeAction[] = ['allow', 'ask', 'deny']

/** Parse the `permission` field: a bare action or a family → rules object. */
function readPermission(
  value: unknown,
  logger: BridgeLogger,
  path: string,
): { defaultAction?: OpencodeAction; families: Map<string, OpencodePermissionFamily> } | undefined {
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

function readJsonCommands(
  value: unknown,
  commands: Map<string, OpencodeJsonCommand>,
  logger: BridgeLogger,
  path: string,
): Map<string, OpencodeJsonCommand> {
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

const REFERENCE_ALIAS_RE = /^[^/\s`,\x00-\x1f]+$/

/** Parse `references`: `<alias>: { path | repository, description?, hidden? }` or a string shorthand. */
function readReferences(value: unknown, baseDir: string, logger: BridgeLogger, path: string): Map<string, OpencodeReference> {
  const result = new Map<string, OpencodeReference>()
  if (value === undefined) return result
  if (!isPlainObject(value)) {
    logger.warn(`opencode: ignoring malformed references field in ${path}: must be an object`)
    return result
  }
  for (const [alias, raw] of Object.entries(value)) {
    if (!REFERENCE_ALIAS_RE.test(alias) || alias === '') {
      logger.warn(`opencode: skipping reference with invalid alias ${JSON.stringify(alias)} in ${path}`)
      continue
    }
    let entry: Record<string, unknown>
    if (typeof raw === 'string') entry = { path: raw }
    else if (isPlainObject(raw)) entry = raw
    else continue
    const reference: OpencodeReference = { alias, hidden: entry['hidden'] === true }
    if (typeof entry['description'] === 'string' && entry['description'].trim() !== '') reference.description = entry['description']
    const localPath = entry['path']
    if (typeof localPath === 'string' && localPath.trim() !== '') {
      reference.path = resolveReferencePath(localPath, baseDir)
    } else if (typeof entry['repository'] === 'string' && entry['repository'].trim() !== '') {
      reference.repository = entry['repository']
    } else {
      logger.warn(`opencode: skipping reference ${JSON.stringify(alias)} in ${path}: neither path nor repository defined`)
      continue
    }
    result.set(alias, reference)
  }
  return result
}

/** Resolve a reference path: `~` home, absolute, else relative to the config file's directory. */
function resolveReferencePath(path: string, baseDir: string): string {
  if (path === '~' || path.startsWith('~/')) return expandHome(path)
  return isAbsolute(path) ? path : join(baseDir, path)
}

/** Parse `skills.paths` (extra skill folders) and `skills.urls` (network — ignored). */
function readSkillPaths(value: unknown, baseDir: string): { path: string }[] {
  if (!isPlainObject(value) || !Array.isArray(value['paths'])) return []
  const result: { path: string }[] = []
  for (const entry of value['paths']) {
    if (typeof entry !== 'string' || entry.trim() === '') continue
    result.push({ path: resolveReferencePath(entry.trim(), baseDir) })
  }
  return result
}

/** Parse `agent.<id>`: custom agents; only subagent/all modes are bridged. */
function readAgents(
  value: unknown,
  baseDir: string,
  project: boolean,
  logger: BridgeLogger,
  path: string,
): Map<string, OpencodeAgentEntry> {
  const result = new Map<string, OpencodeAgentEntry>()
  if (value === undefined) return result
  if (!isPlainObject(value)) {
    logger.warn(`opencode: ignoring malformed agent field in ${path}: must be an object`)
    return result
  }
  for (const [id, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) continue
    const description = entry['description']
    if (typeof description !== 'string' || description.trim() === '') {
      logger.warn(`opencode: skipping agent ${JSON.stringify(id)} in ${path}: description is required`)
      continue
    }
    const mode = entry['mode'] === 'primary' ? 'primary' : entry['mode'] === 'all' ? 'all' : 'subagent'
    const agent: OpencodeAgentEntry = { description: description.trim(), mode, project }
    if (typeof entry['model'] === 'string' && entry['model'].trim() !== '') agent.model = entry['model'].trim()
    const prompt = entry['prompt']
    if (typeof prompt === 'string') {
      agent.prompt = prompt.trim()
    } else if (isPlainObject(prompt) && typeof prompt['file'] === 'string' && prompt['file'].trim() !== '') {
      agent.promptFile = resolveReferencePath(prompt['file'].trim(), baseDir)
    }
    result.set(id, agent)
  }
  return result
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** Parse the `mcp` object: `<name>: { type, command, environment, url, enabled }`. */
function readMcp(value: unknown, logger: BridgeLogger, path: string): Map<string, OpencodeMcpEntry> {
  const result = new Map<string, OpencodeMcpEntry>()
  if (value === undefined) return result
  if (!isPlainObject(value)) {
    logger.warn(`opencode: ignoring malformed mcp field in ${path}: must be an object`)
    return result
  }
  for (const [name, entry] of Object.entries(value)) {
    if (!isPlainObject(entry)) continue
    const type = entry['type']
    if (type !== 'local' && type !== 'remote') continue
    const command = Array.isArray(entry['command'])
      ? entry['command'].filter((part): part is string => typeof part === 'string')
      : typeof entry['command'] === 'string'
        ? [entry['command']]
        : undefined
    const environment: Record<string, string> = {}
    if (isPlainObject(entry['environment'])) {
      for (const [key, envValue] of Object.entries(entry['environment'])) {
        if (typeof envValue === 'string') environment[key] = envValue
      }
    }
    const headers: Record<string, string> = {}
    if (isPlainObject(entry['headers'])) {
      for (const [key, headerValue] of Object.entries(entry['headers'])) {
        if (typeof headerValue === 'string') headers[key] = headerValue
      }
    }
    result.set(name, {
      type,
      command: command !== undefined && command.length > 0 ? command : undefined,
      environment: Object.keys(environment).length > 0 ? environment : undefined,
      url: typeof entry['url'] === 'string' && entry['url'].trim() !== '' ? entry['url'] : undefined,
      headers: Object.keys(headers).length > 0 ? headers : undefined,
      enabled: entry['enabled'] !== false,
    })
  }
  return result
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
