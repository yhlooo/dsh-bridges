/**
 * CodeBuddy Code hook event mapping onto DSH lifecycles.
 *
 * | CodeBuddy Code event | DSH seam                                   |
 * | -------------------- | ------------------------------------------ |
 * | SessionStart         | `agent/session-start` (context injection)  |
 * | UserPromptSubmit     | `agent/pre-step` waterfall (block/context) |
 * | PreToolUse           | `tools/pre-execute` waterfall              |
 * | PostToolUse          | `tools/post-execute` waterfall (success)   |
 * | PostToolUseFailure   | `tools/post-execute` waterfall (failure)   |
 * | Stop                 | `agent/turn-stopping` (steer to continue)  |
 * | SessionEnd           | `agent/disposed` (side effects only)       |
 *
 * Decisions map onto the DSH decision vocabulary where one exists; where it
 * does not (input rewriting via `modifiedInput`, tool-output replacement with
 * typed values, `suppressOutput`/`systemMessage` user-only channels), the
 * closest safe behavior is chosen and logged. Subagents are excluded from
 * `UserPromptSubmit`, `Stop`, `SessionStart`, and `SessionEnd`, which
 * CodeBuddy Code keeps for the main conversation (its `SubagentStop` event is
 * not bridged yet). Blocking messages follow CodeBuddy Code's stdout-first
 * priority (JSON `reason`/`stopReason`, plain stdout, then stderr).
 * @module dsh-bridges/agents/codebuddy-code/hooks/bridge
 */
import type { ChildProcess } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { BridgeLogger } from '../../../util.js'
import { capString, escapeReminderClose, isPlainObject } from '../../../util.js'
import { CodebuddySettingsLoader } from '../settings.js'
import { codebuddyToolName } from './names.js'
import { hookBlockMessage, runEventHooks } from './run.js'
import type { BridgedHookEvent, HookOutcome, MatcherGroup } from './types.js'

export interface HookBridgeConfig {
  hookTimeoutMs: number
  maxHookOutputChars: number
}

/**
 * The bridge caps Stop-hook continuations at 8 consecutive steerings per
 * fresh prompt; CodeBuddy Code documents no cap (its prompt-based `/goal`
 * loop carries its own accounting), so the cap is a bridge-side safety valve.
 */
const MAX_STOP_CONTINUATIONS = 8
/** SessionEnd hooks run under a short shared budget because `agent/disposed` allows little work. */
const SESSION_END_BUDGET_MS = 1500

const HOOK_SOURCE = 'codebuddy-code-hooks'

interface StopState {
  count: number
}

export function createHookBridge(
  ctx: Context,
  logger: BridgeLogger,
  loader: CodebuddySettingsLoader,
  config: HookBridgeConfig,
): void {
  const activeChildren = new Set<ChildProcess>()
  const stopStates = new Map<string, StopState>()
  const onceStates = new Map<string, Set<string>>()
  const onSpawn = (child: ChildProcess) => {
    activeChildren.add(child)
    child.once('close', () => activeChildren.delete(child))
  }

  ctx.on('agent/session-start', (payload) => {
    void onSessionStart(payload.agent, payload.source, loader, logger, config, onSpawn)
  })

  ctx.on('agent/pre-step', (payload, next) => onUserPromptSubmit(payload.agent, payload.messages, payload.signal, stopStates, loader, logger, config, onSpawn, next))

  ctx.on('tools/pre-execute', (exec, next) => onPreToolUse(exec, onceStates, loader, logger, config, onSpawn, next))

  ctx.on('tools/post-execute', (exec, result, next) => onPostToolUse(exec, result, onceStates, loader, logger, config, onSpawn, next))

  ctx.on('agent/turn-stopping', (payload) => onStop(payload.agent, payload.signal, stopStates, onceStates, loader, logger, config, onSpawn))

  ctx.on('agent/disposed', (payload) => {
    void onSessionEnd(payload.agent, onceStates, loader, logger, config, onSpawn)
  })

  ctx.effect(() => () => {
    for (const child of activeChildren) {
      try {
        child.kill('SIGTERM')
      } catch {
        // already gone
      }
    }
    activeChildren.clear()
  }, 'codebuddy-code hook children')
}

// ── SessionStart ─────────────────────────────────────────────────────────────

