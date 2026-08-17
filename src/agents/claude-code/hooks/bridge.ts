/**
 * Claude Code hook event mapping onto DSH lifecycles.
 *
 * | Claude Code event | DSH seam                                   |
 * | ----------------- | ------------------------------------------ |
 * | SessionStart      | `agent/session-start` (context injection)  |
 * | UserPromptSubmit  | `agent/pre-step` waterfall (block/context) |
 * | PreToolUse        | `tools/pre-execute` waterfall              |
 * | PostToolUse       | `tools/post-execute` waterfall (success)   |
 * | PostToolUseFailure| `tools/post-execute` waterfall (failure)   |
 * | Stop              | `agent/turn-stopping` (steer to continue)  |
 * | SessionEnd        | `agent/disposed` (side effects only)       |
 *
 * Decisions map onto the DSH decision vocabulary where one exists; where it
 * does not (input rewriting, tool-output replacement with typed values,
 * `defer`), the closest safe behavior is chosen and logged. Subagents are
 * excluded from `UserPromptSubmit` and `Stop`, which Claude Code keeps for
 * the main conversation (its `SubagentStop` event is not bridged yet).
 * @module dsh-bridges/agents/claude-code/hooks/bridge
 */
import type { ChildProcess } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { FsAdapter } from '../../../fs-adapter.js'
import { composePreToolDecision, type HookToolDecision, type PermissionEvaluator } from '../../../permissions/compose.js'
import { claudeToolName } from './names.js'
import type { BridgeLogger } from '../../../util.js'
import { capString, escapeReminderClose, isPlainObject, killHookChild } from '../../../util.js'
import { runEventHooks } from './run.js'
import { SettingsLoader } from './settings.js'
import type { BridgedHookEvent, HookOutcome } from './types.js'

export interface HookBridgeConfig {
  hookTimeoutMs: number
  userPromptHookTimeoutMs: number
  maxHookOutputChars: number
}

/** Claude Code caps Stop-hook continuations at 8 consecutive blocks. */
const MAX_STOP_CONTINUATIONS = 8
/** Claude Code gives SessionEnd hooks a shared 1.5-second budget. */
const SESSION_END_BUDGET_MS = 1500

const HOOK_SOURCE = 'claude-code-hooks'

interface StopState {
  count: number
}

export function createHookBridge(
  ctx: Context,
  logger: BridgeLogger,
  fs: FsAdapter,
  loader: SettingsLoader,
  config: HookBridgeConfig,
  permissionEvaluator?: PermissionEvaluator,
): void {
  const activeChildren = new Set<ChildProcess>()
  const stopStates = new Map<string, StopState>()
  const onSpawn = (child: ChildProcess) => {
    activeChildren.add(child)
    child.once('close', () => activeChildren.delete(child))
  }

  ctx.on('agent/session-start', (payload) => {
    // Subagent sessions get Claude Code's SubagentStart event instead of
    // SessionStart (upstream scoping: SessionStart is the main conversation's).
    if (payload.agent.session.header.delegationDepth !== undefined) {
      void onSubagentStart(payload.agent, payload.source, loader, logger, config, onSpawn)
    } else {
      void onSessionStart(payload.agent, payload.source, loader, logger, config, onSpawn)
    }
  })

  ctx.on('agent/pre-step', (payload, next) =>
    onUserPromptSubmit(payload.agent, payload.messages, payload.signal, stopStates, loader, logger, config, onSpawn, next),
  )

  ctx.on('tools/pre-execute', (exec, next) => onPreToolUse(exec, loader, logger, config, onSpawn, permissionEvaluator, next))

  ctx.on('tools/post-execute', (exec, result, next) => onPostToolUse(exec, result, loader, logger, config, onSpawn, next))

  ctx.on('agent/turn-stopping', (payload) =>
    payload.agent.session.header.delegationDepth !== undefined
      ? onSubagentStop(payload.agent, payload.signal, stopStates, loader, logger, config, onSpawn)
      : onStop(payload.agent, payload.signal, stopStates, loader, logger, config, onSpawn),
  )

  ctx.on('agent/disposed', (payload) => {
    void onSessionEnd(payload.agent, loader, logger, config, onSpawn)
  })

  ctx.effect(
    () => () => {
      for (const child of activeChildren) {
        killHookChild(child, 'SIGTERM')
      }
      activeChildren.clear()
    },
    'claude-code hook children',
  )
}

// ── SessionStart ─────────────────────────────────────────────────────────────

