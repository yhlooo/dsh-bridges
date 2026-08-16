/**
 * Skill provider that registers Gemini CLI skills, commands, and subagent
 * definitions on `ctx.skills`.
 *
 * Discovery reads the Gemini asset locations:
 *
 * - `~/.gemini/skills/<name>/SKILL.md` (user) and `.gemini/skills/<name>/SKILL.md`
 *   (workspace) — directory skills, non-recursive (Gemini documents no nested
 *   skill directories)
 * - `~/.gemini/commands/<name>.toml` and `.gemini/commands/<name>.toml` —
 *   top-level files; nested paths yield namespaced `dir:name` commands that
 *   are not kebab-case and are skipped with a warning
 * - `~/.gemini/agents/*.md` and `.gemini/agents/*.md` — subagent definitions
 *   bridged as delegation-spec skills (the shared `agent-definitions`
 *   pattern); `kind: remote` agents are skipped
 *
 * Precedence follows Gemini's discovery tiers: workspace (project) assets
 * override user assets, so project ranks sit below user ranks in DSH's
 * lower-rank-wins ordering. Within a level a skill overrides a same-name
 * command. The `.agents/skills` alias locations are deliberately **not**
 * re-read (DSH's filesystem provider covers `.agents` assets).
 *
 * `skills.disabled` names and the `skills.enabled` master switch come from
 * the settings loader. All ranks stay under the DSH runtime-skill rank (250).
 * @module dsh-bridges/agents/gemini-cli/skills/provider
 */
import { dirname, join } from 'node:path'
import { watch } from 'chokidar'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { FsAdapter } from '../../../fs-adapter.js'
import type { BridgeLogger } from '../../../util.js'
import { capString, stripMarkdownExtension } from '../../../util.js'
import { buildAgentSkillBody, type AgentDefinition } from '../../../agent-definitions.js'
import type { GeminiSettingsLoader } from '../settings.js'
import { translateGeminiAgentTools } from '../hooks/names.js'
import { firstParagraph, FrontmatterError, parseAgentFile, parseCommandFile, parseSkillFile } from './parse.js'

export const PROVIDER_NAME = 'gemini-cli'

/**
 * Precedence ranks: workspace assets override user assets (Gemini's discovery
 * tiers run built-in < extension < user < workspace), and a skill overrides a
 * same-name command at the same level.
 */
const RANK_PROJECT_SKILLS = 205
const RANK_PROJECT_AGENTS = 206
const RANK_PROJECT_COMMANDS = 207
const RANK_USER_SKILLS = 210
const RANK_USER_AGENTS = 211
const RANK_USER_COMMANDS = 212

/** Gemini caps skill descriptions at 1,024 characters (Agent Skills standard). */
const MAX_DESCRIPTION_CHARS = 1024

type RootKind = 'user-skills' | 'user-commands' | 'user-agents' | 'project-skills' | 'project-commands' | 'project-agents'

interface SkillRoot {
  kind: RootKind
  path: string
  rank: number
}

interface CandidateLocator {
  root: string
  rootKind: RootKind
  entry: string
  kind: 'bundle' | 'command' | 'agent'
  file: string
}

export interface SkillProviderConfig {
  userGeminiDir: string
  watch: boolean
  /** Bridge `.gemini/agents` definitions as delegation-spec skills. */
  agents: boolean
}

/** Maximum distinct roots (plus config files) that stay watched. */
const MAX_WATCHED_ROOTS = 64
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200

type WatchTargetKind = 'skills-dir' | 'commands-dir' | 'agents-dir' | 'config-file'

interface WatchTarget {
  kind: WatchTargetKind
  path: string
}

