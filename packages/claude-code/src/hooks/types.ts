/**
 * Claude Code hook configuration and runtime types.
 * @module @dsh-bridges/claude-code/hooks/types
 */

/** Handler fields shared by every hook type. */
export interface HookCommonFields {
  /** `command` or `http`; `mcp_tool`, `prompt`, and `agent` are not bridged yet. */
  type: 'command' | 'http'
  /** Permission-rule-style filter on tool events; ignored on other events. */
  if?: string
  /** Seconds before the hook is cancelled. */
  timeout?: number
  /** Spinner text Claude Code shows; not rendered by the bridge. */
  statusMessage?: string
}

export interface CommandHook extends HookCommonFields {
  type: 'command'
  /** Shell command, or the executable when `args` is present (exec form). */
  command: string
  /** Exec-form argument vector. */
  args?: string[]
  /** Run without blocking; output is discarded. */
  async?: boolean
  /** Like `async`, plus wake the agent on exit code 2 (not bridged). */
  asyncRewake?: boolean
  /** `bash` or `powershell`; ignored in exec form. */
  shell?: 'bash' | 'powershell'
}

export interface HttpHook extends HookCommonFields {
  type: 'http'
  url: string
  headers?: Record<string, string>
  /** Env var names that may be interpolated into headers. */
  allowedEnvVars?: string[]
}

export type HookDef = CommandHook | HttpHook

/** One matcher group: a filter plus the handlers that run when it matches. */
export interface MatcherGroup {
  matcher?: string
  hooks: HookDef[]
}

export interface HookSettings {
  hooks?: Record<string, MatcherGroup[]>
  disableAllHooks?: boolean
  env?: Record<string, string>
  allowedHttpHookUrls?: string[]
  httpHookAllowedEnvVars?: string[]
}

/** Merged, deduplicated hook configuration for one workspace. */
export interface LoadedHookSettings {
  disabled: boolean
  byEvent: ReadonlyMap<string, readonly MatcherGroup[]>
  env: Readonly<Record<string, string>>
  allowedHttpHookUrls?: readonly string[]
  httpHookAllowedEnvVars?: readonly string[]
}

/** Parsed hook JSON output — the object Claude Code reads from stdout/HTTP body. */
export interface HookJsonOutput {
  continue?: boolean
  stopReason?: string
  systemMessage?: string
  terminalSequence?: string
  decision?: 'block' | string
  reason?: string
  hookSpecificOutput?: {
    hookEventName?: string
    permissionDecision?: string
    permissionDecisionReason?: string
    additionalContext?: string
    updatedInput?: unknown
    updatedToolOutput?: unknown
  }
}

/** The settled outcome of one hook handler execution. */
export interface HookOutcome {
  handler: HookDef
  /** False when the matcher or `if` filter excluded the handler. */
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
  | 'UserPromptSubmit'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'Stop'
  | 'SessionEnd'
