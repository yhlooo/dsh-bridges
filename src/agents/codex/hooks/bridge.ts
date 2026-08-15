/**
 * Codex hook event mapping onto DSH lifecycles.
 *
 * | Codex event   | DSH seam                                   |
 * | ------------- | ------------------------------------------ |
 * | SessionStart  | `agent/session-start` (context injection)  |
 * | SubagentStart | `agent/session-start` (subagent context)   |
 * | UserPromptSubmit | `agent/pre-step` waterfall (block/context) |
 * | PreToolUse    | `tools/pre-execute` waterfall              |
 * | PostToolUse   | `tools/post-execute` waterfall             |
 * | Stop          | `agent/turn-stopping` (steer to continue)  |
 * | SubagentStop  | `agent/turn-stopping` on subagents         |
 * | SessionEnd    | `agent/disposed` (side effects only)       |
 *
 * Decisions map onto the DSH decision vocabulary where one exists:
 * `permissionDecision: "deny"` / `decision: "block"` / exit 2 block tool
 * calls and prompts; `decision: "block"` on PostToolUse replaces the tool
 * result with the hook feedback (as Codex does); `decision: "block"` on Stop
 * steers a continuation. Codex parses but does not support
 * `permissionDecision: "ask"`, so the bridge ignores it (fail open) like
 * Codex does. `updatedInput` rewriting is impossible in DSH (tool arguments
 * freeze before policy) and is logged. Not bridged: `PermissionRequest`,
 * `PreCompact`, `PostCompact` (no matching DSH seams), Codex's hook
 * trust-review flow, and background-hook output delivery.
 * @module dsh-bridges/agents/codex/hooks/bridge
 */
import type { ChildProcess } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { BridgeLogger } from '../../../util.js'
import { capString, escapeReminderClose, isPlainObject } from '../../../util.js'
import { CodexSettingsLoader } from '../settings.js'
import { codexToolName } from './names.js'
import { hookBlockMessage, runEventHooks } from './run.js'
import type { BridgedHookEvent, HookOutcome } from './types.js'

export interface HookBridgeConfig {
  hookTimeoutMs: number
  maxHookOutputChars: number
}

/** Codex documents no Stop-continuation cap; the bridge keeps a safety valve. */
const MAX_STOP_CONTINUATIONS = 8
/** Codex gives SessionEnd hooks a 1-second default budget (3 s max). */
const SESSION_END_BUDGET_MS = 1000

const HOOK_SOURCE = 'codex-hooks'

interface StopState {
  count: number
}

export function createHookBridge(
  ctx: Context,
  logger: BridgeLogger,
  loader: CodexSettingsLoader,
  config: HookBridgeConfig,
): void {
  const activeChildren = new Set<ChildProcess>()
  const stopStates = new Map<string, StopState>()
  const onSpawn = (child: ChildProcess) => {
    activeChildren.add(child)
    child.once('close', () => activeChildren.delete(child))
  }

  ctx.on('agent/session-start', (payload) => {
    const subagent = payload.agent.session.header.delegationDepth !== undefined
    void (subagent
      ? onSubagentStart(payload.agent, payload.source, loader, logger, config, onSpawn)
      : onSessionStart(payload.agent, payload.source, loader, logger, config, onSpawn))
  })

  ctx.on('agent/pre-step', (payload, next) => onUserPromptSubmit(payload.agent, payload.messages, payload.signal, stopStates, loader, logger, config, onSpawn, next))

  ctx.on('tools/pre-execute', (exec, next) => onPreToolUse(exec, loader, logger, config, onSpawn, next))

  ctx.on('tools/post-execute', (exec, result, next) => onPostToolUse(exec, result, loader, logger, config, onSpawn, next))

  ctx.on('agent/turn-stopping', (payload) => {
    const subagent = payload.agent.session.header.delegationDepth !== undefined
    void (subagent
      ? onSubagentStop(payload.agent, payload.signal, stopStates, loader, logger, config, onSpawn)
      : onStop(payload.agent, payload.signal, stopStates, loader, logger, config, onSpawn))
  })

  ctx.on('agent/disposed', (payload) => {
    void onSessionEnd(payload.agent, loader, logger, config, onSpawn)
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
  }, 'codex hook children')
}

// ── SessionStart / SubagentStart ─────────────────────────────────────────────

