/**
 * Gemini CLI hook bridging: settings.json `hooks` → DSH lifecycles.
 *
 * Event mapping (main sessions only for the session-level events; tool
 * events also run for subagent tool calls, like the other bridges):
 *
 * | Gemini event | DSH seam | Decision mapping |
 * | :--- | :--- | :--- |
 * | `SessionStart` | `agent/session-start` | `additionalContext` (and non-JSON stdout) injected before the first prompt |
 * | `SessionEnd` | `agent/disposed` | side effects only (short budget) |
 * | `BeforeAgent` | `agent/pre-step` | `decision: "deny"` / exit 2 erase the prompt and show the reason; `continue: false` maps to the same (DSH cannot save-but-block); `additionalContext` is appended |
 * | `AfterAgent` | `agent/turn-stopping` | `decision: "deny"` / exit 2 steer a retry (capped at 8); `additionalContext` is injected; `continue: false` has no halt seam (warning) |
 * | `BeforeTool` | `tools/pre-execute` | `decision: "deny"` / exit 2 → deny with reason; `additionalContext` injected; `tool_input` rewriting and `continue: false` are not supported (DSH freezes tool arguments) |
 * | `AfterTool` | `tools/post-execute` | `decision: "deny"` / exit 2 replace the rendered result with the reason; `additionalContext` appended |
 *
 * Not bridged (no DSH seam): `BeforeModel`, `AfterModel`,
 * `BeforeToolSelection`, `PreCompress`, `Notification`.
 *
 * Handler semantics: command hooks only; stdin JSON, stdout must be the final
 * JSON object (non-JSON stdout fails open and becomes a systemMessage);
 * exit 2 blocks with stderr as the reason; timeouts and failures fail open.
 * @module dsh-bridges/agents/gemini-cli/hooks/bridge
 */
import type { ChildProcess } from 'node:child_process'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage, type ContentBlock, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { composePreToolDecision, type HookToolDecision, type PermissionEvaluator } from '../../../permissions/compose.js'
import type { BridgeLogger } from '../../../util.js'
import { capString, escapeReminderClose } from '../../../util.js'
import type { GeminiSettingsLoader } from '../settings.js'
import { geminiToolName } from './names.js'
import { runEventHooks } from './run.js'
import type { BridgedHookEvent, HookOutcome } from './types.js'

const HOOK_SOURCE = 'gemini-cli-hooks'
/** Gemini caps AfterAgent retry hooks via stop_hook_active; DSH steers cap at 8. */
const MAX_CONTINUATIONS = 8

export interface HookBridgeConfig {
  hookTimeoutMs: number
  maxHookOutputChars: number
}

export function createHookBridge(
  ctx: Context,
  logger: BridgeLogger,
  loader: GeminiSettingsLoader,
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
    'gemini-cli hook children',
  )

  const continuations = new Map<string, number>()
  ctx.on('agent/session-start', () => {
    continuations.clear()
  })

  ctx.on('agent/session-start', (payload) => {
    if (payload.source === 'resume') return
    const agent = payload.agent
    if (isSubagent(agent)) return // SessionStart runs on main sessions only
    void onSessionStart(agent, payload.source, loader, logger, config, onSpawn)
  })

  ctx.on('agent/disposed', (payload) => {
    const agent = payload.agent
    if (isSubagent(agent)) return
    void onSessionEnd(agent, loader, logger, config, onSpawn)
  })

  ctx.on('agent/pre-step', (payload, next) => {
    const agent = payload.agent
    if (isSubagent(agent)) return next()
    return onBeforeAgent(payload.agent, payload.messages, loader, logger, config, onSpawn, next)
  })

  ctx.on('tools/pre-execute', (exec, next) => {
    return onBeforeTool(exec, loader, logger, config, onSpawn, permissionEvaluator, next)
  })

  ctx.on('tools/post-execute', (exec, result, next) => {
    return onAfterTool(exec, result, loader, logger, config, onSpawn, next)
  })

  ctx.on('agent/turn-stopping', (payload) => {
    const agent = payload.agent
    if (isSubagent(agent)) return
    void onAfterAgent(agent, loader, logger, config, onSpawn, continuations)
  })
}

function isSubagent(agent: Agent): boolean {
  return agent.session.header.delegationDepth !== undefined
}

function commonInput(agent: Agent, event: BridgedHookEvent): Record<string, unknown> {
  return {
    session_id: String(agent.session.id ?? ''),
    transcript_path: '', // DSH has no transcript file to point at (limitation)
    cwd: agent.session.header.cwd ?? process.cwd(),
    hook_event_name: event,
    timestamp: new Date().toISOString(),
  }
}

