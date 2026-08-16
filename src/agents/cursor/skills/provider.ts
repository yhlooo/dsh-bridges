/**
 * Skill provider that registers Cursor skills and subagent definitions on
 * `ctx.skills`.
 *
 * Discovery reads the Cursor asset locations:
 *
 * - `~/.cursor/skills/<name>/SKILL.md` (user) and `.cursor/skills/<name>/SKILL.md`
 *   (project) — recursive (Cursor walks the skills root and picks up any
 *   `SKILL.md`; the skill identity is the folder containing it)
 * - `~/.cursor/agents/*.md` and `.cursor/agents/*.md` — subagent definitions
 *   bridged as delegation-spec skills (`readonly` / `is_background` are
 *   recorded as limitations)
 *
 * Precedence: project assets override user assets (Cursor documents project >
 * user for subagents; skills follow the same convention), so project ranks
 * sit below user ranks in DSH's lower-rank-wins ordering. The compat roots
 * (`.agents/skills`, `.claude/skills`, `.codex/skills`) are deliberately not
 * re-read — DSH's filesystem provider and the other bridges cover them.
 * @module dsh-bridges/agents/cursor/skills/provider
 */
import { dirname, join } from 'node:path'
import { watch } from 'chokidar'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { FsAdapter } from '../../../fs-adapter.js'
import type { BridgeLogger } from '../../../util.js'
import { capString } from '../../../util.js'
import { buildAgentSkillBody, type AgentDefinition } from '../../../agent-definitions.js'
import type { CursorSettingsLoader } from '../settings.js'
import { FrontmatterError, parseAgentFile, parseSkillFile } from './parse.js'

export const PROVIDER_NAME = 'cursor'

/** Precedence ranks: project overrides user; skills over agents. */
const RANK_PROJECT_SKILLS = 225
const RANK_PROJECT_AGENTS = 226
const RANK_USER_SKILLS = 230
const RANK_USER_AGENTS = 231

/** Cursor caps skill descriptions at 1,024 characters (Agent Skills standard). */
const MAX_DESCRIPTION_CHARS = 1024
/** Cap on the recursive SKILL.md walk (also breaks symlink cycles). */
const MAX_SKILL_DEPTH = 32

type RootKind = 'user-skills' | 'user-agents' | 'project-skills' | 'project-agents'

interface SkillRoot {
  kind: RootKind
  path: string
  rank: number
}

interface CandidateLocator {
  root: string
  rootKind: RootKind
  entry: string
  kind: 'bundle' | 'agent'
  file: string
}

export interface SkillProviderConfig {
  userCursorDir: string
  watch: boolean
  agents: boolean
}

/** Maximum distinct roots (plus config files) that stay watched. */
const MAX_WATCHED_ROOTS = 64
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200

type WatchTargetKind = 'skills-dir' | 'agents-dir' | 'config-file'

interface WatchTarget {
  kind: WatchTargetKind
  path: string
}

