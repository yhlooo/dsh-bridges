/**
 * Skill provider that registers Codex skills on `ctx.skills`.
 *
 * Discovery reads the Codex skill locations:
 *
 * - `<cwd>/.agents/skills/<name>/SKILL.md`, then the same directory in every
 *   parent folder up to the repository root (closest directory first)
 * - `~/.agents/skills/<name>/SKILL.md` (user)
 * - `/etc/codex/skills/<name>/SKILL.md` (admin/system)
 *
 * Codex documents directory skills only (a `SKILL.md` inside a named
 * directory). Precedence puts project assets (closest directory first)
 * before user and system assets; DSH's lower-rank-wins ordering reflects
 * that. Ranks stay under the DSH runtime-skill rank (250), so embedded
 * runtime skills keep winning over Codex assets.
 *
 * Skills disabled via `[[skills.config]]` entries (`enabled = false`) in
 * `config.toml` are skipped. The `agents/openai.yaml` policy metadata
 * (`allow_implicit_invocation`) is not bridged yet.
 * @module dsh-bridges/agents/codex/skills/provider
 */
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { watch } from 'chokidar'
import { parse as parseToml } from 'smol-toml'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { FsAdapter } from '../../../fs-adapter.js'
import type { BridgeLogger } from '../../../util.js'
import { capString, expandHome, isPlainObject } from '../../../util.js'
import type { CodexSettingsLoader, RawCodexAgent } from '../settings.js'
import { AgentDefinitionError, buildAgentSkillBody, type AgentDefinition } from '../../../agent-definitions.js'
import { FrontmatterError, parseSkillFile } from './parse.js'

export const PROVIDER_NAME = 'codex'

/**
 * Precedence ranks: project assets (closest directory first, resolved by
 * provider order within the rank) override user assets, which override
 * system assets.
 */
const RANK_PROJECT_SKILLS = 165
const RANK_USER_SKILLS = 170
const RANK_SYSTEM_SKILLS = 175
const RANK_CONFIG_AGENTS = 168

/** Cap on the routing description (the skills standard caps at 1,024 characters). */
const MAX_DESCRIPTION_CHARS = 1024

type RootKind = 'project' | 'user' | 'system'

interface SkillRoot {
  kind: RootKind
  path: string
  rank: number
}

interface CandidateLocator {
  root: string
  rootKind: RootKind
  /** Directory name (skill bundle) or config-agent role name. */
  entry: string
  /** Absolute path of the SKILL.md file. */
  file: string
  /** `[agents.<name>]` role payload for config-agent entries. */
  agent?: RawCodexAgent
}

export interface SkillProviderConfig {
  userCodexDir: string
  /** User-level skills directory (Codex uses `~/.agents/skills`). */
  userSkillsDir: string
  watch: boolean
}

/** Maximum distinct roots (plus settings files) that stay watched. */
const MAX_WATCHED_ROOTS = 64
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200
/** Cap on the upward project-root walk (also breaks symlink cycles). */
const MAX_WALK_DEPTH = 32

type WatchTargetKind = 'skills-dir' | 'settings-file'

interface WatchTarget {
  kind: WatchTargetKind
  path: string
}

