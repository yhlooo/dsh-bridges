import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { composePreToolDecision, type PreToolUseResolution } from '../agents/claude-code/hooks/bridge.js'
import type { RuleVerdict } from '../permissions/types.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
const exec = {} as ToolExecution
const next = vi.fn(async () => ({ kind: 'allow' as const }))

function evaluator(verdict: RuleVerdict) {
  return vi.fn(async () => verdict)
}

describe('composePreToolDecision', () => {
  beforeEach(() => {
    next.mockClear()
  })

  it('keeps a hook deny over everything', async () => {
    const decision = await composePreToolDecision(
      evaluator({ kind: 'allow' }),
      exec,
      { kind: 'deny', reason: 'hook said no' },
      silent,
      next,
    )
    expect(decision).toEqual({ kind: 'deny', reason: 'hook said no' })
  })

  it('lets a deny rule override a hook allow', async () => {
    const decision = await composePreToolDecision(
      evaluator({ kind: 'deny', reason: 'denied by permission rule "Bash(rm *)"' }),
      exec,
      { kind: 'allow' },
      silent,
      next,
    )
    expect(decision).toEqual({ kind: 'deny', reason: 'denied by permission rule "Bash(rm *)"' })
  })

  it('lets an ask rule outrank a hook allow', async () => {
    const decision = await composePreToolDecision(
      evaluator({ kind: 'ask', reason: 'approval required by permission rule "Bash(git push *)"' }),
      exec,
      { kind: 'allow' },
      silent,
      next,
    )
    expect(decision).toEqual({ kind: 'ask', reason: 'approval required by permission rule "Bash(git push *)"' })
  })

  it('honors a hook allow when rules do not block', async () => {
    const decision = await composePreToolDecision(evaluator({ kind: 'allow' }), exec, { kind: 'allow' }, silent, next)
    expect(decision).toEqual({ kind: 'allow' })
  })

  it('lets a deny rule block a hook ask', async () => {
    const decision = await composePreToolDecision(
      evaluator({ kind: 'deny', reason: 'denied by permission rule "Bash"' }),
      exec,
      { kind: 'ask', reason: 'confirm' },
      silent,
      next,
    )
    expect(decision).toEqual({ kind: 'deny', reason: 'denied by permission rule "Bash"' })
  })

  it('keeps a hook ask when rules do not block', async () => {
    const decision = await composePreToolDecision(evaluator(undefined), exec, { kind: 'ask', reason: 'confirm' }, silent, next)
    expect(decision).toEqual({ kind: 'ask', reason: 'confirm' })
  })

  it('applies rules when hooks are undecided', async () => {
    expect(await composePreToolDecision(evaluator({ kind: 'deny', reason: 'd' }), exec, { kind: 'undecided' }, silent, next)).toEqual({
      kind: 'deny',
      reason: 'd',
    })
    expect(await composePreToolDecision(evaluator({ kind: 'ask', reason: 'a' }), exec, { kind: 'undecided' }, silent, next)).toEqual({
      kind: 'ask',
      reason: 'a',
    })
    expect(await composePreToolDecision(evaluator({ kind: 'allow' }), exec, { kind: 'undecided' }, silent, next)).toEqual({ kind: 'allow' })
  })

  it('defers to the harness policy when nothing matches', async () => {
    const decision = await composePreToolDecision(evaluator(undefined), exec, { kind: 'undecided' }, silent, next)
    expect(decision).toEqual({ kind: 'allow' })
    expect(next).toHaveBeenCalled()
  })

  it('bypasses without an evaluator when a hook allows', async () => {
    const decision = await composePreToolDecision(undefined, exec, { kind: 'allow' }, silent, next)
    expect(decision).toEqual({ kind: 'allow' })
    expect(next).not.toHaveBeenCalled()
  })

  it('fails open when the evaluator throws', async () => {
    const throwing = vi.fn(async () => {
      throw new Error('boom')
    })
    expect(await composePreToolDecision(throwing, exec, { kind: 'allow' }, silent, next)).toEqual({ kind: 'allow' })
    expect(await composePreToolDecision(throwing, exec, { kind: 'undecided' }, silent, next)).toEqual({ kind: 'allow' })
  })

  it('returns a hook decision directly when no evaluator is configured', async () => {
    const decision = await composePreToolDecision(undefined, exec, { kind: 'undecided' } satisfies PreToolUseResolution, silent, next)
    expect(decision).toEqual({ kind: 'allow' })
  })
})
