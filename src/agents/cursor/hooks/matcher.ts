/**
 * Cursor hook matcher semantics: a single string matched against the
 * hook-specific field (tool name for preToolUse, subagent type for
 * subagentStart, the shell command text for before/afterShellExecution, the
 * file path for beforeReadFile/afterFileEdit). Pipe-separated alternatives
 * work as an alternation (`Shell|Read|Write`); `*` or empty matches all;
 * unparseable patterns never match (fail open).
 * @module dsh-bridges/agents/cursor/hooks/matcher
 */

/** Whether a matcher selects the given field value. */
export function matchCursorMatcher(matcher: string | undefined, value?: string): boolean {
  if (matcher === undefined || matcher === '' || matcher === '*') return true
  if (value === undefined) return false
  try {
    // Unanchored: Cursor matchers select by containment for command text
    // (`curl|wget` matches "wget https://x") and exact names still match
    // because tool names are single tokens.
    return new RegExp(matcher).test(value)
  } catch {
    return false
  }
}
