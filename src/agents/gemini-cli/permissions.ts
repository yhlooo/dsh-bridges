/**
 * Gemini CLI Policy Engine bridging: user `~/.gemini/policies/*.toml` rules →
 * the `tools/pre-execute` permission seam.
 *
 * Scope: only the **user** tier is bridged. The workspace tier
 * (`.gemini/policies/`) is disabled upstream (issue #18186) and therefore not
 * read either; the admin/system tier and the built-in default policies live
 * in the Gemini installation, which the bridge cannot read — DeepSeek
 * Harness's own approval policy fills that role instead.
 *
 * Rule semantics (policy-engine.md):
 *
 * - `final_priority = tier_base + toml_priority / 1000` (user tier base 4);
 *   rules are evaluated highest-first and the **first full match** decides.
 * - A rule matches when every present condition holds: `toolName` (glob
 *   wildcards, string or array; subagent delegations match rules naming the
 *   agent), `subagent`, `mcpName`, `argsPattern` (JSON-object subset with
 *   deep equality), `commandPrefix` / `commandRegex` (run_shell_command
 *   only), `interactive`, and `modes`.
 * - `decision`: `allow` / `deny` / `ask_user`. `ask_user` maps to the
 *   DeepSeek Harness approval channel (`ask`), like the other bridges.
 *
 * Recorded limitations: `modes`-gated rules are inactive (DeepSeek Harness
 * has no upstream approval-mode state; rule-less behavior is upstream's
 * default anyway), `interactive: true` rules are inactive (headless
 * sessions), `toolAnnotations` can never match (no annotations seam),
 * `allowRedirection` handling is not applied, and workspace/admin/built-in
 * policies are out of scope.
 * @module dsh-bridges/agents/gemini-cli/permissions
 */
import { join } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { isPlainObject } from '../../util.js'
import type { RuleVerdict } from '../../permissions/types.js'
import { geminiToolName } from './hooks/names.js'

export interface PolicyRule {
  toolName?: string[]
  subagent?: string
  mcpName?: string[]
  toolAnnotations?: Record<string, unknown>
  argsPattern?: Record<string, unknown>
  commandPrefix?: string
  commandRegex?: string
  decision: 'allow' | 'deny' | 'ask_user'
  priority: number
  denyMessage?: string
  modes?: string[]
  interactive?: boolean
}

export class GeminiPolicyLoader {
  private cached: { stamp: string; rules: readonly PolicyRule[] } | undefined

  constructor(
    private readonly logger: BridgeLogger,
    private readonly fs: FsAdapter,
    private readonly userDir: string,
  ) {}