export class GeminiSkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME

  private readonly watchers = new Map<string, { target: WatchTarget; watcher: ReturnType<typeof watch> }>()
  private closed = false

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SkillProviderConfig,
    private readonly settings: GeminiSettingsLoader,
    private readonly invalidate: SkillProviderControl['invalidate'],
  ) {}

  private async resolveRoots(cwd?: string): Promise<SkillRoot[]> {
    const userDir = this.settings.userDir()
    const roots: SkillRoot[] = [
      { kind: 'user-skills', path: join(userDir, 'skills'), rank: RANK_USER_SKILLS },
      { kind: 'user-commands', path: join(userDir, 'commands'), rank: RANK_USER_COMMANDS },
    ]
    if (this.config.agents) {
      roots.push({ kind: 'user-agents', path: join(userDir, 'agents'), rank: RANK_USER_AGENTS })
    }
    if (cwd) {
      const geminiDir = join(cwd, '.gemini')
      roots.push(
        { kind: 'project-skills', path: join(geminiDir, 'skills'), rank: RANK_PROJECT_SKILLS },
        { kind: 'project-commands', path: join(geminiDir, 'commands'), rank: RANK_PROJECT_COMMANDS },
      )
      if (this.config.agents) {
        roots.push({ kind: 'project-agents', path: join(geminiDir, 'agents'), rank: RANK_PROJECT_AGENTS })
      }
    }
    return roots
  }

  private async skillsDisabled(cwd?: string): Promise<ReadonlySet<string>> {
    try {
      const settings = await this.settings.load(cwd)
      if (!settings.skillsEnabled) return new Set(['*'])
      return settings.skillsDisabled
    } catch {
      return new Set()
    }
  }

  async list(options: SkillLookupOptions) {
    const roots = await this.resolveRoots(options.cwd)
    const disabled = await this.skillsDisabled(options.cwd)
    const candidates: SkillCandidate[] = []
    let complete = true
    for (const root of roots) {
      if (options.signal?.aborted) return { candidates, complete: false }
      const result = await this.listRoot(root, options, candidates, disabled)
      complete = complete && result.complete
      if (!result.continue) return { candidates, complete }
    }
    if (this.config.watch) this.ensureWatched(roots, options.cwd)
    return { candidates, complete }
  }

  private async listRoot(
    root: SkillRoot,
    options: SkillLookupOptions,
    candidates: SkillCandidate[],
    disabled: ReadonlySet<string>,
  ): Promise<{ complete: boolean; continue: boolean }> {
    let entries
    try {
      entries = await this.fs.listDir(root.path, options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true }
      this.logger.warn(`gemini-cli: cannot read asset root ${root.path}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (root.kind.endsWith('-skills')) {
        if (!entry.isDir || entry.name.startsWith('.')) continue
        if (disabled.has('*') || disabled.has(entry.name)) continue
        try {
          const file = join(root.path, entry.name, 'SKILL.md')
          if (!(await this.fs.fileExists(file, options.signal))) continue
          const text = await this.fs.readText(file, options.signal)
          candidates.push(this.skillSummary(root, entry.name, file, text))
        } catch (error) {
          if (isAbort(error)) return { complete: false, continue: false }
          if (isMissing(error)) continue
          if (error instanceof FrontmatterError) {
            this.logger.warn(`gemini-cli: skipping invalid skill ${root.path}/${entry.name}: ${error.message}`)
            continue
          }
          this.logger.warn(`gemini-cli: cannot read skill entry under ${root.path}: ${errorMessage(error)}`)
          return { complete: false, continue: true }
        }
      } else if (root.kind.endsWith('-commands')) {
        if (!entry.isFile || !entry.name.toLowerCase().endsWith('.toml')) continue
        // Nested command directories are namespaced with `:` upstream, which
        // is not kebab-case; skip with a warning (no transliteration).
        const name = stripTomlExtension(entry.name)
        if (!isSkillName(name)) {
          this.logger.warn(
            `gemini-cli: skipping command ${root.path}/${entry.name}: nested namespaced commands (dir:name) are not kebab-case; DSH skills require kebab-case names`,
          )
          continue
        }
        try {
          const file = join(root.path, entry.name)
          const text = await this.fs.readText(file, options.signal)
          candidates.push(this.commandSummary(root, name, file, text))
        } catch (error) {
          if (isAbort(error)) return { complete: false, continue: false }
          if (isMissing(error)) continue
          if (error instanceof FrontmatterError) {
            this.logger.warn(`gemini-cli: skipping invalid command ${root.path}/${entry.name}: ${error.message}`)
            continue
          }
          this.logger.warn(`gemini-cli: cannot read command entry under ${root.path}: ${errorMessage(error)}`)
          return { complete: false, continue: true }
        }
      } else {
        // agents
        if (!entry.isFile || !entry.name.toLowerCase().endsWith('.md')) continue
        try {
          const file = join(root.path, entry.name)
          const text = await this.fs.readText(file, options.signal)
          candidates.push(this.agentSummary(root, stripMarkdownExtension(entry.name), file, text))
        } catch (error) {
          if (isAbort(error)) return { complete: false, continue: false }
          if (isMissing(error)) continue
          if (error instanceof FrontmatterError) {
            this.logger.warn(`gemini-cli: skipping invalid agent ${root.path}/${entry.name}: ${error.message}`)
            continue
          }
          this.logger.warn(`gemini-cli: cannot read agent entry under ${root.path}: ${errorMessage(error)}`)
          return { complete: false, continue: true }
        }
      }
    }
    return { complete: true, continue: true }
  }

  private skillSummary(root: SkillRoot, fallbackName: string, file: string, text: string): SkillCandidate {
    const parsed = parseSkillFile(text, fallbackName)
    const name = parsed.frontmatter.name
    if (!isSkillName(name)) {
      throw new FrontmatterError(`skill name ${JSON.stringify(name)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry: name, kind: 'bundle', file }
    return {
      name,
      description: capString(parsed.frontmatter.description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-gemini-cli' : 'user-gemini-cli',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: dirname(file) },
      rank: root.rank,
      locator,
      path: file,
    }
  }

  private commandSummary(root: SkillRoot, name: string, file: string, text: string): SkillCandidate {
    const parsed = parseCommandFile(text)
    const description = parsed.description ?? firstParagraph(parsed.prompt)
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry: name, kind: 'command', file }
    return {
      name,
      description: capString(description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-gemini-cli' : 'user-gemini-cli',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: root.path },
      rank: root.rank,
      locator,
      path: file,
    }
  }

  private agentSummary(root: SkillRoot, fallbackName: string, file: string, text: string): SkillCandidate {
    const parsed = parseAgentFile(text, fallbackName)
    if (parsed.remote) {
      throw new FrontmatterError(`agent ${JSON.stringify(parsed.name)} has kind "remote"; remote (A2A) agents are not bridged`)
    }
    if (!isSkillName(parsed.name)) {
      throw new FrontmatterError(`agent name ${JSON.stringify(parsed.name)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry: parsed.name, kind: 'agent', file }
    return {
      name: parsed.name,
      description: capString(parsed.description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-gemini-cli' : 'user-gemini-cli',
      provider: PROVIDER_NAME,
      rank: root.rank,
      locator,
      path: file,
    }
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as CandidateLocator
    let text: string
    try {
      text = await this.fs.readText(locator.file, options.signal)
    } catch (error) {
      if (isAbort(error)) throw error
      return undefined
    }
    try {
      const source = locator.rootKind.startsWith('project') ? 'project-gemini-cli' : 'user-gemini-cli'
      if (locator.kind === 'command') {
        const parsed = parseCommandFile(text)
        const description = parsed.description ?? firstParagraph(parsed.prompt)
        return {
          name: locator.entry,
          description: capString(description, MAX_DESCRIPTION_CHARS),
          invocation: { modelInvocable: true, userInvocable: true },
          source,
          provider: PROVIDER_NAME,
          resourceBase: { kind: 'directory', path: locator.root },
          content: parsed.prompt,
          path: locator.file,
        }
      }
      if (locator.kind === 'agent') {
        const parsed = parseAgentFile(text, locator.entry)
        if (parsed.remote) return undefined
        const { tools, dropped } = translateGeminiAgentTools(parsed.tools)
        for (const entry of dropped) {
          this.logger.warn(
            `gemini-cli: agent ${JSON.stringify(parsed.name)} tool wildcard ${JSON.stringify(entry)} has no DSH tool-filter form; dropped`,
          )
        }
        const definition: AgentDefinition = {
          name: parsed.name,
          description: parsed.description,
          body: parsed.body,
          tools,
          disallowedTools: [],
          model: parsed.model,
          maxTurns: parsed.maxTurns,
        }
        return {
          name: parsed.name,
          description: capString(parsed.description, MAX_DESCRIPTION_CHARS),
          invocation: { modelInvocable: true, userInvocable: true },
          source,
          provider: PROVIDER_NAME,
          content: buildAgentSkillBody(definition, this.logger),
          path: locator.file,
        }
      }
      const parsed = parseSkillFile(text, locator.entry)
      return {
        name: parsed.frontmatter.name,
        description: capString(parsed.frontmatter.description, MAX_DESCRIPTION_CHARS),
        invocation: { modelInvocable: true, userInvocable: true },
        source,
        provider: PROVIDER_NAME,
        resourceBase: { kind: 'directory', path: dirname(locator.file) },
        content: parsed.body,
        path: locator.file,
      }
    } catch (error) {
      if (error instanceof FrontmatterError) {
        this.logger.warn(`gemini-cli: cannot load malformed asset ${locator.file}: ${error.message}`)
        return undefined
      }
      throw error
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private async ensureWatched(roots: SkillRoot[], cwd?: string) {
    const targets: WatchTarget[] = roots.map((root) => ({
      kind: root.kind.endsWith('-skills') ? 'skills-dir' : root.kind.endsWith('-commands') ? 'commands-dir' : 'agents-dir',
      path: root.path,
    }))
    for (const path of await this.settings.sourcePaths(cwd)) targets.push({ kind: 'config-file', path })
    const seen = new Set<string>()
    for (const target of targets) {
      if (seen.has(target.path)) continue
      seen.add(target.path)
      const existing = this.watchers.get(target.path)
      if (existing) {
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
      depth: target.kind === 'skills-dir' || target.kind === 'commands-dir' ? 2 : 1,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: WATCH_STABILITY_MS, pollInterval: 100 },
    })
    this.watchers.set(target.path, { target, watcher })
    let ready = false
    watcher.on('error', (error) => {
      if (ready) this.logger.warn(`gemini-cli: watcher for ${target.path} failed: ${errorMessage(error)}`)
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

function isRelevantWatchEvent(target: WatchTarget, event: string, path: string): boolean {
  if (target.kind === 'config-file') {
    return event === 'add' || event === 'change' || event === 'unlink'
  }
  const relative = path.slice(target.path.length).replace(/^[/\\]+/, '')
  if (relative === '') return event === 'addDir' || event === 'unlinkDir'
  const depth = relative.split(/[/\\]/).length
  if (target.kind === 'skills-dir') {
    if (depth === 1) return event === 'addDir' || event === 'unlinkDir'
    if (depth === 2) return event === 'unlinkDir' || path.toLowerCase().endsWith('skill.md')
    return false
  }
  if (target.kind === 'commands-dir') {
    if (depth === 1) return relative.toLowerCase().endsWith('.toml') || event === 'unlinkDir'
    return false
  }
  // agents-dir: flat .md files
  if (depth === 1) return relative.toLowerCase().endsWith('.md')
  return false
}

function stripTomlExtension(fileName: string): string {
  const lower = fileName.toLowerCase()
  return lower.endsWith('.toml') ? fileName.slice(0, -5) : fileName
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