function jsonObject(value: unknown): unknown {
  if (value === null || value === undefined) return {}
  if (typeof value === 'object') return value
  return { value }
}

// ── SessionStart ─────────────────────────────────────────────────────────────

async function onSessionStart(
  agent: Agent,
  source: string,
  loader: GeminiSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  const groups = settings.byEvent.get('SessionStart')
  if (!groups || groups.length === 0) return
  try {
    const outcomes = await runEventHooks(
      {
        event: 'SessionStart',
        groups,
        matchedValue: source,
        input: { ...commonInput(agent, 'SessionStart'), session_start_source: source },
        cwd: cwd ?? process.cwd(),
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const contexts = collectContextTexts(outcomes, config.maxHookOutputChars)
    if (contexts.length > 0) agent.inject(makeContextMessage('SessionStart', contexts, config.maxHookOutputChars))
  } catch (error) {
    logger.warn(`gemini-cli: SessionStart hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── SessionEnd ───────────────────────────────────────────────────────────────

async function onSessionEnd(
  agent: Agent,
  loader: GeminiSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  const groups = settings.byEvent.get('SessionEnd')
  if (!groups || groups.length === 0) return
  try {
    const signal = AbortSignal.timeout(1500) // side effects only; short budget
    await runEventHooks(
      {
        event: 'SessionEnd',
        groups,
        matchedValue: undefined,
        input: { ...commonInput(agent, 'SessionEnd') },
        cwd: cwd ?? process.cwd(),
        signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
  } catch (error) {
    logger.warn(`gemini-cli: SessionEnd hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── BeforeAgent (agent/pre-step) ─────────────────────────────────────────────

async function onBeforeAgent(
  agent: Agent,
  messages: readonly UserMessage[],
  loader: GeminiSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<{ kind: 'enter'; messages: UserMessage[] } | { kind: 'reject' }>,
): Promise<{ kind: 'enter'; messages: UserMessage[] } | { kind: 'reject' }> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  const groups = settings.byEvent.get('BeforeAgent')
  if (!groups || groups.length === 0) return next()
  try {
    const prompt = messages.map((message) => message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')).join('\n')
    const outcomes = await runEventHooks(
      {
        event: 'BeforeAgent',
        groups,
        matchedValue: undefined, // lifecycle event: only `*`/empty matchers run
        input: { ...commonInput(agent, 'BeforeAgent'), prompt },
        cwd: cwd ?? process.cwd(),
        signal: undefined,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const block = resolveBlock(outcomes, config.maxHookOutputChars)
    if (block !== undefined) {
      // Erase the prompt and surface the reason — the same visible-channel
      // approach as the other bridges (DSH has no save-message-but-block).
      return { kind: 'enter', messages: [makeBlockNotice('BeforeAgent', block, config.maxHookOutputChars)] }
    }
    const contexts = collectContextTexts(outcomes, config.maxHookOutputChars)
    if (contexts.length === 0) return next()
    const decision = await next()
    if (decision.kind === 'reject') return decision
    return { kind: 'enter', messages: [...decision.messages, makeContextMessage('BeforeAgent', contexts, config.maxHookOutputChars)] }
  } catch (error) {
    logger.warn(`gemini-cli: BeforeAgent hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

// ── AfterAgent (agent/turn-stopping) ─────────────────────────────────────────

async function onAfterAgent(
  agent: Agent,
  loader: GeminiSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  continuations: Map<string, number>,
): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  const groups = settings.byEvent.get('AfterAgent')
  if (!groups || groups.length === 0) return
  const agentId = String(agent.session.id ?? '')
  const count = continuations.get(agentId) ?? 0
  if (count >= MAX_CONTINUATIONS) {
    logger.warn('gemini-cli: AfterAgent hook retry cap reached; not steering again')
    return
  }
  try {
    const outcomes = await runEventHooks(
      {
        event: 'AfterAgent',
        groups,
        matchedValue: undefined,
        // DSH does not expose the final response text at turn-stopping;
        // hooks that need it see empty strings (limitation).
        input: { ...commonInput(agent, 'AfterAgent'), prompt: '', prompt_response: '', stop_hook_active: count > 0 },
        cwd: cwd ?? process.cwd(),
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const block = resolveBlock(outcomes, config.maxHookOutputChars)
    const contexts = collectContextTexts(outcomes, config.maxHookOutputChars)
    if (block !== undefined) {
      continuations.set(agentId, count + 1)
      agent.steer(makeContinueMessage('AfterAgent', block, config.maxHookOutputChars))
      return
    }
    if (contexts.length > 0) {
      agent.steer(makeContextMessage('AfterAgent', contexts, config.maxHookOutputChars))
    }
  } catch (error) {
    logger.warn(`gemini-cli: AfterAgent hooks failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// ── BeforeTool (tools/pre-execute) ───────────────────────────────────────────

interface ResolvedPreTool {
  decision?: HookToolDecision
  contexts: string[]
}

async function onBeforeTool(
  exec: ToolExecution,
  loader: GeminiSettingsLoader,
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
  const groups = settings.byEvent.get('BeforeTool')
  if (!groups || groups.length === 0) return next()
  try {
    const name = geminiToolName(exec.name)
    const outcomes = await runEventHooks(
      {
        event: 'BeforeTool',
        groups,
        matchedValue: name,
        input: { ...commonInput(agent, 'BeforeTool'), tool_name: name, tool_input: jsonObject(exec.arguments) },
        cwd: cwd ?? process.cwd(),
        signal: exec.signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const resolved = resolvePreTool(outcomes, logger, config.maxHookOutputChars)
    if (resolved.contexts.length > 0) {
      agent.inject(makeContextMessage('BeforeTool', resolved.contexts, config.maxHookOutputChars))
    }
    return composePreToolDecision(permissionEvaluator, exec, resolved.decision, logger, next)
  } catch (error) {
    logger.warn(`gemini-cli: BeforeTool hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

function resolvePreTool(outcomes: HookOutcome[], logger: BridgeLogger, maxChars: number): ResolvedPreTool {
  let allow = false
  const contexts: string[] = []
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    const specific = outcome.output?.hookSpecificOutput
    if (specific?.tool_input !== undefined) {
      logger.warn('gemini-cli: hookSpecificOutput.tool_input rewriting is not supported (DSH freezes tool arguments); ignored')
    }
    if (outcome.exitCode === 2) {
      return {
        decision: {
          kind: 'deny',
          reason: firstNonEmpty(outcome.output?.reason, capString(outcome.stderr, maxChars), 'blocked by a Gemini CLI hook'),
        },
        contexts,
      }
    }
    const decision = outcome.output?.decision
    if (decision === 'deny' || decision === 'block') {
      return {
        decision: {
          kind: 'deny',
          reason: firstNonEmpty(outcome.output?.reason, capString(outcome.stderr, maxChars), 'denied by a Gemini CLI hook'),
        },
        contexts,
      }
    }
    if (outcome.output?.continue === false) {
      logger.warn('gemini-cli: hook continue=false would kill the agent loop; DSH has no halt seam — denying the tool instead')
      return { decision: { kind: 'deny', reason: firstNonEmpty(outcome.output?.stopReason, 'stopped by a Gemini CLI hook') }, contexts }
    }
    if (decision === 'allow') allow = true
    const context = outcome.output?.systemMessage ?? specific?.additionalContext
    if (typeof context === 'string' && context.trim() !== '') contexts.push(context)
  }
  if (allow) return { decision: { kind: 'allow' }, contexts }
  return { decision: undefined, contexts }
}

// ── AfterTool (tools/post-execute) ───────────────────────────────────────────

interface ResolvedPost {
  contexts: UserMessage[]
  replacement?: string
}

async function onAfterTool(
  exec: ToolExecution,
  result: Readonly<ToolExecutionResult>,
  loader: GeminiSettingsLoader,
  logger: BridgeLogger,
  config: HookBridgeConfig,
  onSpawn: (child: ChildProcess) => void,
  next: () => Promise<PostToolDecision>,
): Promise<PostToolDecision> {
  const agent = exec.agent
  if (!agent) return next()
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  const groups = settings.byEvent.get('AfterTool')
  if (!groups || groups.length === 0) return next()
  try {
    const name = geminiToolName(exec.name)
    const input: Record<string, unknown> = {
      ...commonInput(agent, 'AfterTool'),
      tool_name: name,
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
        event: 'AfterTool',
        groups,
        matchedValue: name,
        input,
        cwd: cwd ?? process.cwd(),
        signal: exec.signal,
        defaultTimeoutMs: config.hookTimeoutMs,
        onSpawn,
      },
      logger,
    )
    const post = resolvePost(outcomes, logger, config.maxHookOutputChars)
    const downstream = await next()
    if (post.contexts.length === 0 && post.replacement === undefined) return downstream
    if (downstream.kind === 'block') {
      return {
        kind: 'block',
        feedback: downstream.feedback,
        additionalContexts: [...(downstream.additionalContexts ?? []), ...post.contexts],
      }
    }
    const base = { kind: 'accept' as const, additionalContexts: [...(downstream.additionalContexts ?? []), ...post.contexts] }
    if (post.replacement !== undefined && downstream.content === undefined) {
      return { ...base, content: [{ type: 'text', text: post.replacement }] }
    }
    return base
  } catch (error) {
    logger.warn(`gemini-cli: AfterTool hooks failed: ${error instanceof Error ? error.message : String(error)}`)
    return next()
  }
}

function resolvePost(outcomes: HookOutcome[], logger: BridgeLogger, maxChars: number): ResolvedPost {
  const contextTexts: string[] = []
  let replacement: string | undefined
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    const specific = outcome.output?.hookSpecificOutput
    if (specific?.tailToolCallRequest !== undefined) {
      logger.warn('gemini-cli: hookSpecificOutput.tailToolCallRequest is not supported; ignored')
    }
    if (outcome.exitCode === 2) {
      replacement = firstNonEmpty(outcome.output?.reason, capString(outcome.stderr, maxChars), 'blocked by a Gemini CLI hook')
      continue
    }
    if (outcome.output?.decision === 'deny' || outcome.output?.decision === 'block') {
      // Hide the real tool output; the reason replaces the result.
      replacement = firstNonEmpty(outcome.output?.reason, capString(outcome.stderr, maxChars), 'denied by a Gemini CLI hook')
      continue
    }
    if (outcome.output?.continue === false) {
      logger.warn('gemini-cli: hook continue=false would kill the agent loop; DSH has no halt seam — ignored')
    }
    const context = outcome.output?.systemMessage ?? specific?.additionalContext
    if (typeof context === 'string' && context.trim() !== '') contextTexts.push(context)
  }
  const contexts = contextTexts.length > 0 ? [makeContextMessage('AfterTool', contextTexts, maxChars)] : []
  return { contexts, replacement }
}

// ── shared resolution helpers ────────────────────────────────────────────────

/** The block reason when any outcome blocks (deny / exit 2); undefined otherwise. */
function resolveBlock(outcomes: HookOutcome[], maxChars: number): string | undefined {
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    if (outcome.exitCode === 2) {
      return firstNonEmpty(outcome.output?.reason, capString(outcome.stderr, maxChars), 'blocked by a Gemini CLI hook')
    }
    if (outcome.output?.decision === 'deny' || outcome.output?.decision === 'block') {
      return firstNonEmpty(outcome.output?.reason, capString(outcome.stderr, maxChars), 'denied by a Gemini CLI hook')
    }
    if (outcome.output?.continue === false) {
      return firstNonEmpty(outcome.output?.stopReason, 'stopped by a Gemini CLI hook')
    }
  }
  return undefined
}

function collectContextTexts(outcomes: HookOutcome[], maxChars: number): string[] {
  const texts: string[] = []
  for (const outcome of outcomes) {
    if (!outcome.ran) continue
    if (outcome.exitCode !== 0) continue // exit 2 blocks (handled elsewhere); warnings are not context
    const specific = outcome.output?.hookSpecificOutput
    const context = outcome.output?.systemMessage ?? specific?.additionalContext
    if (typeof context === 'string' && context.trim() !== '') texts.push(capString(context, maxChars))
    // Non-JSON stdout means the hook failed; Gemini treats the whole output
    // as a systemMessage and allows the action.
    if (outcome.plainText !== null && outcome.plainText !== '') texts.push(capString(outcome.plainText, maxChars))
  }
  return texts
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value !== undefined && value.trim() !== '') return value.trim()
  }
  return 'blocked by a Gemini CLI hook'
}

function contentText(content: readonly ContentBlock[]): string {
  return content.map((block) => (block.type === 'text' ? block.text : '')).join('')
}

function makeBlockNotice(event: BridgedHookEvent, reason: string, maxChars: number): UserMessage {
  return createUserMessage({
    content: [
      {
        type: 'text',
        text: `<system-reminder>\nA Gemini CLI ${event} hook blocked this prompt: ${escapeReminderClose(capString(reason, maxChars))}\n</system-reminder>`,
      },
    ],
    source: { kind: 'plugin', plugin: HOOK_SOURCE },
  })
}

function makeContinueMessage(event: BridgedHookEvent, feedback: string, maxChars: number): UserMessage {
  return createUserMessage({
    content: [
      {
        type: 'text',
        text: `<system-reminder>\nA Gemini CLI ${event} hook asked to continue: ${escapeReminderClose(capString(feedback, maxChars))}\n</system-reminder>`,
      },
    ],
    source: { kind: 'plugin', plugin: HOOK_SOURCE },
  })
}

function makeContextMessage(event: BridgedHookEvent, texts: string[], maxChars: number): UserMessage {
  const body = texts
    .map((text) => `Context from a Gemini CLI ${event} hook:\n\n${escapeReminderClose(capString(text, maxChars))}`)
    .join('\n\n')
  return createUserMessage({
    content: [{ type: 'text', text: `<system-reminder>\n${body}\n</system-reminder>` }],
    source: { kind: 'plugin', plugin: HOOK_SOURCE },
  })
}
