/**
 * Cursor hook bridging: `hooks.json` → DSH lifecycles.
 *
 * Event mapping (session-level events run on main sessions; subagent events
 * on subagent sessions; tool events on both — the claude-code precedent):
 *
 * | Cursor event | DSH seam | Decision mapping |
 * | :--- | :--- | :--- |
 * | `sessionStart` | `agent/session-start` | fire-and-forget; `additional_context` injected |
 * | `sessionEnd` | `agent/disposed` | side effects only (short budget) |
 * | `beforeSubmitPrompt` | `agent/pre-step` | `continue: false` blocks the prompt and shows `user_message` |
 * | `preToolUse` | `tools/pre-execute` | `permission: "deny"` / exit 2 → deny (`agent_message`); `updated_input` rewriting unsupported (DSH freezes tool arguments) |
 * | `postToolUse` / `postToolUseFailure` | `tools/post-execute` | `additional_context` appended |
 * | `stop` | `agent/turn-stopping` | `followup_message` steers a continuation (per-script `loop_limit`, default 5) |
 * | `afterAgentResponse` | `agent/turn-stopping` | `additional_context` injected |
 * | `subagentStart` | `agent/session-start` (subagents) | `additional_context`; `permission: "deny"` has no deny seam (warning) |
 * | `subagentStop` | `agent/turn-stopping` (subagents) | `followup_message` steers (per-script `loop_limit`) |
 * | `beforeShellExecution` / `afterShellExecution` | pre/post-execute for `bash`/`pwsh` | matcher runs against the command text |
 * | `beforeReadFile` / `afterFileEdit` | pre-execute (`read`) / post-execute (`edit`/`write`) | matcher runs against the file path |
 * | `beforeMCPExecution` / `afterMCPExecution` | pre/post-execute for `mcp__*` tools | matcher runs against the tool name |
 *
 * Not bridged (no seam): `preCompact`, `afterAgentThought`, `workspaceOpen`,
 * the Tab hooks, and prompt-type hooks. `failClosed: true` handlers block on
 * failure instead of allowing.
 * @module dsh-bridges/agents/cursor/hooks/bridge
 */
import type { ChildProcess } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { composePreToolDecision, type HookToolDecision, type PermissionEvaluator } from '../../../permissions/compose.js'
import type { BridgeLogger } from '../../../util.js'
import { capString } from '../../../util.js'
import type { CursorSettingsLoader } from '../settings.js'
import { cursorToolName } from './names.js'
import { runEventHooks } from './run.js'
import type { BridgedHookEvent, HookOutcome } from './types.js'

const HOOK_SOURCE = 'cursor-hooks'
/** Cursor's default per-script loop cap for stop/subagentStop followups. */
const DEFAULT_LOOP_LIMIT = 5
/** Session end side-effect budget (ms). */
const SESSION_END_BUDGET_MS = 1500

export interface HookBridgeConfig {
  hookTimeoutMs: number
  maxHookOutputChars: number
}

