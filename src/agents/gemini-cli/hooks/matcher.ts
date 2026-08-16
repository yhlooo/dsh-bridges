/**
 * Gemini CLI hook matcher semantics: tool events (`BeforeTool`,
 * `AfterTool`) use **regular expressions** against the tool name; lifecycle
 * events (`SessionStart`, `SessionEnd`, `BeforeAgent`, `AfterAgent`) use
 * **exact strings** against the event's matched value (the session source
 * for SessionStart/SessionEnd); `*` or an empty matcher matches everything.
 * An unparseable regex never matches (best-effort, fail open).
 * @module dsh-bridges/agents/gemini-cli/hooks/matcher
 */
import type { BridgedHookEvent } from './types.js'

const TOOL_EVENTS = new Set<BridgedHookEvent>(['BeforeTool', 'AfterTool'])

/** Whether a group matcher selects the given event / matched value. */
export function matchGeminiMatcher(matcher: string | undefined, event: BridgedHookEvent, matchedValue?: string): boolean {
  if (matcher === undefined || matcher === '' || matcher === '*') return true
  if (matchedValue === undefined) return false
  if (TOOL_EVENTS.has(event)) {
    try {
      return new RegExp(matcher).test(matchedValue)
    } catch {
      return false // unparseable regex never matches (fail open)
    }
  }
  return matcher === matchedValue
}
