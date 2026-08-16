/**
 * Shared custom-subagent definition support (Claude Code `.claude/agents/`,
 * CodeBuddy Code `.codebuddy/agents/`).
 *
 * Upstream subagent definitions are markdown files with YAML frontmatter
 * (`name` + `description` required; `tools`/`disallowedTools`/`model`/
 * `maxTurns`/`permissionMode`/`skills`/`mcpServers`/`hooks`/`memory`/
 * `background`/`effort`/`isolation`/`color`/`initialPrompt` optional) and a
 * system-prompt body.
 *
 * DeepSeek Harness has no registry of named subagent definitions — its
 * `subagent` tool takes everything inline (`label`, `persona`, `toolFilter:
 * { allow, deny }`, `agentOptions: { model }`, `maxDepth`, `prompt`). Each
 * definition is therefore bridged as a **skill whose body carries a
 * delegation spec**: the upstream system prompt verbatim, plus instructions
 * telling the model which inline parameters to pass when delegating.
 * Unmappable frontmatter is recorded in the guides' limitations.
 * @module dsh-bridges/agent-definitions
 */
import { parse as parseYaml } from 'yaml'
import type { BridgeLogger } from './util.js'
import { isPlainObject } from './util.js'

/** A `---`-fenced YAML frontmatter block at the very start of a file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Thrown when frontmatter exists but cannot be interpreted; callers fail closed. */
export class AgentDefinitionError extends Error {}

/** The fields this bridge maps onto a skill-carried delegation spec. */
export interface AgentDefinition {
  /** Frontmatter `name` (the upstream agent identifier). */
  name: string
  /** Frontmatter `description` (when to delegate). */
  description: string
  /** System prompt body without the frontmatter block. */
  body: string
  /** `tools` entries as written (upstream tool names). */
  tools: string[]
  /** `disallowedTools` entries as written. */
  disallowedTools: string[]
  /** `model` frontmatter, or undefined. */
  model?: string
  /** `maxTurns` frontmatter, when a positive integer. */
  maxTurns?: number
}

/** Upstream agent-tool names → DSH tool names (hooks' name tables, reversed). */
const UPSTREAM_TO_DSH_TOOL: Readonly<Record<string, string>> = {
  Bash: 'bash',
  PowerShell: 'pwsh',
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Glob: 'glob',
  Grep: 'grep',
  WebFetch: 'web',
  WebSearch: 'web_search',
  AskUserQuestion: 'ask_user_question',
  ExitPlanMode: 'exit_plan_mode',
  Agent: 'subagent',
  Task: 'subagent',
  TodoWrite: 'todo_write',
  Skill: 'skill',
}

/**
 * Translate an upstream `tools`/`disallowedTools` list to DSH tool names.
 * Unknown entries return undefined: DSH's subagent tool rejects unknown
 * tool-filter names at startup, so dropping them (with a warning) beats
 * failing every delegation.
 */
export function translateAgentToolList(entries: readonly string[], logger: BridgeLogger, name: string): string[] {
  const translated: string[] = []
  for (const entry of entries) {
    const trimmed = entry.trim()
    if (trimmed === '') continue
    const mapped = UPSTREAM_TO_DSH_TOOL[trimmed] ?? trimmed
    translated.push(mapped)
  }
  return translated
}

/**
 * Parse one agent-definition file. Throws {@link AgentDefinitionError} when
 * the frontmatter is malformed or the required `name` / `description` fields
 * are missing, so discovery can fail closed (drop with a warning).
 */
export function parseAgentDefinition(text: string): AgentDefinition {
  const match = FRONTMATTER_RE.exec(text)
  if (!match) throw new AgentDefinitionError('missing YAML frontmatter (--- … ---)')
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(match[1] ?? '')
  } catch (error) {
    throw new AgentDefinitionError(`invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (!isPlainObject(frontmatter)) throw new AgentDefinitionError('frontmatter must be a YAML mapping')
  const name = frontmatter['name']
  if (typeof name !== 'string' || name.trim() === '') throw new AgentDefinitionError('frontmatter name must be a non-empty string')
  if (name.includes(':')) throw new AgentDefinitionError(`frontmatter name ${JSON.stringify(name)} contains ":" (plugin-scoped names are not supported)`)
  const description = frontmatter['description']
  if (typeof description !== 'string' || description.trim() === '') throw new AgentDefinitionError('frontmatter description must be a non-empty string')
  const tools = readStringList(frontmatter['tools'])
  const disallowedTools = readStringList(frontmatter['disallowedTools'])
  const model = typeof frontmatter['model'] === 'string' && frontmatter['model'].trim() !== '' ? frontmatter['model'] : undefined
  const maxTurns = typeof frontmatter['maxTurns'] === 'number' && Number.isInteger(frontmatter['maxTurns']) && frontmatter['maxTurns'] > 0 ? frontmatter['maxTurns'] : undefined
  return {
    name: name.trim(),
    description: description.trim(),
    body: text.slice(match[0].length).trim(),
    tools,
    disallowedTools,
    model,
    maxTurns,
  }
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
  }
  return []
}

/**
 * Build the skill body for one agent definition: the upstream system prompt
 * verbatim, followed by the delegation spec the model should pass to the DSH
 * `subagent` tool.
 */
export function buildAgentSkillBody(
  definition: AgentDefinition,
  logger: BridgeLogger,
): string {
  const allow = translateAgentToolList(definition.tools, logger, definition.name)
  const deny = translateAgentToolList(definition.disallowedTools, logger, definition.name)
  const lines: string[] = [
    definition.body,
    '',
    '---',
    '',
    'This skill is a bridged custom subagent definition. To use it, delegate with the `subagent` tool:',
    `- label: "${escapeSpecValue(definition.name)}"`,
    '- persona: the entire text above this separator, verbatim',
    '- prompt: the user\'s task',
  ]
  if (allow.length > 0) lines.push(`- toolFilter.allow: ${JSON.stringify(allow)}`)
  if (deny.length > 0) lines.push(`- toolFilter.deny: ${JSON.stringify(deny)}`)
  if (definition.model !== undefined && definition.model !== 'inherit' && definition.model !== 'default') {
    lines.push(`- agentOptions.model: "${escapeSpecValue(definition.model)}"`)
  }
  if (definition.maxTurns !== undefined) lines.push(`- maxDepth: ${definition.maxTurns}`)
  lines.push('Do not perform the work inline; delegate and report back to the user.')
  return lines.join('\n')
}

function escapeSpecValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}