async function onSessionStart(
  agent: Agent,
  source: string,
  loader: CodexSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.hooksDisabled) return
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
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    // `continue: false` would end the turn without a model request; there is
    // no such seam at session start, so only context is delivered.
    const contexts = collectHookContext('SessionStart', outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('SessionStart', contexts, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`codex: SessionStart hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function onSubagentStart(
  agent: Agent,
  source: string,
  loader: CodexSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.hooksDisabled) return
  const groups = settings.byEvent.get('SubagentStart')
  if (!groups || groups.length === 0) return
  try {
    const outcomes = await runEventHooks(
      {
        event: 'SubagentStart',
        groups,
        matchedValue: agentType(agent),
        input: { ...commonInput(agent, 'SubagentStart'), agent_id: String(agent.session.id), agent_type: agentType(agent) },
        cwd: cwd ?? process.cwd(),
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const contexts = collectHookContext('SubagentStart', outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('SubagentStart', contexts, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`codex: SubagentStart hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── UserPromptSubmit ─────────────────────────────────────────────────────────

async function onUserPromptSubmit(
  agent: Agent,
  messages: readonly UserMessage[],
  signal: AbortSignal,
  stopStates: Map<string, StopState>,
  loader: CodexSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PreStepDecision>,
): Promise<PreStepDecision> {
  // Codex fires UserPromptSubmit in the main conversation's turns; subagents
  // get SubagentStart/SubagentStop instead.
  if (agent.session.header.delegationDepth !== undefined) return next()
  const userMessages = messages.filter((message) => message.role === 'user' && message.source.kind === 'user')
  if (userMessages.length === 0) return next()
  const prompt = userMessages.map(messageText).filter((text) => text !== '').join('\n')

  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.hooksDisabled) return next()
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
      // to the user through the model's reply (Codex blocks the prompt and
      // shows the reason; DSH has no non-model notice channel).
      return { kind: 'enter', messages: [makeBlockNotice('UserPromptSubmit', block, config.maxHookOutputChars)] }
    }
    const contexts = collectHookContext('UserPromptSubmit', outcomes, config.maxHookOutputChars)
    const decision = await next()
    if (contexts.length === 0 || decision.kind !== 'enter') return decision
    return { kind: 'enter', messages: [...decision.messages, makeContextMessage('UserPromptSubmit', contexts, config.maxHookOutputChars)] }
  } catch (error) {
    logger.warn(`codex: UserPromptSubmit hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

// ── PreToolUse ───────────────────────────────────────────────────────────────

async function onPreToolUse(
  exec: ToolExecution,
  loader: CodexSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PreToolDecision>,
): Promise<PreToolDecision> {
  const agent = exec.agent
  if (!agent) return next()
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.hooksDisabled) return next()
  const groups = settings.byEvent.get('PreToolUse')
  if (!groups || groups.length === 0) return next()

  try {
    const codexName = codexToolName(exec.name)
    const outcomes = await runEventHooks(
      {
        event: 'PreToolUse',
        groups,
        matchedValue: codexName,
        input: {
          ...commonInput(agent, 'PreToolUse'),
          tool_name: codexName,
          tool_input: codexToolInput(codexName, exec.arguments),
          tool_use_id: String(exec.callId),
        },
        cwd: cwd ?? process.cwd(),
        signal: exec.signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    for (const outcome of outcomes) {
      const updated = outcome.output?.hookSpecificOutput?.updatedInput
      if (updated !== undefined) {
        logger.warn('codex: a PreToolUse hook returned updatedInput; DSH freezes tool arguments before policy, so input rewriting is ignored')
      }
    }
    const contexts = collectHookContext('PreToolUse', outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('PreToolUse', contexts, config.maxHookOutputChars))
    const decision = resolvePreToolUse(outcomes, config.maxHookOutputChars)
    if (decision.kind === 'deny') return { kind: 'deny', reason: decision.reason }
    return next()
  } catch (error) {
    logger.warn(`codex: PreToolUse hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

export function resolvePreToolUse(outcomes: readonly HookOutcome[], maxChars: number): { kind: 'allow' } | { kind: 'deny'; reason: string } {
  // Deny wins; `ask` is parsed but not supported by Codex itself, so it is
  // ignored (the call continues). Timeouts and failures fail open.
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    const specific = outcome.output?.hookSpecificOutput
    if (outcome.exitCode === 2) {
      return { kind: 'deny', reason: firstNonEmpty(hookBlockMessage(outcome), capString(outcome.stderr, maxChars), 'blocked by a Codex hook') }
    }
    if (outcome.output?.decision === 'block') {
      return { kind: 'deny', reason: firstNonEmpty(outcome.output.reason, 'blocked by a Codex hook') }
    }
    if (specific?.permissionDecision === 'deny') {
      return { kind: 'deny', reason: firstNonEmpty(specific.permissionDecisionReason, 'denied by a Codex hook') }
    }
  }
  return { kind: 'allow' }
}

// ── PostToolUse ──────────────────────────────────────────────────────────────

async function onPostToolUse(
  exec: ToolExecution,
  result: Readonly<ToolExecutionResult>,
  loader: CodexSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PostToolDecision>,
): Promise<PostToolDecision> {
  const agent = exec.agent
  if (!agent) return next()
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.hooksDisabled) return next()
  const groups = settings.byEvent.get('PostToolUse')
  if (!groups || groups.length === 0) return next()

  try {
    const codexName = codexToolName(exec.name)
    const input: Record<string, unknown> = {
      ...commonInput(agent, 'PostToolUse'),
      tool_name: codexName,
      tool_input: codexToolInput(codexName, exec.arguments),
      tool_use_id: String(exec.callId),
      tool_response: result.isError
        ? { error: result.error.message }
        : { value: result.value, content: contentText(result.content) },
    }
    const outcomes = await runEventHooks(
      {
        event: 'PostToolUse',
        groups,
        matchedValue: codexName,
        input,
        cwd: cwd ?? process.cwd(),
        signal: exec.signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const post = resolvePostToolUse(outcomes, config.maxHookOutputChars)
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
    logger.warn(`codex: PostToolUse hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

function resolvePostToolUse(outcomes: readonly HookOutcome[], maxChars: number): { contexts: UserMessage[]; replacementContent?: ContentBlock[] } {
  const contextTexts: string[] = []
  let replacement: ContentBlock[] | undefined
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    const additional = outcome.output?.hookSpecificOutput?.additionalContext
    if (typeof additional === 'string' && additional.trim() !== '') contextTexts.push(additional)
    // Codex replaces the tool result with the hook feedback when a PostToolUse
    // hook blocks (decision: "block", exit 2, or continue: false).
    const blocked =
      outcome.output?.decision === 'block' ||
      outcome.exitCode === 2 ||
      (outcome.output?.continue === false && hookBlockMessage(outcome) !== undefined)
    if (blocked) {
      replacement = [
        {
          type: 'text',
          text: firstNonEmpty(hookBlockMessage(outcome), capString(outcome.stderr, maxChars), 'blocked by a Codex hook'),
        },
      ]
    }
  }
  const contexts = contextTexts.length > 0 ? [makeContextMessage('PostToolUse', contextTexts, maxChars)] : []
  return { contexts, replacementContent: replacement }
}

// ── Stop / SubagentStop ──────────────────────────────────────────────────────

async function onStop(
  agent: Agent,
  signal: AbortSignal,
  stopStates: Map<string, StopState>,
  loader: CodexSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.hooksDisabled) return
  const groups = settings.byEvent.get('Stop')
  if (!groups || groups.length === 0) return
  const state = stopStates.get(agent.session.id) ?? { count: 0 }
  if (state.count >= MAX_STOP_CONTINUATIONS) return // bridge-side safety valve

  try {
    const outcomes = await runEventHooks(
      {
        event: 'Stop',
        groups,
        input: { ...commonInput(agent, 'Stop'), stop_hook_active: state.count > 0 },
        cwd: cwd ?? process.cwd(),
        signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    // Codex: `decision: "block"` / exit 2 steers a continuation whose prompt
    // is the hook's reason; `continue: false` wins over continuation and
    // stops the turn (the bridge then does nothing).
    const stop = resolveStopDecision(outcomes)
    if (stop === undefined) return
    stopStates.set(agent.session.id, { count: state.count + 1 })
    agent.steer(makeContinueMessage('Stop', stop, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`codex: Stop hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function onSubagentStop(
  agent: Agent,
  signal: AbortSignal,
  stopStates: Map<string, StopState>,
  loader: CodexSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.hooksDisabled) return
  const groups = settings.byEvent.get('SubagentStop')
  if (!groups || groups.length === 0) return
  const state = stopStates.get(agent.session.id) ?? { count: 0 }
  if (state.count >= MAX_STOP_CONTINUATIONS) return

  try {
    const outcomes = await runEventHooks(
      {
        event: 'SubagentStop',
        groups,
        matchedValue: agentType(agent),
        input: { ...commonInput(agent, 'SubagentStop'), agent_id: String(agent.session.id), agent_type: agentType(agent), stop_hook_active: state.count > 0 },
        cwd: cwd ?? process.cwd(),
        signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const stop = resolveStopDecision(outcomes)
    if (stop === undefined) return
    stopStates.set(agent.session.id, { count: state.count + 1 })
    agent.steer(makeContinueMessage('SubagentStop', stop, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`codex: SubagentStop hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/** The continuation text a Stop/SubagentStop run asks for, or undefined. */
export function resolveStopDecision(outcomes: readonly HookOutcome[]): string | undefined {
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    if (outcome.output?.continue === false) return undefined // explicit stop wins
  }
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    if (outcome.output?.decision === 'block') {
      return firstNonEmpty(outcome.output.reason, 'continue per a Codex hook')
    }
    if (outcome.exitCode === 2) {
      return firstNonEmpty(hookBlockMessage(outcome), outcome.stderr, 'continue per a Codex hook')
    }
  }
  return undefined
}

// ── SessionEnd ───────────────────────────────────────────────────────────────

async function onSessionEnd(
  agent: Agent,
  loader: CodexSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  // Codex runs SessionEnd only for the main thread.
  if (agent.session.header.delegationDepth !== undefined) return
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  if (settings.hooksDisabled) return
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
        defaultTimeoutMs: SESSION_END_BUDGET_MS,
        onSpawn,
      },
      logger,
    )
  } catch (error) {
    logger.debug(`codex: SessionEnd hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── shared decision helpers ──────────────────────────────────────────────────

/**
 * The blocking reason of a prompt-level run: top-level `decision: "block"`,
 * exit code 2, or `continue: false` with a reason.
 */
export function resolveBlockDecision(outcomes: readonly HookOutcome[], maxChars: number): string | undefined {
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    if (outcome.output?.decision === 'block') {
      return firstNonEmpty(outcome.output.reason, 'blocked by a Codex hook')
    }
    if (outcome.exitCode === 2) {
      return firstNonEmpty(hookBlockMessage(outcome), capString(outcome.stderr, maxChars), 'blocked by a Codex hook')
    }
    if (outcome.output?.continue === false) {
      return firstNonEmpty(outcome.output.stopReason, 'stopped by a Codex hook')
    }
  }
  return undefined
}

/** Context strings a hook supplies: JSON `additionalContext` plus, for the
 * events Codex designates, exit-0 plain stdout. */
function collectHookContext(event: BridgedHookEvent, outcomes: readonly HookOutcome[], maxChars: number): string[] {
  const contexts: string[] = []
  const plainStdoutEvents = new Set(['SessionStart', 'UserPromptSubmit', 'SubagentStart'])
  for (const outcome of outcomes) {
    if (!outcome.ran || outcome.detached) continue
    const additional = outcome.output?.hookSpecificOutput?.additionalContext
    if (typeof additional === 'string' && additional.trim() !== '') contexts.push(additional)
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
  const framed = `<system-reminder>\nCodex hook (${event}) added context:\n\n${body}\n</system-reminder>`
  return createUserMessage({ content: [{ type: 'text', text: framed }], source: { kind: 'plugin', plugin: HOOK_SOURCE } })
}

function makeBlockNotice(event: BridgedHookEvent, reason: string, maxChars: number): UserMessage {
  const text = `<system-reminder>\nA Codex hook (${event}) blocked the user's message before it reached you. The original message was erased. Block reason: ${escapeReminderClose(capString(reason, maxChars))}\n\nTell the user that their message was blocked and why, in one or two sentences.\n</system-reminder>`
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: HOOK_SOURCE } })
}

function makeContinueMessage(event: BridgedHookEvent, reason: string, maxChars: number): UserMessage {
  const framed = `<system-reminder>\nA Codex hook (${event}) asked the agent to continue: ${escapeReminderClose(capString(reason, maxChars))}\n</system-reminder>`
  return createUserMessage({ content: [{ type: 'text', text: framed }], source: { kind: 'plugin', plugin: HOOK_SOURCE } })
}

// ── small helpers ────────────────────────────────────────────────────────────

/** Codex's `tool_input` shape: `{ command }` for Bash/apply_patch, the raw arguments otherwise. */
function codexToolInput(toolName: string, args: unknown): unknown {
  if ((toolName === 'Bash' || toolName === 'apply_patch') && isPlainObject(args) && typeof args['command'] === 'string') {
    return { command: args['command'] }
  }
  return args
}

function agentType(agent: Agent): string {
  const preset = agent.session.header.agentPreset
  return typeof preset === 'string' && preset.trim() !== '' ? preset : 'subagent'
}

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

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value
  }
  return 'blocked by a Codex hook'
}