  async load(): Promise<readonly PolicyRule[]> {
    const dir = join(this.userDir, 'policies')
    const stamps: string[] = []
    let entries: { name: string }[]
    try {
      entries = await this.fs.listDir(dir)
    } catch {
      return []
    }
    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith('.toml')) continue
      try {
        stamps.push(`${entry.name}:${(await this.fs.stamp(join(dir, entry.name))) ?? 'absent'}`)
      } catch {
        stamps.push(`${entry.name}:unreadable`)
      }
    }
    const stamp = stamps.join('|')
    if (this.cached !== undefined && this.cached.stamp === stamp) return this.cached.rules
    const rules = await this.loadFresh(dir, entries)
    this.cached = { stamp, rules }
    return rules
  }

  private async loadFresh(dir: string, entries: { name: string }[]): Promise<PolicyRule[]> {
    const rules: PolicyRule[] = []
    for (const entry of entries) {
      if (!entry.name.toLowerCase().endsWith('.toml')) continue
      const path = join(dir, entry.name)
      let text: string
      try {
        text = await this.fs.readText(path)
      } catch (error) {
        this.logger.warn(`gemini-cli: cannot read policy ${path}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      let value: unknown
      try {
        value = parseToml(text)
      } catch (error) {
        this.logger.warn(`gemini-cli: ignoring invalid policy TOML ${path}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      if (!isPlainObject(value) || !Array.isArray(value['rule'])) continue
      for (const rawRule of value['rule']) {
        if (!isPlainObject(rawRule)) continue
        const rule = normalizeRule(rawRule)
        if (rule !== undefined) rules.push(rule)
      }
    }
    // Highest final priority first; stable within the same priority.
    return rules.sort((a, b) => b.priority - a.priority)
  }
}

function normalizeRule(raw: Record<string, unknown>): PolicyRule | undefined {
  const decision = raw['decision']
  if (decision !== 'allow' && decision !== 'deny' && decision !== 'ask_user') return undefined
  const rule: PolicyRule = {
    decision,
    priority: typeof raw['priority'] === 'number' && raw['priority'] >= 0 && raw['priority'] <= 999 ? raw['priority'] : 0,
  }
  const toolName = raw['toolName']
  if (typeof toolName === 'string' && toolName.trim() !== '') rule.toolName = [toolName.trim()]
  else if (Array.isArray(toolName)) {
    const names = toolName.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    if (names.length > 0) rule.toolName = names
  }
  if (typeof raw['subagent'] === 'string' && raw['subagent'].trim() !== '') rule.subagent = raw['subagent'].trim()
  const mcpName = raw['mcpName']
  if (typeof mcpName === 'string' && mcpName.trim() !== '') rule.mcpName = [mcpName.trim()]
  else if (Array.isArray(mcpName)) {
    const names = mcpName.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    if (names.length > 0) rule.mcpName = names
  }
  if (isPlainObject(raw['toolAnnotations'])) rule.toolAnnotations = raw['toolAnnotations']
  if (isPlainObject(raw['argsPattern'])) rule.argsPattern = raw['argsPattern']
  if (typeof raw['commandPrefix'] === 'string' && raw['commandPrefix'] !== '') rule.commandPrefix = raw['commandPrefix']
  if (typeof raw['commandRegex'] === 'string' && raw['commandRegex'] !== '') rule.commandRegex = raw['commandRegex']
  if (typeof raw['denyMessage'] === 'string' && raw['denyMessage'].trim() !== '') rule.denyMessage = raw['denyMessage'].trim()
  if (Array.isArray(raw['modes'])) {
    const modes = raw['modes'].filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    if (modes.length > 0) rule.modes = modes
  }
  if (typeof raw['interactive'] === 'boolean') rule.interactive = raw['interactive']
  return rule
}

/** Evaluate the highest-priority matching rule (exported for tests). */
export function evaluatePolicy(rules: readonly PolicyRule[], exec: ToolExecution): RuleVerdict {
  const toolName = effectiveToolName(exec)
  const subagentLabel =
    exec.name === 'subagent' && typeof exec.arguments === 'object' && exec.arguments !== null
      ? (exec.arguments as { label?: unknown }).label
      : undefined
  const label = typeof subagentLabel === 'string' ? subagentLabel : undefined
  for (const rule of rules) {
    if (!ruleMatches(rule, toolName, exec.arguments, label)) continue
    if (rule.decision === 'deny') {
      return { kind: 'deny', reason: rule.denyMessage ?? `denied by a Gemini CLI policy rule` }
    }
    if (rule.decision === 'ask_user') return { kind: 'ask', reason: rule.denyMessage }
    return { kind: 'allow' }
  }
  return undefined
}

/** The name policy conditions compare against (agent names for delegations). */
function effectiveToolName(exec: ToolExecution): string {
  if (exec.name === 'subagent' && typeof exec.arguments === 'object' && exec.arguments !== null) {
    const label = (exec.arguments as { label?: unknown }).label
    if (typeof label === 'string' && label !== '') return label
  }
  return geminiPolicyToolName(exec.name)
}

/**
 * DSH `mcp__gemini__<server>__<tool>` → Gemini FQN `mcp_<server>_<tool>` so
 * policy `toolName` globs (`mcp_*`, `mcp_server_*`, `mcp_*_toolName`) and
 * `mcpName` conditions (parsed on the first `_` after `mcp_`) match the
 * runtime names, mirroring upstream's composite FQN.
 */
function geminiPolicyToolName(dshName: string): string {
  const prefix = 'mcp__gemini__'
  if (dshName.startsWith(prefix)) return `mcp_${dshName.slice(prefix.length).replaceAll('__', '_')}`
  return geminiToolName(dshName)
}

function ruleMatches(rule: PolicyRule, toolName: string, args: unknown, subagentLabel: string | undefined): boolean {
  if (rule.interactive === true) return false // headless session: interactive-only rules are inactive
  if (rule.modes !== undefined && rule.modes.length > 0) return false // no upstream approval mode in DSH
  if (rule.toolAnnotations !== undefined) return false // no annotations seam; can never match
  if (rule.toolName !== undefined && !rule.toolName.some((pattern) => wildcardMatch(pattern, toolName))) return false
  if (rule.subagent !== undefined) {
    if (subagentLabel === undefined || !wildcardMatch(rule.subagent, subagentLabel)) return false
  }
  if (rule.mcpName !== undefined) {
    const server = mcpServerName(toolName)
    if (server === undefined || !rule.mcpName.some((pattern) => wildcardMatch(pattern, server))) return false
  }
  if (rule.argsPattern !== undefined) {
    if (typeof args !== 'object' || args === null) return false
    for (const [key, expected] of Object.entries(rule.argsPattern)) {
      if (!(key in args)) return false
      if (!stableEqual((args as Record<string, unknown>)[key], expected)) return false
    }
  }
  if (rule.commandPrefix !== undefined || rule.commandRegex !== undefined) {
    if (toolName !== 'run_shell_command') return false
    const command = typeof args === 'object' && args !== null ? (args as { command?: unknown }).command : undefined
    if (typeof command !== 'string') return false
    if (rule.commandPrefix !== undefined && !command.startsWith(rule.commandPrefix)) return false
    if (rule.commandRegex !== undefined) {
      try {
        if (!new RegExp(rule.commandRegex).test(command)) return false
      } catch {
        return false // unparseable regex never matches (fail open)
      }
    }
  }
  return true
}

/** `mcp_<server>_<tool>`: the server name is the first underscore-delimited part. */
function mcpServerName(toolName: string): string | undefined {
  if (!toolName.startsWith('mcp_')) return undefined
  const rest = toolName.slice(4)
  const index = rest.indexOf('_')
  if (index === 0) return undefined // empty server part: not a gemini FQN
  return index < 0 ? rest : rest.slice(0, index)
}

/** Simple glob with `*` wildcards (`mcp_*` matches every MCP tool). */
export function wildcardMatch(pattern: string, value: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return pattern === value
  const regex = new RegExp(`^${pattern.split('*').map(escapeRegex).join('.*')}$`)
  return regex.test(value)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Order-insensitive deep equality (pattern values are JSON scalars/objects). */
function stableEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/** Register the policy bridge on the tools/pre-execute seam. */
export function createPermissionsBridge(ctx: Context, logger: BridgeLogger, loader: GeminiPolicyLoader): PermissionEvaluatorLike {
  const evaluator = (exec: ToolExecution): Promise<RuleVerdict> => evaluatePolicyForExec(loader, exec)
  return evaluator
}

type PermissionEvaluatorLike = (exec: ToolExecution) => Promise<RuleVerdict>

async function evaluatePolicyForExec(loader: GeminiPolicyLoader, exec: ToolExecution): Promise<RuleVerdict> {
  const rules = await loader.load()
  if (rules.length === 0) return undefined
  return evaluatePolicy(rules, exec)
}
