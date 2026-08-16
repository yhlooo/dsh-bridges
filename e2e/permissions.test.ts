/**
 * Ring-A e2e scenario: permission rules through the real tools seam.
 *
 * The fixture's `.claude/settings.json` carries deny / ask / allow rules. The
 * test drives the host's `tools/pre-execute` waterfall and asserts the
 * permission bridge maps the upstream rule verdicts onto deny / ask / allow
 * decisions, and that a malformed rule never takes the whole bridge down
 * (fail-soft).
 */
import { describe, expect, it } from 'vitest'
import { bashExec, bootHarness, fixtureCopy, preToolUse, tempUserDir } from './harness.js'

describe('e2e: claude-code permission rules', () => {
  it('denies a command matching a deny rule, with the rule in the reason', async () => {
    const project = await fixtureCopy('claude-code/permissions')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      const decision = await preToolUse(harness, bashExec(harness, 'rm -rf /tmp/x'))
      expect(decision).toEqual({ kind: 'deny', reason: 'denied by permission rule "Bash(rm -rf *)"' })
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })

  it('asks for a command matching an ask rule', async () => {
    const project = await fixtureCopy('claude-code/permissions')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      const decision = await preToolUse(harness, bashExec(harness, 'git push origin main'))
      expect(decision).toEqual({ kind: 'ask', reason: 'approval required by permission rule "Bash(git push *)"' })
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })

  it('allows tools matching an allow rule without reaching the policy fallback', async () => {
    const project = await fixtureCopy('claude-code/permissions')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      const decision = await preToolUse(harness, {
        ...bashExec(harness, 'unused'),
        name: 'read',
        arguments: { file_path: './README.md' },
      })
      expect(decision).toEqual({ kind: 'allow' })
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })

  it('falls through to the harness policy when no rule matches', async () => {
    const project = await fixtureCopy('claude-code/permissions')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      const decision = await preToolUse(harness, bashExec(harness, 'npm test'))
      expect(decision).toEqual({ kind: 'allow' })
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })
})
