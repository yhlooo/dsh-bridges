import { describe, expect, it } from 'vitest'
import { parseHookStdout, runEventHooks } from '../agents/gemini-cli/hooks/run.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

describe('gemini hook execution (real subprocesses)', () => {
  it('runs a command hook with the JSON payload on stdin and parses the deny decision', async () => {
    // Shell-form command; must stay cmd-safe (no %/!/&, function() instead of
    // arrows — cmd would treat the arrow's `>` as redirection).
    const command = `node -e "var d='';process.stdin.on('data',function(c){d+=c});process.stdin.on('end',function(){var p=JSON.parse(d);if(p.tool_name==='run_shell_command'){}else{process.exit(7)}console.log(JSON.stringify({decision:'deny',reason:'no bash'}))})"`
    const outcomes = await runEventHooks(
      {
        event: 'BeforeTool',
        groups: [{ matcher: 'run_shell_command', hooks: [{ type: 'command', command }] }],
        matchedValue: 'run_shell_command',
        input: { tool_name: 'run_shell_command', tool_input: { command: 'rm -rf /' } },
        cwd: process.cwd(),
        defaultTimeoutMs: 5000,
      },
      silent,
    )
    expect(outcomes).toHaveLength(1)
    expect(outcomes[0]!.exitCode).toBe(0)
    expect(outcomes[0]!.output?.decision).toBe('deny')
    expect(outcomes[0]!.output?.reason).toBe('no bash')
  })

  it('exit code 2 blocks with stderr as the reason', async () => {
    const outcomes = await runEventHooks(
      {
        event: 'BeforeTool',
        groups: [{ matcher: '*', hooks: [{ type: 'command', command: `node -e "console.error('blocked');process.exit(2)"` }] }],
        matchedValue: 'write_file',
        input: { tool_name: 'write_file' },
        cwd: process.cwd(),
        defaultTimeoutMs: 5000,
      },
      silent,
    )
    expect(outcomes[0]!.exitCode).toBe(2)
    expect(outcomes[0]!.stderr).toContain('blocked')
  })

  it('treats non-JSON stdout as plain text (Gemini systemMessage semantics)', async () => {
    const outcomes = await runEventHooks(
      {
        event: 'BeforeTool',
        groups: [{ hooks: [{ type: 'command', command: 'echo just some text' }] }],
        matchedValue: 'read_file',
        input: {},
        cwd: process.cwd(),
        defaultTimeoutMs: 5000,
      },
      silent,
    )
    expect(outcomes[0]!.exitCode).toBe(0)
    expect(outcomes[0]!.output).toBeNull()
    expect(outcomes[0]!.plainText).toBe('just some text')
  })

  it('fails open on timeout', async () => {
    // Short sleep: on Windows the kill hits the direct child only and the
    // surviving grandchild holds the pipes until it exits (pitfalls #25).
    const outcomes = await runEventHooks(
      {
        event: 'BeforeTool',
        groups: [{ hooks: [{ type: 'command', command: `node -e "setTimeout(function(){process.exit(0)},400)"` }] }],
        matchedValue: 'x',
        input: {},
        cwd: process.cwd(),
        defaultTimeoutMs: 100,
      },
      silent,
    )
    expect(outcomes[0]!.timedOut).toBe(true)
    expect(outcomes[0]!.exitCode).toBeNull()
  })

  it('fails open on a hook that cannot start', async () => {
    const outcomes = await runEventHooks(
      {
        event: 'BeforeTool',
        groups: [{ hooks: [{ type: 'command', command: 'definitely-not-a-real-binary-xyz' }] }],
        matchedValue: 'x',
        input: {},
        cwd: process.cwd(),
        defaultTimeoutMs: 5000,
      },
      silent,
    )
    // The shell spawns; the shell reports "command not found" as a non-zero
    // exit (a non-fatal warning upstream, never a block).
    expect(outcomes[0]!.ran).toBe(true)
    expect(outcomes[0]!.exitCode).not.toBe(0)
    expect(outcomes[0]!.output).toBeNull()
  })
})

describe('gemini hook stdout parsing', () => {
  it('splits strict JSON from plain text', () => {
    expect(parseHookStdout('{"decision":"allow"}')).toEqual({ output: { decision: 'allow' }, plainText: null })
    expect(parseHookStdout('  {"decision":"deny","reason":"x"}  ')).toEqual({ output: { decision: 'deny', reason: 'x' }, plainText: null })
    expect(parseHookStdout('oops\n{"broken')).toEqual({ output: null, plainText: 'oops\n{"broken' })
    expect(parseHookStdout('[1,2]')).toEqual({ output: null, plainText: '[1,2]' })
  })
})