export function createHookBridge(
  ctx: Context,
  logger: BridgeLogger,
  loader: CursorSettingsLoader,
  config: HookBridgeConfig,
  permissionEvaluator?: PermissionEvaluator,
): void {
  const children = new Set<ChildProcess>()
  const onSpawn = (child: ChildProcess) => {
    children.add(child)
    child.once('close', () => children.delete(child))
  }
  ctx.effect(
    () => () => {
      for (const child of children) {
        try {
          if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
        } catch {
          // already gone
        }
      }
      children.clear()
    },
    'cursor hook children',
  )

  const followups = new Map<string, Map<string, number>>() // agentId → (handler command → count)
  ctx.on('agent/session-start', () => {
    followups.clear()
  })

  ctx.on('agent/session-start', (payload) => {
    if (payload.source === 'resume') return
    const agent = payload.agent
    if (isSubagent(agent)) {
      void onSubagentStart(agent, loader, logger, config, onSpawn)
      return
    }
    void onSessionStart(agent, loader, logger, config, onSpawn)
  })

  ctx.on('agent/disposed', (payload) => {
    const agent = payload.agent
    if (isSubagent(agent)) return
    void onSessionEnd(agent, loader, logger, config, onSpawn)
  })

  ctx.on('agent/pre-step', (payload, next) => {
    const agent = payload.agent
    if (isSubagent(agent)) return next()
    return onBeforeSubmitPrompt(payload.agent, payload.messages, loader, logger, config, onSpawn, next)
  })

  ctx.on('tools/pre-execute', (exec, next) => {
    return onPreToolUse(exec, loader, logger, config, onSpawn, permissionEvaluator, next)
  })

  ctx.on('tools/post-execute', (exec, result, next) => {
    return onPostToolUse(exec, result, loader, logger, config, onSpawn, next)
  })

  ctx.on('agent/turn-stopping', (payload) => {
    const agent = payload.agent
    if (isSubagent(agent)) {
      void onSubagentStop(agent, loader, logger, config, onSpawn, followups)
      return
    }
    void onStopAndAfterAgentResponse(agent, loader, logger, config, onSpawn, followups)
  })
}

function isSubagent(agent: Agent): boolean {
  return agent.session.header.delegationDepth !== undefined
}

function commonInput(agent: Agent): Record<string, unknown> {
  return {
    session_id: String(agent.session.id ?? ''),
    cwd: agent.session.header.cwd ?? process.cwd(),
  }
}

function jsonObject(value: unknown): unknown {
  if (value === null || value === undefined) return {}
  if (typeof value === 'object') return value
  return { value }
}

// ── sessionStart / sessionEnd ────────────────────────────────────────────────

