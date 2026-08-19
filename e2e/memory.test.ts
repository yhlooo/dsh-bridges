/**
 * Ring-A e2e scenario 2: CLAUDE.md memory injection at session start.
 *
 * The real plugin listens on the host's `agent/session-start` seam and injects
 * the user/project CLAUDE.md files the same framing DSH uses. The recording
 * agent captures exactly what a real agent would receive.
 */
import { describe, expect, it } from 'vitest'
import { bootHarness, fixtureCopy, sessionStart, tempUserDir, waitFor } from './harness.js'

describe('e2e: claude-code memory injection', () => {
  it('injects the project .claude/CLAUDE.md at session start with the plugin source id', async () => {
    const project = await fixtureCopy('claude-code/memory')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      sessionStart(harness)
      const message = await waitFor(() => harness.agent.injected[0])
      expect(message.source).toEqual({ kind: 'plugin', plugin: 'dsh-bridges:CLAUDE.md' })
      const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
      expect(text).toContain('Instructions from:')
      expect(text).toContain('.claude/CLAUDE.md')
      expect(text).toContain('Project-level .claude/CLAUDE.md instructions')
      // The root CLAUDE.md belongs to DSH's own loader, not the bridge.
      expect(text).not.toContain('Root CLAUDE.md instructions')
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })

  it('collapses the project file when it duplicates the root CLAUDE.md', async () => {
    const project = await fixtureCopy('claude-code/memory-dedup')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      sessionStart(harness)
      // Nothing should arrive: the only project memory duplicates the root file.
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(harness.agent.injected).toHaveLength(0)
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })
})
