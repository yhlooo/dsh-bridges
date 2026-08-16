import { describe, expect, it } from 'vitest'
import { hookBlockMessage, parseHookStdout, runEventHooks } from '../agents/codebuddy-code/hooks/run.js'
import { resolveBlockDecision, resolvePreToolUse } from '../agents/codebuddy-code/hooks/bridge.js'
import type { HookOutcome, MatcherGroup } from '../agents/codebuddy-code/hooks/types.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

function run(options: { groups: MatcherGroup[]; timeoutMs?: number; env?: Record<string, string> } = { groups: [] }) {
  return runEventHooks(
    {
      event: 'PreToolUse',
      groups: options.groups,
      matchedValue: 'Bash',
      input: { tool_name: 'Bash', tool_input: { command: 'npm test' }, hook_event_name: 'PreToolUse' },
      cwd: process.cwd(),
      projectDir: process.cwd(),
      env: options.env ?? {},
      defaultTimeoutMs: options.timeoutMs ?? 5000,
    },
    silent,
  )
}

describe('parseHookStdout', () => {
  it('parses JSON objects', () => {
    const { output, plainText } = parseHookStdout('  {"continue":false,"reason":"no"}')
    expect(output?.continue).toBe(false)
    expect(plainText).toBeNull()
  })

  it('treats JSON arrays and invalid JSON as plain text', () => {
    expect(parseHookStdout('[1,2]').plainText).toBe('[1,2]')
    expect(parseHookStdout('{broken').plainText).toBe('{broken')
  })

  it('treats non-JSON stdout as plain text', () => {
    expect(parseHookStdout('hello').plainText).toBe('hello')
    expect(parseHookStdout('').plainText).toBe('')
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

  it('prefers JSON reason over stopReason, plain stdout, and stderr', () => {
    expect(hookBlockMessage({ ...base, output: { reason: 'json reason', stopReason: 'stop' }, plainText: 'plain', stderr: 'err' })).toBe(
      'json reason',
    )
    expect(hookBlockMessage({ ...base, output: { stopReason: 'stop' }, plainText: 'plain', stderr: 'err' })).toBe('stop')
  })

  it('falls back to plain stdout, then stderr', () => {
    expect(hookBlockMessage({ ...base, plainText: 'plain message' })).toBe('plain message')
    expect(hookBlockMessage({ ...base, stderr: 'stderr message' })).toBe('stderr message')
    expect(hookBlockMessage({ ...base })).toBeUndefined()
  })
})

describe('runEventHooks (command hooks)', () => {
  // Hook commands run in exec form (`node` + args): no shell parsing, so the
  // same handlers behave identically under cmd and POSIX shells.
  it('captures JSON output and exit code', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: ['-e', 'process.stdout.write(JSON.stringify({continue:false,reason:"halt"}))'],
            },
          ],
        },
      ],
    })
    expect(outcome!.ran).toBe(true)
    expect(outcome!.exitCode).toBe(0)
    expect(outcome!.output?.continue).toBe(false)
  })

  it('captures exit code 2 with stdout and stderr', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: ['-e', 'process.stderr.write("blocked by policy");process.stdout.write("stdout reason");process.exit(2)'],
            },
          ],
        },
      ],
    })
    expect(outcome!.exitCode).toBe(2)
    expect(outcome!.stderr).toContain('blocked by policy')
    expect(hookBlockMessage(outcome!)).toBe('stdout reason')
  })

  it('captures plain stdout', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: ['-e', 'process.stdout.write("context line")'],
            },
          ],
        },
      ],
    })
    expect(outcome!.plainText).toBe('context line')
  })

  it('runs exec form without a shell', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: ['-e', 'process.stdout.write(JSON.stringify({continue:false,stopReason:"halted"}))'],
            },
          ],
        },
      ],
    })
    expect(outcome!.output?.continue).toBe(false)
    expect(outcome!.output?.stopReason).toBe('halted')
  })

  it('times out and fails open', async () => {
    const [outcome] = await run({
      groups: [{ hooks: [{ type: 'command', command: 'node', args: ['-e', 'setTimeout(()=>{},5000)'] }] }],
      timeoutMs: 300,
    })
    expect(outcome!.timedOut).toBe(true)
    expect(outcome!.exitCode).toBeNull()
  })

  it('filters by matcher and if', async () => {
    const outcomes = await run({
      groups: [
        { matcher: 'Edit', hooks: [{ type: 'command', command: 'node', args: ['-e', 'process.stdout.write("no")'] }] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['-e', 'process.stdout.write("yes")'], if: 'Bash(git *)' }] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node', args: ['-e', 'process.stdout.write("also")'] }] },
      ],
    })
    // The Edit group is filtered out entirely; the `if` handler stays but does not run.
    expect(outcomes.map((outcome) => outcome.ran)).toEqual([false, true])
    expect(outcomes).toHaveLength(2)
  })

  it('matches substring matchers like CodeBuddy Code', async () => {
    const outcomes = await run({
      groups: [
        { matcher: 'sh', hooks: [{ type: 'command', command: 'node', args: ['-e', 'process.stdout.write("matched")'] }] },
        { matcher: '^Bash$', hooks: [{ type: 'command', command: 'node', args: ['-e', 'process.stdout.write("exact")'] }] },
      ],
    })
    expect(outcomes[0]!.ran).toBe(true) // "Bash" contains "sh"
    expect(outcomes[1]!.ran).toBe(true)
  })

  it('marks detached async handlers', async () => {
    const [outcome] = await run({
      groups: [{ hooks: [{ type: 'command', command: 'node', args: ['-e', 'setTimeout(()=>{},2000)'], async: true }] }],
    })
    expect(outcome!.ran).toBe(true)
    expect(outcome!.detached).toBe(true)
  })

  it('reports handlers that failed to start', async () => {
    const [outcome] = await run({
      groups: [{ hooks: [{ type: 'command', command: '/nonexistent/script-xyz.sh', args: [] }] }],
    })
    expect(outcome!.failedToStart).toBeDefined()
  })

  it('passes stdin JSON and CODEBUDDY_PROJECT_DIR to the handler', async () => {
    const [outcome] = await run({
      groups: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node',
              args: [
                '-e',
                'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log(j.hook_event_name+"|"+j.tool_name+"|"+process.env.CODEBUDDY_PROJECT_DIR)})',
              ],
            },
          ],
        },
      ],
    })
    expect(outcome!.plainText).toBe(`PreToolUse|Bash|${process.cwd()}`)
  })
})

