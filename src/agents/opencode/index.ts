/**
 * The opencode bridge subsystem: skills/commands provider and AGENTS.md /
 * CLAUDE.md rules memory.
 *
 * opencode has no lifecycle-hook configuration (its plugin system is a
 * JavaScript API, not a settings file), so this subsystem registers two
 * pieces: the skill/command provider (including JSON-configured commands
 * from `opencode.json`) and the rules-memory injection (global + project
 * AGENTS.md with Claude Code fallbacks, plus `instructions` files).
 *
 * One `dsh-bridges` plugin hosts one bridge subsystem per supported agent
 * tool; this one mirrors the Claude Code / CodeBuddy Code subsystems against
 * opencode's asset layout (`~/.config/opencode/`, `.opencode/`). Each
 * subsystem receives the shared filesystem adapter and logger and registers
 * its own providers and event listeners under the plugin's fiber.
 * @module dsh-bridges/agents/opencode
 */
import type { Context } from '@deepseek-ai/cordis'
import type { FsAdapter } from '../../fs-adapter.js'
import type { BridgeLogger } from '../../util.js'
import { registerMemory } from './memory.js'
import { OpencodeSettingsLoader } from './settings.js'
import { OpencodeSkillProvider } from './skills/provider.js'

export interface OpencodeConfig {
  /** Master switch for the whole opencode bridge. */
  enabled?: boolean
  /** Discover and register opencode skills and commands (files and JSON). */
  skills?: boolean
  /** Inject opencode rules (AGENTS.md, CLAUDE.md fallback, instructions). */
  memory?: boolean
  /** User-level opencode config directory (usually `~/.config/opencode`). */
  userOpencodeDir?: string
  /** User-level Claude Code directory for the CLAUDE.md compatibility fallback. */
  userClaudeDir?: string
  /** Honor opencode's Claude Code compatibility fallbacks (CLAUDE.md rules). */
  claudeCompat?: boolean
  /** Watch existing asset roots and config files, republishing on change. */
  watch?: boolean
  /** Cap on the rendered rules-memory block, in characters. */
  memoryMaxBytes?: number
}

export const OPENCODE_DEFAULTS: Required<OpencodeConfig> = {
  enabled: true,
  skills: true,
  memory: true,
  userOpencodeDir: '~/.config/opencode',
  userClaudeDir: '~/.claude',
  claudeCompat: true,
  watch: true,
  memoryMaxBytes: 32_768,
}

/** Register every opencode bridge piece on the shared plugin context. */
export function registerOpencodeBridge(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: OpencodeConfig = {}): void {
  const resolved = { ...OPENCODE_DEFAULTS, ...config }
  if (!resolved.enabled) return

  // The settings loader is shared between the skill/command provider (JSON
  // commands) and the memory bridge (instructions): both read the same
  // opencode.json(c) files.
  const loader = new OpencodeSettingsLoader(logger, fs, { userOpencodeDir: resolved.userOpencodeDir })

  if (resolved.skills) {
    let provider: OpencodeSkillProvider | undefined
    ctx.skills.registerProvider((control) => {
      provider = new OpencodeSkillProvider(
        logger,
        fs,
        { userOpencodeDir: resolved.userOpencodeDir, watch: resolved.watch },
        loader,
        control.invalidate,
      )
      return provider
    })
    ctx.effect(() => () => {
      void provider?.dispose()
    }, 'opencode skill watchers')
  }

  if (resolved.memory) {
    registerMemory(ctx, logger, fs, loader, {
      userOpencodeDir: resolved.userOpencodeDir,
      userClaudeDir: resolved.userClaudeDir,
      claudeCompat: resolved.claudeCompat,
      maxBytes: resolved.memoryMaxBytes,
    })
  }
}
