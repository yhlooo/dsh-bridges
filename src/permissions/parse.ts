/**
 * Claude Code / CodeBuddy Code permission-rule grammar: `Tool` or
 * `Tool(specifier)` strings.
 *
 * Tool names may carry glob characters (`*`, `?`) — upstream documents
 * `"*"` (every tool) and `"mcp__*"` (every MCP tool). The specifier is the
 * text between the first `(` and the last `)` so commands containing
 * parentheses still parse. Unparseable rules return `undefined`; callers warn
 * and drop them, matching upstream's lenient configuration handling.
 * @module dsh-bridges/permissions/parse
 */
import type { ParsedRule, RuleKind } from './types.js'

const TOOL_NAME_RE = /^[A-Za-z0-9_*?-]+$/

/** Parse one `Tool` / `Tool(specifier)` permission rule string. */
export function parseToolSpecifierRule(rule: string, kind: RuleKind): ParsedRule | undefined {
  const raw = rule.trim()
  if (raw === '') return undefined
  const open = raw.indexOf('(')
  let tool: string
  let specifier: string | undefined
  if (open === -1) {
    tool = raw
  } else {
    const close = raw.lastIndexOf(')')
    if (close <= open) return undefined // no closing paren
    tool = raw.slice(0, open).trim()
    specifier = raw.slice(open + 1, close).trim()
    if (specifier === '') return undefined // `Tool()` names nothing
  }
  if (!TOOL_NAME_RE.test(tool)) return undefined
  return { kind, tool, specifier, raw }
}

/** Parse a rule-array value into its bucket, dropping invalid entries. */
export function parseToolSpecifierRules(kind: RuleKind, value: unknown): ParsedRule[] {
  if (!Array.isArray(value)) return []
  const rules: ParsedRule[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const parsed = parseToolSpecifierRule(entry, kind)
    if (parsed !== undefined) rules.push(parsed)
  }
  return rules
}