async function onSessionStart(
  agent: Agent,
  source: string,
  loader: SettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return
  const groups = settings.byEvent.get('SessionStart')
  if (!groups || groups.length === 0) return
  try {
    const outcomes = await runEventHooks(
      {
        event: 'SessionStart',
        groups,
        matchedValue: source,
        input: { ...commonInput(agent, 'SessionStart'), source },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
        allowedHttpHookUrls: settings.allowedHttpHookUrls,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const contexts = collectHookContext('SessionStart', outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('SessionStart', contexts, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`claude-code: SessionStart hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── SubagentStart ───────────────────────────────────────────────────────────

async function onSubagentStart(
  agent: Agent,
  source: string,
  loader: SettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return
  const groups = settings.byEvent.get('SubagentStart')
  if (!groups || groups.length === 0) return
  try {
    // DSH subagents carry no upstream agent type, so specific matchers
    // cannot match; `*` matchers run (documented limitation).
    const outcomes = await runEventHooks(
      {
        event: 'SubagentStart',
        groups,
        matchedValue: 'generic',
        input: { ...commonInput(agent, 'SubagentStart'), agent_type: 'generic' },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
        allowedHttpHookUrls: settings.allowedHttpHookUrls,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const contexts = collectHookContext('SubagentStart', outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('SubagentStart', contexts, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`claude-code: SubagentStart hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── UserPromptSubmit ─────────────────────────────────────────────────────────

async function onUserPromptSubmit(
  agent: Agent,
  messages: readonly UserMessage[],
  signal: AbortSignal,
  stopStates: Map<string, StopState>,
  loader: SettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision> {
  // Claude Code keeps UserPromptSubmit for the main conversation; subagents
  // get other events (SubagentStop etc., not bridged yet).
  if (agent.session.header.delegationDepth !== undefined) return next()
  const userMessages = messages.filter((message) => message.role === 'user' && message.source.kind === 'user')
  if (userMessages.length === 0) return next()
  const prompt = userMessages
    .map(messageText)
    .filter((text) => text !== '')
    .join('\n')

  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return next()
  const groups = settings.byEvent.get('UserPromptSubmit')
  if (!groups || groups.length === 0) return next()

  // Fresh user input resets the Stop-continuation counter.
  stopStates.delete(agent.session.id)

  try {
    const outcomes = await runEventHooks(
      {
        event: 'UserPromptSubmit',
        groups,
        input: { ...commonInput(agent, 'UserPromptSubmit'), prompt },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
        allowedHttpHookUrls: settings.allowedHttpHookUrls,
        signal,
        defaultTimeoutMs: config.userPromptHookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const block = resolveBlockDecision(outcomes, config.maxHookOutputChars)
    if (block !== undefined) {
      // The claimed prompt is erased — it never reaches the model — and the
      // step enters with the block notice instead, so the reason is visible
      // to the user through the model's reply. Claude Code erases the prompt
      // and shows the reason; DSH has no non-model notice channel, so the
      // reason rides the entering step.
      return { kind: 'enter', messages: [makeBlockNotice('UserPromptSubmit', block, config.maxHookOutputChars)] }
    }
    const contexts = collectHookContext('UserPromptSubmit', outcomes, config.maxHookOutputChars)
    const decision = await next()
    if (contexts.length === 0 || decision.kind !== 'enter') return decision
    return { kind: 'enter', messages: [...decision.messages, makeContextMessage('UserPromptSubmit', contexts, config.maxHookOutputChars)] }
  } catch (error) {
    logger.warn(`claude-code: UserPromptSubmit hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

// ── PreToolUse ───────────────────────────────────────────────────────────────

async function onPreToolUse(
  exec: ToolExecution,
  loader: SettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  permissionEvaluator: PermissionEvaluator | undefined,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  const agent = exec.agent
  if (!agent) return next()
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) {
    // Hooks disabled: permission rules still apply on their own.
    return composePreToolDecision(permissionEvaluator, exec, undefined, logger, next)
  }
  const groups = settings.byEvent.get('PreToolUse')
  if (!groups || groups.length === 0) {
    // No PreToolUse hooks configured: permission rules apply on their own.
    return composePreToolDecision(permissionEvaluator, exec, undefined, logger, next)
  }

  try {
    const claudeName = claudeToolName(exec.name)
    const outcomes = await runEventHooks(
      {
        event: 'PreToolUse',
        groups,
        matchedValue: claudeName,
        input: {
          ...commonInput(agent, 'PreToolUse'),
          tool_name: claudeName,
          tool_input: jsonObject(exec.arguments),
          tool_use_id: String(exec.callId),
        },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
        allowedHttpHookUrls: settings.allowedHttpHookUrls,
        signal: exec.signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    for (const outcome of outcomes) {
      const updated = outcome.output?.hookSpecificOutput?.updatedInput
      if (updated !== undefined) {
        logger.warn(
          'claude-code: a PreToolUse hook returned updatedInput; DSH freezes tool arguments before policy, so input rewriting is ignored',
        )
      }
    }
    const contexts = collectHookContext('PreToolUse', outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('PreToolUse', contexts, config.maxHookOutputChars))
    return composePreToolDecision(permissionEvaluator, exec, resolvePreToolUse(outcomes, config.maxHookOutputChars), logger, next)
  } catch (error) {
    logger.warn(`claude-code: PreToolUse hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return composePreToolDecision(permissionEvaluator, exec, undefined, logger, next)
  }
}

export type PreToolUseResolution = HookToolDecision

export { composePreToolDecision } from '../../../permissions/compose.js'

export function resolvePreToolUse(outcomes: readonly HookOutcome[], maxChars: number): PreToolUseResolution {
  // Precedence: deny > defer > ask > allow; timeouts and failures fail open.
  // `defer` (pause and resume later) has no DSH seam, so it maps to `ask` —
  // the closest prompt-equivalent — instead of an outright deny.
  let ask: { kind: 'ask'; reason?: string } | undefined
  let allow = false
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    const specific = outcome.output?.hookSpecificOutput
    const decision = specific?.permissionDecision
    if (outcome.exitCode === 2) {
      return {
        kind: 'deny',
        reason: firstNonEmpty(specific?.permissionDecisionReason, capString(outcome.stderr, maxChars), 'blocked by a Claude Code hook'),
      }
    }
    if (decision === 'deny') {
      return {
        kind: 'deny',
        reason: firstNonEmpty(specific?.permissionDecisionReason, capString(outcome.stderr, maxChars), 'denied by a Claude Code hook'),
      }
    }
    if (decision === 'defer') {
      return {
        kind: 'ask',
        reason: firstNonEmpty(
          specific?.permissionDecisionReason,
          `tool call deferred by a Claude Code hook; defer is mapped to approval by the dsh bridge`,
        ),
      }
    }
    if (decision === 'ask') ask = { kind: 'ask', reason: specific?.permissionDecisionReason }
    if (decision === 'allow') allow = true
    if (outcome.output?.continue === false) {
      return { kind: 'deny', reason: firstNonEmpty(outcome.output.stopReason, 'stopped by a Claude Code hook') }
    }
  }
  if (ask) return ask
  if (allow) return { kind: 'allow' }
  return { kind: 'undecided' }
}

// ── PostToolUse / PostToolUseFailure ────────────────────────────────────────

interface ResolvedPost {
  contexts: UserMessage[]
  replacementContent?: ContentBlock[]
}

async function onPostToolUse(
  exec: ToolExecution,
  result: Readonly<ToolExecutionResult>,
  loader: SettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PostToolDecision>,
): Promise<PostToolDecision> {
  const agent = exec.agent
  if (!agent) return next()
  const event: BridgedHookEvent = result.isError ? 'PostToolUseFailure' : 'PostToolUse'
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return next()
  const groups = settings.byEvent.get(event)
  if (!groups || groups.length === 0) return next()

  try {
    const claudeName = claudeToolName(exec.name)
    const input: Record<string, unknown> = {
      ...commonInput(agent, event),
      tool_name: claudeName,
      tool_input: jsonObject(exec.arguments),
      tool_use_id: String(exec.callId),
    }
    if (result.isError) {
      input['error'] = result.error.message
    } else {
      input['tool_response'] = {
        value: result.value,
        content: contentText(result.content),
      }
    }
    const outcomes = await runEventHooks(
      {
        event,
        groups,
        matchedValue: claudeName,
        input,
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
        allowedHttpHookUrls: settings.allowedHttpHookUrls,
        signal: exec.signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const post = resolvePostToolUse(event, outcomes, config.maxHookOutputChars)
    const downstream = await next()
    if (post.contexts.length === 0 && post.replacementContent === undefined) return downstream
    if (downstream.kind === 'block') {
      return {
        kind: 'block',
        feedback: downstream.feedback,
        additionalContexts: [...(downstream.additionalContexts ?? []), ...post.contexts],
      }
    }
    const base = { kind: 'accept' as const, additionalContexts: [...(downstream.additionalContexts ?? []), ...post.contexts] }
    if (post.replacementContent !== undefined && downstream.value === undefined) {
      return { ...base, content: post.replacementContent }
    }
    if (downstream.content !== undefined) return { ...base, content: downstream.content }
    if (downstream.value !== undefined) return { ...base, value: downstream.value }
    return base
  } catch (error) {
    logger.warn(`claude-code: ${event} hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

function resolvePostToolUse(event: BridgedHookEvent, outcomes: readonly HookOutcome[], maxChars: number): ResolvedPost {
  const contextTexts: string[] = []
  let replacement: ContentBlock[] | undefined
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    const specific = outcome.output?.hookSpecificOutput
    const additional = specific?.additionalContext
    if (typeof additional === 'string' && additional.trim() !== '') contextTexts.push(additional)
    if (outcome.exitCode === 2 && outcome.stderr.trim() !== '') {
      // Claude Code shows the stderr of an exit-2 PostToolUse hook to Claude.
      contextTexts.push(outcome.stderr)
    }
    if (outcome.output?.decision === 'block' && typeof outcome.output.reason === 'string') {
      // Claude Code appends the reason next to the tool result; the bridge
      // delivers it as injected context instead (DSH blocks would discard
      // the original result value).
      contextTexts.push(outcome.output.reason)
    }
    const updated = specific?.updatedToolOutput
    if (updated !== undefined) {
      replacement = [
        {
          type: 'text',
          text: typeof updated === 'string' ? updated : JSON.stringify(updated, undefined, 2),
        },
      ]
    }
  }
  const contexts = contextTexts.length > 0 ? [makeContextMessage(event, contextTexts, maxChars)] : []
  return { contexts, replacementContent: replacement }
}

// ── Stop ─────────────────────────────────────────────────────────────────────

async function onStop(
  agent: Agent,
  signal: AbortSignal,
  stopStates: Map<string, StopState>,
  loader: SettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  if (agent.session.header.delegationDepth !== undefined) return // SubagentStop not bridged
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return
  const groups = settings.byEvent.get('Stop')
  if (!groups || groups.length === 0) return
  const state = stopStates.get(agent.session.id) ?? { count: 0 }
  if (state.count >= MAX_STOP_CONTINUATIONS) return // Claude Code's 8-block cap

  try {
    const outcomes = await runEventHooks(
      {
        event: 'Stop',
        groups,
        input: { ...commonInput(agent, 'Stop'), stop_hook_active: state.count > 0 },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
        allowedHttpHookUrls: settings.allowedHttpHookUrls,
        signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const block = resolveBlockDecision(outcomes, config.maxHookOutputChars)
    const contexts = collectHookContext('Stop', outcomes, config.maxHookOutputChars)
    const feedback = [...(block !== undefined ? [block] : []), ...contexts]
    if (feedback.length === 0) return
    stopStates.set(agent.session.id, { count: state.count + 1 })
    agent.steer(makeContinueMessage('Stop', feedback, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`claude-code: Stop hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── SubagentStop ────────────────────────────────────────────────────────────

async function onSubagentStop(
  agent: Agent,
  signal: AbortSignal,
  stopStates: Map<string, StopState>,
  loader: SettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return
  const groups = settings.byEvent.get('SubagentStop')
  if (!groups || groups.length === 0) return
  const state = stopStates.get(agent.session.id) ?? { count: 0 }
  if (state.count >= MAX_STOP_CONTINUATIONS) return // Claude Code's 8-block cap
  try {
    const outcomes = await runEventHooks(
      {
        event: 'SubagentStop',
        groups,
        matchedValue: 'generic',
        input: { ...commonInput(agent, 'SubagentStop'), agent_type: 'generic', stop_hook_active: state.count > 0 },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
        allowedHttpHookUrls: settings.allowedHttpHookUrls,
        signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const block = resolveBlockDecision(outcomes, config.maxHookOutputChars)
    const contexts = collectHookContext('SubagentStop', outcomes, config.maxHookOutputChars)
    const feedback = [...(block !== undefined ? [block] : []), ...contexts]
    if (feedback.length === 0) return
    stopStates.set(agent.session.id, { count: state.count + 1 })
    agent.steer(makeContinueMessage('SubagentStop', feedback, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`claude-code: SubagentStop hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── SessionEnd ───────────────────────────────────────────────────────────────

async function onSessionEnd(
  agent: Agent,
  loader: SettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  // Same scoping as SessionStart: subagent teardown is not a Claude Code
  // SessionEnd.
  if (agent.session.header.delegationDepth !== undefined) return
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return
  const groups = settings.byEvent.get('SessionEnd')
  if (!groups || groups.length === 0) return
  try {
    // SessionEnd hooks run for side effects; their output is discarded.
    await runEventHooks(
      {
        event: 'SessionEnd',
        groups,
        matchedValue: 'other',
        input: { ...commonInput(agent, 'SessionEnd'), reason: 'other' },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        httpHookAllowedEnvVars: settings.httpHookAllowedEnvVars,
        allowedHttpHookUrls: settings.allowedHttpHookUrls,
        defaultTimeoutMs: SESSION_END_BUDGET_MS,
        onSpawn,
      },
      logger,
    )
  } catch (error) {
    logger.debug(`claude-code: SessionEnd hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── shared decision helpers ──────────────────────────────────────────────────

/** Top-level `decision: "block"`, exit code 2, or `continue: false`. */
export function resolveBlockDecision(outcomes: readonly HookOutcome[], maxChars: number): string | undefined {
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    if (outcome.exitCode === 2) {
      return firstNonEmpty(
        typeof outcome.output?.reason === 'string' ? outcome.output.reason : undefined,
        capString(outcome.stderr, maxChars),
        'blocked by a Claude Code hook',
      )
    }
    if (outcome.output?.decision === 'block') {
      return firstNonEmpty(outcome.output.reason, 'blocked by a Claude Code hook')
    }
    if (outcome.output?.continue === false) {
      return firstNonEmpty(outcome.output.stopReason, 'stopped by a Claude Code hook')
    }
  }
  return undefined
}

/** Context strings a hook supplies: JSON `additionalContext` plus, for the two
 * events Claude Code designates, exit-0 plain stdout. */
function collectHookContext(event: BridgedHookEvent, outcomes: readonly HookOutcome[], maxChars: number): string[] {
  const contexts: string[] = []
  const plainStdoutEvents = new Set(['SessionStart', 'UserPromptSubmit'])
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    const specific = outcome.output?.hookSpecificOutput?.additionalContext
    if (typeof specific === 'string' && specific.trim() !== '') contexts.push(specific)
    if (plainStdoutEvents.has(event) && outcome.exitCode === 0 && outcome.plainText !== null && outcome.plainText.trim() !== '') {
      contexts.push(outcome.plainText)
    }
  }
  return contexts.map((text) => capString(text, maxChars))
}

// ── message builders ─────────────────────────────────────────────────────────

function commonInput(agent: Agent, event: BridgedHookEvent): Record<string, unknown> {
  return {
    session_id: String(agent.session.id),
    cwd: agent.session.header.cwd,
    hook_event_name: event,
    permission_mode: 'default',
  }
}

function makeContextMessage(event: BridgedHookEvent, texts: string[], maxChars: number): UserMessage {
  const body = texts.map((text) => escapeReminderClose(capString(text, maxChars))).join('\n\n')
  const framed = `<system-reminder>\nClaude Code hook (${event}) added context:\n\n${body}\n</system-reminder>`
  return createUserMessage({ content: [{ type: 'text', text: framed }], source: { kind: 'plugin', plugin: HOOK_SOURCE } })
}

function makeBlockNotice(event: BridgedHookEvent, reason: string, maxChars: number): UserMessage {
  const text = `<system-reminder>\nA Claude Code hook (${event}) blocked the user's message before it reached you. The original message was erased. Block reason: ${escapeReminderClose(capString(reason, maxChars))}\n\nTell the user that their message was blocked and why, in one or two sentences.\n</system-reminder>`
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: HOOK_SOURCE } })
}

function makeContinueMessage(event: BridgedHookEvent, texts: string[], maxChars: number): UserMessage {
  const body = texts.map((text) => escapeReminderClose(capString(text, maxChars))).join('\n\n')
  const framed = `<system-reminder>\nA Claude Code hook (${event}) asked the agent to continue:\n\n${body}\n</system-reminder>`
  return createUserMessage({ content: [{ type: 'text', text: framed }], source: { kind: 'plugin', plugin: HOOK_SOURCE } })
}

// ── small helpers ────────────────────────────────────────────────────────────

function messageText(message: UserMessage): string {
  return message.content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function contentText(content: readonly ContentBlock[]): string {
  return content
    .filter((block): block is Extract<ContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function jsonObject(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {}
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value
  }
  return 'blocked by a Claude Code hook'
}
