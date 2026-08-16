/**
 * Skill provider that registers Claude Code skills and commands on `ctx.skills`.
 *
 * Discovery reads the Claude Code skill locations:
 *
 * - `~/.claude/skills/<name>/SKILL.md` and flat `~/.claude/skills/<name>.md`
 * - `~/.claude/commands/<name>.md`
 * - `<cwd>/.claude/skills/<name>/SKILL.md` and flat `<cwd>/.claude/skills/<name>.md`
 * - `<cwd>/.claude/commands/<name>.md`
 *
 * Precedence mirrors Claude Code: personal (user) assets override project
 * assets, and a skill overrides a same-name command at the same level. The
 * provider registers on the global skills layer, so DSH-native skills from
 * nearer preset layers (`.dsh/skills`, `.agents/skills`, runtime skills)
 * shadow Claude assets on name conflicts.
 * @module dsh-bridges/agents/claude-code/skills/provider
 */
import { join, dirname } from 'node:path'
import { watch } from 'chokidar'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { FsAdapter } from '../../../fs-adapter.js'
import type { BridgeLogger } from '../../../util.js'
import { capString, expandHome, stripMarkdownExtension } from '../../../util.js'
import { FrontmatterError, firstParagraph, parseSkillFile } from './parse.js'

export const PROVIDER_NAME = 'claude-code'

/** Precedence ranks: personal overrides project (Claude Code semantics); a skill overrides a same-name command at the same level. */
const RANK_USER_SKILLS = 105
const RANK_USER_COMMANDS = 110
const RANK_PROJECT_SKILLS = 115
const RANK_PROJECT_COMMANDS = 120

/** Claude Code truncates the combined description + when_to_use listing text at 1,536 characters. */
const MAX_DESCRIPTION_CHARS = 1536
/** Reserved directory name in the personal skills location. */
const SYNCED_DIR = 'synced'

type RootKind = 'user-skills' | 'user-commands' | 'project-skills' | 'project-commands'

interface SkillRoot {
  kind: RootKind
  path: string
  rank: number
}

interface CandidateLocator {
  root: string
  rootKind: RootKind
  /** Directory name (bundle) or file name without extension (flat). */
  entry: string
  kind: 'bundle' | 'flat'
  /** Absolute path of the SKILL.md / flat markdown file. */
  file: string
}

export interface SkillProviderConfig {
  userClaudeDir: string
  watch: boolean
}

/** Maximum distinct project roots whose `.claude` directories stay watched. */
const MAX_WATCHED_ROOTS = 64
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200

