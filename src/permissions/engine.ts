/**
 * Permission-rule evaluation: deny rules first, then ask, then allow — the
 * first match determines the outcome, regardless of specificity (upstream
 * Claude Code / CodeBuddy Code semantics). A verdict of `undefined` defers to
 * the harness policy (and to any hook decision that ran before the rules).
 *
 * Rule matching has two stages: the tool-name pattern must match the
 * translated upstream tool name, and — when the rule carries a specifier —
 * the specifier must match the tool call's primary argument field (see
 * `fields.ts` for per-field semantics). A specifier on a tool without a
 * mapped field can never match.
 *
 * Two dialects share this engine:
 * - `claude` (default): tool-name globs; Bash specifiers are command prefixes;
 *   file paths are case-sensitive full-path globs.
 * - `codebuddy`: Bash specifiers are exact / `:*` prefix / wildcard with
 *   compound-command analysis; file paths are case-insensitive with
 *   bare-filename-any-depth matching; MCP tool names normalize case and
 *   `-`/`.` → `_`; bare `*` excludes MCP tools and `mcp__*` works in
 *   deny/ask only; `Skill(name)` and `Agent(name)` specifiers follow the
 *   upstream subagent/skill rules.
 * @module dsh-bridges/permissions/engine
 */
import { basename } from 'node:path'
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
  /** Rule dialect: `claude` (default) or `codebuddy`. */
  dialect?: 'claude' | 'codebuddy'
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
  const dialect = context.dialect ?? 'claude'
  const nameMatches = dialect === 'codebuddy' ? codebuddyToolMatch(rule, toolName) : globMatch(rule.tool, toolName)
  if (!nameMatches) return false
  if (rule.specifier === undefined) return true
  const fields = context.fields ?? DEFAULT_TOOL_FIELDS
  const spec = fields[toolName]
  if (spec === undefined) return false // specifier needs a mapped field
  const value = primaryField(toolName, args, fields)
  if (value === undefined) return false
  switch (spec.kind) {
    case 'command':
      return dialect === 'codebuddy' ? codebuddyCommandMatches(rule, value) : commandMatches(rule.specifier, value)
    case 'path':
      return dialect === 'codebuddy' ? codebuddyPathMatches(rule.specifier, value, context) : pathMatches(rule.specifier, value, context)
    case 'url':
      return urlMatches(rule.specifier, value)
    case 'text':
      return globMatch(rule.specifier, value)
    case 'skill':
      // CodeBuddy Code: skill rules must match exactly, no wildcards.
      return rule.specifier === value
  }
}

// ── tool-name matching ───────────────────────────────────────────────────────

/**
 * CodeBuddy Code tool-name matching: MCP names normalize case and `-`/`.` to
 * `_`; `mcp__server` prefixes match `mcp__server__*`; `*` only replaces the
 * whole last segment; a bare `*` rule matches everything except MCP tools and
 * `mcp__*` only takes effect in deny/ask buckets.
 */
export function codebuddyToolMatch(rule: ParsedRule, toolName: string): boolean {
  const pattern = rule.tool
  if (pattern.startsWith('mcp__')) {
    if (rule.kind === 'allow' && pattern === 'mcp__*') return false
    if (!toolName.startsWith('mcp__')) return false
    const star = pattern.indexOf('*')
    if (star !== -1 && star !== pattern.length - 1) return false // `*` only replaces the last segment
    const base = pattern.endsWith('*') ? pattern.slice(0, -1) : pattern
    const normalizedPattern = normalizeMcpName(base)
    const normalizedName = normalizeMcpName(toolName)
    if (base.endsWith('*') || base.endsWith('__')) return normalizedName.startsWith(normalizedPattern)
    // `mcp__server` without a trailing `__` matches `mcp__server__*` too.
    if (!pattern.includes('__', 5)) return normalizedName.startsWith(`${normalizedPattern}__`)
    return normalizedName === normalizedPattern
  }
  if (pattern === '*') return !toolName.startsWith('mcp__') // bare * never covers MCP tools
  return globMatch(pattern, toolName)
}

function normalizeMcpName(name: string): string {
  return name.toLowerCase().replace(/[-.]/g, '_')
}

