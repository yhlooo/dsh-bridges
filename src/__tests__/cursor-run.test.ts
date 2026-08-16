import { describe, expect, it } from 'vitest'
import { matchCursorMatcher } from '../agents/cursor/hooks/matcher.js'
import { cursorToolName } from '../agents/cursor/hooks/names.js'
import { parseHookStdout, runEventHooks } from '../agents/cursor/hooks/run.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

describe('cursor matcher and names', () => {
  it('matches pipe alternations and wildcards', () => {
    expect(matchCursorMatcher('Shell|Read|Write', 'Shell')).toBe(true)
    expect(matchCursorMatcher('Shell|Read|Write', 'Grep')).toBe(false)
    expect(matchCursorMatcher('curl|wget', 'wget https://x')).toBe(true)
    expect(matchCursorMatcher(undefined, 'anything')).toBe(true)
    expect(matchCursorMatcher('', 'anything')).toBe(true)
    expect(matchCursorMatcher('*', 'anything')).toBe(true)
    expect(matchCursorMatcher('([broken', 'anything')).toBe(false)
  })

  it('translates DSH tool names to Cursor names', () => {
    const table: Record<string, string> = {
      bash: 'Shell',
      pwsh: 'Shell',
      read: 'Read',
      write: 'Write',
      edit: 'Edit',
      glob: 'Glob',
      grep: 'Grep',
      web: 'WebFetch',
      web_search: 'WebSearch',
      subagent: 'Task',
      todo_write: 'TodoWrite',
    }
    for (const [dsh, upstream] of Object.entries(table)) expect(cursorToolName(dsh)).toBe(upstream)
    expect(cursorToolName('mcp__server__tool')).toBe('mcp__server__tool')
  })
})

describe('cursor hook execution (real subprocesses)', () => {
  it('runs a command hook with JSON stdin and parses a deny decision', async () => {
    // Shell-form command; must stay cmd-safe (no %/!/&, function() instead of
    // arrows — cmd would treat the arrow's `>` as redirection).
    const command = `node -e "var d='';process.stdin.on('data',function(c){d+=c});process.stdin.on('end',function(){var p=JSON.parse(d);if(p.tool_name==='Shell'){}else{process.exit(7)}console.log(JSON.stringify({permission:'deny',agent_message:'no shell for you'}))})"`
    const outcomes = await runEventHooks(
      {
        event: 'preToolUse',
        groups: [{ matcher: 'Shell', hooks: [{ type: 'command', command }] }],
        matchedValue: 'Shell',
        input: { tool_name: 'Shell', tool_input: { command: 'rm -rf /' } },
        cwd: process.cwd(),
        defaultTimeoutMs: 5000,
      },
      silent,
    )
    expect(outcomes[0]!.exitCode).toBe(0)
    expect(outcomes[0]!.output?.permission).toBe('deny')
    expect(outcomes[0]!.output?.agent_message).toBe('no shell for you')
  })

  it('exit code 2 blocks with stderr as context and failClosed reverses failures', async () => {
    const outcomes = await runEventHooks(
      {
        event: 'preToolUse',
        groups: [
          { hooks: [{ type: 'command', command: `node -e "console.error('blocked');process.exit(2)"` }] },
          // Short sleep: on Windows the kill hits the direct child only and
          // the surviving grandchild holds the pipes until it exits.
          {
            hooks: [{ type: 'command', command: `node -e "setTimeout(function(){process.exit(0)},400)"`, timeout: 0.1, failClosed: true }],
          },
        ],
        matchedValue: 'Read',
        input: { tool_name: 'Read' },
        cwd: process.cwd(),
        defaultTimeoutMs: 5000,
      },
      silent,
    )
    expect(outcomes[0]!.exitCode).toBe(2)
    expect(outcomes[0]!.stderr).toContain('blocked')
    expect(outcomes[1]!.timedOut).toBe(true)
    expect(outcomes[1]!.handler.failClosed).toBe(true)
  })

  it('parses strict JSON stdout and treats non-JSON as plain text', () => {
    expect(parseHookStdout('{"permission":"allow"}')).toEqual({ output: { permission: 'allow' }, plainText: null })
    expect(parseHookStdout('plain text')).toEqual({ output: null, plainText: 'plain text' })
  })
})
