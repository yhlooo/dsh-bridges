/**
 * Claude Code hook execution: matcher filtering, command and HTTP handlers,
 * exit-code/JSON output capture.
 *
 * Command hooks replicate Claude Code's contract: JSON input on stdin, exit
 * code 2 as the blocking signal, stdout parsed as JSON when it starts with
 * `{` and as plain text otherwise. `command` plus `args` spawns in exec form
 * (no shell); a bare `command` runs through the system shell. HTTP hooks POST
 * the same JSON and read the same output vocabulary from the response body.
 *
 * `mcp_tool`, `prompt`, and `agent` handler types are not bridged yet and are
 * skipped with a diagnostic.
 * @module dsh-bridges/agents/claude-code/hooks/run
 */
import { spawn, type ChildProcess } from 'node:child_process'
import type { BridgeLogger } from '../../../util.js'
import { isPlainObject } from '../../../util.js'
import { matchIf, matchMatcher, globMatch } from './matcher.js'
import type { BridgedHookEvent, CommandHook, HookDef, HookJsonOutput, HookOutcome, HttpHook, MatcherGroup } from './types.js'

/** Hard bound on captured process output; context-bound text is capped later. */
const MAX_CAPTURE_CHARS = 1024 * 1024
/** Grace period between SIGTERM and SIGKILL when cancelling a hook. */
const KILL_GRACE_MS = 500

export interface HookRun {
  event: BridgedHookEvent
  groups: readonly MatcherGroup[]
  /** The matched field for the event (tool name, session start source, …). */
  matchedValue?: string
  /** The JSON payload handed to handlers on stdin / as the POST body. */
  input: Record<string, unknown>
  /** Working directory handlers spawn in. */
  cwd: string
  /** Absolute project root substituted into `${CLAUDE_PROJECT_DIR}`. */
  projectDir: string
  /** Extra environment layered over the process environment and settings env. */
  env: Readonly<Record<string, string>>
  /** Effective allowlist intersection for HTTP header env interpolation. */
  httpHookAllowedEnvVars?: readonly string[]
  /** Merged URL allowlist; when defined, non-matching HTTP hooks never run. */
  allowedHttpHookUrls?: readonly string[]
  signal?: AbortSignal
  defaultTimeoutMs: number
  /** Called once per spawned child so the bridge can track and cancel them. */
  onSpawn?: (child: ChildProcess) => void
}

/** Tool events: `matcher` compares the tool name and `if` rules apply. */
const TOOL_EVENTS = new Set(['PreToolUse', 'PostToolUse', 'PostToolUseFailure'])

export async function runEventHooks(run: HookRun, logger: BridgeLogger): Promise<HookOutcome[]> {
  const handlers: HookDef[] = []
  for (const group of run.groups) {
    if (run.matchedValue !== undefined && !matchMatcher(group.matcher, run.matchedValue)) continue
    for (const handler of group.hooks) handlers.push(handler)
  }
  if (handlers.length === 0) return []

  const toolEvent = TOOL_EVENTS.has(run.event)
  const toolName = typeof run.input['tool_name'] === 'string' ? run.input['tool_name'] : ''
  const toolArgs = run.input['tool_input']

  return Promise.all(handlers.map(async (handler) => executeHandler(handler, run, logger, toolEvent, toolName, toolArgs)))
}

async function executeHandler(
  handler: HookDef,
  run: HookRun,
  logger: BridgeLogger,
  toolEvent: boolean,
  toolName: string,
  toolArgs: unknown,
): Promise<HookOutcome> {
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
  // `if` rules only apply to tool events; on other events a handler carrying
  // one never runs.
  if (toolEvent) {
    if (!matchIf(handler.if, toolName, toolArgs)) return base
  } else if (handler.if !== undefined) {
    return base
  }
  switch (handler.type) {
    case 'command':
      return runCommandHook(handler, run, logger, base)
    case 'http':
      return runHttpHook(handler, run, logger, base)
    default:
      return { ...base, ran: true, skippedReason: `hook type ${JSON.stringify((handler as { type?: string }).type)} is not bridged` }
  }
}

// ── command hooks ───────────────────────────────────────────────────────────

function spawnCommand(handler: CommandHook, run: HookRun): ChildProcess {
  const command = substituteProjectDir(handler.command, run.projectDir)
  const env = { ...process.env, CLAUDE_PROJECT_DIR: run.projectDir, ...run.env }
  // On POSIX each hook gets its own process group so timeouts and aborts can
  // kill shell grandchildren (`sh -c 'sleep 5'`) instead of orphaning them.
  const detached = process.platform !== 'win32'
  if (handler.args !== undefined) {
    const args = handler.args.map((arg) => substituteProjectDir(arg, run.projectDir))
    return spawn(command, args, { cwd: run.cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached })
  }
  return spawn(shellCommand(command, handler.shell), {
    cwd: run.cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    detached,
  })
}

