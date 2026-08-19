/**
 * Ring-A e2e: the remaining claude-code hook seams — `agent/pre-step`
 * (UserPromptSubmit) blocking and `tools/post-execute` (PostToolUse) context
 * injection.
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { describe, expect, it } from 'vitest'
import { bashExec, bootHarness, fixtureCopy, postToolUse, preStep, tempUserDir } from './harness.js'

function userPrompt(text: string) {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } })
}

describe('e2e: claude-code UserPromptSubmit blocking', () => {
  it('erases the prompt and enters the step with a visible block notice', async () => {
    const project = await fixtureCopy('claude-code/hooks-prompt')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      const decision = await preStep(harness, [userPrompt('hello world')])
      expect(decision.kind).toBe('enter')
      if (decision.kind !== 'enter') return
      const messages = decision.messages
      expect(messages).toHaveLength(1)
      expect(messages[0]!.source).toEqual({ kind: 'plugin', plugin: 'dsh-bridges/claude-code-hook/UserPromptSubmit' })
      const text = messages[0]!.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
      expect(text).toContain('blocked by prompt policy')
      // The original prompt was erased, not replaced alongside.
      expect(text).not.toContain('hello world')
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })
})

describe('e2e: claude-code PostToolUse context injection', () => {
  it('attaches the hook additionalContext to the accepted result', async () => {
    const project = await fixtureCopy('claude-code/hooks-post')
    const user = await tempUserDir()
    const harness = await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
    try {
      const result = {
        isError: false as const,
        value: 'done',
        content: [{ type: 'text' as const, text: 'done' }],
      }
      const decision = await postToolUse(harness, bashExec(harness, 'echo hi'), result)
      expect(decision.kind).toBe('accept')
      if (decision.kind !== 'accept') return
      const contexts = decision.additionalContexts ?? []
      expect(contexts).toHaveLength(1)
      expect(contexts[0]!.source).toEqual({ kind: 'plugin', plugin: 'dsh-bridges/claude-code-hook/PostToolUse' })
      const text = contexts[0]!.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
      expect(text).toContain('extra context from fixture')
    } finally {
      await harness.dispose()
      await project.cleanup()
      await user.cleanup()
    }
  })
})
