/**
 * Codex hook matcher evaluation.
 *
 * The `matcher` field follows Codex's rules: `*`, empty, or omitted matches
 * everything; anything else is a JavaScript regular expression tested against
 * the event's matched field (tool name, session start source, end reason, …).
 * Unparseable matchers fail closed rather than run everywhere.
 *
 * Codex documents two matcher aliases for tool events: `Edit` and `Write`
 * also match `apply_patch`, and `Agent` also matches `spawn_agent`. The
 * bridge evaluates those aliases so matchers written for Codex run unchanged.
 * @module dsh-bridges/agents/codex/hooks/matcher
 */

/** Matcher alias names per canonical tool name (Codex-documented). */
const MATCHER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  apply_patch: ['Edit', 'Write'],
  spawn_agent: ['Agent'],
}

/**
 * Evaluate a matcher against the event's matched field (tool name, session
 * start source, end reason, …).
 */
export function matchMatcher(matcher: string | undefined, value: string): boolean {
  if (matcher === undefined || matcher === '' || matcher === '*') return true
  let regex: RegExp
  try {
    regex = new RegExp(matcher)
  } catch {
    return false // unparseable matcher: fail closed rather than run everywhere
  }
  if (regex.test(value)) return true
  for (const alias of MATCHER_ALIASES[value] ?? []) {
    if (regex.test(alias)) return true
  }
  return false
}
