/**
 * Gemini CLI hook configuration and runtime types.
 * @module dsh-bridges/agents/gemini-cli/hooks/types
 */

/** One command hook handler (Gemini supports only the `command` type). */
export interface CommandHook {
  type: 'command'
  /** Shell command string. */
  command: string
  /** Display name (optional). */
  name?: string
  /** Timeout in **milliseconds** (Gemini's unit; default 60,000). */
  timeout?: number
  /** Description shown in hook listings (optional). */
  description?: string
}

export type HookDef = CommandHook

/** One matcher group: a filter plus the handlers that run when it matches. */
export interface MatcherGroup {
  /** Regex (tool events) / exact string (lifecycle); `*` or empty matches all. */
  matcher?: string
  hooks: HookDef[]
}

/** Parsed hook JSON output — the object Gemini reads from stdout. */
export interface HookJsonOutput {
  decision?: 'allow' | 'deny' | 'block' | string
  reason?: string
  continue?: boolean
  stopReason?: string
  systemMessage?: string
  suppressOutput?: boolean
  hookSpecificOutput?: {
    additionalContext?: string
    tool_input?: unknown
    tailToolCallRequest?: unknown
  }
}

/** The settled outcome of one hook handler execution. */
export interface HookOutcome {
  handler: HookDef
  /** False when the matcher excluded the handler. */
  ran: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  cancelled?: boolean
  failedToStart?: string
  skippedReason?: string
  /** Parsed JSON output when stdout began with `{` and parsed as an object. */
  output: HookJsonOutput | null
  /** Non-JSON stdout; Gemini treats it as a systemMessage and allows. */
  plainText: string | null
}

/** The hook events this bridge maps onto DSH lifecycles. */
export type BridgedHookEvent = 'SessionStart' | 'SessionEnd' | 'BeforeAgent' | 'AfterAgent' | 'BeforeTool' | 'AfterTool'
