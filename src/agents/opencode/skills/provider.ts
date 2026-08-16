/**
 * Skill provider that registers opencode skills and commands on `ctx.skills`.
 *
 * Discovery reads the opencode asset locations:
 *
 * - `<cwd>/.opencode/skills/<name>/SKILL.md` and
 *   `~/.config/opencode/skills/<name>/SKILL.md` (directory skills only)
 * - `<cwd>/.opencode/commands/<name>.md` and
 *   `~/.config/opencode/commands/<name>.md` (flat command files)
 * - JSON-defined commands from `opencode.json(c)` (`command.<name>`), which
 *   override same-name command files at the same level
 *
 * opencode's Claude-compat fallback roots (`.claude/skills`,
 * `~/.claude/skills`) and agent-compat roots (`.agents/skills`,
 * `~/.agents/skills`) are deliberately **not** re-read here: the claude-code
 * bridge already covers `.claude` assets and DSH's own filesystem provider
 * covers `.agents` assets, so re-registering them would duplicate candidates.
 *
 * Precedence mirrors the two config layers: project assets override user
 * assets, and a skill overrides a same-name command at the same level, so
 * project ranks sit below user ranks in DSH's lower-rank-wins ordering. All
 * ranks stay under the DSH runtime-skill rank (250), so embedded runtime
 * skills keep winning over opencode assets.
 * @module dsh-bridges/agents/opencode/skills/provider
 */
import { dirname, join } from 'node:path'
import { watch } from 'chokidar'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { FsAdapter } from '../../../fs-adapter.js'
import type { BridgeLogger } from '../../../util.js'
import { capString, expandHome, stripMarkdownExtension } from '../../../util.js'
import type { OpencodeSettingsLoader } from '../settings.js'
import { buildAgentSkillBody, type AgentDefinition } from '../../../agent-definitions.js'
import type { OpencodeAgentEntry } from '../settings.js'
import { firstParagraph, FrontmatterError, isOpencodeName, parseCommandFile, parseSkillFile } from './parse.js'

export const PROVIDER_NAME = 'opencode'

/**
 * Precedence ranks: project assets override user assets (like the config
 * layers), a skill overrides a same-name command, and JSON-configured
 * commands override same-name command files at the same level.
 */
const RANK_PROJECT_SKILLS = 145
const RANK_PROJECT_EXTRA_SKILLS = 146
const RANK_PROJECT_AGENTS = 149
const RANK_USER_AGENTS = 159
const RANK_PROJECT_JSON_COMMANDS = 147
const RANK_PROJECT_COMMANDS = 150
const RANK_USER_SKILLS = 155
const RANK_USER_JSON_COMMANDS = 157
const RANK_USER_COMMANDS = 160

/** opencode caps the skill `description` at 1,024 characters. */
const MAX_DESCRIPTION_CHARS = 1024

type RootKind = 'user-skills' | 'user-json-commands' | 'user-commands' | 'project-skills' | 'project-extra-skills' | 'project-json-commands' | 'project-commands'

interface SkillRoot {
  kind: RootKind
  path: string
  rank: number
}

interface CandidateLocator {
  root: string
  rootKind: RootKind
  /** Directory name (skill bundle) or command name. */
  entry: string
  kind: 'bundle' | 'file-command' | 'json-command' | 'config-agent'
  /** Absolute path of the SKILL.md / command file; undefined for JSON commands. */
  file?: string
  /** `agent.<id>` payload for config-agent entries. */
  agent?: OpencodeAgentEntry
}

export interface SkillProviderConfig {
  userOpencodeDir: string
  watch: boolean
}

/** Maximum distinct roots (plus config files) that stay watched. */
const MAX_WATCHED_ROOTS = 64
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200

type WatchTargetKind = 'skills-dir' | 'commands-dir' | 'config-file'

interface WatchTarget {
  kind: WatchTargetKind
  path: string
}

