/**
 * Composition of a PreToolUse hook decision with the permission-rule verdict,
 * shared by every hook-owning bridge (Claude Code, CodeBuddy Code, Codex).
 *
 * Upstream contract (Claude Code hooks reference; CodeBuddy Code documents
 * the same interplay): deny rules always win — a hook `allow` never overrides
 * a matching deny rule — and a matching ask rule still prompts after a hook
 * grants the permission. A hook `deny` denies outright; a hook `ask` prompts;
 * a hook `allow` bypasses unless a deny/ask rule matches; an undecided hook
 * falls through to the rules.
 * @module dsh-bridges/permissions/compose
 */
import type { PreToolDecision, ToolExecution } from '@deepseek-ai/dsh-tools'
import type { BridgeLogger } from '../util.js'
import type { RuleVerdict } from './types.js'

/** Verdict provider consumed by a hook bridge's PreToolUse handler. */
export type PermissionEvaluator = (exec: ToolExecution) => Promise<RuleVerdict>

/** One hook's PreToolUse resolution, before rule composition. */
export type HookToolDecision =
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }
  | { kind: 'allow' }
  | { kind: 'undecided' }

/**
 * Compose a hook decision with the permission-rule verdict. Exported for unit
 * tests; hook bridges call this as the final step of their PreToolUse handler.
 */
export async function composePreToolDecision(
  evaluator: PermissionEvaluator | undefined,
  exec: ToolExecution,
  hookDecision: HookToolDecision | undefined,
  logger: BridgeLogger,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  if (hookDecision?.kind === 'deny') return { kind: 'deny', reason: hookDecision.reason }
  let rules: RuleVerdict
  if (evaluator === undefined) {
    rules = undefined
  } else {
    try {
      rules = await evaluator(exec)
    } catch (error) {
      logger.warn(`permission rules failed: ${error instanceof Error ? error.message : String(error)}`)
      rules = undefined
    }
  }
  if (rules?.kind === 'deny') return { kind: 'deny', reason: rules.reason }
  if (hookDecision?.kind === 'ask') return { kind: 'ask', reason: hookDecision.reason }
  if (hookDecision?.kind === 'allow') {
    // Upstream: an ask rule still prompts after a hook grants the permission.
    if (rules?.kind === 'ask') return { kind: 'ask', reason: rules.reason }
    return { kind: 'allow' }
  }
  if (rules?.kind === 'ask') return { kind: 'ask', reason: rules.reason }
  if (rules?.kind === 'allow') return { kind: 'allow' }
  return next()
}
