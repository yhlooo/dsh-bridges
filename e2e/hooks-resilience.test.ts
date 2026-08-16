/**
 * Ring-A e2e: hook resilience through the real seam — timeout fail-open and
 * broken-config fail-soft. Both paths must leave the bridge serving defaults
 * instead of crashing or hanging the host.
 */
import { describe, expect, it } from 'vitest'
import { bashExec, bootHarness, fixtureCopy, preToolUse, tempUserDir } from './harness.js'

describe('e2e: claude-code hook resilience', () => {
  it('fails open when a PreToolUse hook exceeds the timeout', async () => {
    const project = await fixtureCopy('claude-code/hooks-timeout')
    const user = await tempUserDir()
    const harness = await bootHarness({
      cwd: project.dir,
      userClaudeDir: user.dir,
      config: { claudeCode: { hookTimeoutMs: 300 } },
    })
    try {
      // The hook sleeps 30s; the bridge must time it out and allow the tool.
      const decision = await preToolUse(harness, bashExec(harness, 'echo hi'))
      expect(decision).toEqual({ kind: 'allow' })
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })

  it('fails soft when the project settings file is invalid JSON', async () => {
    const project = await fixtureCopy('claude-code/broken-settings')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      // Neither the hook bridge nor the plugin as a whole may throw or hang.
      const decision = await preToolUse(harness, bashExec(harness, 'echo hi'))
      expect(decision).toEqual({ kind: 'allow' })
      const skills = await harness.ctx.skills.list({ cwd: project.dir })
      expect(Array.isArray(skills)).toBe(true)
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })
})
