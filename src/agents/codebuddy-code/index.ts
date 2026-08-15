/**
 * The CodeBuddy Code bridge subsystem: skills/commands provider,
 * CODEBUDDY.md memory, and lifecycle hooks.
 *
 * One `dsh-bridges` plugin hosts one bridge subsystem per supported agent
 * tool; this subsystem mirrors the Claude Code one against CodeBuddy Code's
 * asset layout (`~/.codebuddy`, `.codebuddy/`). Each subsystem receives the
 * shared filesystem adapter and logger and registers its own providers and
 * event listeners under the plugin's fiber.
 * @module dsh-bridges/agents/codebuddy-code
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { createHookBridge } from './hooks/bridge.js'
import { registerMemory } from './memory.js'
import { CodebuddySettingsLoader } from './settings.js'
import { CodebuddySkillProvider } from './skills/provider.js'

export interface CodebuddyCodeConfig {
  /** Master switch for the whole CodeBuddy Code bridge. */
  enabled?: boolean
  /** Discover and register CodeBuddy Code skills and commands. */
  skills?: boolean
  /** Inject CODEBUDDY.md memory and always-apply rules at session start. */
  memory?: boolean
  /** Run CodeBuddy Code hooks from settings.json at DSH lifecycle seams. */
  hooks?: boolean
  /** User-level CodeBuddy Code directory (usually `~/.codebuddy`). */
  userCodebuddyDir?: string
  /** Watch existing skill roots and settings files, republishing on change. */
  watch?: boolean
  /** Default hook timeout (ms), mirroring CodeBuddy Code's 60-second limit. */
  hookTimeoutMs?: number
  /** Cap on context-bound hook output characters. */
  maxHookOutputChars?: number
  /** Cap on the rendered CODEBUDDY.md memory block, in characters. */
  memoryMaxBytes?: number
}

export const CODEBUDDY_CODE_DEFAULTS: Required<CodebuddyCodeConfig> = {
  enabled: true,
  skills: true,
  memory: true,
  hooks: true,
  userCodebuddyDir: '~/.codebuddy',
  watch: true,
  hookTimeoutMs: 60_000,
  maxHookOutputChars: 10_000,
  memoryMaxBytes: 32_768,
}

/** Register every CodeBuddy Code bridge piece on the shared plugin context. */
export function registerCodebuddyCodeBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: CodebuddyCodeConfig = {}): void {
  const resolved = { ...CODEBUDDY_CODE_DEFAULTS, ...config }
  if (!resolved.enabled) return

  // The settings loader is shared between the hook bridge and the skill
  // provider: both read the same settings files (hooks, env, skillOverrides).
  const loader = new CodebuddySettingsLoader(logger, fs, { userCodebuddyDir: resolved.userCodebuddyDir })

  if (resolved.skills) {
    let provider: CodebuddySkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new CodebuddySkillProvider(
        logger,
        fs,
        { userCodebuddyDir: resolved.userCodebuddyDir, watch: resolved.watch },
        loader,
        control.invalidate,
      )
      return provider
    })
    ctx.effect(() => () => {
      void provider?.dispose()
    }, 'codebuddy-code skill watchers')
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, { userCodebuddyDir: resolved.userCodebuddyDir, maxBytes: resolved.memoryMaxBytes })
  }

  if (resolved.hooks) {
    createHookBridge(ctx, logger, loader, {
      hookTimeoutMs: resolved.hookTimeoutMs,
      maxHookOutputChars: resolved.maxHookOutputChars,
    })
  }
}
