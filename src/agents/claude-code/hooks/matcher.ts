/**
 * Claude Code hook matcher evaluation.
 *
 * The `matcher` field follows Claude Code's rules: `*`/empty/omitted matches
 * everything; a value built only from letters, digits, `_`, `-`, spaces, `,`,
 * and `|` is an exact-name set; anything else is an unanchored JavaScript
 * regular expression.
 *
 * The `if` field uses permission-rule syntax (`Bash(git *)`). The bridge
 * supports the common `ToolName(glob)` shape against one primary argument
 * field per tool and fails open when the rule cannot be interpreted, matching
 * Claude Code's best-effort contract. Claude Code's deeper Bash subcommand
 * analysis is not replicated.
 * @module dsh-bridges/agents/claude-code/hooks/matcher
 */
import { isPlainObject } from '../../../util.js'

const EXACT_SET_RE = /^[A-Za-z0-9_\-, |]*$/

/**
 * Evaluate a matcher against the event's matched field (tool name, session
 * start source, …).
 */
export function matchMatcher(matcher: string | undefined, value: string): boolean {
  if (matcher === undefined || matcher === '' || matcher === '*') return true
  if (EXACT_SET_RE.test(matcher)) {
    const names = matcher
      .split(/[,|]/)
      .map((name) => name.trim())
      .filter((name) => name !== '')
    return names.includes(value)
  }
  try {
    return new RegExp(matcher).test(value)
  } catch {
    return false // unparseable matcher: fail closed rather than run everywhere
  }
}

/**
 * Evaluate a `ToolName(glob)` `if` rule against a tool call.
 *
 * Returns true when the rule is absent or uninterpretable (fail open, as
 * Claude Code documents the filter as best-effort).
 */
export function matchIf(rule: string | undefined, toolName: string, args: unknown): boolean {
  if (rule === undefined || rule === '') return true
  const match = /^([A-Za-z0-9_-]+)\((.*)\)$/.exec(rule.trim())
  if (!match) return true
  const ruleTool = match[1]
  const pattern = match[2]
  if (ruleTool !== toolName) return false
  if (pattern === undefined) return false
  const primary = primaryMatchField(toolName, args)
  if (primary === undefined) return true // no field to test: fail open
  return globMatch(pattern, primary)
}

/** The input field an `if` rule compares per tool, mirroring Claude Code's docs. */
export function primaryMatchField(toolName: string, args: unknown): string | undefined {
  if (!isPlainObject(args)) return undefined
  switch (toolName) {
    case 'Bash':
    case 'PowerShell':
      return stringField(args, 'command')
    case 'Edit':
    case 'Write':
    case 'Read':
      return stringField(args, 'file_path')
    case 'Glob':
      return stringField(args, 'pattern')
    case 'Grep':
      return stringField(args, 'pattern')
    case 'WebFetch':
      return stringField(args, 'url')
    case 'WebSearch':
      return stringField(args, 'query')
    default:
      return undefined
  }
}

function stringField(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' ? value : undefined
}

/** Glob-to-regex translation for `if` patterns (`*` and `?` wildcards). */
export function globMatch(pattern: string, value: string): boolean {
  let regex = '^'
  for (const char of pattern) {
    if (char === '*') regex += '.*'
    else if (char === '?') regex += '.'
    else regex += escapeRegExp(char)
  }
  regex += '$'
  return new RegExp(regex).test(value)
}

function escapeRegExp(char: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char
}