export class ClaudeSkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME

  private readonly watchers = new Map<string, ReturnType<typeof watch>>()
  private closed = false

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SkillProviderConfig,
    private readonly invalidate: SkillProviderControl['invalidate'],
  ) {}

  private resolveRoots(cwd?: string): SkillRoot[] {
    const userClaudeDir = expandHome(this.config.userClaudeDir)
    const roots: SkillRoot[] = [
      { kind: 'user-skills', path: join(userClaudeDir, 'skills'), rank: RANK_USER_SKILLS },
      { kind: 'user-commands', path: join(userClaudeDir, 'commands'), rank: RANK_USER_COMMANDS },
    ]
    if (cwd) {
      const projectClaudeDir = join(cwd, '.claude')
      roots.push(
        { kind: 'project-skills', path: join(projectClaudeDir, 'skills'), rank: RANK_PROJECT_SKILLS },
        { kind: 'project-commands', path: join(projectClaudeDir, 'commands'), rank: RANK_PROJECT_COMMANDS },
      )
    }
    return roots
  }

  async list(options: SkillLookupOptions) {
    const roots = this.resolveRoots(options.cwd)
    const candidates: SkillCandidate[] = []
    let complete = true
    for (const root of roots) {
      let entries
      try {
        entries = await this.fs.listDir(root.path, options.signal)
      } catch (error) {
        if (isAbort(error)) return { candidates, complete: false }
        if (isMissing(error)) continue // confirmed-absent root is a valid empty state
        this.logger.warn(`claude-code: cannot read skill root ${root.path}: ${errorMessage(error)}`)
        complete = false
        continue
      }
      for (const entry of entries) {
        if (options.signal?.aborted) return { candidates, complete: false }
        // The `synced` folder name is reserved in the personal skills location.
        if (root.kind === 'user-skills' && entry.name.toLowerCase() === SYNCED_DIR) continue
        try {
          if (entry.isDir) {
            const file = join(root.path, entry.name, 'SKILL.md')
            if (!(await this.fs.fileExists(file, options.signal))) continue
            const text = await this.fs.readText(file, options.signal)
            candidates.push(this.summary(root, entry.name, 'bundle', file, text))
          } else if (entry.isFile && entry.name.toLowerCase().endsWith('.md')) {
            const file = join(root.path, entry.name)
            const text = await this.fs.readText(file, options.signal)
            candidates.push(this.summary(root, stripMarkdownExtension(entry.name), 'flat', file, text))
          }
        } catch (error) {
          if (isAbort(error)) return { candidates, complete: false }
          if (isMissing(error)) continue // vanished mid-scan
          if (error instanceof FrontmatterError) {
            this.logger.warn(`claude-code: skipping malformed skill ${root.path}: ${error.message}`)
            continue
          }
          this.logger.warn(`claude-code: cannot read skill entry under ${root.path}: ${errorMessage(error)}`)
          complete = false
        }
      }
    }
    if (this.config.watch) this.ensureWatched(roots)
    return { candidates, complete }
  }

  private summary(root: SkillRoot, entry: string, kind: 'bundle' | 'flat', file: string, text: string): SkillCandidate {
    if (!isSkillName(entry)) {
      throw new FrontmatterError(`skill name ${JSON.stringify(entry)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const parsed = parseSkillFile(text)
    const { frontmatter, body } = parsed
    const description = this.composeDescription(frontmatter.description, frontmatter.whenToUse, body)
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry, kind, file }
    return {
      name: entry,
      description,
      whenToUse: frontmatter.whenToUse,
      invocation: {
        modelInvocable: frontmatter.modelInvocable,
        userInvocable: frontmatter.userInvocable,
      },
      source: root.kind.startsWith('user') ? 'user-claude' : 'project-claude',
      provider: PROVIDER_NAME,
      resourceBase: kind === 'bundle' ? { kind: 'directory', path: dirname(file) } : { kind: 'directory', path: root.path },
      rank: root.rank,
      locator,
      path: file,
      metadata: frontmatter.metadata,
    }
  }

  private composeDescription(description: string | undefined, whenToUse: string | undefined, body: string): string {
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
    let parsed
    try {
      parsed = parseSkillFile(text)
    } catch (error) {
      if (error instanceof FrontmatterError) {
        this.logger.warn(`claude-code: cannot load malformed skill ${locator.file}: ${error.message}`)
        return undefined
      }
      throw error
    }
    const { frontmatter, body } = parsed
    return {
      name: locator.entry,
      description: this.composeDescription(frontmatter.description, frontmatter.whenToUse, body),
      whenToUse: frontmatter.whenToUse,
      invocation: {
        modelInvocable: frontmatter.modelInvocable,
        userInvocable: frontmatter.userInvocable,
      },
      source: locator.rootKind.startsWith('user') ? 'user-claude' : 'project-claude',
      provider: PROVIDER_NAME,
      resourceBase:
        locator.kind === 'bundle' ? { kind: 'directory', path: dirname(locator.file) } : { kind: 'directory', path: locator.root },
      content: body,
      path: locator.file,
      metadata: frontmatter.metadata,
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private ensureWatched(roots: SkillRoot[]) {
    for (const root of roots) {
      const existing = this.watchers.get(root.path)
      if (existing) {
        // Keep most-recently-used order so eviction drops the oldest project.
        this.watchers.delete(root.path)
        this.watchers.set(root.path, existing)
        continue
      }
      if (this.watchers.size >= MAX_WATCHED_ROOTS) {
        const oldest = this.watchers.keys().next().value
        if (oldest !== undefined) {
          void this.watchers
            .get(oldest)
            ?.close()
            .catch(() => {})
          this.watchers.delete(oldest)
        }
      }
      void this.openRootWatcher(root.path)
    }
  }

  private async openRootWatcher(rootPath: string) {
    const watcher = watch(rootPath, {
      persistent: true,
      ignoreInitial: true,
      depth: 1,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: WATCH_STABILITY_MS, pollInterval: 100 },
    })
    this.watchers.set(rootPath, watcher)
    let ready = false
    watcher.on('error', (error) => {
      if (ready) this.logger.warn(`claude-code: watcher for ${rootPath} failed: ${errorMessage(error)}`)
    })
    for (const event of ['add', 'addDir', 'change', 'unlink', 'unlinkDir'] as const) {
      watcher.on(event, (path: string) => {
        if (!ready || this.closed) return
        if (isRelevantWatchEvent(rootPath, event, path)) this.invalidate()
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
    const pending = [...this.watchers.values()].map((watcher) => watcher.close().catch(() => {}))
    this.watchers.clear()
    await Promise.all(pending)
  }
}

/** Whether a depth-1 watch event can change the catalog. */
function isRelevantWatchEvent(rootPath: string, event: string, path: string): boolean {
  const relative = path.slice(rootPath.length).replace(/^[/\\]+/, '')
  if (relative === '') {
    // The root itself appeared or disappeared.
    return event === 'addDir' || event === 'unlinkDir'
  }
  if (relative.includes('/') || relative.includes('\\')) return false
  if (event === 'addDir' || event === 'unlinkDir') return true // bundle directory appeared/left
  return relative.toLowerCase().endsWith('.md')
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