function shellCommand(command: string, shell: CommandHook['shell']): string {
  if (process.platform === 'win32') {
    if (shell === 'powershell') return `powershell.exe -NoProfile -Command ${JSON.stringify(command)}`
    return command // spawn({ shell: true }) runs cmd.exe
  }
  if (shell === 'powershell') return `pwsh -NoProfile -Command ${JSON.stringify(command)}`
  return command // spawn({ shell: true }) runs /bin/sh
}

function substituteProjectDir(value: string, projectDir: string): string {
  return value.replace(/\$\{CLAUDE_PROJECT_DIR\}/g, projectDir)
}

async function runCommandHook(handler: CommandHook, run: HookRun, logger: BridgeLogger, base: HookOutcome): Promise<HookOutcome> {
  if (handler.async === true) {
    // Background hooks run without blocking; their output is discarded.
    try {
      const child = spawnCommand(handler, run)
      run.onSpawn?.(child)
      // Async hooks still receive the JSON payload on stdin (upstream contract);
      // drain stdout/stderr so a verbose background hook cannot deadlock on a
      // full pipe buffer.
      child.stdin?.on('error', () => {})
      child.stdin?.end(JSON.stringify(run.input))
      child.stdout?.resume()
      child.stderr?.resume()
    } catch (error) {
      logger.debug(`claude-code: async hook failed to start: ${error instanceof Error ? error.message : String(error)}`)
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

// ── HTTP hooks ───────────────────────────────────────────────────────────────

async function runHttpHook(handler: HttpHook, run: HookRun, logger: BridgeLogger, base: HookOutcome): Promise<HookOutcome> {
  if (run.allowedHttpHookUrls !== undefined && !run.allowedHttpHookUrls.some((pattern) => globMatch(pattern, handler.url))) {
    return { ...base, ran: true, skippedReason: 'HTTP hook URL is not on the allowedHttpHookUrls allowlist' }
  }
  const timeoutMs = handler.timeout !== undefined ? handler.timeout * 1000 : run.defaultTimeoutMs
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const signal = run.signal ? AbortSignal.any([run.signal, timeoutSignal]) : timeoutSignal
  const effectiveAllowed =
    handler.allowedEnvVars !== undefined && run.httpHookAllowedEnvVars !== undefined
      ? handler.allowedEnvVars.filter((name) => run.httpHookAllowedEnvVars!.includes(name))
      : (handler.allowedEnvVars ?? run.httpHookAllowedEnvVars)
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(handler.headers ?? {})) {
    headers[name] = interpolateHeader(value, effectiveAllowed)
  }
  try {
    const response = await fetch(handler.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(run.input),
      signal,
    })
    const body = (await response.text()).slice(0, MAX_CAPTURE_CHARS)
    if (!response.ok) {
      // HTTP failures are non-blocking errors; execution continues.
      return { ...base, ran: true, exitCode: response.status, stderr: `HTTP ${response.status}: ${body}` }
    }
    return { ...base, ran: true, exitCode: 0, stdout: body, ...parseHookStdout(body) }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError'
    return {
      ...base,
      ran: true,
      timedOut,
      cancelled: !timedOut && run.signal?.aborted ? true : undefined,
      failedToStart: timedOut ? undefined : error instanceof Error ? error.message : String(error),
      stderr: error instanceof Error ? error.message : String(error),
    }
  } finally {
    logger.debug(`claude-code: ${run.event} HTTP hook ${handler.url} settled`)
  }
}

function interpolateHeader(value: string, allowed: readonly string[] | undefined): string {
  if (allowed === undefined || allowed.length === 0) return value.replace(/\$\w+|\$\{\w+\}/g, '')
  return value.replace(/\$(\w+)|\$\{(\w+)\}/g, (whole, name1, name2) => {
    const name = (name1 ?? name2) as string
    if (!allowed.includes(name)) return ''
    return process.env[name] ?? ''
  })
}

// ── output parsing ───────────────────────────────────────────────────────────

/** Split settled stdout into parsed JSON output vs plain text, per Claude Code rules. */
export function parseHookStdout(stdout: string): { output: HookJsonOutput | null; plainText: string | null } {
  const trimmed = stdout.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (isPlainObject(parsed)) return { output: parsed as HookJsonOutput, plainText: null }
    } catch {
      // fall through to plain text, exactly like Claude Code
    }
  }
  return { output: null, plainText: trimmed }
}
