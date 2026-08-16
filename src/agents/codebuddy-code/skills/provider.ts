/**
 * Skill provider that registers CodeBuddy Code skills and commands on
 * `ctx.skills`.
 *
 * Discovery reads the CodeBuddy Code asset locations:
 *
 * - `~/.codebuddy/skills/<name>/SKILL.md`
 * - `~/.codebuddy/commands/*.md` (nested subdirectories qualify names with
 *   `:`; those names are not kebab-case and are skipped)
 * - `<cwd>/.codebuddy/skills/<name>/SKILL.md`
 * - `<cwd>/.codebuddy/commands/*.md`
 *
 * CodeBuddy Code only documents directory skills (a `SKILL.md` inside a named
 * directory); flat `<name>.md` skills are a Claude Code extension and are not
 * read here. Precedence mirrors CodeBuddy Code: project assets override user
 * assets (unlike Claude Code, where personal assets win), and a skill
 * overrides a same-name command at the same level — so project ranks sit
 * below user ranks in DSH's lower-rank-wins ordering. Ranks stay under the
 * DSH runtime-skill rank (250), so embedded runtime skills keep winning over
 * CodeBuddy assets.
 *
 * The `skillOverrides` setting (per skill name: `on`, `name-only`,
 * `user-invocable-only`, `off`) is applied on top of the file's own
 * frontmatter.
 * @module dsh-bridges/agents/codebuddy-code/skills/provider
 */
import { join, dirname, basename } from 'node:path'
import { watch } from 'chokidar'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { FsAdapter } from '../../../fs-adapter.js'
import type { BridgeLogger } from '../../../util.js'
import { AgentDefinitionError, buildAgentSkillBody, parseAgentDefinition } from '../../../agent-definitions.js'
import { capString, expandHome, stripMarkdownExtension } from '../../../util.js'
import type { CodebuddySettingsLoader } from '../settings.js'
import type { SkillOverrideState } from '../hooks/types.js'
import { FrontmatterError, firstParagraph, parseSkillFile } from './parse.js'

export const PROVIDER_NAME = 'codebuddy-code'

/**
 * Precedence ranks: project assets override user assets (CodeBuddy Code
 * semantics, the inverse of Claude Code), and a skill overrides a same-name
 * command at the same level.
 */
const RANK_PROJECT_SKILLS = 125
const RANK_PROJECT_COMMANDS = 130
const RANK_PROJECT_AGENTS = 132
const RANK_USER_SKILLS = 135
const RANK_USER_AGENTS = 137
const RANK_USER_COMMANDS = 140

/** Cap on the composed routing description; CodeBuddy Code documents no listing limit, so the bridge keeps Claude Code's 1,536 characters as a safety bound. */
const MAX_DESCRIPTION_CHARS = 1536
/** Recursion bound for nested command discovery. */
const MAX_COMMAND_DEPTH = 8

type RootKind = 'user-skills' | 'user-commands' | 'user-agents' | 'project-skills' | 'project-commands' | 'project-agents'

interface SkillRoot {
  kind: RootKind
  path: string
  rank: number
}

interface CandidateLocator {
  root: string
  rootKind: RootKind
  /** Directory name (skill bundle) or qualified command name (`group:name`). */
  entry: string
  kind: 'bundle' | 'command' | 'agent'
  /** Absolute path of the SKILL.md / command markdown file. */
  file: string
  /** The skillOverrides state resolved at discovery time. */
  override: SkillOverrideState
}

export interface SkillProviderConfig {
  userCodebuddyDir: string
  watch: boolean
  /** Discover `.codebuddy/agents` / `~/.codebuddy/agents` subagent definitions. */
  agents: boolean
}

/** Maximum distinct roots (plus settings files) that stay watched. */
const MAX_WATCHED_ROOTS = 64
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200

type WatchTargetKind = 'skills-dir' | 'commands-dir' | 'settings-file'

interface WatchTarget {
  kind: WatchTargetKind
  path: string
}

