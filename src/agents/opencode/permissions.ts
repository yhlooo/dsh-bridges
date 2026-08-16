/**
 * opencode `permission` config enforced at the DSH `tools/pre-execute` seam.
 *
 * opencode's semantics differ from the Claude Code family: families keyed by
 * action kind (`bash`, `edit`, `read`, …) with ordered `pattern → action`
 * rules where the LAST matching rule wins, a bare string form
 * (`permission: "allow"`), `~`/`$HOME` expansion, an `external_directory`
 * guard for paths outside the working directory, and permissive built-in
 * defaults (most families allow; `external_directory`/`doom_loop` ask; reads
 * deny `.env*` except `.env.example`).
 *
 * The bridge mirrors this: when any config layer defines `permission`, the
 * bridge evaluates it — unmatched calls resolve to opencode's built-in
 * defaults, so an opencode project's permissive posture carries over. When no
 * layer defines `permission`, the bridge stays out of the way and DeepSeek
 * Harness policy applies. `doom_loop` (repeat-detection) and `webfetch`
 * (URL-fetch tool) have no DSH seam and are recorded as limitations;
 * `lsp` has no DSH tool.
 * @module dsh-bridges/agents/opencode/permissions
 */
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import { globMatch } from '../../permissions/glob.js'
import type { RuleVerdict } from '../../permissions/types.js'
import type { BridgeLogger } from '../../util.js'
import { isPlainObject } from '../../util.js'
import type { OpencodeAction, OpencodePermissionConfig, OpencodeSettingsLoader } from './settings.js'

/** DSH tool names → opencode permission families (evaluated in order). */
const DSH_TO_OPENCODE_FAMILIES: Readonly<Record<string, readonly string[]>> = {
  read: ['read'],
  edit: ['edit'],
  write: ['edit'],
  glob: ['glob'],
  grep: ['grep'],
  bash: ['bash'],
  subagent: ['task'],
  skill: ['skill'],
  ask_user_question: ['question'],
  web: ['websearch'],
  web_search: ['websearch'],
}

/** Built-in opencode defaults applied when `permission` is configured. */
const BUILTIN_READ_RULES: readonly (readonly [string, OpencodeAction])[] = [
  ['*', 'allow'],
  ['*.env', 'deny'],
  ['*.env.*', 'deny'],
  ['*.env.example', 'allow'],
]
const BUILTIN_FAMILY_DEFAULT: Readonly<Record<string, OpencodeAction>> = {
  external_directory: 'ask',
  doom_loop: 'ask',
}

/** The argument value a family's granular patterns match against. */
function familyValue(family: string, args: unknown): { value: string | undefined; kind: 'path' | 'text' } {
  if (!isPlainObject(args)) return { value: undefined, kind: 'text' }
  switch (family) {
    case 'read':
    case 'edit':
      return { value: stringField(args, 'file_path'), kind: 'path' }
    case 'bash':
      return { value: stringField(args, 'command'), kind: 'text' }
    case 'glob':
    case 'grep':
      return { value: stringField(args, 'pattern'), kind: 'text' }
    case 'websearch':
      return { value: stringField(args, 'query'), kind: 'text' }
    case 'skill':
      return { value: stringField(args, 'name'), kind: 'text' }
    default:
      return { value: undefined, kind: 'text' } // task / question / lsp: family-level only
  }
}

