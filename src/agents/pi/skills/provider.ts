/**
 * Skill provider that registers pi skills and prompt templates on
 * `ctx.skills`.
 *
 * Discovery reads the pi asset locations:
 *
 * - `$PI_DIR/skills/<name>/SKILL.md` (recursive) and root-level `<name>.md`
 *   (flat skills), where `$PI_DIR` is `PI_CODING_AGENT_DIR` or `~/.pi/agent`
 * - `.pi/skills/` the same way (project, trust-gated)
 * - `$PI_DIR/prompts/<name>.md` and `.pi/prompts/<name>.md` (slash-command
 *   templates, non-recursive; project trust-gated)
 * - settings-declared `skills` / `prompts` arrays (file or directory paths,
 *   resolved against the declaring settings file)
 *
 * The `.agents/skills` compat roots are deliberately **not** re-read here:
 * DSH's own filesystem provider covers `.agents` assets, so re-registering
 * them would duplicate candidates (the opencode precedent).
 *
 * Precedence mirrors pi's source order: `~/.pi/agent/skills` loads before
 * `.pi/skills` and the first skill found wins same-name collisions, so
 * personal assets override project assets (user ranks sit below project
 * ranks in DSH's lower-rank-wins ordering). Within a level a skill overrides
 * a same-name prompt template. All ranks stay under the DSH runtime-skill
 * rank (250).
 *
 * pi is lenient about skill validation: unknown fields are ignored, most
 * violations warn, `name` may differ from the directory name (frontmatter
 * wins, directory name is the fallback), and only a missing `description`
 * drops the skill. DSH skill names must be kebab-case, so a pi-legal name
 * that is not kebab-case is skipped with a warning (no transliteration).
 * @module dsh-bridges/agents/pi/skills/provider
 */
import { dirname, join, sep } from 'node:path'
import { watch } from 'chokidar'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions, SkillProvider, SkillProviderControl } from '@deepseek-ai/dsh-skill'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { FsAdapter } from '../../../fs-adapter.js'
import type { BridgeLogger } from '../../../util.js'
import { capString, stripMarkdownExtension } from '../../../util.js'
import type { PiSettingsLoader } from '../settings.js'
import { firstParagraph, FrontmatterError, parsePromptFile, parseSkillFile } from './parse.js'

export const PROVIDER_NAME = 'pi'

/**
 * Precedence ranks: personal assets override project assets (pi's source
 * load order is global → project, first found wins), a skill overrides a
 * same-name prompt template at the same level, and directory assets override
 * same-level settings-array entries of the same kind.
 */
const RANK_USER_SKILLS = 180
const RANK_USER_SETTINGS_SKILLS = 181
const RANK_USER_PROMPTS = 182
const RANK_USER_SETTINGS_PROMPTS = 183
const RANK_PROJECT_SKILLS = 190
const RANK_PROJECT_SETTINGS_SKILLS = 191
const RANK_PROJECT_PROMPTS = 192
const RANK_PROJECT_SETTINGS_PROMPTS = 193

/** pi caps the skill `description` at 1,024 characters. */
const MAX_DESCRIPTION_CHARS = 1024

type RootKind =
  | 'user-skills'
  | 'user-settings-skills'
  | 'user-prompts'
  | 'user-settings-prompts'
  | 'project-skills'
  | 'project-settings-skills'
  | 'project-prompts'
  | 'project-settings-prompts'

interface SkillRoot {
  kind: RootKind
  path: string
  rank: number
}

interface CandidateLocator {
  root: string
  rootKind: RootKind
  entry: string
  kind: 'bundle' | 'flat-skill' | 'prompt'
  /** Absolute path of the SKILL.md / `.md` file. */
  file: string
  /** Fallback skill name used at discovery (frontmatter `name` wins on load). */
  fallback: string
}

export interface SkillProviderConfig {
  userPiDir: string
  watch: boolean
}