// ── command matching ─────────────────────────────────────────────────────────

/** Claude Code: Bash-style prefix match (the command starts with the glob). */
function commandMatches(specifier: string, command: string): boolean {
  const prefix = globToRegExp(specifier).source.slice(1, -1) // strip ^…$
  return new RegExp(`^${prefix}`).test(command)
}

/**
 * CodeBuddy Code Bash matching: exact without wildcards, `:*` word prefix,
 * bash-glob wildcards (`*` crosses `/`); compound commands split on top-level
 * `&&`/`||`/`;`/`|` — deny/ask trigger on any subcommand, allow requires every
 * subcommand to match, and allow rules demand an exact match when the command
 * contains redirections.
 */
function codebuddyCommandMatches(rule: ParsedRule, command: string): boolean {
  const specifier = rule.specifier ?? ''
  const subcommands = splitCompoundCommand(command)
  if (rule.kind === 'allow' && /(^|[^<>&])[><]|[&]?>/.test(command)) {
    return subcommands.length === 1 && subcommands[0] === specifier
  }
  const results = subcommands.map((sub) => codebuddySingleCommandMatches(specifier, sub))
  if (rule.kind === 'allow') return results.length > 0 && results.every(Boolean)
  return results.some(Boolean)
}

function codebuddySingleCommandMatches(specifier: string, command: string): boolean {
  if (specifier.endsWith(':*')) {
    const base = specifier.slice(0, -2)
    return command === base || command.startsWith(`${base} `)
  }
  if (specifier.includes('*')) return globMatch(specifier, command)
  return command === specifier
}

/** Split a command on top-level `&&`/`||`/`;`/`|` (quotes are respected). */
export function splitCompoundCommand(command: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (quote !== null) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    const next = command[index + 1]
    if ((char === '&' && next === '&') || char === '|' || char === ';') {
      const trimmed = current.trim()
      if (trimmed !== '') parts.push(trimmed)
      current = ''
      if (char === '&') index += 1 // skip the second &
      continue
    }
    current += char
  }
  const trimmed = current.trim()
  if (trimmed !== '') parts.push(trimmed)
  return parts
}

// ── path matching ────────────────────────────────────────────────────────────

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
  return matchesAdditionalDirectories(specifier, arg, context, projectRelative, false)
}

/**
 * CodeBuddy Code file matching: case-insensitive; a specifier without a path
 * separator matches the file's basename at any depth; otherwise a full-path
 * glob.
 */
function codebuddyPathMatches(specifier: string, argPath: string, context: RuleMatchContext): boolean {
  const { absolute, projectRelative } = resolveRulePath(specifier, context)
  const arg = isAbsolute(argPath) ? argPath : resolve(context.cwd, argPath)
  const hasSeparator = /[/\\]/.test(specifier.replace(/^\.\//, ''))
  if (!hasSeparator) {
    const base = basename(arg)
    const nameOnly = specifier.replace(/^\.\//, '')
    if (globToRegExp(nameOnly.toLowerCase(), 'i').test(base.toLowerCase())) return true
  } else if (globToRegExp(absolute.toLowerCase(), 'i').test(arg.toLowerCase())) {
    return true
  }
  return matchesAdditionalDirectories(specifier, arg, context, projectRelative, true)
}

function matchesAdditionalDirectories(
  specifier: string,
  arg: string,
  context: RuleMatchContext,
  projectRelative: boolean,
  caseInsensitive: boolean,
): boolean {
  if (!projectRelative || context.additionalDirectories === undefined) return false
  const relative = specifier.startsWith('./') ? specifier.slice(2) : specifier.startsWith('/') ? specifier.slice(1) : specifier
  for (const dir of context.additionalDirectories) {
    const base = isAbsolute(dir) ? dir : resolve(context.cwd, dir)
    const pattern = resolve(base, relative)
    const matched = caseInsensitive ? globToRegExp(pattern.toLowerCase(), 'i').test(arg.toLowerCase()) : globMatch(pattern, arg)
    if (matched) return true
  }
  return false
}

// ── url matching ─────────────────────────────────────────────────────────────

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
