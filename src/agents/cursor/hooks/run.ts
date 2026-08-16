/**
 * Cursor hook execution: matcher filtering, command handlers, exit-code and
 * JSON output capture.
 *
 * Command hooks replicate Cursor's contract: JSON input on stdin; exit code
 * `0` means success (stdout parsed as JSON when it starts with `{`), exit
 * code `2` blocks the action (equivalent to `permission: "deny"`), other
 * exit codes fail open by default. `failClosed: true` reverses the failure
 * default: crash, timeout, and invalid JSON **block** the action instead.
 *
 * Relative command paths resolve against the hook source directory (project
 * hooks run from the project root, user hooks from `~/.cursor/`).
 * @module dsh-bridges/agents/cursor/hooks/run
 */
import { spawn, type ChildProcess } from 'node:child_process'
import type { BridgeLogger } from '../../../util.js'
import { isPlainObject } from '../../../util.js'
import { matchCursorMatcher } from './matcher.js'
import type { BridgedHookEvent, HookDef, HookJsonOutput, HookOutcome, MatcherGroup } from './types.js'

/** Hard bound on captured process output; context-bound text is capped later. */
const MAX_CAPTURE_CHARS = 1024 * 1024
/** Grace period between SIGTERM and SIGKILL when cancelling a hook. */
const KILL_GRACE_MS = 500
/** Cursor's platform hook timeout default (seconds). */
const DEFAULT_TIMEOUT_S = 30

export interface HookRun {
  event: BridgedHookEvent
  groups: readonly MatcherGroup[]
  /** The matched field (tool name, subagent type, shell command, file path, …). */
  matchedValue?: string
  /** The JSON payload handed to handlers on stdin. */
  input: Record<string, unknown>
  /** Working directory handlers spawn in (project root for project hooks). */
  cwd: string
  signal?: AbortSignal
  defaultTimeoutMs: number
  /** Called once per spawned child so the bridge can track and cancel them. */
  onSpawn?: (child: ChildProcess) => void
}

export async function runEventHooks(run: HookRun, _logger: BridgeLogger): Promise<HookOutcome[]> {
  const handlers: HookDef[] = []
  for (const group of run.groups) {
    if (!matchCursorMatcher(group.matcher, run.matchedValue)) continue
    for (const handler of group.hooks) handlers.push(handler)
  }
  if (handlers.length === 0) return []
  const outcomes: HookOutcome[] = []
  for (const handler of handlers) {
    outcomes.push(await executeHandler(handler, run, _logger))
  }
  return outcomes
}

async function executeHandler(handler: HookDef, run: HookRun, _logger: BridgeLogger): Promise<HookOutcome> {
  const base: HookOutcome = {
    handler,
    ran: true,
    exitCode: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    output: null,
    plainText: null,
  }
  let child: ChildProcess
  try {
    child = spawnCommand(handler.command, run)
  } catch (error) {
    return { ...base, failedToStart: error instanceof Error ? error.message : String(error) }
  }
  run.onSpawn?.(child)

  const timeoutMs = handler.timeout !== undefined ? handler.timeout * 1000 : run.defaultTimeoutMs
  let timedOut = false
  let cancelled = false
  const kill = (signal: NodeJS.Signals) => {
    if (child.exitCode !== null || child.signalCode !== null) return
    try {
      if (process.platform === 'win32' || child.pid === undefined) child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch {
      // already gone
    }
  }
  const timeout = setTimeout(() => {
    timedOut = true
    kill('SIGTERM')
    setTimeout(() => kill('SIGKILL'), KILL_GRACE_MS).unref()
  }, timeoutMs)
  timeout.unref()
  const onAbort = () => {
    cancelled = true
    kill('SIGTERM')
    setTimeout(() => kill('SIGKILL'), KILL_GRACE_MS).unref()
  }
  run.signal?.addEventListener('abort', onAbort, { once: true })
  if (run.signal?.aborted) onAbort()

  try {
    const outcome = await collectOutput(child, run.input)
    return {
      ...base,
      exitCode: outcome.exitCode,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
      timedOut,
      cancelled: cancelled || undefined,
      ...parseHookStdout(outcome.stdout),
    }
  } catch (error) {
    return { ...base, cancelled: cancelled || undefined, failedToStart: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
    run.signal?.removeEventListener('abort', onAbort)
  }
}

function spawnCommand(command: string, run: HookRun): ChildProcess {
  const detached = process.platform !== 'win32'
  return spawn(command, {
    cwd: run.cwd,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    detached,
  })
}

function collectOutput(
  child: ChildProcess,
  input: Record<string, unknown>,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < MAX_CAPTURE_CHARS) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < MAX_CAPTURE_CHARS) stderr += chunk.toString('utf8')
    })
    child.once('error', reject)
    child.once('close', (code) => resolve({ stdout, stderr, exitCode: code }))
    const payload = JSON.stringify(input)
    child.stdin?.on('error', () => {}) // the hook may exit without reading stdin
    child.stdin?.end(payload)
  })
}

/** Split settled stdout into parsed JSON output vs plain text. */
export function parseHookStdout(stdout: string): { output: HookJsonOutput | null; plainText: string | null } {
  const trimmed = stdout.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isPlainObject(parsed)) return { output: parsed as HookJsonOutput, plainText: null }
    } catch {
      // fall through to plain text
    }
  }
  return { output: null, plainText: trimmed }
}

/** Cursor's platform default hook timeout in milliseconds. */
export const CURSOR_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_S * 1000
