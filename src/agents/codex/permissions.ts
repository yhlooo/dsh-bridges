/**
 * Codex approval / sandbox policy (`config.toml`) applied to DSH sessions.
 *
 * Codex's `sandbox_mode` vocabulary (`read-only` / `workspace-write` /
 * `danger-full-access`) is identical to DSH's sandbox modes, so the bridge
 * writes the configured value through `setSandboxMode` at session start.
 * `approval_policy` maps `never` → DSH `never` (auto-approve) and
 * `untrusted` / `on-request` / `on-failure` / `granular` → DSH `ask`;
 * granular per-category switches have no DSH seam and are logged, not
 * enforced. `default_permissions` applies only when it names a built-in
 * profile (`:read-only` / `:workspace` / `:danger-full-access`).
 *
 * Only explicitly configured values are applied — Codex's own defaults
 * (read-only sandbox, untrusted approvals) never override a DSH deployment's
 * policy. `[sandbox_workspace_write]` writable roots / network access and
 * custom `[permissions.<name>]` profiles are read but not applied (no DSH
 * seam for per-session writable roots).
 * @module dsh-bridges/agents/codex/permissions
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { SandboxMode } from '@deepseek-ai/dsh-sandbox'
import { setSandboxMode } from '@deepseek-ai/dsh-sandbox-policy'
import { setApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import type { BridgeLogger } from '../../util.js'
import type { CodexSettingsLoader, LoadedCodexSettings } from './settings.js'

/** Codex built-in permission-profile names and their DSH sandbox modes. */
const BUILTIN_PROFILE_MODES: Readonly<Record<string, SandboxMode>> = {
  ':read-only': 'read-only',
  ':workspace': 'workspace-write',
  ':danger-full-access': 'danger-full-access',
}

/** Map the merged Codex policy onto DSH session knobs at session start. */
export function createPermissionsBridge(ctx: Context, logger: BridgeLogger, loader: CodexSettingsLoader): void {
  ctx.on('agent/session-start', (payload) => {
    void applyCodexPolicy(payload.agent, loader, logger)
  })
}

export async function applyCodexPolicy(agent: Agent, loader: CodexSettingsLoader, logger: BridgeLogger): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  try {
    applySettings(settings, agent, logger)
  } catch (error) {
    logger.warn(`codex: applying approval/sandbox policy failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export function applySettings(settings: LoadedCodexSettings, agent: Agent, logger: BridgeLogger): void {
  // Sandbox mode: an explicit `default_permissions` built-in profile wins,
  // then an explicit `sandbox_mode`.
  let sandbox: SandboxMode | undefined
  if (settings.defaultPermissionsProfile !== undefined) {
    const profile = BUILTIN_PROFILE_MODES[settings.defaultPermissionsProfile]
    if (profile !== undefined) {
      sandbox = profile
    } else {
      logger.warn(
        `codex: permission profile "${settings.defaultPermissionsProfile}" is not a built-in; custom [permissions.<name>] profiles have no DSH seam and are not applied`,
      )
    }
  }
  if (sandbox === undefined && settings.sandboxMode !== undefined) sandbox = settings.sandboxMode
  if (sandbox !== undefined) setSandboxMode(agent.session, sandbox)

  const policy = settings.approvalPolicy
  if (policy !== undefined) {
    // Codex prompts for every approval under untrusted / on-request /
    // granular policies; DSH 'ask' delegates to the composed answerers.
    setApprovalPolicy(agent.session, policy.kind === 'never' ? 'never' : 'ask')
    if (policy.kind === 'granular') {
      logger.warn('codex: granular approval_policy categories (sandbox_approval/rules/mcp_elicitations/request_permissions/skill_approval) have no DSH seam and are not enforced')
    }
  }
}
