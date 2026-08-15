/**
 * CodeBuddy Code hook configuration and runtime types.
 * @module dsh-bridges/agents/codebuddy-code/hooks/types
 */

/** Handler fields shared by every hook type. */
export interface HookCommonFields {
  /** `command` or `http`; `prompt` and `agent` are not bridged yet. */
  type: 'command' | 'http'
  /** Permission-rule-style filter on tool events; ignored on other events. */
  if?: string
  /** Seconds before the hook is cancelled (CodeBuddy Code defaults to 60). */
  timeout?: number
  /** Run once per session instead of on every matching event. */
  once?: boolean
}

export interface CommandHook extends HookCommonFields {
  type: 'command'
  /** Shell command, or the executable when `args` is present (exec form). */
  command: string
  /** Exec-form argument vector. */
  args?: string[]
  /** Run without blocking; output is discarded. */
  async?: boolean
  /** `bash` or `powershell`; ignored in exec form. */
  shell?: 'bash' | 'powershell'
}

export interface HttpHook extends HookCommonFields {
  type: 'http'
  url: string
  /** `POST` (default), `PUT`, or `PATCH`. */
  method?: 'POST' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
}

export type HookDef = CommandHook | HttpHook

/** One matcher group: a regex filter plus the handlers that run when it matches. */
export interface MatcherGroup {
  matcher?: string
  hooks: HookDef[]
}

/**
 * One skill visibility override from the `skillOverrides` setting. Invalid
 * values are filtered out per file before merging, so a later file's invalid
 * value falls back to the previous valid one (all-invalid means `on`).
 */
export type SkillOverrideState = 'on' | 'name-only' | 'user-invocable-only' | 'off'

export const SKILL_OVERRIDE_STATES: readonly SkillOverrideState[] = ['on', 'name-only', 'user-invocable-only', 'off']

/** Parsed hook JSON output — the object CodeBuddy Code reads from stdout/HTTP body. */
export interface HookJsonOutput {
  continue?: boolean
  stopReason?: string
  /** Alias of `stopReason`. */
  reason?: string
  suppressOutput?: boolean
  systemMessage?: string
  decision?: 'block' | string
  hookSpecificOutput?: {
    hookEventName?: string
    permissionDecision?: 'allow' | 'deny' | 'ask' | string
    permissionDecisionReason?: string
    modifiedInput?: unknown
    additionalContext?: string
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