async function onSessionStart(
  agent: Agent,
  source: string,
  loader: CodebuddySettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  // Subagents have their own lifecycle events in CodeBuddy Code
  // (SubagentStart/SubagentStop, not bridged); SessionStart is the main
  // conversation's.
  if (agent.session.header.delegationDepth !== undefined) return
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
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const contexts = collectHookContext('SessionStart', outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('SessionStart', contexts, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`codebuddy-code: SessionStart hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── UserPromptSubmit ─────────────────────────────────────────────────────────

async function onUserPromptSubmit(
  agent: Agent,
  messages: readonly UserMessage[],
  signal: AbortSignal,
  stopStates: Map<string, StopState>,
  loader: CodebuddySettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision> {
  // CodeBuddy Code keeps UserPromptSubmit for the main conversation;
  // subagents get SubagentStop etc. (not bridged yet).
  if (agent.session.header.delegationDepth !== undefined) return next()
  const userMessages = messages.filter((message) => message.role === 'user' && message.source.kind === 'user')
  if (userMessages.length === 0) return next()
  const prompt = userMessages.map(messageText).filter((text) => text !== '').join('\n')

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
        signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const block = resolveBlockDecision(outcomes, config.maxHookOutputChars)
    if (block !== undefined) {
      // The claimed prompt is erased — it never reaches the model — and the
      // step enters with the block notice instead, so the reason is visible
      // to the user through the model's reply. CodeBuddy Code erases the
      // prompt and shows the reason; DSH has no non-model notice channel, so
      // the reason rides the entering step.
      return { kind: 'enter', messages: [makeBlockNotice('UserPromptSubmit', block, config.maxHookOutputChars)] }
    }
    const contexts = collectHookContext('UserPromptSubmit', outcomes, config.maxHookOutputChars)
    const decision = await next()
    if (contexts.length === 0 || decision.kind !== 'enter') return decision
    return { kind: 'enter', messages: [...decision.messages, makeContextMessage('UserPromptSubmit', contexts, config.maxHookOutputChars)] }
  } catch (error) {
    logger.warn(`codebuddy-code: UserPromptSubmit hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

// ── PreToolUse ───────────────────────────────────────────────────────────────

async function onPreToolUse(
  exec: ToolExecution,
  onceStates: Map<string, Set<string>>,
  loader: CodebuddySettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  const agent = exec.agent
  if (!agent) return next()
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return next()
  const groups = settings.byEvent.get('PreToolUse')
  if (!groups || groups.length === 0) return next()

  const sessionId = agent.session.id
  const eligible = pruneOnce(groups, sessionId, onceStates)
  if (eligible.length === 0) return next()

  try {
    const codebuddyName = codebuddyToolName(exec.name)
    const outcomes = await runEventHooks(
      {
        event: 'PreToolUse',
        groups: eligible,
        matchedValue: codebuddyName,
        input: {
          ...commonInput(agent, 'PreToolUse'),
          tool_name: codebuddyName,
          tool_input: jsonObject(exec.arguments),
        },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        signal: exec.signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    recordOnce(outcomes, sessionId, onceStates)
    for (const outcome of outcomes) {
      const modified = outcome.output?.hookSpecificOutput?.modifiedInput
      if (modified !== undefined) {
        logger.warn('codebuddy-code: a PreToolUse hook returned modifiedInput; DSH freezes tool arguments before policy, so input rewriting is ignored')
      }
    }
    const contexts = collectHookContext('PreToolUse', outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('PreToolUse', contexts, config.maxHookOutputChars))
    const decision = resolvePreToolUse(outcomes, config.maxHookOutputChars)
    if (decision.kind === 'deny') return { kind: 'deny', reason: decision.reason }
    if (decision.kind === 'ask') return { kind: 'ask', reason: decision.reason }
    return next()
  } catch (error) {
    logger.warn(`codebuddy-code: PreToolUse hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

export function resolvePreToolUse(
  outcomes: readonly HookOutcome[],
  maxChars: number,
): { kind: 'allow' } | { kind: 'deny'; reason: string } | { kind: 'ask'; reason?: string } {
  // Precedence: deny > ask > allow; timeouts and failures fail open.
  let ask: { kind: 'ask'; reason?: string } | undefined
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    const specific = outcome.output?.hookSpecificOutput
    const decision = specific?.permissionDecision
    if (outcome.exitCode === 2) {
      return { kind: 'deny', reason: firstNonEmpty(hookBlockMessage(outcome), capString(outcome.stderr, maxChars), 'blocked by a CodeBuddy Code hook') }
    }
    if (decision === 'deny') {
      return { kind: 'deny', reason: firstNonEmpty(specific?.permissionDecisionReason, hookBlockMessage(outcome), 'denied by a CodeBuddy Code hook') }
    }
    if (decision === 'ask') ask = { kind: 'ask', reason: specific?.permissionDecisionReason }
    if (outcome.output?.continue === false) {
      return { kind: 'deny', reason: firstNonEmpty(outcome.output.stopReason, outcome.output.reason, 'stopped by a CodeBuddy Code hook') }
    }
  }
  if (ask) return ask
  return { kind: 'allow' }
}

// ── PostToolUse / PostToolUseFailure ────────────────────────────────────────

interface ResolvedPost {
  contexts: UserMessage[]
  replacementContent?: ContentBlock[]
}

async function onPostToolUse(
  exec: ToolExecution,
  result: Readonly<ToolExecutionResult>,
  onceStates: Map<string, Set<string>>,
  loader: CodebuddySettingsLoader,
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

  const sessionId = agent.session.id
  const eligible = pruneOnce(groups, sessionId, onceStates)
  if (eligible.length === 0) return next()

  try {
    const codebuddyName = codebuddyToolName(exec.name)
    const input: Record<string, unknown> = {
      ...commonInput(agent, event),
      tool_name: codebuddyName,
      tool_input: jsonObject(exec.arguments),
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
        groups: eligible,
        matchedValue: codebuddyName,
        input,
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        signal: exec.signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    recordOnce(outcomes, sessionId, onceStates)
    const post = resolvePostToolUse(event, outcomes, config.maxHookOutputChars)
    const downstream = await next()
    if (post.contexts.length === 0 && post.replacementContent === undefined) return downstream
    if (downstream.kind === 'block') {
      return { kind: 'block', feedback: downstream.feedback, additionalContexts: [...(downstream.additionalContexts ?? []), ...post.contexts] }
    }
    const base = { kind: 'accept' as const, additionalContexts: [...(downstream.additionalContexts ?? []), ...post.contexts] }
    if (post.replacementContent !== undefined && downstream.value === undefined) {
      return { ...base, content: post.replacementContent }
    }
    if (downstream.content !== undefined) return { ...base, content: downstream.content }
    if (downstream.value !== undefined) return { ...base, value: downstream.value }
    return base
  } catch (error) {
    logger.warn(`codebuddy-code: ${event} hooks failed: ${error instanceof Error ? error.message : String(error)}`)
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
    if (outcome.exitCode === 2) {
      // CodeBuddy Code shows the exit-2 message to the agent next to the tool
      // result (stdout-first priority); the bridge delivers it as context.
      const message = hookBlockMessage(outcome)
      if (message !== undefined) contextTexts.push(message)
    }
    if (outcome.output?.decision === 'block' && typeof outcome.output.reason === 'string') {
      // Deprecated in CodeBuddy Code (use continue: false) but still honored.
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
  onceStates: Map<string, Set<string>>,
  loader: CodebuddySettingsLoader,
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
  if (state.count >= MAX_STOP_CONTINUATIONS) return // bridge safety cap

  const sessionId = agent.session.id
  const eligible = pruneOnce(groups, sessionId, onceStates)
  if (eligible.length === 0) return

  try {
    const outcomes = await runEventHooks(
      {
        event: 'Stop',
        groups: eligible,
        input: { ...commonInput(agent, 'Stop'), stop_hook_active: state.count > 0 },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    recordOnce(outcomes, sessionId, onceStates)
    const block = resolveBlockDecision(outcomes, config.maxHookOutputChars)
    const contexts = collectHookContext('Stop', outcomes, config.maxHookOutputChars)
    const feedback = [...(block !== undefined ? [block] : []), ...contexts]
    if (feedback.length === 0) return
    stopStates.set(agent.session.id, { count: state.count + 1 })
    agent.steer(makeContinueMessage('Stop', feedback, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`codebuddy-code: Stop hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── SessionEnd ───────────────────────────────────────────────────────────────

async function onSessionEnd(
  agent: Agent,
  onceStates: Map<string, Set<string>>,
  loader: CodebuddySettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  // Same scoping as SessionStart: subagent teardown is not a CodeBuddy Code
  // SessionEnd.
  if (agent.session.header.delegationDepth !== undefined) return
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.disabled) return
  const groups = settings.byEvent.get('SessionEnd')
  if (!groups || groups.length === 0) return
  const sessionId = agent.session.id
  const eligible = pruneOnce(groups, sessionId, onceStates)
  if (eligible.length === 0) return
  try {
    // SessionEnd hooks run for side effects; their output is discarded.
    const outcomes = await runEventHooks(
      {
        event: 'SessionEnd',
        groups: eligible,
        matchedValue: 'other',
        input: { ...commonInput(agent, 'SessionEnd'), reason: 'other' },
        cwd: cwd ?? process.cwd(),
        projectDir: cwd ?? process.cwd(),
        env: settings.env,
        defaultTimeoutMs: SESSION_END_BUDGET_MS,
        onSpawn,
      },
      logger,
    )
    recordOnce(outcomes, sessionId, onceStates)
  } catch (error) {
    logger.debug(`codebuddy-code: SessionEnd hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── `once` handler bookkeeping ──────────────────────────────────────────────

/** Drop handlers whose `once: true` already ran in this session. */
function pruneOnce(groups: readonly MatcherGroup[], sessionId: string, onceStates: Map<string, Set<string>>): MatcherGroup[] {
  const fired = onceStates.get(sessionId)
  if (!fired || fired.size === 0) return [...groups]
  const pruned: MatcherGroup[] = []
  for (const group of groups) {
    const hooks = group.hooks.filter((handler) => !(handler.once === true && fired.has(JSON.stringify(handler))))
    if (hooks.length > 0) pruned.push({ matcher: group.matcher, hooks })
  }
  return pruned
}

/** Remember which `once` handlers actually ran, so later events skip them. */
function recordOnce(outcomes: readonly HookOutcome[], sessionId: string, onceStates: Map<string, Set<string>>): void {
  let fired = onceStates.get(sessionId)
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.handler.once !== true) continue
    fired ??= new Set()
    fired.add(JSON.stringify(outcome.handler))
  }
  if (fired) onceStates.set(sessionId, fired)
}

// ── shared decision helpers ──────────────────────────────────────────────────

/** Top-level `continue: false` / legacy `decision: "block"`, or exit code 2. */
export function resolveBlockDecision(outcomes: readonly HookOutcome[], maxChars: number): string | undefined {
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    if (outcome.exitCode === 2) {
      return firstNonEmpty(
        hookBlockMessage(outcome),
        capString(outcome.stderr, maxChars),
        'blocked by a CodeBuddy Code hook',
      )
    }
    if (outcome.output?.continue === false) {
      return firstNonEmpty(outcome.output.stopReason, outcome.output.reason, 'stopped by a CodeBuddy Code hook')
    }
    if (outcome.output?.decision === 'block') {
      return firstNonEmpty(outcome.output.reason, 'blocked by a CodeBuddy Code hook')
    }
  }
  return undefined
}

/** Context strings a hook supplies: JSON `additionalContext` plus, for the two
 * events CodeBuddy Code designates, exit-0 plain stdout. */
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
  const framed = `<system-reminder>\nCodeBuddy Code hook (${event}) added context:\n\n${body}\n</system-reminder>`
  return createUserMessage({ content: [{ type: 'text', text: framed }], source: { kind: 'plugin', plugin: HOOK_SOURCE } })
}

function makeBlockNotice(event: BridgedHookEvent, reason: string, maxChars: number): UserMessage {
  const text = `<system-reminder>\nA CodeBuddy Code hook (${event}) blocked the user's message before it reached you. The original message was erased. Block reason: ${escapeReminderClose(capString(reason, maxChars))}\n\nTell the user that their message was blocked and why, in one or two sentences.\n</system-reminder>`
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: HOOK_SOURCE } })
}

function makeContinueMessage(event: BridgedHookEvent, texts: string[], maxChars: number): UserMessage {
  const body = texts.map((text) => escapeReminderClose(capString(text, maxChars))).join('\n\n')
  const framed = `<system-reminder>\nA CodeBuddy Code hook (${event}) asked the agent to continue:\n\n${body}\n</system-reminder>`
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
  return 'blocked by a CodeBuddy Code hook'
}
