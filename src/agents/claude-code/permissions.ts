/**
 * Claude Code permission rules (`settings.json` `permissions.allow/ask/deny`)
 * enforced at the DSH `tools/pre-execute` seam.
 *
 * Upstream contract (hooks reference): deny and ask rules are evaluated even
 * after a hook returns `allow`, and a hook's `allow` never overrides a
 * matching deny rule. The composition therefore lives in the hooks bridge's
 * PreToolUse handler: hook deny short-circuits; otherwise the rule verdict is
 * evaluated and deny rules always win, a hook `ask` prompts, a hook `allow`
 * bypasses except for matching deny/ask rules, and an undecided hook falls
 * through to the rules.
 *
 * When hooks are disabled the bridge registers its own standalone listener
 * with the same deny → ask → allow order and falls through to the DSH policy
 * stack when no rule matches.
 *
 * `permissions.defaultMode` and `permissions.disableBypassPermissionsMode` are
 * read into the merged configuration but not enforced: DSH owns its approval
 * modes and the bridge has no seam to switch them (see the guides).
 * @module dsh-bridges/agents/claude-code/permissions
 */
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { evaluateRules } from '../../permissions/engine.js'
import type { PermissionEvaluator } from '../../permissions/compose.js'
import type { RuleVerdict as _RuleVerdict } from '../../permissions/types.js'
import type { BridgeLogger } from '../../util.js'
import { claudeToolName } from './hooks/names.js'
import type { SettingsLoader } from './hooks/settings.js'

export type { PermissionEvaluator }

/** Build the rule evaluator for one tool call (rules only; hooks compose it). */
export function createPermissionEvaluator(logger: BridgeLogger, loader: SettingsLoader): PermissionEvaluator {
  return async (exec) => {
    const agent = exec.agent
    if (!agent) return undefined
    const cwd = agent.session.header.cwd ?? process.cwd()
    const settings = await loader.load(cwd)
    const permissions = settings.permissions
    if (permissions.allow.length === 0 && permissions.ask.length === 0 && permissions.deny.length === 0) return undefined
    const claudeName = claudeToolName(exec.name)
    const verdict = evaluateRules(permissions, claudeName, exec.arguments, {
      cwd,
      home: homedir(),
      additionalDirectories: permissions.additionalDirectories,
    })
    if (verdict !== undefined) logger.debug(`claude-code: permission rule verdict for ${claudeName}: ${verdict.kind}`)
    return verdict
  }
}

/** Standalone `tools/pre-execute` enforcement used when hooks are disabled. */
export function createPermissionsOnlyBridge(ctx: Context, logger: BridgeLogger, loader: SettingsLoader): void {
  const evaluate = createPermissionEvaluator(logger, loader)
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const verdict = await evaluate(exec)
    if (verdict === undefined) return next()
    return verdict
  })
}