/** Maximum distinct roots (plus config files) that stay watched. */
const MAX_WATCHED_ROOTS = 64
/** Stable-write window before a chokidar event is trusted (milliseconds). */
const WATCH_STABILITY_MS = 200
/** Cap on the recursive SKILL.md walk (also breaks symlink cycles). */
const MAX_SKILL_DEPTH = 32

type WatchTargetKind = 'skills-root' | 'prompts-root' | 'asset-file' | 'config-file'

interface WatchTarget {
  kind: WatchTargetKind
  path: string
}

export class PiSkillProvider implements SkillProvider {
  readonly name = PROVIDER_NAME

  private readonly watchers = new Map<string, { target: WatchTarget; watcher: ReturnType<typeof watch> }>()
  private closed = false

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly config: SkillProviderConfig,
    private readonly settings: PiSettingsLoader,
    private readonly invalidate: SkillProviderControl['invalidate'],
  ) {}

  private async resolveRoots(cwd?: string): Promise<SkillRoot[]> {
    const piDir = this.settings.piDir()
    let loaded: Awaited<ReturnType<PiSettingsLoader['load']>> = {
      skillPaths: [],
      promptPaths: [],
      defaultProjectTrust: 'ask',
      enableSkillCommands: true,
      projectTrusted: false,
    }
    try {
      loaded = await this.settings.load(cwd)
    } catch (error) {
      if (!isAbort(error)) this.logger.warn(`pi: cannot read settings for skill discovery: ${errorMessage(error)}`)
    }
    // Rank order: skills < settings skills < prompts < settings prompts
    // (personal before project, matching pi's global-then-project load order).
    const roots: SkillRoot[] = [{ kind: 'user-skills', path: join(piDir, 'skills'), rank: RANK_USER_SKILLS }]
    for (const entry of loaded.skillPaths) {
      if (entry.project) continue
      roots.push({ kind: 'user-settings-skills', path: entry.path, rank: RANK_USER_SETTINGS_SKILLS })
    }
    roots.push({ kind: 'user-prompts', path: join(piDir, 'prompts'), rank: RANK_USER_PROMPTS })
    for (const entry of loaded.promptPaths) {
      if (entry.project) continue
      roots.push({ kind: 'user-settings-prompts', path: entry.path, rank: RANK_USER_SETTINGS_PROMPTS })
    }
    if (cwd && loaded.projectTrusted) {
      roots.push({ kind: 'project-skills', path: join(cwd, '.pi', 'skills'), rank: RANK_PROJECT_SKILLS })
      for (const entry of loaded.skillPaths) {
        if (!entry.project) continue
        roots.push({ kind: 'project-settings-skills', path: entry.path, rank: RANK_PROJECT_SETTINGS_SKILLS })
      }
      roots.push({ kind: 'project-prompts', path: join(cwd, '.pi', 'prompts'), rank: RANK_PROJECT_PROMPTS })
      for (const entry of loaded.promptPaths) {
        if (!entry.project) continue
        roots.push({ kind: 'project-settings-prompts', path: entry.path, rank: RANK_PROJECT_SETTINGS_PROMPTS })
      }
    }
    return roots
  }

  async list(options: SkillLookupOptions) {
    const roots = await this.resolveRoots(options.cwd)
    const candidates: SkillCandidate[] = []
    // pi keeps the first skill found on same-name collisions and warns; the
    // root order (user before project) matches pi's source load order.
    const seen = new Map<string, SkillRoot>()
    let complete = true
    for (const root of roots) {
      if (options.signal?.aborted) return { candidates, complete: false }
      const result = await this.listRoot(root, options, candidates, seen)
      complete = complete && result.complete
      if (!result.continue) return { candidates, complete }
    }
    if (this.config.watch) this.ensureWatched(roots, options.cwd)
    return { candidates, complete }
  }

  /** Discover one root (skills roots recurse, prompt roots do not). */
  private async listRoot(
    root: SkillRoot,
    options: SkillLookupOptions,
    candidates: SkillCandidate[],
    seen: Map<string, SkillRoot>,
  ): Promise<{ complete: boolean; continue: boolean }> {
    const isPrompt = root.kind.endsWith('-prompts')
    // Settings-array entries may point at a single asset file, or at a
    // directory that is itself one skill bundle (SKILL.md directly inside).
    if (root.kind.includes('-settings-')) {
      if (await this.fs.fileExists(root.path, options.signal)) {
        const fallback = stripMarkdownExtension(root.path.split(sep).pop() ?? 'asset')
        const text = await this.fs.readText(root.path, options.signal)
        try {
          const summary = isPrompt
            ? this.promptSummary(root, fallback, root.path, text)
            : this.skillSummary(root, fallback, dirname(root.path), root.path, text)
          this.pushSeen(summary, root, candidates, seen)
        } catch (error) {
          if (isAbort(error)) return { complete: false, continue: false }
          if (isMissing(error)) return { complete: true, continue: true }
          if (error instanceof FrontmatterError) {
            this.logger.warn(`pi: skipping invalid settings asset ${root.path}: ${error.message}`)
          } else {
            this.logger.warn(`pi: cannot read settings asset ${root.path}: ${errorMessage(error)}`)
          }
        }
        return { complete: true, continue: true }
      }
      if (!isPrompt) {
        const skillFile = join(root.path, 'SKILL.md')
        if (await this.fs.fileExists(skillFile, options.signal)) {
          try {
            const text = await this.fs.readText(skillFile, options.signal)
            const summary = this.skillSummary(root, root.path.split(sep).pop() ?? 'skill', root.path, skillFile, text)
            this.pushSeen(summary, root, candidates, seen)
          } catch (error) {
            if (isAbort(error)) return { complete: false, continue: false }
            if (isMissing(error)) return { complete: true, continue: true }
            if (error instanceof FrontmatterError) {
              this.logger.warn(`pi: skipping invalid settings skill ${skillFile}: ${error.message}`)
            } else {
              this.logger.warn(`pi: cannot read settings skill ${skillFile}: ${errorMessage(error)}`)
            }
          }
          return { complete: true, continue: true }
        }
      }
    }
    let entries
    try {
      entries = await this.fs.listDir(root.path, options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true } // confirmed-absent root is a valid empty state
      this.logger.warn(`pi: cannot read asset root ${root.path}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (entry.isFile && entry.name.toLowerCase().endsWith('.md')) {
        // Root-level `.md` files are flat skills in skill roots and prompt
        // templates in prompt roots (pi ignores them under `.agents/skills`,
        // which this provider does not read at all).
        try {
          const file = join(root.path, entry.name)
          const text = await this.fs.readText(file, options.signal)
          const fallback = stripMarkdownExtension(entry.name)
          const summary = isPrompt
            ? this.promptSummary(root, fallback, file, text)
            : this.skillSummary(root, fallback, dirname(file), file, text)
          this.pushSeen(summary, root, candidates, seen)
        } catch (error) {
          if (isAbort(error)) return { complete: false, continue: false }
          if (isMissing(error)) continue // vanished mid-scan
          if (error instanceof FrontmatterError) {
            this.logger.warn(`pi: skipping invalid asset ${join(root.path, entry.name)}: ${error.message}`)
            continue
          }
          this.logger.warn(`pi: cannot read asset entry under ${root.path}: ${errorMessage(error)}`)
          return { complete: false, continue: true }
        }
      } else if (entry.isDir && !isPrompt && !entry.name.startsWith('.')) {
        // Directory skills: recursively find dirs containing SKILL.md; the
        // dir name is only the fallback (frontmatter `name` wins).
        const result = await this.listBundleDirs(join(root.path, entry.name), root, options, candidates, seen, 1)
        if (!result.complete) return { complete: false, continue: result.continue }
        if (!result.continue) return { complete: false, continue: false }
      }
    }
    return { complete: true, continue: true }
  }

  /** Recursive SKILL.md discovery under one directory (pi discovers recursively). */
  private async listBundleDirs(
    dir: string,
    root: SkillRoot,
    options: SkillLookupOptions,
    candidates: SkillCandidate[],
    seen: Map<string, SkillRoot>,
    depth: number,
  ): Promise<{ complete: boolean; continue: boolean }> {
    if (depth > MAX_SKILL_DEPTH) return { complete: true, continue: true }
    const skillFile = join(dir, 'SKILL.md')
    try {
      if (await this.fs.fileExists(skillFile, options.signal)) {
        const text = await this.fs.readText(skillFile, options.signal)
        try {
          const summary = this.skillSummary(root, dir.split(sep).pop() ?? 'skill', dir, skillFile, text)
          this.pushSeen(summary, root, candidates, seen)
        } catch (error) {
          if (isAbort(error)) return { complete: false, continue: false }
          if (isMissing(error)) {
            // vanished mid-scan; fall through to subdirectories
          } else if (error instanceof FrontmatterError) {
            this.logger.warn(`pi: skipping invalid skill ${skillFile}: ${error.message}`)
          } else {
            this.logger.warn(`pi: cannot read skill entry ${skillFile}: ${errorMessage(error)}`)
            return { complete: false, continue: true }
          }
        }
      }
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (!isMissing(error)) {
        this.logger.warn(`pi: cannot read skill entry ${skillFile}: ${errorMessage(error)}`)
        return { complete: false, continue: true }
      }
    }
    let entries
    try {
      entries = await this.fs.listDir(dir, options.signal)
    } catch (error) {
      if (isAbort(error)) return { complete: false, continue: false }
      if (isMissing(error)) return { complete: true, continue: true }
      this.logger.warn(`pi: cannot read skill directory ${dir}: ${errorMessage(error)}`)
      return { complete: false, continue: true }
    }
    for (const entry of entries) {
      if (options.signal?.aborted) return { complete: false, continue: false }
      if (!entry.isDir || entry.name.startsWith('.')) continue
      const result = await this.listBundleDirs(join(dir, entry.name), root, options, candidates, seen, depth + 1)
      if (!result.complete) return result
      if (!result.continue) return { complete: false, continue: false }
    }
    return { complete: true, continue: true }
  }

  /** Register a candidate unless pi's first-found-wins rule drops it. */
  private pushSeen(candidate: SkillCandidate, root: SkillRoot, candidates: SkillCandidate[], seen: Map<string, SkillRoot>): void {
    const previous = seen.get(candidate.name)
    if (previous !== undefined) {
      this.logger.warn(
        `pi: skill ${JSON.stringify(candidate.name)} from ${root.path} collides with ${previous.path}; keeping the first skill found (pi behavior)`,
      )
      return
    }
    seen.set(candidate.name, root)
    candidates.push(candidate)
  }

  private skillSummary(root: SkillRoot, fallbackName: string, bundleDir: string, file: string, text: string): SkillCandidate {
    const parsed = parseSkillFile(text, fallbackName)
    for (const warning of parsed.warnings) this.logger.warn(`pi: ${file}: ${warning}`)
    const name = parsed.frontmatter.name
    if (!isSkillName(name)) {
      throw new FrontmatterError(`skill name ${JSON.stringify(name)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const locator: CandidateLocator = {
      root: root.path,
      rootKind: root.kind,
      entry: name,
      kind: dirname(file) !== root.path ? 'bundle' : 'flat-skill',
      file,
      fallback: fallbackName,
    }
    // A root-level flat skill keeps the root as its resource base; a bundle
    // keeps its own directory so supporting files resolve on demand.
    const isBundle = locator.kind === 'bundle'
    return {
      name,
      description: capString(parsed.frontmatter.description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: !parsed.frontmatter.disableModelInvocation, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-pi' : 'user-pi',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: isBundle ? dirname(file) : root.path },
      rank: root.rank,
      locator,
      path: file,
      metadata: parsed.frontmatter.metadata,
    }
  }

  private promptSummary(root: SkillRoot, name: string, file: string, text: string): SkillCandidate {
    if (!isSkillName(name)) {
      throw new FrontmatterError(`prompt template name ${JSON.stringify(name)} is not kebab-case; DSH skills require kebab-case names`)
    }
    const parsed = parsePromptFile(text)
    const description = parsed.description && parsed.description.trim() !== '' ? parsed.description : firstParagraph(parsed.body)
    const locator: CandidateLocator = { root: root.path, rootKind: root.kind, entry: name, kind: 'prompt', file, fallback: name }
    return {
      name,
      description: capString(description, MAX_DESCRIPTION_CHARS),
      invocation: { modelInvocable: true, userInvocable: true },
      source: root.kind.startsWith('project') ? 'project-pi' : 'user-pi',
      provider: PROVIDER_NAME,
      resourceBase: { kind: 'directory', path: root.path },
      rank: root.rank,
      locator,
      path: file,
    }
  }

  async get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined> {
    const locator = candidate.locator as CandidateLocator
    const file = locator.file
    let text: string
    try {
      text = await this.fs.readText(file, options.signal)
    } catch (error) {
      if (isAbort(error)) throw error
      return undefined // file disappeared: the skill is no longer loadable
    }
    try {
      if (locator.kind === 'prompt') {
        const parsed = parsePromptFile(text)
        const description = parsed.description && parsed.description.trim() !== '' ? parsed.description : firstParagraph(parsed.body)
        return {
          name: locator.entry,
          description: capString(description, MAX_DESCRIPTION_CHARS),
          invocation: { modelInvocable: true, userInvocable: true },
          source: locator.rootKind.startsWith('project') ? 'project-pi' : 'user-pi',
          provider: PROVIDER_NAME,
          resourceBase: { kind: 'directory', path: locator.root },
          content: parsed.body,
          path: file,
        }
      }
      const isBundle = locator.kind === 'bundle'
      const parsed = parseSkillFile(text, locator.fallback)
      for (const warning of parsed.warnings) this.logger.warn(`pi: ${file}: ${warning}`)
      return {
        name: parsed.frontmatter.name,
        description: capString(parsed.frontmatter.description, MAX_DESCRIPTION_CHARS),
        invocation: { modelInvocable: !parsed.frontmatter.disableModelInvocation, userInvocable: true },
        source: locator.rootKind.startsWith('project') ? 'project-pi' : 'user-pi',
        provider: PROVIDER_NAME,
        resourceBase: { kind: 'directory', path: isBundle ? dirname(file) : locator.root },
        content: parsed.body,
        path: file,
        metadata: parsed.frontmatter.metadata,
      }
    } catch (error) {
      if (error instanceof FrontmatterError) {
        this.logger.warn(`pi: cannot load malformed asset ${file}: ${error.message}`)
        return undefined
      }
      throw error
    }
  }

  // ── watching ──────────────────────────────────────────────────────────────

  private async ensureWatched(roots: SkillRoot[], cwd?: string) {
    const targets: WatchTarget[] = []
    for (const root of roots) {
      if (root.kind.endsWith('-prompts')) targets.push({ kind: 'prompts-root', path: root.path })
      else targets.push({ kind: 'skills-root', path: root.path })
    }
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
      depth: target.kind === 'prompts-root' ? 1 : undefined,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: WATCH_STABILITY_MS, pollInterval: 100 },
    })
    this.watchers.set(target.path, { target, watcher })
    let ready = false
    watcher.on('error', (error) => {
      if (ready) this.logger.warn(`pi: watcher for ${target.path} failed: ${errorMessage(error)}`)
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
    return event === 'add' || event === 'change' || event === 'unlink'
  }
  if (target.kind === 'prompts-root') {
    const relative = path.slice(target.path.length).replace(/^[/\\]+/, '')
    if (relative === '') return event === 'addDir' || event === 'unlinkDir'
    if (relative.includes('/') || relative.includes('\\')) return false
    return relative.toLowerCase().endsWith('.md')
  }
  // skills-root: any markdown file or directory change can alter the catalog.
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