export class OpencodeSkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME

  private readonly watchers = new Map<string, { target: WatchTarget; watcher: ReturnType<typeof watch> }>()
  private closed = false

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SkillProviderConfig,
    private readonly settings: OpencodeSettingsLoader,
    private readonly invalidate: SkillProviderControl['invalidate'],
  ) {}

  private async resolveRoots(cwd?: string): Promise<SkillRoot[]> {
    const userDir = expandHome(this.config.userOpencodeDir)
    const roots: SkillRoot[] = [
      { kind: 'user-skills', path: join(userDir, 'skills'), rank: RANK_USER_SKILLS },
      { kind: 'user-json-commands', path: join(userDir, 'commands'), rank: RANK_USER_JSON_COMMANDS },
      { kind: 'user-commands', path: join(userDir, 'commands'), rank: RANK_USER_COMMANDS },
    ]
    if (cwd) {
      // Upward `.opencode/skills` discovery (opencode walks from cwd to the
      // git worktree root; closest directories win on same-rank conflicts
      // through candidate order).
      for (const dir of await this.projectDirs(cwd)) {
        roots.push({ kind: 'project-skills', path: join(dir, '.opencode', 'skills'), rank: RANK_PROJECT_SKILLS })
      }
      // `skills.paths` extra roots from opencode.json(c).
      try {
        const settings = await this.settings.load(cwd)
        for (const entry of settings.skillPaths) {
          roots.push({ kind: 'project-extra-skills', path: entry.path, rank: RANK_PROJECT_EXTRA_SKILLS })
        }
      } catch (error) {
        if (!isAbort(error)) this.logger.warn(`opencode: cannot read config for skills.paths: ${errorMessage(error)}`)
      }
      const projectDir = join(cwd, '.opencode')
      roots.push(
        { kind: 'project-json-commands', path: join(projectDir, 'commands'), rank: RANK_PROJECT_JSON_COMMANDS },
        { kind: 'project-commands', path: join(projectDir, 'commands'), rank: RANK_PROJECT_COMMANDS },
      )
    }
    return roots
  }

  /** The directory chain from the git root down to `cwd`, closest first. */
  private async projectDirs(cwd: string): Promise<string[]> {
    const dirs: string[] = []
    let dir: string = cwd
    for (let depth = 0; depth < 32; depth++) {
      dirs.push(dir)
      if (await this.fs.dirExists(join(dir, '.git'))) break
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return dirs
  }

  async list(options: SkillLookupOptions) {
    const roots = await this.resolveRoots(options.cwd)
    const jsonCommands = await this.readJsonCommands(options.cwd, options.signal)
    const candidates: SkillCandidate[] = []
    let complete = true
    for (const root of roots) {
      if (options.signal?.aborted) return { candidates, complete: false }
      switch (root.kind) {
        case 'user-skills':
        case 'project-skills':
        case 'project-extra-skills': {
          const result = await this.listSkills(root, options, candidates)
          complete = complete && result.complete
          if (!result.continue) return { candidates, complete }
          break
        }
        case 'user-commands':
        case 'project-commands': {
          const result = await this.listCommands(root, options, candidates)
          complete = complete && result.complete
          if (!result.continue) return { candidates, complete }
          break
        }
        case 'user-json-commands': {
          for (const command of jsonCommands.all) {
            if (jsonCommands.project.has(command.name)) continue // project layer overrides
            try {
              candidates.push(this.jsonCommandSummary(root, command.name, command.template, command.description))
            } catch (error) {
              if (error instanceof FrontmatterError) {
                this.logger.warn(`opencode: skipping invalid JSON command ${JSON.stringify(command.name)}: ${error.message}`)
                continue
              }
              throw error
            }
          }
          break
        }
        case 'project-json-commands': {
          for (const command of jsonCommands.all) {
            if (!jsonCommands.project.has(command.name)) continue
            try {
              candidates.push(this.jsonCommandSummary(root, command.name, command.template, command.description))
            } catch (error) {
              if (error instanceof FrontmatterError) {
                this.logger.warn(`opencode: skipping invalid JSON command ${JSON.stringify(command.name)}: ${error.message}`)
                continue
              }
              throw error
            }
          }
          break
        }
      }
    }
    for (const [name, agent] of await this.readAgents(options.cwd, options.signal)) {
      if (options.signal?.aborted) return { candidates, complete: false }
      if (agent.mode === 'primary') continue // primary agents are main assistants, not subagents
      if (!isSkillName(name)) {
        this.logger.warn(`opencode: skipping agent ${JSON.stringify(name)}: name is not kebab-case; DSH skills require kebab-case names`)
        continue
      }
      candidates.push({
        name,
        description: capString(agent.description, MAX_DESCRIPTION_CHARS),
        invocation: { modelInvocable: true, userInvocable: true },
        source: agent.project ? 'project-opencode' : 'user-opencode',
        provider: PROVIDER_NAME,
        rank: agent.project ? RANK_PROJECT_AGENTS : RANK_USER_AGENTS,
        locator: { root: '', rootKind: 'project-commands', entry: name, kind: 'config-agent', agent } satisfies CandidateLocator,
      })
    }
    if (this.config.watch) this.ensureWatched(roots, options.cwd)
    return { candidates, complete }
  }

  private async readAgents(cwd: string | undefined, signal?: AbortSignal): Promise<ReadonlyMap<string, OpencodeAgentEntry>> {
    if (signal?.aborted) return new Map()
    try {
      return (await this.settings.load(cwd)).agents
    } catch (error) {
      if (isAbort(error)) return new Map()
      this.logger.warn(`opencode: cannot read config for agent definitions: ${errorMessage(error)}`)
      return new Map()
    }
  }

  private async readJsonCommands(cwd: string | undefined, signal?: AbortSignal): Promise<{ all: readonly { name: string; template: string; description?: string }[]; project: ReadonlySet<string> }> {
    if (signal?.aborted) return { all: [], project: new Set() }
    try {
      const settings = await this.settings.load(cwd)
      return {
        all: [...settings.commands.entries()].map(([name, command]) => ({
          name,
          template: command.template,
          description: command.description,
        })),
        project: new Set(settings.projectCommands.keys()),
      }
    } catch (error) {
      if (isAbort(error)) return { all: [], project: new Set() }
      this.logger.warn(`opencode: cannot read config for JSON commands: ${errorMessage(error)}`)
      return { all: [], project: new Set() }
    }
  }

  /** Discover `SKILL.md` bundles directly under a skills root. */
  private async listSkills(
    root: SkillRoot,
    options: SkillLookupOptions,
    candidates: SkillCandidate[],
  ): Promise<{ complete: boolean; continue: boolean }> {
    let entries
    try {
      entries = await this.fs.listDir(root.path, options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true } // confirmed-absent root is a valid empty state
      this.logger.warn(`opencode: cannot read skill root ${root.path}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (!entry.isDir) continue // opencode documents directory skills only
      try {
        const file = join(root.path, entry.name, 'SKILL.md')
        if (!(await this.fs.fileExists(file, options.signal))) continue
        const text = await this.fs.readText(file, options.signal)
        candidates.push(this.skillSummary(root, entry.name, file, text))
      } catch (error) {
        if (isAbort(error)) return { complete: false, continue: false }
        if (isMissing(error)) continue // vanished mid-scan
        if (error instanceof FrontmatterError) {
          this.logger.warn(`opencode: skipping invalid skill ${root.path}/${entry.name}: ${error.message}`)
          continue
        }
        this.logger.warn(`opencode: cannot read skill entry under ${root.path}: ${errorMessage(error)}`)
        return { complete: false, continue: true }
      }
    }
    return { complete: true, continue: true }
  }

  /** Discover flat command `.md` files directly under a commands root. */
  private async listCommands(
    root: SkillRoot,
    options: SkillLookupOptions,
    candidates: SkillCandidate[],
  ): Promise<{ complete: boolean; continue: boolean }> {
    let entries
    try {
      entries = await this.fs.listDir(root.path, options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true }
      this.logger.warn(`opencode: cannot read command root ${root.path}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (!entry.isFile || !entry.name.toLowerCase().endsWith('.md')) continue // nested command directories are not documented by opencode
      const name = stripMarkdownExtension(entry.name)
      const file = join(root.path, entry.name)
      try {
        const text = await this.fs.readText(file, options.signal)
        candidates.push(this.commandSummary(root, name, file, text))
      } catch (error) {
        if (isAbort(error)) return { complete: false, continue: false }
        if (isMissing(error)) continue
        if (error instanceof FrontmatterError) {
          this.logger.warn(`opencode: skipping malformed command ${file}: ${error.message}`)
          continue
        }
        this.logger.warn(`opencode: cannot read command entry ${file}: ${errorMessage(error)}`)
        return { complete: false, continue: true }
      }
    }
    return { complete: true, continue: true }
  }

  private skillSummary(root: SkillRoot, entry: string, file: string, text: string): SkillCandidate {
    if (!isSkillName(entry)) {
      throw new FrontmatterError(`skill name ${JSON.stringify(entry)} is not kebab-case; DSH skills require kebab-case names`)
    }
    if (!isOpencodeName(entry)) {
      throw new FrontmatterError(`skill name ${JSON.stringify(entry)} is not a valid opencode skill name`)
    }
    const parsed = parseSkillFile(text, entry)
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry, kind: 'bundle', file }
    return {
      name: entry,
      description: capString(parsed.frontmatter.description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-opencode' : 'user-opencode',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: dirname(file) },
      rank: root.rank,
      locator,
      path: file,
      metadata: parsed.frontmatter.metadata,
    }
  }

  private commandSummary(root: SkillRoot, name: string, file: string, text: string): SkillCandidate {
    if (!isSkillName(name)) {
      throw new FrontmatterError(`command name ${JSON.stringify(name)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const parsed = parseCommandFile(text)
    const description = parsed.description && parsed.description.trim() !== '' ? parsed.description : firstParagraph(parsed.body)
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry: name, kind: 'file-command', file }
    return {
      name,
      description: capString(description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-opencode' : 'user-opencode',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: root.path },
      rank: root.rank,
      locator,
      path: file,
    }
  }

  private jsonCommandSummary(root: SkillRoot, name: string, template: string, description?: string): SkillCandidate {
    if (!isSkillName(name)) {
      throw new FrontmatterError(`JSON command name ${JSON.stringify(name)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry: name, kind: 'json-command' }
    return {
      name,
      description: capString(description && description.trim() !== '' ? description : firstParagraph(template), MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-opencode' : 'user-opencode',
      provider: PROVIDER_NAME,
      rank: root.rank,
      locator,
    }
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as CandidateLocator
    if (locator.kind === 'config-agent' && locator.agent !== undefined) {
      const agent = locator.agent
      let body = agent.prompt ?? ''
      if (agent.promptFile !== undefined) {
        try {
          body = await this.fs.readText(agent.promptFile, options.signal)
        } catch (error) {
          if (isAbort(error)) throw error
          this.logger.warn(`opencode: cannot read agent prompt ${agent.promptFile}: ${errorMessage(error)}`)
          body = agent.description
        }
      }
      if (body.trim() === '') body = agent.description
      const definition: AgentDefinition = {
        name: locator.entry,
        description: agent.description,
        body,
        tools: [],
        disallowedTools: [],
        model: agent.model,
      }
      return {
        name: locator.entry,
        description: capString(agent.description, MAX_DESCRIPTION_CHARS),
        invocation: { modelInvocable: true, userInvocable: true },
        source: agent.project ? 'project-opencode' : 'user-opencode',
        provider: PROVIDER_NAME,
        content: buildAgentSkillBody(definition, this.logger),
      }
    }
    if (locator.kind === 'json-command') {
      // Re-resolve the template through the settings loader so edits to
      // opencode.json are reflected without a restart.
      const { all } = await this.readJsonCommands(options.cwd, options.signal)
      const command = all.find((entry) => entry.name === locator.entry)
      if (!command) return undefined
      return {
        name: locator.entry,
        description: capString(
          command.description && command.description.trim() !== '' ? command.description : firstParagraph(command.template),
          MAX_DESCRIPTION_CHARS,
        ),
        invocation: { modelInvocable: true, userInvocable: true },
        source: locator.rootKind.startsWith('project') ? 'project-opencode' : 'user-opencode',
        provider: PROVIDER_NAME,
        content: command.template,
      }
    }
    const file = locator.file
    if (file === undefined) return undefined
    let text: string
    try {
      text = await this.fs.readText(file, options.signal)
    } catch (error) {
      if (isAbort(error)) throw error
      return undefined // file disappeared: the skill is no longer loadable
    }
    try {
      if (locator.kind === 'bundle') {
        const parsed = parseSkillFile(text, locator.entry)
        return {
          name: locator.entry,
          description: capString(parsed.frontmatter.description, MAX_DESCRIPTION_CHARS),
          invocation: { modelInvocable: true, userInvocable: true },
          source: locator.rootKind.startsWith('project') ? 'project-opencode' : 'user-opencode',
          provider: PROVIDER_NAME,
          resourceBase: { kind: 'directory', path: dirname(file) },
          content: parsed.body,
          path: file,
          metadata: parsed.frontmatter.metadata,
        }
      }
      const parsed = parseCommandFile(text)
      const description = parsed.description && parsed.description.trim() !== '' ? parsed.description : firstParagraph(parsed.body)
      return {
        name: locator.entry,
        description: capString(description, MAX_DESCRIPTION_CHARS),
        invocation: { modelInvocable: true, userInvocable: true },
        source: locator.rootKind.startsWith('project') ? 'project-opencode' : 'user-opencode',
        provider: PROVIDER_NAME,
        resourceBase: { kind: 'directory', path: locator.root },
        content: parsed.body,
        path: file,
      }
    } catch (error) {
      if (error instanceof FrontmatterError) {
        this.logger.warn(`opencode: cannot load malformed asset ${file}: ${error.message}`)
        return undefined
      }
      throw error
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private ensureWatched(roots: SkillRoot[], cwd?: string) {
    const targets: WatchTarget[] = roots.map((root) => ({
      kind: root.kind.endsWith('-skills') ? 'skills-dir' : 'commands-dir',
      path: root.path,
    }))
    for (const path of this.settings.sourcePaths(cwd)) targets.push({ kind: 'config-file', path })
    const seen = new Set<string>()
    for (const target of targets) {
      if (seen.has(target.path)) continue // the json-command roots alias the command dirs
      seen.add(target.path)
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
      if (ready) this.logger.warn(`opencode: watcher for ${target.path} failed: ${errorMessage(error)}`)
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
  if (target.kind === 'config-file') {
    // Any add/change/unlink of the config file changes JSON commands.
    return event === 'add' || event === 'change' || event === 'unlink'
  }
  if (target.kind === 'commands-dir') {
    const relative = path.slice(target.path.length).replace(/^[/\\]+/, '')
    if (relative === '') return event === 'addDir' || event === 'unlinkDir'
    if (relative.includes('/') || relative.includes('\\')) return false
    return relative.toLowerCase().endsWith('.md')
  }
  // skills-dir: depth-1 bundle dirs and depth-2 SKILL.md files matter.
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
