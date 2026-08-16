/**
 * Permission-rule evaluation: deny rules first, then ask, then allow — the
 * first match determines the outcome, regardless of specificity (upstream
 * Claude Code / CodeBuddy Code semantics). A verdict of `undefined` defers to
 * the harness policy (and to any hook decision that ran before the rules).
 *
 * Rule matching has two stages: the tool-name pattern (`*`/`?` globs) must
 * match the translated upstream tool name, and — when the rule carries a
 * specifier — the specifier must match the tool call's primary argument field
 * (see `fields.ts` for per-field semantics). A specifier on a tool without a
 * mapped field can never match.
 * @module dsh-bridges/permissions/engine
 */
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { DEFAULT_TOOL_FIELDS, primaryField, type ToolFieldSpec } from './fields.js'
import { globMatch, globToRegExp } from './glob.js'
import type { ParsedRule, RuleSet, RuleVerdict } from './types.js'

/** Context that specifier matching resolves paths against. */
export interface RuleMatchContext {
  /** Session working directory (the project root for rule resolution). */
  cwd: string
  /** Home directory for `~`-prefixed rule paths. */
  home?: string
  /** Additional working directories `./`-relative rule paths also resolve in. */
  additionalDirectories?: readonly string[]
  /** Per-tool field map; defaults to the Claude Code / CodeBuddy Code names. */
  fields?: Readonly<Record<string, ToolFieldSpec>>
}

/** Evaluate a rule set against one tool call. */
export function evaluateRules(rules: RuleSet, toolName: string, args: unknown, context: RuleMatchContext): RuleVerdict {
  const deny = firstMatchingRule(rules.deny, toolName, args, context)
  if (deny !== undefined) return { kind: 'deny', reason: `denied by permission rule "${deny.raw}"` }
  const ask = firstMatchingRule(rules.ask, toolName, args, context)
  if (ask !== undefined) return { kind: 'ask', reason: `approval required by permission rule "${ask.raw}"` }
  const allow = firstMatchingRule(rules.allow, toolName, args, context)
  if (allow !== undefined) return { kind: 'allow' }
  return undefined
}

function firstMatchingRule(bucket: readonly ParsedRule[], toolName: string, args: unknown, context: RuleMatchContext): ParsedRule | undefined {
  for (const rule of bucket) {
    if (ruleMatches(rule, toolName, args, context)) return rule
  }
  return undefined
}

/** Whether one parsed rule matches a tool call. */
export function ruleMatches(rule: ParsedRule, toolName: string, args: unknown, context: RuleMatchContext): boolean {
  if (!globMatch(rule.tool, toolName)) return false
  if (rule.specifier === undefined) return true
  const fields = context.fields ?? DEFAULT_TOOL_FIELDS
  const spec = fields[toolName]
  if (spec === undefined) return false // specifier needs a mapped field
  const value = primaryField(toolName, args, fields)
  if (value === undefined) return false
  switch (spec.kind) {
    case 'command':
      return commandMatches(rule.specifier, value)
    case 'path':
      return pathMatches(rule.specifier, value, context)
    case 'url':
      return urlMatches(rule.specifier, value)
    case 'text':
      return globMatch(rule.specifier, value)
  }
}

// ── specifier semantics ──────────────────────────────────────────────────────

/** Bash-style prefix match: the command starts with the glob's expansion. */
function commandMatches(specifier: string, command: string): boolean {
  const prefix = globToRegExp(specifier).source.slice(1, -1) // strip ^…$
  return new RegExp(`^${prefix}`).test(command)
}

/**
 * Resolve an upstream permission-rule path to an absolute glob. Upstream
 * rule-path conventions: `//x` absolute, `/x` project-relative, `~/x` home,
 * `./x` / `x` project-relative.
 */
function resolveRulePath(specifier: string, context: RuleMatchContext): { absolute: string; projectRelative: boolean } {
  const home = context.home ?? homedir()
  if (specifier.startsWith('//')) return { absolute: specifier.slice(1), projectRelative: false }
  if (specifier.startsWith('~/') || specifier === '~') {
    const rest = specifier === '~' ? '' : specifier.slice(2)
    return { absolute: join(home, rest), projectRelative: false }
  }
  const relative = specifier.startsWith('./') ? specifier.slice(2) : specifier.startsWith('/') ? specifier.slice(1) : specifier
  return { absolute: resolve(context.cwd, relative), projectRelative: true }
}

function pathMatches(specifier: string, argPath: string, context: RuleMatchContext): boolean {
  const { absolute, projectRelative } = resolveRulePath(specifier, context)
  const arg = isAbsolute(argPath) ? argPath : resolve(context.cwd, argPath)
  if (globMatch(absolute, arg)) return true
  if (projectRelative && context.additionalDirectories !== undefined) {
    for (const dir of context.additionalDirectories) {
      const base = isAbsolute(dir) ? dir : resolve(context.cwd, dir)
      const pattern = resolve(base, specifier.startsWith('./') ? specifier.slice(2) : specifier)
      if (globMatch(pattern, arg)) return true
    }
  }
  return false
}

function urlMatches(specifier: string, url: string): boolean {
  const domain = /^domain:(.+)$/.exec(specifier)
  if (domain !== null) {
    let host: string
    try {
      host = new URL(url).hostname
    } catch {
      return false
    }
    const pattern = domain[1]
    if (pattern === undefined) return false
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2)
      return host === base || host.endsWith(`.${base}`)
    }
    return host === pattern
  }
  return globMatch(specifier, url)
}
