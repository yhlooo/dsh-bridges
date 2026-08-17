/**
 * Codex hook execution: matcher filtering, command handlers, exit-code/JSON
 * output capture.
 *
 * Command hooks replicate Codex's contract: JSON input on stdin, the command
 * line run through the shell, exit code 2 as the blocking signal, stdout
 * parsed as JSON when it starts with `{` and as plain text otherwise.
 * `timeout` is in seconds (Codex defaults to 600 for most events; the bridge
 * passes the event's default). `async: true` handlers run detached and their
 * output is discarded (Codex would deliver it at the next safe point — not
 * bridged). `commandWindows` replaces `command` on Windows. `prompt` and
 * `agent` handler types are parsed but skipped by Codex itself and are not
 * bridged.
 * @module dsh-bridges/agents/codex/hooks/run
 */
import { spawn, type ChildProcess } from 'node:child_process'
import type { BridgeLogger } from '../../../util.js'
import { isPlainObject } from '../../../util.js'
import { matchMatcher } from './matcher.js'
import type { BridgedHookEvent, CommandHook, HookJsonOutput, HookOutcome, MatcherGroup } from './types.js'

/** Hard bound on captured process output; context-bound text is capped later. */
const MAX_CAPTURE_CHARS = 1024 * 1024
/** Grace period between SIGTERM and SIGKILL when cancelling a hook. */
const KILL_GRACE_MS = 500

export interface HookRun {
  event: BridgedHookEvent
  groups: readonly MatcherGroup[]
  /** The matched field for the event (tool name, session start source, …). */
  matchedValue?: string
  /** The JSON payload handed to handlers on stdin. */
  input: Record<string, unknown>
  /** Working directory handlers spawn in. */
  cwd: string
  signal?: AbortSignal
  defaultTimeoutMs: number
  /** Called once per spawned child so the bridge can track and cancel them. */
  onSpawn?: (child: ChildProcess) => void
}

export async function runEventHooks(run: HookRun, logger: BridgeLogger): Promise<HookOutcome[]> {
  const handlers: CommandHook[] = []
  for (const group of run.groups) {
    if (run.matchedValue !== undefined && !matchMatcher(group.matcher, run.matchedValue)) continue
    for (const handler of group.hooks) handlers.push(handler)
  }
  if (handlers.length === 0) return []
  return Promise.all(handlers.map(async (handler) => executeHandler(handler, run, logger)))
}

async function executeHandler(handler: CommandHook, run: HookRun, logger: BridgeLogger): Promise<HookOutcome> {
  const base: HookOutcome = {
    handler,
    ran: false,
    exitCode: null,
    stdout: '',
    stderr: '',
    timedOut: false,
    output: null,
    plainText: null,
  }
  if (handler.async === true) {
    // Background hooks run without blocking; this bridge discards their
    // output (Codex would deliver it at the next safe point).
    try {
      const child = spawnCommand(handler, run)
      run.onSpawn?.(child)
      // Async hooks still receive the JSON payload on stdin; drain stdout and
      // stderr so a verbose background hook cannot deadlock on a full pipe.
      child.stdin?.on('error', () => {})
      child.stdin?.end(JSON.stringify(run.input))
      child.stdout?.resume()
      child.stderr?.resume()
    } catch (error) {
      logger.debug(`codex: async hook failed to start: ${error instanceof Error ? error.message : String(error)}`)
    }
    return { ...base, ran: true, detached: true }
  }

  let child: ChildProcess
  try {
    child = spawnCommand(handler, run)
  } catch (error) {
    return { ...base, ran: true, failedToStart: error instanceof Error ? error.message : String(error) }
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
    // A timed-out / cancelled hook's partial output is discarded, never parsed
    // into a decision (upstream drops the output on timeout).
    const discarded = timedOut || cancelled
    return {
      ...base,
      ran: true,
      exitCode: outcome.exitCode,
      stdout: discarded ? '' : outcome.stdout,
      stderr: outcome.stderr,
      timedOut,
      cancelled: cancelled || undefined,
      ...(discarded ? {} : parseHookStdout(outcome.stdout)),
    }
  } catch (error) {
    return { ...base, ran: true, cancelled: cancelled || undefined, failedToStart: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timeout)
    run.signal?.removeEventListener('abort', onAbort)
  }
}

function spawnCommand(handler: CommandHook, run: HookRun): ChildProcess {
  // On Windows, `commandWindows` overrides `command` (Codex-documented).
  const command = process.platform === 'win32' && handler.commandWindows !== undefined ? handler.commandWindows : handler.command
  // Codex runs hook commands through the shell (its own examples use `$()`).
  // On POSIX each hook gets its own process group so timeouts and aborts can
  // kill shell grandchildren instead of orphaning them.
  return spawn(command, {
    cwd: run.cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    detached: process.platform !== 'win32',
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

// ── output parsing ───────────────────────────────────────────────────────────

/** Split settled stdout into parsed JSON output vs plain text, per Codex rules. */
export function parseHookStdout(stdout: string): { output: HookJsonOutput | null; plainText: string | null } {
  const trimmed = stdout.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isPlainObject(parsed)) return { output: parsed as HookJsonOutput, plainText: null }
    } catch {
      // fall through to plain text, exactly like Codex
    }
  }
  return { output: null, plainText: trimmed }
}

/**
 * The message a blocking exit-2 hook reports, following Codex's priority:
 * JSON `reason`, then `stopReason`, then stderr.
 */
export function hookBlockMessage(outcome: HookOutcome): string | undefined {
  const reason = typeof outcome.output?.reason === 'string' ? outcome.output.reason : undefined
  if (reason !== undefined && reason.trim() !== '') return reason
  const stopReason = typeof outcome.output?.stopReason === 'string' ? outcome.output.stopReason : undefined
  if (stopReason !== undefined && stopReason.trim() !== '') return stopReason
  if (outcome.stderr.trim() !== '') return outcome.stderr.trim()
  return undefined
}
