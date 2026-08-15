/**
 * Codex hook configuration and runtime types.
 * @module dsh-bridges/agents/codex/hooks/types
 */

/** One command hook handler. Codex currently supports only `type: "command"`. */
export interface CommandHook {
  type: 'command'
  /** Shell command line (Codex runs it through the shell). */
  command: string
  /** Windows-only command override. */
  commandWindows?: string
  /** Seconds before the hook is cancelled (Codex defaults to 600). */
  timeout?: number
  /** Spinner text Codex shows; not rendered by the bridge. */
  statusMessage?: string
  /** Approximate token threshold for `additionalContext` spilling; the bridge caps output by characters instead. */
  additionalContextLimit?: number
  /** Run without blocking; output is discarded by this bridge. */
  async?: boolean
}

/** One matcher group: a regex filter plus the handlers that run when it matches. */
export interface MatcherGroup {
  matcher?: string
  hooks: CommandHook[]
}

/** Parsed hook JSON output — the object Codex reads from stdout. */
export interface HookJsonOutput {
  continue?: boolean
  stopReason?: string
  systemMessage?: string
  suppressOutput?: boolean
  decision?: 'block' | string
  reason?: string
  hookSpecificOutput?: {
    hookEventName?: string
    /** `allow` or `deny`; `ask` is parsed but not supported by Codex itself. */
    permissionDecision?: string
    permissionDecisionReason?: string
    additionalContext?: string
    updatedInput?: unknown
  }
}

/** The settled outcome of one hook handler execution. */
export interface HookOutcome {
  handler: CommandHook
  /** False when the matcher excluded the handler. */
  ran: boolean
  /** True when the handler ran detached (`async: true`) and was not awaited. */
  detached?: boolean
  exitCode: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  /** True when the run was cancelled by the caller signal before settling. */
  cancelled?: boolean
  failedToStart?: string
  skippedReason?: string
  /** Parsed JSON output when stdout began with `{` and parsed as an object. */
  output: HookJsonOutput | null
  /** Non-JSON stdout (or stdout that failed JSON parsing). */
  plainText: string | null
}

/** The hook events this bridge maps onto DSH lifecycles. */
export type BridgedHookEvent =
  | 'SessionStart'
  | 'SubagentStart'
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'Stop'
  | 'SubagentStop'
  | 'SessionEnd'
