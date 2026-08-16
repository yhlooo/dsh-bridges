/**
 * Cursor hook configuration and runtime types.
 * @module dsh-bridges/agents/cursor/hooks/types
 */

/** One command hook handler (prompt-type hooks need an LLM and are skipped). */
export interface CommandHook {
  type: 'command'
  /** Script path or command (relative paths resolve per hook source). */
  command: string
  /** Execution timeout in **seconds** (Cursor's unit; platform default). */
  timeout?: number
  /** Per-script loop cap for stop/subagentStop followups (default 5). */
  loopLimit?: number
  /**
   * When true, hook failures (crash, timeout, invalid JSON) **block** the
   * action instead of allowing it through.
   */
  failClosed?: boolean
  /** Filter criteria — field depends on the hook (tool name, subagent type, shell command, …). */
  matcher?: string
}

export type HookDef = CommandHook

/** One matcher group (the settings loader wraps each handler in its own group). */
export interface MatcherGroup {
  matcher?: string
  hooks: HookDef[]
}

/** Parsed hook JSON output — the object Cursor reads from stdout. */
export interface HookJsonOutput {
  permission?: 'allow' | 'deny' | 'ask' | string
  user_message?: string
  agent_message?: string
  updated_input?: unknown
  updated_mcp_tool_output?: unknown
  additional_context?: string
  continue?: boolean
  followup_message?: string
  env?: Record<string, unknown>
}

/** The settled outcome of one hook handler execution. */
export interface HookOutcome {
  handler: HookDef
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
  /** Non-JSON stdout (a failed hook; fail-open by default). */
  plainText: string | null
}

/** The hook events this bridge maps onto DSH lifecycles. */
export type BridgedHookEvent =
  | 'sessionStart'
  | 'sessionEnd'
  | 'beforeSubmitPrompt'
  | 'preToolUse'
  | 'postToolUse'
  | 'postToolUseFailure'
  | 'subagentStart'
  | 'subagentStop'
  | 'beforeShellExecution'
  | 'afterShellExecution'
  | 'beforeMCPExecution'
  | 'afterMCPExecution'
  | 'beforeReadFile'
  | 'afterFileEdit'
  | 'stop'
  | 'afterAgentResponse'