export class CodebuddySkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME

  private readonly watchers = new Map<string, { target: WatchTarget; watcher: ReturnType<typeof watch> }>()
  private closed = false

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SkillProviderConfig,
    private readonly settings: CodebuddySettingsLoader,
    private readonly invalidate: SkillProviderControl['invalidate'],
  ) {}

  private resolveRoots(cwd?: string): SkillRoot[] {
    const userCodebuddyDir = expandHome(this.config.userCodebuddyDir)
    const roots: SkillRoot[] = [
      { kind: 'user-skills', path: join(userCodebuddyDir, 'skills'), rank: RANK_USER_SKILLS },
      { kind: 'user-commands', path: join(userCodebuddyDir, 'commands'), rank: RANK_USER_COMMANDS },
      ...(this.config.agents ? [{ kind: 'user-agents' as const, path: join(userCodebuddyDir, 'agents'), rank: RANK_USER_AGENTS }] : []),
    ]
    if (cwd) {
      const projectCodebuddyDir = join(cwd, '.codebuddy')
      roots.push(
        { kind: 'project-skills', path: join(projectCodebuddyDir, 'skills'), rank: RANK_PROJECT_SKILLS },
        { kind: 'project-commands', path: join(projectCodebuddyDir, 'commands'), rank: RANK_PROJECT_COMMANDS },
        ...(this.config.agents ? [{ kind: 'project-agents' as const, path: join(projectCodebuddyDir, 'agents'), rank: RANK_PROJECT_AGENTS }] : []),
      )
    }
    return roots
  }

  async list(options: SkillLookupOptions) {
    const roots = this.resolveRoots(options.cwd)
    const overrides = await this.readOverrides(options.cwd, options.signal)
    const candidates: SkillCandidate[] = []
    let complete = true
    for (const root of roots) {
      if (options.signal?.aborted) return { candidates, complete: false }
      if (root.kind.endsWith('-skills')) {
        const result = await this.listSkills(root, overrides, options, candidates)
        complete = complete && result.complete
        if (!result.continue) return { candidates, complete }
      } else if (root.kind.endsWith('-agents')) {
        const result = await this.listAgents(root, options, candidates)
        complete = complete && result.complete
        if (!result.continue) return { candidates, complete }
      } else {
        const result = await this.listCommands(root, options, candidates, 0)
        complete = complete && result.complete
        if (!result.continue) return { candidates, complete }
      }
    }
    if (this.config.watch) this.ensureWatched(roots, options.cwd)
    return { candidates, complete }
  }

  /** Discover `SKILL.md` bundles directly under a skills root. */
  private async listSkills(
    root: SkillRoot,
    overrides: ReadonlyMap<string, SkillOverrideState>,
    options: SkillLookupOptions,
    candidates: SkillCandidate[],
  ): Promise<{ complete: boolean; continue: boolean }> {
    let entries
    try {
      entries = await this.fs.listDir(root.path, options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true } // confirmed-absent root is a valid empty state
      this.logger.warn(`codebuddy-code: cannot read skill root ${root.path}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (!entry.isDir) continue // CodeBuddy Code documents directory skills only
      try {
        const file = join(root.path, entry.name, 'SKILL.md')
        if (!(await this.fs.fileExists(file, options.signal))) continue
        const text = await this.fs.readText(file, options.signal)
        candidates.push(this.summary(root, entry.name, 'bundle', file, text, overrides.get(entry.name) ?? 'on'))
      } catch (error) {
        if (isAbort(error)) return { complete: false, continue: false }
        if (isMissing(error)) continue // vanished mid-scan
        if (error instanceof FrontmatterError) {
          this.logger.warn(`codebuddy-code: skipping malformed skill ${root.path}: ${error.message}`)
          continue
        }
        this.logger.warn(`codebuddy-code: cannot read skill entry under ${root.path}: ${errorMessage(error)}`)
        return { complete: false, continue: true }
      }
    }
    return { complete: true, continue: true }
  }

  /** Discover command `.md` files recursively; nested files qualify with `:`. */
  private async listCommands(
    root: SkillRoot,
    options: SkillLookupOptions,
    candidates: SkillCandidate[],
    depth: number,
    prefix = '',
  ): Promise<{ complete: boolean; continue: boolean }> {
    if (depth > MAX_COMMAND_DEPTH) return { complete: true, continue: true }
    let entries
    try {
      entries = await this.fs.listDir(prefix === '' ? root.path : join(root.path, prefix), options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true }
      this.logger.warn(`codebuddy-code: cannot read command root ${root.path}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (entry.isDir) {
        const result = await this.listCommands(root, options, candidates, depth + 1, join(prefix, entry.name))
        if (!result.continue) return result
        continue
      }
      if (!entry.isFile || !entry.name.toLowerCase().endsWith('.md')) continue
      // Subdirectory commands are named `group:name` (a colon is not
      // kebab-case, so they are skipped with a warning per DSH's name policy).
      const qualified =
        prefix === '' ? stripMarkdownExtension(entry.name) : `${prefix.replace(/[/\\]+/g, ':')}:${stripMarkdownExtension(entry.name)}`
      const file = join(root.path, prefix, entry.name)
      try {
        const text = await this.fs.readText(file, options.signal)
        if (!isSkillName(qualified)) {
          this.logger.warn(
            `codebuddy-code: skipping command ${JSON.stringify(qualified)}: nested command names are not kebab-case; DSH skills require kebab-case names`,
          )
          continue
        }
        candidates.push(this.summary(root, qualified, 'command', file, text, 'on'))
      } catch (error) {
        if (isAbort(error)) return { complete: false, continue: false }
        if (isMissing(error)) continue
        if (error instanceof FrontmatterError) {
          this.logger.warn(`codebuddy-code: skipping malformed command ${file}: ${error.message}`)
          continue
        }
        this.logger.warn(`codebuddy-code: cannot read command entry ${file}: ${errorMessage(error)}`)
      }
    }
    return { complete: true, continue: true }
  }

  /** Discover custom subagent definition files directly under an agents root. */
  private async listAgents(
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
      this.logger.warn(`codebuddy-code: cannot read agents root ${root.path}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (!entry.isFile || !entry.name.toLowerCase().endsWith('.md')) continue
      const file = join(root.path, entry.name)
      try {
        const text = await this.fs.readText(file, options.signal)
        candidates.push(this.summaryAgent(root, file, text))
      } catch (error) {
        if (isAbort(error)) return { complete: false, continue: false }
        if (isMissing(error)) continue // vanished mid-scan
        if (error instanceof AgentDefinitionError) {
          this.logger.warn(`codebuddy-code: skipping malformed subagent ${file}: ${error.message}`)
          continue
        }
        this.logger.warn(`codebuddy-code: cannot read subagent entry ${file}: ${errorMessage(error)}`)
        return { complete: false, continue: true }
      }
    }
    return { complete: true, continue: true }
  }

  /** Candidate summary for one custom subagent definition file. */
  private summaryAgent(root: SkillRoot, file: string, text: string): SkillCandidate {
    const definition = parseAgentDefinition(text)
    if (!isSkillName(definition.name)) {
      throw new AgentDefinitionError(
        `subagent name ${JSON.stringify(definition.name)} is not kebab-case; DSH skills require kebab-case names`,
      )
    }
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry: definition.name, kind: 'agent', file, override: 'on' }
    return {
      name: definition.name,
      description: capString(definition.description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-codebuddy' : 'user-codebuddy',
      provider: PROVIDER_NAME,
      rank: root.rank,
      locator,
      path: file,
    }
  }

  private async readOverrides(cwd: string | undefined, signal?: AbortSignal): Promise<ReadonlyMap<string, SkillOverrideState>> {
    if (signal?.aborted) return new Map()
    try {
      return (await this.settings.load(cwd)).skillOverrides
    } catch (error) {
      if (isAbort(error)) return new Map()
      this.logger.warn(`codebuddy-code: cannot read settings for skillOverrides: ${errorMessage(error)}`)
      return new Map()
    }
  }

  private summary(
    root: SkillRoot,
    entry: string,
    kind: 'bundle' | 'command',
    file: string,
    text: string,
    override: SkillOverrideState,
  ): SkillCandidate {
    if (!isSkillName(entry)) {
      throw new FrontmatterError(`skill name ${JSON.stringify(entry)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const parsed = parseSkillFile(text)
    const { frontmatter, body } = parsed
    const invocation = applyOverride({ modelInvocable: frontmatter.modelInvocable, userInvocable: frontmatter.userInvocable }, override)
    const description = this.composeDescription(frontmatter.description, frontmatter.whenToUse, body, override)
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry, kind, file, override }
    return {
      name: entry,
      description,
      whenToUse: frontmatter.whenToUse,
      invocation,
      source: root.kind.startsWith('project') ? 'project-codebuddy' : 'user-codebuddy',
      provider: PROVIDER_NAME,
      resourceBase: kind === 'bundle' ? { kind: 'directory', path: dirname(file) } : { kind: 'directory', path: root.path },
      rank: root.rank,
      locator,
      path: file,
      metadata: frontmatter.metadata,
    }
  }

  private composeDescription(
    description: string | undefined,
    whenToUse: string | undefined,
    body: string,
    override: SkillOverrideState,
  ): string {
    // `name-only` collapses the description, mirroring the setting's purpose
    // of saving context budget while keeping the skill visible by name.
    if (override === 'name-only') return ''
    const base = description ?? firstParagraph(body)
    const combined = whenToUse && whenToUse.trim() ? `${base}\n${whenToUse}` : base
    return capString(combined, MAX_DESCRIPTION_CHARS)
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as CandidateLocator
    let text: string
    try {
      text = await this.fs.readText(locator.file, options.signal)
    } catch (error) {
      if (isAbort(error)) throw error
      return undefined // file disappeared: the skill is no longer loadable
    }
    if (locator.kind === 'agent') {
      let definition
      try {
        definition = parseAgentDefinition(text)
      } catch (error) {
        if (error instanceof AgentDefinitionError) {
          this.logger.warn(`codebuddy-code: cannot load malformed subagent ${locator.file}: ${error.message}`)
          return undefined
        }
        throw error
      }
      return {
        name: definition.name,
        description: capString(definition.description, MAX_DESCRIPTION_CHARS),
        invocation: { modelInvocable: true, userInvocable: true },
        source: locator.rootKind.startsWith('project') ? 'project-codebuddy' : 'user-codebuddy',
        provider: PROVIDER_NAME,
        content: buildAgentSkillBody(definition, this.logger),
        path: locator.file,
      }
    }
    let parsed
    try {
      parsed = parseSkillFile(text)
    } catch (error) {
      if (error instanceof FrontmatterError) {
        this.logger.warn(`codebuddy-code: cannot load malformed skill ${locator.file}: ${error.message}`)
        return undefined
      }
      throw error
    }
    const { frontmatter, body } = parsed
    const override = await this.readOverrides(options.cwd, options.signal).then((overrides) => overrides.get(locator.entry) ?? 'on')
    const invocation = applyOverride({ modelInvocable: frontmatter.modelInvocable, userInvocable: frontmatter.userInvocable }, override)
    return {
      name: locator.entry,
      description: this.composeDescription(frontmatter.description, frontmatter.whenToUse, body, override),
      whenToUse: frontmatter.whenToUse,
      invocation,
      source: locator.rootKind.startsWith('project') ? 'project-codebuddy' : 'user-codebuddy',
      provider: PROVIDER_NAME,
      resourceBase:
        locator.kind === 'bundle' ? { kind: 'directory', path: dirname(locator.file) } : { kind: 'directory', path: locator.root },
      content: body,
      path: locator.file,
      metadata: frontmatter.metadata,
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private ensureWatched(roots: SkillRoot[], cwd?: string) {
    const targets: WatchTarget[] = roots.map((root) => ({
      kind: root.kind.endsWith('-skills') ? 'skills-dir' : 'commands-dir',
      path: root.path,
    }))
    for (const path of this.settings.sourcePaths(cwd)) targets.push({ kind: 'settings-file', path })
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
      depth: target.kind === 'commands-dir' ? 0 : target.kind === 'skills-dir' ? 2 : 0,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: WATCH_STABILITY_MS, pollInterval: 100 },
    })
    this.watchers.set(target.path, { target, watcher })
    let ready = false
    watcher.on('error', (error) => {
      if (ready) this.logger.warn(`codebuddy-code: watcher for ${target.path} failed: ${errorMessage(error)}`)
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

/** Apply a skillOverrides state to the frontmatter-derived invocation policy. */
function applyOverride(
  invocation: { modelInvocable: boolean; userInvocable: boolean },
  override: SkillOverrideState,
): { modelInvocable: boolean; userInvocable: boolean } {
  switch (override) {
    case 'off':
      return { modelInvocable: false, userInvocable: false }
    case 'user-invocable-only':
      return { modelInvocable: false, userInvocable: true }
    default:
      return invocation
  }
}

/** Whether a watch event can change the catalog for its target. */
function isRelevantWatchEvent(target: WatchTarget, event: string, path: string): boolean {
  if (target.kind === 'settings-file') {
    // Any add/change/unlink of the settings file changes skillOverrides.
    return event === 'add' || event === 'change' || event === 'unlink'
  }
  const relative = path.slice(target.path.length).replace(/^[/\\]+/, '')
  if (relative === '') {
    return event === 'addDir' || event === 'unlinkDir'
  }
  const depth = relative.split(/[/\\]/).length
  if (target.kind === 'commands-dir') {
    if (event === 'addDir' || event === 'unlinkDir') return true
    return relative.toLowerCase().endsWith('.md')
  }
  // skills-dir: depth-1 bundle dirs and depth-2 SKILL.md files matter.
  if (depth === 1) return event === 'addDir' || event === 'unlinkDir'
  if (depth === 2) {
    if (event === 'unlinkDir') return true
    return basename(path).toLowerCase() === 'skill.md'
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
