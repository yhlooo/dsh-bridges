/**
 * The pi bridge subsystem: skills/prompt-template provider and context-file
 * memory.
 *
 * pi (the Rust coding agent from earendil-works) has no lifecycle-hook
 * configuration, no permission rules, and no MCP config (its TypeScript
 * extension event bus is the equivalent of those — out of scope, like
 * opencode's plugin API), so this subsystem registers two pieces: the
 * skill/prompt provider (`.pi/skills`, `.pi/prompts`, the `~/.pi/agent/`
 * counterparts, and settings-array paths, all trust-gated for the project
 * side) and the context-file memory (the AGENTS.md / CLAUDE.md chain plus
 * APPEND_SYSTEM.md, loaded regardless of project trust).
 *
 * One `dsh-bridges` plugin hosts one bridge subsystem per supported agent
 * tool; each subsystem receives the shared filesystem adapter and logger and
 * registers its own providers and event listeners under the plugin's fiber.
 * @module dsh-bridges/agents/pi
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { registerMemory } from './memory.js'
import { PiSettingsLoader } from './settings.js'
import { PiSkillProvider } from './skills/provider.js'

export interface PiConfig {
  /** Master switch for the whole pi bridge. */
  enabled?: boolean
  /** Discover and register pi skills and prompt templates. */
  skills?: boolean
  /** Inject the pi context-file chain (AGENTS.md / CLAUDE.md) at session start. */
  memory?: boolean
  /** User-level pi config directory (usually `~/.pi/agent`; `PI_CODING_AGENT_DIR` wins). */
  userPiDir?: string
  /** Watch existing asset roots and config files, republishing on change. */
  watch?: boolean
  /** Cap on the rendered context-file memory block, in characters. */
  memoryMaxBytes?: number
}

export const PI_DEFAULTS: Required<PiConfig> = {
  enabled: true,
  skills: true,
  memory: true,
  userPiDir: '~/.pi/agent',
  watch: true,
  memoryMaxBytes: 32_768,
}

/** Register every pi bridge piece on the shared plugin context. */
export function registerPiBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: PiConfig = {}): void {
  const resolved = { ...PI_DEFAULTS, ...config }
  if (!resolved.enabled) return

  // The settings loader is shared between the skill provider (settings
  // `skills` / `prompts` arrays + trust gating) and the memory bridge
  // (APPEND_SYSTEM.md trust gating).
  const loader = new PiSettingsLoader(logger, fs, { userPiDir: resolved.userPiDir })

  if (resolved.skills) {
    let provider: PiSkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new PiSkillProvider(logger, fs, { userPiDir: resolved.userPiDir, watch: resolved.watch }, loader, control.invalidate)
      return provider
    })
    ctx.effect(
      () => () => {
        void provider?.dispose()
      },
      'pi skill watchers',
    )
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, loader, { userPiDir: resolved.userPiDir, maxBytes: resolved.memoryMaxBytes })
  }
}