export class CodexSkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME

  private readonly watchers = new Map<string, { target: WatchTarget; watcher: ReturnType<typeof watch> }>()
  private closed = false

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SkillProviderConfig,
    private readonly settings: CodexSettingsLoader,
    private readonly invalidate: SkillProviderControl['invalidate'],
  ) {}

  /** Project skill roots from the working directory up to the repository root. */
  private async resolveProjectRoots(cwd: string): Promise<SkillRoot[]> {
    const loaded = await this.settings.load(cwd)
    const markers = loaded.projectRootMarkers.length > 0 ? loaded.projectRootMarkers : ['.git']
    const candidates: string[] = []
    let dir: string = cwd
    let found = false
    for (let depth = 0; depth < MAX_WALK_DEPTH; depth++) {
      candidates.push(dir)
      if (await this.hasMarker(dir, markers)) {
        found = true
        break
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    // Without a project root, Codex checks only the current directory.
    const dirs = found ? candidates : candidates.slice(0, 1)
    return dirs.map((path) => ({ kind: 'project', path: join(path, '.agents', 'skills'), rank: RANK_PROJECT_SKILLS }))
  }

  private async hasMarker(dir: string, markers: readonly string[]): Promise<boolean> {
    for (const marker of markers) {
      if (await this.fs.dirExists(join(dir, marker))) return true
    }
    return false
  }

  private async resolveRoots(cwd?: string): Promise<SkillRoot[]> {
    const roots: SkillRoot[] = []
    if (cwd) roots.push(...(await this.resolveProjectRoots(cwd)))
    // Codex keeps user skills in `$HOME/.agents/skills`, independent of
    // `CODEX_HOME` / `~/.codex`. The system root mirrors settings.ts:
    // `resolve('/etc/codex')` stays the same on POSIX and becomes the
    // current-drive absolute `D:\etc\codex` on Windows.
    roots.push({ kind: 'user', path: expandHome(this.config.userSkillsDir), rank: RANK_USER_SKILLS })
    roots.push({ kind: 'system', path: join(resolve('/etc/codex'), 'skills'), rank: RANK_SYSTEM_SKILLS })
    return roots
  }

  async list(options: SkillLookupOptions) {
    const roots = await this.resolveRoots(options.cwd)
    const disabledPaths = await this.readDisabledPaths(options.cwd, options.signal)
    const candidates: SkillCandidate[] = []
    let complete = true
    for (const root of roots) {
      if (options.signal?.aborted) return { candidates, complete: false }
      let entries
      try {
        entries = await this.fs.listDir(root.path, options.signal)
      } catch (error) {
        if (isAbort(error)) return { candidates, complete: false }
        if (isMissing(error)) continue // confirmed-absent root is a valid empty state
        this.logger.warn(`codex: cannot read skill root ${root.path}: ${errorMessage(error)}`)
        complete = false
        continue
      }
      for (const entry of entries) {
        if (options.signal?.aborted) return { candidates, complete: false }
        if (!entry.isDir) continue // Codex documents directory skills only
        const bundleDir = join(root.path, entry.name)
        if (disabledPaths.has(bundleDir)) continue
        try {
          const file = join(bundleDir, 'SKILL.md')
          if (!(await this.fs.fileExists(file, options.signal))) continue
          if (disabledPaths.has(file)) continue
          const text = await this.fs.readText(file, options.signal)
          candidates.push(this.summary(root, entry.name, file, text))
        } catch (error) {
          if (isAbort(error)) return { candidates, complete: false }
          if (isMissing(error)) continue // vanished mid-scan
          if (error instanceof FrontmatterError) {
            this.logger.warn(`codex: skipping invalid skill ${bundleDir}: ${error.message}`)
            continue
          }
          this.logger.warn(`codex: cannot read skill entry under ${root.path}: ${errorMessage(error)}`)
          complete = false
        }
      }
    }
    for (const [name, agent] of await this.readAgents(options.cwd, options.signal)) {
      if (options.signal?.aborted) return { candidates, complete: false }
      if (!isSkillName(name)) {
        this.logger.warn(`codex: skipping [agents.${name}] role: name is not kebab-case; DSH skills require kebab-case names`)
        continue
      }
      if (agent.description === undefined) {
        this.logger.warn(`codex: skipping [agents.${name}] role: description is required`)
        continue
      }
      candidates.push({
        name,
        description: capString(agent.description, MAX_DESCRIPTION_CHARS),
        invocation: { modelInvocable: true, userInvocable: true },
        source: 'config-codex',
        provider: PROVIDER_NAME,
        rank: RANK_CONFIG_AGENTS,
        locator: { root: '', rootKind: 'project', entry: name, file: '', agent } satisfies CandidateLocator,
      })
    }
    if (this.config.watch) await this.ensureWatched(roots, options.cwd)
    return { candidates, complete }
  }

  private async readAgents(cwd: string | undefined, signal?: AbortSignal): Promise<ReadonlyMap<string, RawCodexAgent>> {
    if (signal?.aborted) return new Map()
    try {
      return (await this.settings.load(cwd)).agents
    } catch (error) {
      if (isAbort(error)) return new Map()
      this.logger.warn(`codex: cannot read settings for [agents] roles: ${errorMessage(error)}`)
      return new Map()
    }
  }

  private async readDisabledPaths(cwd: string | undefined, signal?: AbortSignal): Promise<ReadonlySet<string>> {
    if (signal?.aborted) return new Set()
    try {
      return (await this.settings.load(cwd)).skillDisabledPaths
    } catch (error) {
      if (isAbort(error)) return new Set()
      this.logger.warn(`codex: cannot read settings for skills.config: ${errorMessage(error)}`)
      return new Set()
    }
  }

  /** Load a `[agents.<name>]` role as a delegation-spec skill body. */
  private async loadConfigAgent(locator: CandidateLocator, signal?: AbortSignal): Promise<SkillDefinition | undefined> {
    const agent = locator.agent
    if (agent === undefined) return undefined
    let body = ''
    let model: string | undefined
    if (agent.configFile !== undefined) {
      const file = isAbsolute(agent.configFile) ? agent.configFile : join(agent.baseDir, agent.configFile)
      try {
        const text = await this.fs.readText(file, signal)
        body = text
        const parsed = parseToml(text)
        if (isPlainObject(parsed) && typeof parsed['model'] === 'string') model = parsed['model']
      } catch (error) {
        if (isAbort(error)) throw error
        this.logger.warn(`codex: cannot read [agents.${locator.entry}] config file: ${errorMessage(error)}`)
      }
    }
    const definition: AgentDefinition = {
      name: locator.entry,
      description: agent.description ?? '',
      body: body.trim() === '' ? agent.description ?? '' : body,
      tools: [],
      disallowedTools: [],
      model,
    }
    return {
      name: locator.entry,
      description: capString(agent.description ?? '', MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: 'config-codex',
      provider: PROVIDER_NAME,
      content: buildAgentSkillBody(definition, this.logger),
    }
  }

  private summary(root: SkillRoot, entry: string, file: string, text: string): SkillCandidate {
    if (!isSkillName(entry)) {
      throw new FrontmatterError(`skill name ${JSON.stringify(entry)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const parsed = parseSkillFile(text, entry)
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry, file }
    return {
      name: entry,
      description: capString(parsed.frontmatter.description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind === 'project' ? 'project-codex' : root.kind === 'user' ? 'user-codex' : 'system-codex',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: dirname(file) },
      rank: root.rank,
      locator,
      path: file,
    }
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as CandidateLocator
    if (locator.agent !== undefined) {
      return this.loadConfigAgent(locator, options.signal)
    }
    let text: string
    try {
      text = await this.fs.readText(locator.file, options.signal)
    } catch (error) {
      if (isAbort(error)) throw error
      return undefined // file disappeared: the skill is no longer loadable
    }
    try {
      const parsed = parseSkillFile(text, locator.entry)
      return {
        name: locator.entry,
        description: capString(parsed.frontmatter.description, MAX_DESCRIPTION_CHARS),
        invocation: { modelInvocable: true, userInvocable: true },
        source: locator.rootKind === 'project' ? 'project-codex' : locator.rootKind === 'user' ? 'user-codex' : 'system-codex',
        provider: PROVIDER_NAME,
        resourceBase: { kind: 'directory', path: dirname(locator.file) },
        content: parsed.body,
        path: locator.file,
      }
    } catch (error) {
      if (error instanceof FrontmatterError) {
        this.logger.warn(`codex: cannot load malformed skill ${locator.file}: ${error.message}`)
        return undefined
      }
      throw error
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private async ensureWatched(roots: SkillRoot[], cwd?: string) {
    const targets: WatchTarget[] = roots.map((root) => ({ kind: 'skills-dir', path: root.path }))
    for (const path of await this.settings.sourcePaths(cwd)) targets.push({ kind: 'settings-file', path })
    for (const target of targets) {
      const existing = this.watchers.get(target.path)
      if (existing) {
        // Keep most-recently-used order so eviction drops the oldest project.
        this.watchers.delete(target.path)
        this.watchers.set(target.path, existing)
        continue
      }
      if (this.watchers.size >= MAX_WATCHED_ROOTS) {
        const oldest = this.watchers.keys().next().value
        if (oldest !== undefined) {
          void this.watchers
            .get(oldest)
            ?.watcher.close()
            .catch(() => {})
          this.watchers.delete(oldest)
        }
      }
      void this.openTargetWatcher(target)
    }
  }

  private async openTargetWatcher(target: WatchTarget) {
    const watcher = watch(target.path, {
      persistent: true,
      ignoreInitial: true,
      depth: target.kind === 'skills-dir' ? 2 : 0,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: WATCH_STABILITY_MS, pollInterval: 100 },
    })
    this.watchers.set(target.path, { target, watcher })
    let ready = false
    watcher.on('error', (error) => {
      if (ready) this.logger.warn(`codex: watcher for ${target.path} failed: ${errorMessage(error)}`)
    })
    for (const event of ['add', 'addDir', 'change', 'unlink', 'unlinkDir'] as const) {
      watcher.on(event, (path: string) => {
        if (!ready || this.closed) return
        if (isRelevantWatchEvent(target, event, path)) this.invalidate()
      })
    }
    await new Promise<void>((resolve) => {
      watcher.once('ready', () => {
        ready = true
        resolve()
      })
    })
    if (this.closed) void watcher.close().catch(() => {})
  }

  async dispose() {
    this.closed = true
    const pending = [...this.watchers.values()].map(({ watcher }) => watcher.close().catch(() => {}))
    this.watchers.clear()
    await Promise.all(pending)
  }
}

/** Whether a watch event can change the catalog for its target. */
function isRelevantWatchEvent(target: WatchTarget, event: string, path: string): boolean {
  if (target.kind === 'settings-file') {
    // Any add/change/unlink of a settings file changes skills.config.
    return event === 'add' || event === 'change' || event === 'unlink'
  }
  const relative = path.slice(target.path.length).replace(/^[/\\]+/, '')
  if (relative === '') return event === 'addDir' || event === 'unlinkDir'
  const depth = relative.split(/[/\\]/).length
  if (depth === 1) return event === 'addDir' || event === 'unlinkDir'
  if (depth === 2) {
    if (event === 'unlinkDir') return true
    return path.slice(target.path.length + 1).toLowerCase() === 'skill.md'
  }
  return false
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