describe('decision resolvers', () => {
  const base: HookOutcome = {
    handler: { type: 'command', command: 'x' },
    ran: true,
    exitCode: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    output: null,
    plainText: null,
  }

  it('resolves exit 2 into a block with the stdout-first message', () => {
    const decision = resolveBlockDecision([{ ...base, exitCode: 2, stdout: '{"reason":"no"}', output: { reason: 'no' } }], 1000)
    expect(decision).toBe('no')
    const plain = resolveBlockDecision([{ ...base, exitCode: 2, plainText: 'plain stop', stderr: 'err' }], 1000)
    expect(plain).toBe('plain stop')
    const stderrOnly = resolveBlockDecision([{ ...base, exitCode: 2, stderr: 'stderr stop' }], 1000)
    expect(stderrOnly).toBe('stderr stop')
  })

  it('resolves continue:false into a stop', () => {
    const decision = resolveBlockDecision([{ ...base, output: { continue: false, stopReason: 'stop here' } }], 1000)
    expect(decision).toBe('stop here')
  })

  it('still honors the deprecated top-level decision block', () => {
    const decision = resolveBlockDecision([{ ...base, output: { decision: 'block', reason: 'policy' } }], 1000)
    expect(decision).toBe('policy')
  })

  it('resolves PreToolUse deny before ask and allow', () => {
    const deny = resolvePreToolUse(
      [
        { ...base, output: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } } },
        {
          ...base,
          output: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'danger' } },
        },
      ],
      1000,
    )
    expect(deny).toEqual({ kind: 'deny', reason: 'danger' })
  })

  it('denies on exit 2 and continue:false', () => {
    const exit2 = resolvePreToolUse([{ ...base, exitCode: 2, plainText: 'no tool for you' }], 1000)
    expect(exit2).toEqual({ kind: 'deny', reason: 'no tool for you' })
    const stopped = resolvePreToolUse([{ ...base, output: { continue: false, stopReason: 'halt' } }], 1000)
    expect(stopped).toEqual({ kind: 'deny', reason: 'halt' })
  })

  it('maps ask', () => {
    const decision = resolvePreToolUse(
      [
        {
          ...base,
          output: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: 'confirm' } },
        },
      ],
      1000,
    )
    expect(decision).toEqual({ kind: 'ask', reason: 'confirm' })
  })

  it('fails open on timeouts and startup failures', () => {
    const decision = resolvePreToolUse([{ ...base, timedOut: true }, { ...base, failedToStart: 'ENOENT' }], 1000)
    expect(decision).toEqual({ kind: 'undecided' })
  })

  it('maps an explicit allow', () => {
    const decision = resolvePreToolUse(
      [{ ...base, output: { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } } }],
      1000,
    )
    expect(decision).toEqual({ kind: 'allow' })
  })
})
