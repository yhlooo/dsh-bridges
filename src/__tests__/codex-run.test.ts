import { describe, expect, it } from 'vitest'
import { hookBlockMessage, parseHookStdout, runEventHooks } from '../agents/codex/hooks/run.js'
import { resolveBlockDecision, resolvePreToolUse, resolveStopDecision } from '../agents/codex/hooks/bridge.js'
import type { HookOutcome, MatcherGroup } from '../agents/codex/hooks/types.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

function run(options: { groups: MatcherGroup[]; timeoutMs?: number; matchedValue?: string } = { groups: [] }) {
  return runEventHooks(
    {
      event: 'PreToolUse',
      groups: options.groups,
      matchedValue: options.matchedValue ?? 'Bash',
      input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, hook_event_name: 'PreToolUse' },
      cwd: process.cwd(),
      defaultTimeoutMs: options.timeoutMs ?? 5000,
    },
    silent,
  )
}

describe('parseHookStdout', () => {
  it('parses JSON objects', () => {
    const { output, plainText } = parseHookStdout('  {"continue":false,"stopReason":"no"}')
    expect(output?.continue).toBe(false)
    expect(plainText).toBeNull()
  })

  it('treats non-JSON stdout as plain text', () => {
    expect(parseHookStdout('hello').plainText).toBe('hello')
    expect(parseHookStdout('{broken').plainText).toBe('{broken')
  })
})

describe('hookBlockMessage', () => {
  const base: HookOutcome = {
    handler: { type: 'command', command: 'x' },
    ran: true,
    exitCode: 2,
    stdout: '',
    stderr: '',
    timedOut: false,
    output: null,
    plainText: null,
  }

  it('prefers JSON reason over stopReason and stderr', () => {
    expect(hookBlockMessage({ ...base, output: { reason: 'json reason', stopReason: 'stop' }, stderr: 'err' })).toBe('json reason')
    expect(hookBlockMessage({ ...base, output: { stopReason: 'stop' }, stderr: 'err' })).toBe('stop')
  })

  it('falls back to stderr (plain stdout is invalid for blocking)', () => {
    expect(hookBlockMessage({ ...base, plainText: 'plain', stderr: 'stderr message' })).toBe('stderr message')
    expect(hookBlockMessage({ ...base })).toBeUndefined()
  })
})

describe('runEventHooks (command hooks)', () => {
  // Codex handlers are shell-command-only (no args field, per upstream), so
  // the commands below must parse identically under cmd and POSIX shells.
  // Keep the timeout sleep short: on Windows the kill targets the direct
  // child and the orphaned grandchild holds the pipes until it exits.
  it('captures JSON output and exit code', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node -e "process.stdout.write(JSON.stringify({continue:false,reason:\'halt\'}))"',
            },
          ],
        },
      ],
    })
    expect(outcome!.ran).toBe(true)
    expect(outcome!.exitCode).toBe(0)
    expect(outcome!.output?.continue).toBe(false)
  })

  it('captures exit code 2 with stderr', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node -e "process.stderr.write(\'blocked by policy\');process.exit(2)"',
            },
          ],
        },
      ],
    })
    expect(outcome!.exitCode).toBe(2)
    expect(hookBlockMessage(outcome!)).toBe('blocked by policy')
  })

  it('captures plain stdout', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node -e "process.stdout.write(\'context line\')"',
            },
          ],
        },
      ],
    })
    expect(outcome!.plainText).toBe('context line')
  })

  it('times out and fails open', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node -e "setTimeout(()=>{},3000)"',
              timeout: 1,
            },
          ],
        },
      ],
      timeoutMs: 50_000,
    })
    expect(outcome!.timedOut).toBe(true)
    expect(outcome!.exitCode).toBeNull()
  })

  it('runs async hooks detached without waiting', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node -e "setTimeout(()=>{},5000)"',
              async: true,
            },
          ],
        },
      ],
    })
    expect(outcome!.ran).toBe(true)
    expect(outcome!.detached).toBe(true)
    expect(outcome!.exitCode).toBeNull()
  })

  it('runs no handlers when the matcher does not match', async () => {
    const outcomes = await run({
      groups: [{ matcher: '^Edit$', hooks: [{ type: 'command', command: 'node -e "process.stdout.write(\'no\')"' }] }],
      matchedValue: 'Bash',
    })
    expect(outcomes).toHaveLength(0)
  })
})

describe('resolvePreToolUse', () => {
  const outcome = (partial: Partial<HookOutcome>): HookOutcome => ({
    handler: { type: 'command', command: 'x' },
    ran: true,
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    output: null,
    plainText: null,
    ...partial,
  })

  it('denies on permissionDecision deny, decision block, and exit code 2', () => {
    expect(
      resolvePreToolUse(
        [outcome({ output: { hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: 'no way' } } })],
        100,
      ).kind,
    ).toBe('deny')
    expect(resolvePreToolUse([outcome({ output: { decision: 'block', reason: 'blocked' } })], 100).kind).toBe('deny')
    expect(resolvePreToolUse([outcome({ exitCode: 2, stderr: 'exit blocked' })], 100).kind).toBe('deny')
  })

  it('ignores permissionDecision ask (parsed but not supported by Codex)', () => {
    expect(resolvePreToolUse([outcome({ output: { hookSpecificOutput: { permissionDecision: 'ask' } } })], 100).kind).toBe('allow')
  })

  it('allows by default and fails open on timeouts', () => {
    expect(resolvePreToolUse([outcome({ timedOut: true })], 100).kind).toBe('allow')
    expect(resolvePreToolUse([], 100).kind).toBe('allow')
  })
})

describe('resolveBlockDecision', () => {
  const outcome = (partial: Partial<HookOutcome>): HookOutcome => ({
    handler: { type: 'command', command: 'x' },
    ran: true,
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    output: null,
    plainText: null,
    ...partial,
  })

  it('blocks on decision block, exit 2, and continue false', () => {
    expect(resolveBlockDecision([outcome({ output: { decision: 'block', reason: 'no' } })], 100)).toBe('no')
    expect(resolveBlockDecision([outcome({ exitCode: 2, stderr: 'no' })], 100)).toBe('no')
    expect(resolveBlockDecision([outcome({ output: { continue: false, stopReason: 'stop' } })], 100)).toBe('stop')
    expect(resolveBlockDecision([outcome({})], 100)).toBeUndefined()
  })
})

describe('resolveStopDecision', () => {
  const outcome = (partial: Partial<HookOutcome>): HookOutcome => ({
    handler: { type: 'command', command: 'x' },
    ran: true,
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    output: null,
    plainText: null,
    ...partial,
  })

  it('continues on decision block and exit 2', () => {
    expect(resolveStopDecision([outcome({ output: { decision: 'block', reason: 'keep going' } })])).toBe('keep going')
    expect(resolveStopDecision([outcome({ exitCode: 2, stderr: 'once more' })])).toBe('once more')
  })

  it('lets continue: false win over continuation decisions', () => {
    const decisions = [outcome({ output: { continue: false } }), outcome({ output: { decision: 'block', reason: 'again' } })]
    expect(resolveStopDecision(decisions)).toBeUndefined()
  })

  it('stops when nothing asks to continue', () => {
    expect(resolveStopDecision([outcome({})])).toBeUndefined()
  })
})
