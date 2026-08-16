/**
 * CodeBuddy Code permission rules (`settings.json` `permissions.allow/ask/deny`)
 * enforced at the DSH `tools/pre-execute` seam.
 *
 * Same architecture as the Claude Code bridge: the settings loader merges the
 * rules across scopes, an evaluator verdict is composed with PreToolUse hook
 * decisions inside the hook bridge (deny rules always win; ask rules outrank a
 * hook allow), and a standalone listener enforces the rules when hooks are
 * disabled. Rule evaluation uses the shared engine's CodeBuddy dialect
 * (exact/`:*`/wildcard Bash matching with compound-command analysis,
 * case-insensitive file globs, MCP name normalization, `Skill(name)` exact
 * matches).
 *
 * `permissions.defaultMode` and the bypass/auto-mode switches are read but not
 * enforced: DeepSeek Harness owns its approval modes (see the guides).
 * @module dsh-bridges/agents/codebuddy-code/permissions
 */
import { homedir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import type { PreToolDecision } from '@deepseek-ai/dsh-tools'
import { evaluateRules } from '../../permissions/engine.js'
import type { PermissionEvaluator } from '../../permissions/compose.js'
import type { RuleVerdict } from '../../permissions/types.js'
import type { BridgeLogger } from '../../util.js'
import { codebuddyToolName } from './hooks/names.js'
import type { CodebuddySettingsLoader } from './settings.js'

export type { PermissionEvaluator }

/** Build the rule evaluator for one tool call (rules only; hooks compose it). */
export function createPermissionEvaluator(logger: BridgeLogger, loader: CodebuddySettingsLoader): PermissionEvaluator {
  return async (exec) => {
    const agent = exec.agent
    if (!agent) return undefined
    const cwd = agent.session.header.cwd ?? process.cwd()
    const settings = await loader.load(cwd)
    const permissions = settings.permissions
    if (permissions.allow.length === 0 && permissions.ask.length === 0 && permissions.deny.length === 0) return undefined
    const codebuddyName = codebuddyToolName(exec.name)
    // CodeBuddy Code's permission rules key the subagent tool as `Agent`
    // (its hooks call the same tool `Task`); evaluate both spellings.
    const names = codebuddyName === 'Task' ? ['Agent', 'Task'] : [codebuddyName]
    let verdict: RuleVerdict
    for (const name of names) {
      verdict = evaluateRules(permissions, name, exec.arguments, {
        cwd,
        home: homedir(),
        additionalDirectories: permissions.additionalDirectories,
        dialect: 'codebuddy',
      })
      if (verdict !== undefined) break
    }
    if (verdict !== undefined) logger.debug(`codebuddy-code: permission rule verdict for ${codebuddyName}: ${verdict.kind}`)
    return verdict
  }
}

/** Standalone `tools/pre-execute` enforcement used when hooks are disabled. */
export function createPermissionsOnlyBridge(ctx: Context, logger: BridgeLogger, loader: CodebuddySettingsLoader): void {
  const evaluate = createPermissionEvaluator(logger, loader)
  ctx.on('tools/pre-execute', async (exec, next): Promise<PreToolDecision> => {
    const verdict = await evaluate(exec)
    if (verdict === undefined) return next()
    return verdict
  })
}
