/**
 * Ring-A e2e scenario 3: PreToolUse hook blocking through the real seam.
 *
 * The fixture's `.claude/settings.json` blocks Bash calls with an exit-2 hook
 * that records its stdin payload first. The test drives the host's
 * `tools/pre-execute` waterfall and asserts the real subprocess ran, received
 * the translated Claude Code payload on stdin, and its exit code 2 surfaced as
 * a deny decision.
 *
 * The fixture hook uses POSIX shell syntax; the hooks matrix on Windows needs
 * platform-appropriate fixture commands (tracked in the Windows CI task).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bootHarness, fixtureCopy, preToolUse, tempUserDir, waitFor } from './harness.js'

function bashExec(harness: Awaited<ReturnType<typeof bootHarness>>, command: string) {
  const callId = 'call-1' as import('@deepseek-ai/dsh-llm').CallId
  return {
    callId,
    rootCallId: callId,
    name: 'bash',
    arguments: { command },
    agent: harness.agent as never,
    signal: new AbortController().signal,
    // Registry-assigned identity; the bridge reads it only as an opaque value.
    token: Symbol('e2e-token') as import('@deepseek-ai/dsh-tools').ToolExecutionToken,
  }
}

describe('e2e: claude-code PreToolUse hook blocking', () => {
  it('runs the real hook, feeds it the translated payload, and denies on exit 2', async () => {
    const project = await fixtureCopy('claude-code/hooks')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      const decision = await preToolUse(harness, bashExec(harness, 'echo hi'))
      expect(decision).toEqual({ kind: 'deny', reason: 'denied by e2e fixture policy' })

      // The subprocess really ran: it captured its stdin payload in the project dir.
      const payload = JSON.parse(await readFile(join(project.dir, '.e2e-hook-input.json'), 'utf8'))
      expect(payload.tool_name).toBe('Bash')
      expect(payload.hook_event_name).toBe('PreToolUse')
      expect(payload.tool_input).toEqual({ command: 'echo hi' })
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })

  it('allows tools the matcher does not cover', async () => {
    const project = await fixtureCopy('claude-code/hooks')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      const exec = bashExec(harness, 'echo hi')
      const decision = await preToolUse(harness, { ...exec, name: 'read', arguments: { path: 'a.txt' } })
      expect(decision).toEqual({ kind: 'allow' })
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })

  it('kills a still-running hook child when the plugin is torn down', async () => {
    const project = await fixtureCopy('claude-code/hooks-live')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      // Fire without awaiting: the hook sleeps past the whole test.
      void preToolUse(harness, bashExec(harness, 'echo hi')).catch(() => {})
      // Wait for the hook subprocess to spawn and record its pid.
      const pidFile = join(project.dir, '.e2e-hook.pid')
      const pid = await waitFor(async () => {
        try {
          return Number((await readFile(pidFile, 'utf8')).trim())
        } catch {
          return undefined
        }
      })
      expect(isAlive(pid)).toBe(true)

      await harness.dispose()
      // Teardown must kill the child instead of orphaning it; the hook's own
      // 5s timeout would also kill it, so probe a short window to catch leaks.
      await waitFor(() => (isAlive(pid) ? undefined : true), 1000)
      expect(isAlive(pid)).toBe(false)
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })
})

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