export class CursorSkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME

  private readonly watchers = new Map<string, { target: WatchTarget; watcher: ReturnType<typeof watch> }>()
  private closed = false

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SkillProviderConfig,
    private readonly settings: CursorSettingsLoader,
    private readonly invalidate: SkillProviderControl['invalidate'],
  ) {}

  private resolveRoots(cwd?: string): SkillRoot[] {
    const userDir = this.settings.userDir()
    const roots: SkillRoot[] = [{ kind: 'user-skills', path: join(userDir, 'skills'), rank: RANK_USER_SKILLS }]
    if (this.config.agents) {
      roots.push({ kind: 'user-agents', path: join(userDir, 'agents'), rank: RANK_USER_AGENTS })
    }
    if (cwd) {
      const dir = join(cwd, '.cursor')
      roots.push({ kind: 'project-skills', path: join(dir, 'skills'), rank: RANK_PROJECT_SKILLS })
      if (this.config.agents) {
        roots.push({ kind: 'project-agents', path: join(dir, 'agents'), rank: RANK_PROJECT_AGENTS })
      }
    }
    return roots
  }

  async list(options: SkillLookupOptions) {
    const roots = this.resolveRoots(options.cwd)
    const candidates: SkillCandidate[] = []
    let complete = true
    for (const root of roots) {
      if (options.signal?.aborted) return { candidates, complete: false }
      const result = await this.listRoot(root, options, candidates)
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
  ): Promise<{ complete: boolean; continue: boolean }> {
    let entries
    try {
      entries = await this.fs.listDir(root.path, options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true }
      this.logger.warn(`cursor: cannot read asset root ${root.path}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (root.kind.endsWith('-skills')) {
        if (!entry.isDir || entry.name.startsWith('.')) continue
        const result = await this.listBundleDirs(join(root.path, entry.name), root, options, candidates, 1)
        if (!result.complete) return result
        if (!result.continue) return { complete: false, continue: false }
      } else {
        if (!entry.isFile || !entry.name.toLowerCase().endsWith('.md')) continue
        try {
          const file = join(root.path, entry.name)
          const text = await this.fs.readText(file, options.signal)
          candidates.push(this.agentSummary(root, entry.name.replace(/\.md$/i, ''), file, text))
        } catch (error) {
          if (isAbort(error)) return { complete: false, continue: false }
          if (isMissing(error)) continue
          if (error instanceof FrontmatterError) {
            this.logger.warn(`cursor: skipping invalid agent ${root.path}/${entry.name}: ${error.message}`)
            continue
          }
          this.logger.warn(`cursor: cannot read agent entry under ${root.path}: ${errorMessage(error)}`)
          return { complete: false, continue: true }
        }
      }
    }
    return { complete: true, continue: true }
  }

  /** Recursive SKILL.md discovery (Cursor walks the skills root recursively). */
  private async listBundleDirs(
    dir: string,
    root: SkillRoot,
    options: SkillLookupOptions,
    candidates: SkillCandidate[],
    depth: number,
  ): Promise<{ complete: boolean; continue: boolean }> {
    if (depth > MAX_SKILL_DEPTH) return { complete: true, continue: true }
    const skillFile = join(dir, 'SKILL.md')
    try {
      if (await this.fs.fileExists(skillFile, options.signal)) {
        const text = await this.fs.readText(skillFile, options.signal)
        try {
          candidates.push(this.skillSummary(root, dir.split(/[/\\]/).pop() ?? 'skill', skillFile, text))
        } catch (error) {
          if (isAbort(error)) return { complete: false, continue: false }
          if (isMissing(error)) {
            // vanished mid-scan; fall through
          } else if (error instanceof FrontmatterError) {
            this.logger.warn(`cursor: skipping invalid skill ${skillFile}: ${error.message}`)
          } else {
            this.logger.warn(`cursor: cannot read skill entry ${skillFile}: ${errorMessage(error)}`)
            return { complete: false, continue: true }
          }
        }
      }
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (!isMissing(error)) {
        this.logger.warn(`cursor: cannot read skill entry ${skillFile}: ${errorMessage(error)}`)
        return { complete: false, continue: true }
      }
    }
    let entries
    try {
      entries = await this.fs.listDir(dir, options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true }
      this.logger.warn(`cursor: cannot read skill directory ${dir}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (!entry.isDir || entry.name.startsWith('.')) continue
      const result = await this.listBundleDirs(join(dir, entry.name), root, options, candidates, depth + 1)
      if (!result.complete) return result
      if (!result.continue) return { complete: false, continue: false }
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
      invocation: { modelInvocable: !parsed.frontmatter.disableModelInvocation, userInvocable: parsed.frontmatter.userInvocable },
      source: root.kind.startsWith('project') ? 'project-cursor' : 'user-cursor',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: dirname(file) },
      rank: root.rank,
      locator,
      path: file,
      metadata: parsed.frontmatter.metadata,
    }
  }

  private agentSummary(root: SkillRoot, fallbackName: string, file: string, text: string): SkillCandidate {
    const parsed = parseAgentFile(text, fallbackName)
    if (!isSkillName(parsed.name)) {
      throw new FrontmatterError(`agent name ${JSON.stringify(parsed.name)} is not kebab-case; DSH skills require kebab-case names`)
    }
    if (parsed.readonly) {
      this.logger.warn(
        `cursor: agent ${JSON.stringify(parsed.name)} has readonly mode; the bridge cannot express it and registers the delegation spec without a tool filter`,
      )
    }
    if (parsed.background) {
      this.logger.warn(`cursor: agent ${JSON.stringify(parsed.name)} is a background agent; DSH subagent calls are synchronous`)
    }
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry: parsed.name, kind: 'agent', file }
    return {
      name: parsed.name,
      description: capString(parsed.description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-cursor' : 'user-cursor',
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
      const source = locator.rootKind.startsWith('project') ? 'project-cursor' : 'user-cursor'
      if (locator.kind === 'agent') {
        const parsed = parseAgentFile(text, locator.entry)
        const definition: AgentDefinition = {
          name: parsed.name,
          description: parsed.description,
          body: parsed.body,
          tools: [],
          disallowedTools: [],
          model: parsed.model,
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
        invocation: { modelInvocable: !parsed.frontmatter.disableModelInvocation, userInvocable: parsed.frontmatter.userInvocable },
        source,
        provider: PROVIDER_NAME,
        resourceBase: { kind: 'directory', path: dirname(locator.file) },
        content: parsed.body,
        path: locator.file,
        metadata: parsed.frontmatter.metadata,
      }
    } catch (error) {
      if (error instanceof FrontmatterError) {
        this.logger.warn(`cursor: cannot load malformed asset ${locator.file}: ${error.message}`)
        return undefined
      }
      throw error
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private async ensureWatched(roots: SkillRoot[], cwd?: string) {
    const targets: WatchTarget[] = roots.map((root) => ({
      kind: root.kind.endsWith('-skills') ? 'skills-dir' : 'agents-dir',
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
      depth: target.kind === 'agents-dir' ? 1 : undefined,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: WATCH_STABILITY_MS, pollInterval: 100 },
    })
    this.watchers.set(target.path, { target, watcher })
    let ready = false
    watcher.on('error', (error) => {
      if (ready) this.logger.warn(`cursor: watcher for ${target.path} failed: ${errorMessage(error)}`)
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
  if (target.kind === 'agents-dir') {
    const relative = path.slice(target.path.length).replace(/^[/\\]+/, '')
    if (relative === '') return event === 'addDir' || event === 'unlinkDir'
    if (relative.includes('/') || relative.includes('\\')) return false
    return relative.toLowerCase().endsWith('.md')
  }
  // skills-dir: recursive — any markdown or directory change can alter the catalog.
  if (event === 'addDir' || event === 'unlinkDir') return true
  return path.toLowerCase().endsWith('.md')
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