async function onSessionStart(
  agent: Agent,
  loader: CursorSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const groups = await groupsFor(loader, agent, 'sessionStart')
  if (groups === undefined) return
  try {
    const outcomes = await runEventHooks(
      {
        event: 'sessionStart',
        groups,
        matchedValue: undefined,
        input: { ...commonInput(agent), is_background_agent: false },
        cwd: agent.session.header.cwd ?? process.cwd(),
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const contexts = collectAdditionalContext(outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('sessionStart', contexts, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`cursor: sessionStart hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function onSessionEnd(
  agent: Agent,
  loader: CursorSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const groups = await groupsFor(loader, agent, 'sessionEnd')
  if (groups === undefined) return
  try {
    const signal = AbortSignal.timeout(SESSION_END_BUDGET_MS)
    await runEventHooks(
      {
        event: 'sessionEnd',
        groups,
        matchedValue: undefined,
        input: { ...commonInput(agent) },
        cwd: agent.session.header.cwd ?? process.cwd(),
        signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
  } catch (error) {
    logger.warn(`cursor: sessionEnd hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── subagentStart / subagentStop ─────────────────────────────────────────────

async function onSubagentStart(
  agent: Agent,
  loader: CursorSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const groups = await groupsFor(loader, agent, 'subagentStart')
  if (groups === undefined) return
  try {
    const outcomes = await runEventHooks(
      {
        event: 'subagentStart',
        groups,
        matchedValue: 'generalPurpose', // DSH subagents carry no upstream type
        input: { ...commonInput(agent) },
        cwd: agent.session.header.cwd ?? process.cwd(),
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    for (const outcome of outcomes) {
      if (!outcome.ran) continue
      if (outcome.exitCode === 2 || outcome.output?.permission === 'deny') {
        logger.warn('cursor: subagentStart hook denied subagent creation; DSH has no deny seam at session-start — ignoring')
      }
    }
    const contexts = collectAdditionalContext(outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('subagentStart', contexts, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`cursor: subagentStart hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function onSubagentStop(
  agent: Agent,
  loader: CursorSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  followups: Map<string, Map<string, number>>,
): Promise<void> {
  const groups = await groupsFor(loader, agent, 'subagentStop')
  if (groups === undefined) return
  try {
    const outcomes = await runEventHooks(
      {
        event: 'subagentStop',
        groups,
        matchedValue: 'generalPurpose',
        input: { ...commonInput(agent) },
        cwd: agent.session.header.cwd ?? process.cwd(),
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const followup = resolveFollowup(outcomes, config.maxHookOutputChars)
    if (followup !== undefined && allowFollowup(followups, agent, outcomes)) {
      agent.steer(makeContinueMessage('subagentStop', followup, config.maxHookOutputChars))
    }
  } catch (error) {
    logger.warn(`cursor: subagentStop hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── beforeSubmitPrompt (agent/pre-step) ──────────────────────────────────────

async function onBeforeSubmitPrompt(
  agent: Agent,
  messages: readonly UserMessage[],
  loader: CursorSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<{ kind: 'enter'; messages: UserMessage[] } | { kind: 'reject' }>,
): Promise<{ kind: 'enter'; messages: UserMessage[] } | { kind: 'reject' }> {
  const groups = await groupsFor(loader, agent, 'beforeSubmitPrompt')
  if (groups === undefined) return next()
  try {
    const prompt = messages.map((message) => message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')).join('\n')
    const outcomes = await runEventHooks(
      {
        event: 'beforeSubmitPrompt',
        groups,
        matchedValue: undefined,
        input: { ...commonInput(agent), prompt },
        cwd: agent.session.header.cwd ?? process.cwd(),
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    for (const outcome of outcomes) {
      if (!outcome.ran) continue
      if (outcome.exitCode === 2 || outcome.output?.continue === false) {
        const reason = firstNonEmpty(
          outcome.output?.user_message,
          capString(outcome.stderr, config.maxHookOutputChars),
          'blocked by a Cursor hook',
        )
        return { kind: 'enter', messages: [makeBlockNotice('beforeSubmitPrompt', reason, config.maxHookOutputChars)] }
      }
    }
    return next()
  } catch (error) {
    logger.warn(`cursor: beforeSubmitPrompt hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

// ── preToolUse (+ kind-specific pre events) ──────────────────────────────────

async function onPreToolUse(
  exec: ToolExecution,
  loader: CursorSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  permissionEvaluator: PermissionEvaluator | undefined,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  const agent = exec.agent
  if (!agent) return next()
  const cursorName = cursorToolName(exec.name)
  const runs = await collectToolRuns(loader, agent, exec, cursorName, 'pre', 'preToolUse', config, onSpawn)
  if (runs.length === 0) return next()
  try {
    const outcomes: HookOutcome[] = []
    for (const run of runs) {
      outcomes.push(...(await runEventHooks(run, logger)))
    }
    const resolved = resolvePreTool(outcomes, logger, config.maxHookOutputChars)
    if (resolved.contexts.length > 0) {
      agent.inject(makeContextMessage('preToolUse', resolved.contexts, config.maxHookOutputChars))
    }
    return composePreToolDecision(permissionEvaluator, exec, resolved.decision, logger, next)
  } catch (error) {
    logger.warn(`cursor: preToolUse hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

type HookRunSpec = NonNullable<Parameters<typeof runEventHooks>[0]>

/** The hook runs for a tool: the generic event plus the kind-specific event. */
async function collectToolRuns(
  loader: CursorSettingsLoader,
  agent: Agent,
  exec: ToolExecution,
  cursorName: string,
  phase: 'pre' | 'post',
  genericEvent: 'preToolUse' | 'postToolUse' | 'postToolUseFailure',
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<HookRunSpec[]> {
  const cwd = agent.session.header.cwd ?? process.cwd()
  const settings = await loader.load(cwd)
  const runs: HookRunSpec[] = []
  const genericGroups = settings.byEvent.get(genericEvent)
  if (genericGroups && genericGroups.length > 0) {
    runs.push({
      event: genericEvent,
      groups: genericGroups,
      matchedValue: cursorName,
      input: {
        ...commonInput(agent),
        tool_name: cursorName,
        tool_input: jsonObject(exec.arguments),
        tool_use_id: String(exec.callId),
      },
      cwd,
      defaultTimeoutMs: config.hookTimeoutMs,
      onSpawn,
    })
  }
  // Kind-specific events, selected by the DSH tool and matched on the field
  // the Cursor docs assign to each (shell command text, file path, tool name).
  const kinds: { events: [BridgedHookEvent, BridgedHookEvent]; tools: string[]; matchField: 'command' | 'path' | 'name' }[] = [
    { events: ['beforeShellExecution', 'afterShellExecution'], tools: ['bash', 'pwsh'], matchField: 'command' },
    { events: ['beforeReadFile', 'afterFileEdit'], tools: ['read'], matchField: 'path' },
    { events: ['beforeReadFile', 'afterFileEdit'], tools: ['edit', 'write'], matchField: 'path' },
    { events: ['beforeMCPExecution', 'afterMCPExecution'], tools: [], matchField: 'name' },
  ]
  for (const kind of kinds) {
    const applies = kind.tools.length === 0 ? exec.name.startsWith('mcp') : kind.tools.includes(exec.name)
    if (!applies) continue
    const event = phase === 'pre' ? kind.events[0] : kind.events[1]
    const kindGroups = settings.byEvent.get(event)
    if (!kindGroups || kindGroups.length === 0) continue
    const matched =
      kind.matchField === 'command'
        ? typeof exec.arguments === 'object' &&
          exec.arguments !== null &&
          typeof (exec.arguments as { command?: unknown }).command === 'string'
          ? (exec.arguments as { command: string }).command
          : undefined
        : kind.matchField === 'path'
          ? typeof exec.arguments === 'object' &&
            exec.arguments !== null &&
            (typeof (exec.arguments as { file_path?: unknown }).file_path === 'string' ||
              typeof (exec.arguments as { path?: unknown }).path === 'string')
            ? String((exec.arguments as { file_path?: unknown; path?: unknown }).file_path ?? (exec.arguments as { path?: unknown }).path)
            : undefined
          : cursorName
    runs.push({
      event,
      groups: kindGroups,
      matchedValue: matched,
      input: {
        ...commonInput(agent),
        tool_name: cursorName,
        tool_input: jsonObject(exec.arguments),
        tool_use_id: String(exec.callId),
      },
      cwd,
      defaultTimeoutMs: config.hookTimeoutMs,
      onSpawn,
    })
  }
  return runs
}

function resolvePreTool(
  outcomes: HookOutcome[],
  logger: BridgeLogger,
  maxChars: number,
): { decision: HookToolDecision | undefined; contexts: string[] } {
  let allow = false
  const contexts: string[] = []
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    if (outcome.output?.updated_input !== undefined) {
      logger.warn('cursor: preToolUse updated_input rewriting is not supported (DSH freezes tool arguments); ignored')
    }
    if (outcome.exitCode === 2) {
      return {
        decision: {
          kind: 'deny',
          reason: firstNonEmpty(outcome.output?.agent_message, capString(outcome.stderr, maxChars), 'blocked by a Cursor hook'),
        },
        contexts,
      }
    }
    if (outcome.output?.permission === 'deny') {
      return {
        decision: {
          kind: 'deny',
          reason: firstNonEmpty(
            outcome.output?.agent_message,
            outcome.output?.user_message,
            capString(outcome.stderr, maxChars),
            'denied by a Cursor hook',
          ),
        },
        contexts,
      }
    }
    if (outcome.output?.permission === 'allow') allow = true
    // `permission: "ask"` is accepted but not enforced upstream → allow.
    const failure = hookFailed(outcome)
    if (failure && outcome.handler.failClosed === true) {
      return {
        decision: { kind: 'deny', reason: firstNonEmpty(capString(outcome.stderr, maxChars), 'a fail-closed Cursor hook failed') },
        contexts,
      }
    }
    const context = outcome.output?.additional_context
    if (typeof context === 'string' && context.trim() !== '') contexts.push(context)
  }
  if (allow) return { decision: { kind: 'allow' }, contexts }
  return { decision: undefined, contexts }
}

// ── postToolUse / postToolUseFailure (+ kind-specific post events) ───────────

async function onPostToolUse(
  exec: ToolExecution,
  result: Readonly<ToolExecutionResult>,
  loader: CursorSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PostToolDecision>,
): Promise<PostToolDecision> {
  const agent = exec.agent
  if (!agent) return next()
  const cursorName = cursorToolName(exec.name)
  const genericEvent = result.isError ? 'postToolUseFailure' : 'postToolUse'
  const runs = await collectToolRuns(loader, agent, exec, cursorName, 'post', genericEvent, config, onSpawn)
  // Enrich the generic postToolUse run with the result payload.
  const generic = runs.find((run) => run.event === genericEvent)
  if (generic !== undefined) {
    if (result.isError) {
      generic.input = { ...generic.input, failure_type: 'error' }
    } else {
      generic.input = { ...generic.input, tool_output: JSON.stringify({ value: result.value, content: contentText(result.content) }) }
    }
  }
  if (runs.length === 0) return next()
  try {
    const outcomes: HookOutcome[] = []
    for (const run of runs) {
      outcomes.push(...(await runEventHooks(run, logger)))
    }
    const contextTexts: string[] = []
    for (const outcome of outcomes) {
      if (!outcome.ran) continue
      if (outcome.output?.updated_mcp_tool_output !== undefined) {
        logger.warn('cursor: postToolUse updated_mcp_tool_output rewriting is not supported; ignored')
      }
      const context = outcome.output?.additional_context
      if (typeof context === 'string' && context.trim() !== '') contextTexts.push(context)
    }
    const contexts = contextTexts.length > 0 ? [makeContextMessage(genericEvent, contextTexts, config.maxHookOutputChars)] : []
    if (contexts.length === 0) return next()
    const downstream = await next()
    if (downstream.kind === 'block') {
      return { kind: 'block', feedback: downstream.feedback, additionalContexts: [...(downstream.additionalContexts ?? []), ...contexts] }
    }
    return { kind: 'accept', additionalContexts: [...(downstream.additionalContexts ?? []), ...contexts] }
  } catch (error) {
    logger.warn(`cursor: postToolUse hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

// ── stop / afterAgentResponse (agent/turn-stopping, main sessions) ───────────

async function onStopAndAfterAgentResponse(
  agent: Agent,
  loader: CursorSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  followups: Map<string, Map<string, number>>,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  const stopGroups = settings.byEvent.get('stop')
  if (stopGroups && stopGroups.length > 0) {
    try {
      const outcomes = await runEventHooks(
        {
          event: 'stop',
          groups: stopGroups,
          matchedValue: undefined,
          input: { ...commonInput(agent), status: 'completed', loop_count: followups.get(String(agent.session.id))?.size ?? 0 },
          cwd: cwd ?? process.cwd(),
          defaultTimeoutMs: config.hookTimeoutMs,
          onSpawn,
        },
        logger,
      )
      const followup = resolveFollowup(outcomes, config.maxHookOutputChars)
      if (followup !== undefined && allowFollowup(followups, agent, outcomes)) {
        agent.steer(makeContinueMessage('stop', followup, config.maxHookOutputChars))
      }
    } catch (error) {
      logger.warn(`cursor: stop hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const responseGroups = settings.byEvent.get('afterAgentResponse')
  if (responseGroups && responseGroups.length > 0) {
    try {
      const outcomes = await runEventHooks(
        {
          event: 'afterAgentResponse',
          groups: responseGroups,
          matchedValue: undefined,
          // DSH does not expose the final response text at turn-stopping.
          input: { ...commonInput(agent), text: '' },
          cwd: cwd ?? process.cwd(),
          defaultTimeoutMs: config.hookTimeoutMs,
          onSpawn,
        },
        logger,
      )
      const contexts = collectAdditionalContext(outcomes, config.maxHookOutputChars)
      if (contexts.length > 0) {
        agent.steer(makeContextMessage('afterAgentResponse', contexts, config.maxHookOutputChars))
      }
    } catch (error) {
      logger.warn(`cursor: afterAgentResponse hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

// ── shared resolution helpers ────────────────────────────────────────────────

function resolveFollowup(outcomes: HookOutcome[], maxChars: number): string | undefined {
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    const followup = outcome.output?.followup_message
    if (typeof followup === 'string' && followup.trim() !== '') return capString(followup, maxChars)
  }
  return undefined
}

function allowFollowup(followups: Map<string, Map<string, number>>, agent: Agent, outcomes: HookOutcome[]): boolean {
  const agentId = String(agent.session.id ?? '')
  const counts = followups.get(agentId) ?? new Map<string, number>()
  followups.set(agentId, counts)
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    const key = outcome.handler.command
    const limit = outcome.handler.loopLimit ?? DEFAULT_LOOP_LIMIT
    const count = counts.get(key) ?? 0
    if (count >= limit) continue
    counts.set(key, count + 1)
    return true
  }
  return false
}

function collectAdditionalContext(outcomes: HookOutcome[], maxChars: number): string[] {
  const texts: string[] = []
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    const context = outcome.output?.additional_context
    if (typeof context === 'string' && context.trim() !== '') texts.push(capString(context, maxChars))
  }
  return texts
}

/** True when the hook did not succeed (non-zero/exit-2 paths are handled separately). */
function hookFailed(outcome: HookOutcome): boolean {
  return (
    outcome.timedOut ||
    outcome.failedToStart !== undefined ||
    (outcome.exitCode !== 0 && outcome.exitCode !== 2) ||
    (outcome.exitCode === 0 && outcome.output === null)
  )
}

async function groupsFor(
  loader: CursorSettingsLoader,
  agent: Agent,
  event: string,
): Promise<readonly import('./types.js').MatcherGroup[] | undefined> {
  const settings = await loader.load(agent.session.header.cwd)
  const groups = settings.byEvent.get(event)
  if (!groups || groups.length === 0) return undefined
  return groups
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return 'blocked by a Cursor hook'
}

function contentText(content: readonly ContentBlock[]): string {
  return content.map((block) => (block.type === 'text' ? block.text : '')).join('')
}

function makeBlockNotice(event: BridgedHookEvent, reason: string, maxChars: number): UserMessage {
  return createUserMessage({
    content: [
      {
        type: 'text',
        text: `<system-reminder>\nA Cursor ${event} hook blocked this prompt: ${capString(reason, maxChars)}\n</system-reminder>`,
      },
    ],
    source: { kind: 'plugin', plugin: HOOK_SOURCE },
  })
}

function makeContinueMessage(event: BridgedHookEvent, followup: string, maxChars: number): UserMessage {
  return createUserMessage({
    content: [
      {
        type: 'text',
        text: `<system-reminder>\nA Cursor ${event} hook submitted a follow-up: ${capString(followup, maxChars)}\n</system-reminder>`,
      },
    ],
    source: { kind: 'plugin', plugin: HOOK_SOURCE },
  })
}

function makeContextMessage(event: BridgedHookEvent, texts: string[], maxChars: number): UserMessage {
  const body = texts.map((text) => `Context from a Cursor ${event} hook:\n\n${capString(text, maxChars)}`).join('\n\n')
  return createUserMessage({
    content: [{ type: 'text', text: `<system-reminder>\n${body}\n</system-reminder>` }],
    source: { kind: 'plugin', plugin: HOOK_SOURCE },
  })
}