function stringField(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

/** Resolve one opencode family for a tool call into an action or undefined. */
export function evaluateFamily(
  permissions: OpencodePermissionConfig,
  family: string,
  value: string | undefined,
  kind: 'path' | 'text',
  context: { cwd: string; home: string },
): OpencodeAction | undefined {
  const entry = permissions.families.get(family)
  const wildcard = permissions.families.get('*')
  const rules = entry?.rules.length
    ? entry.rules
    : wildcard?.rules.length
      ? wildcard.rules
      : family === 'read'
        ? [...BUILTIN_READ_RULES]
        : []
  let action: OpencodeAction | undefined
  if (value !== undefined) {
    for (const [pattern, ruleAction] of rules) {
      if (matchOpencodePattern(pattern, value, kind, context)) action = ruleAction // last match wins
    }
  }
  action ??= entry?.action ?? wildcard?.action ?? permissions.defaultAction ?? BUILTIN_FAMILY_DEFAULT[family] ?? 'allow'
  return action
}

/** opencode wildcard matching: `*` any chars, `?` one char; `~`/`$HOME` for paths. */
export function matchOpencodePattern(
  pattern: string,
  value: string,
  kind: 'path' | 'text',
  context: { cwd: string; home: string },
): boolean {
  let expanded = pattern
  if (expanded === '~' || expanded.startsWith('~/')) expanded = join(context.home, expanded === '~' ? '' : expanded.slice(2))
  else if (expanded === '$HOME' || expanded.startsWith('$HOME/'))
    expanded = join(context.home, expanded === '$HOME' ? '' : expanded.slice(6))
  if (kind === 'path') {
    if (isAbsolute(expanded)) {
      const absolute = isAbsolute(value) ? value : resolve(context.cwd, value)
      return globMatch(expanded, absolute)
    }
    const absolute = isAbsolute(value) ? value : resolve(context.cwd, value)
    const relativePath = relative(context.cwd, absolute)
    if (relativePath.startsWith('..')) return false // outside the working directory
    return globMatch(expanded, relativePath)
  }
  return globMatch(expanded, value)
}

/** The merged verdict for one tool call; undefined defers to DSH policy. */
export function evaluateOpencodePermissions(
  permissions: OpencodePermissionConfig,
  toolName: string,
  args: unknown,
  context: { cwd: string; home: string },
): RuleVerdict {
  const families = DSH_TO_OPENCODE_FAMILIES[toolName] ?? [undefined]
  const verdicts: OpencodeAction[] = []
  let externalPath: string | undefined
  for (const family of families) {
    if (family === undefined) {
      verdicts.push(evaluateFamily(permissions, '<unmapped>', undefined, 'text', context) ?? 'allow')
      continue
    }
    const { value, kind } = familyValue(family, args)
    const action = evaluateFamily(permissions, family, value, kind, context)
    if (action === undefined) continue
    verdicts.push(action)
    // Remember the resolved path for the external_directory guard.
    if (kind === 'path' && value !== undefined) externalPath = isAbsolute(value) ? value : resolve(context.cwd, value)
  }
  // external_directory guard: paths outside the working directory.
  if (externalPath !== undefined && relative(context.cwd, externalPath).startsWith('..')) {
    const external = evaluateFamily(permissions, 'external_directory', externalPath, 'path', context)
    if (external !== undefined) verdicts.push(external)
  }
  if (verdicts.includes('deny')) return { kind: 'deny', reason: 'denied by an opencode permission rule' }
  if (verdicts.includes('ask')) return { kind: 'ask', reason: 'approval required by an opencode permission rule' }
  if (verdicts.length > 0) return { kind: 'allow' }
  return undefined
}

/** Register `tools/pre-execute` enforcement for the opencode bridge. */
export function createPermissionsBridge(ctx: Context, logger: BridgeLogger, loader: OpencodeSettingsLoader): void {
  ctx.on('tools/pre-execute', async (exec: ToolExecution, next): Promise<PreToolDecision> => {
    const agent = exec.agent
    if (!agent) return next()
    const cwd = agent.session.header.cwd ?? process.cwd()
    const settings = await loader.load(cwd)
    const permissions = settings.permissions
    if (permissions === undefined) return next() // no permission config: hands off
    const verdict = evaluateOpencodePermissions(permissions, exec.name, exec.arguments, { cwd, home: homedir() })
    if (verdict === undefined) return next()
    logger.debug(`opencode: permission verdict for ${exec.name}: ${verdict.kind}`)
    return verdict
  })
}
