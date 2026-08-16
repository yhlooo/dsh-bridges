/**
 * Shared permission-rule vocabulary for every bridge that reads an upstream
 * tool's declarative permission rules (Claude Code / CodeBuddy Code settings
 * `permissions`, opencode `permission`, …).
 *
 * Upstream rule grammars share one shape — `Tool` or `Tool(specifier)` strings
 * collected in `allow` / `ask` / `deny` buckets, evaluated deny → ask → allow
 * — so the parsed representation is grammar-neutral; only the parsers differ
 * per tool.
 * @module dsh-bridges/permissions/types
 */

export type RuleKind = 'allow' | 'ask' | 'deny'

/** One parsed rule: a tool-name pattern plus an optional argument specifier. */
export interface ParsedRule {
  kind: RuleKind
  /** Tool-name pattern (glob characters allowed, e.g. `mcp__*`, `*`). */
  tool: string
  /** Text inside `Tool(...)`, or undefined for a bare `Tool` rule. */
  specifier?: string
  /** The rule string as written, for warnings and deny/ask reasons. */
  raw: string
}

/** The three buckets of a merged permission configuration. */
export interface RuleSet {
  allow: ParsedRule[]
  ask: ParsedRule[]
  deny: ParsedRule[]
}

/** Empty rule set constant for "no rules configured". */
export const EMPTY_RULE_SET: RuleSet = { allow: [], ask: [], deny: [] }

/** Merged permission configuration for one workspace (parsed rules + scalars). */
export interface MergedPermissionConfig extends RuleSet {
  /** Interactive permission mode; read but not enforced by the bridge. */
  defaultMode?: string
  /** `disable` blocks bypassPermissions mode upstream; read but not enforced. */
  disableBypassPermissionsMode?: boolean
  /** Additional working directories that `./`-relative rule paths resolve in. */
  additionalDirectories: string[]
}

/** Verdict vocabulary mapped onto the `tools/pre-execute` decision shapes. */
export type RuleVerdict =
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }
  | { kind: 'allow' }
  | undefined
