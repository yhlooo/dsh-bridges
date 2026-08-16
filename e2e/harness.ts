/**
 * Ring-A e2e boot helper: a real cordis composition hosting the real
 * dsh-bridges plugin (loaded from `src/index.ts`) on top of the real skill
 * registry (`@deepseek-ai/dsh-skill`), driven through the same event seams the
 * dsh host uses.
 *
 * The only stand-in is the agent: the real `Agent` is created by the agent
 * registry inside the dsh loop, which is not a dev dependency here. `E2eAgent`
 * implements the runtime surface the bridges touch (`session.header.cwd`,
 * `session.id`, `inject()`, `steer()`) and records injections, so tests assert
 * on the exact messages a real agent would receive.
 *
 * Event dispatch mirrors the host: `emit` for `agent/session-start`,
 * `waterfall` with an explicit innermost `next` (the default policy decision)
 * for `tools/*` and `agent/pre-step` seams.
 * @module dsh-bridges/e2e/harness
 */
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import type { Agent, PreStepDecision, SessionStartSource } from '@deepseek-ai/dsh-agent'
import type { UserMessage } from '@deepseek-ai/dsh-llm'
import type { PostToolDecision, PreToolDecision, ToolExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import * as bridges from '../src/index.js'
import type { BridgesConfig } from '../src/index.js'

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url)

/** Recording stand-in for the parts of `Agent` the bridges touch. */
export class E2eAgent {
  readonly injected: UserMessage[] = []
  readonly steered: UserMessage[] = []
  session = { id: 'e2e-session-1', header: { cwd: undefined as string | undefined } }

  inject(message: UserMessage): void {
    this.injected.push(message)
  }

  steer(message: UserMessage): void {
    this.steered.push(message)
  }
}

export interface Harness {
  /** The root context hosting the real skill registry and the real plugin. */
  readonly ctx: Context
  readonly agent: E2eAgent
  dispose(): Promise<void>
}

export interface BootOptions {
  /** Session working directory; points at a copied fixture tree. */
  readonly cwd: string
  /** The `claudeCode.userClaudeDir` value; must exist and stay isolated from the real `~/.claude`. */
  readonly userClaudeDir: string
  /** Extra top-level plugin config, merged over the skeleton defaults. */
  readonly config?: Partial<BridgesConfig>
}

/** Boot the composition: real skills registry, then the real bundle under test. */
export async function bootHarness(options: BootOptions): Promise<Harness> {
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  const claudeDefaults = {
    enabled: true,
    skills: true,
    memory: true,
    hooks: true,
    userClaudeDir: options.userClaudeDir,
    watch: false,
    hookTimeoutMs: 5000,
    userPromptHookTimeoutMs: 5000,
    maxHookOutputChars: 10_000,
    memoryMaxBytes: 32_768,
  }
  const config: BridgesConfig = {
    // Per-tool merge so a scenario can override one field (e.g. hookTimeoutMs)
    // without losing the isolation defaults.
    claudeCode: { ...claudeDefaults, ...options.config?.claudeCode },
    codebuddyCode: { enabled: false, ...options.config?.codebuddyCode },
    opencode: { enabled: false, ...options.config?.opencode },
    codex: { enabled: false, ...options.config?.codex },
  }
  await ctx.plugin(bridges, config)
  const agent = new E2eAgent()
  agent.session.header.cwd = options.cwd
  return {
    ctx,
    agent,
    async dispose() {
      await ctx.fiber.dispose()
    },
  }
}

/** Dispatch `agent/session-start` the way the host does. */
export function sessionStart(harness: Harness, source: SessionStartSource = 'startup'): void {
  harness.ctx.emit('agent/session-start', { agent: harness.agent as unknown as Agent, source })
}

/** Dispatch `tools/pre-execute` with the host's default allow decision as the innermost `next`. */
export function preToolUse(harness: Harness, exec: ToolExecution): Promise<PreToolDecision> {
  return harness.ctx.waterfall('tools/pre-execute', exec, async () => ({ kind: 'allow' }))
}

/** Dispatch `agent/pre-step` with the original messages as the host's default enter decision. */
export function preStep(harness: Harness, messages: UserMessage[]): Promise<PreStepDecision> {
  const payload = {
    agent: harness.agent as unknown as Agent,
    messages,
    turn: 1,
    step: 1,
    signal: new AbortController().signal,
  }
  return harness.ctx.waterfall('agent/pre-step', payload, async () => ({ kind: 'enter', messages }))
}

/** Dispatch `tools/post-execute` with the host's default accept decision as the innermost `next`. */
export function postToolUse(harness: Harness, exec: ToolExecution, result: ToolExecutionResult): Promise<PostToolDecision> {
  return harness.ctx.waterfall('tools/post-execute', exec, result, async () => ({ kind: 'accept' }))
}

/** Poll until `probe` resolves to a defined value or the timeout elapses. */
export async function waitFor<T>(probe: () => T | undefined | Promise<T | undefined>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await probe()
    if (value !== undefined) return value
    if (Date.now() >= deadline) throw new Error('waitFor: condition not met within timeout')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

/** Copy one immutable fixture tree into a fresh temp directory. */
export async function fixtureCopy(name: string): Promise<{ dir: string; cleanup(): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-bridges-e2e-'))
  await cp(new URL(`${name}/`, FIXTURES_DIR), dir, { recursive: true })
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}

/** Fresh empty directory to serve as an isolated user config dir. */
export async function tempUserDir(): Promise<{ dir: string; cleanup(): Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-bridges-user-'))
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}

/** Minimal `ToolExecution` stand-in for a `bash` call, as the registry would hand it to the waterfall. */
export function bashExec(harness: Harness, command: string): ToolExecution {
  const callId = 'call-1' as import('@deepseek-ai/dsh-llm').CallId
  return {
    callId,
    rootCallId: callId,
    name: 'bash',
    arguments: { command },
    agent: harness.agent as never,
    signal: new AbortController().signal,
    // Registry-assigned identity; the bridge reads it only as an opaque value.
    token: Symbol('e2e-token') as import('@deepseek-ai/dsh-tools').ToolExecutionToken,
  }
}
