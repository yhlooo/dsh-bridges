/**
 * Tool-name translation between DSH and Codex.
 *
 * Codex hook matchers and hook scripts key on Codex tool names (`Bash`,
 * `apply_patch`, `spawn_agent`, …). DSH names its tools differently
 * (`bash`, `edit`, `subagent`, …). Hooks therefore evaluate against the
 * translated Codex name and receive it in the `tool_name` input field, so a
 * hook written for Codex runs unchanged. Unknown DSH tools (MCP servers,
 * first-party extras) keep their own name.
 * @module dsh-bridges/agents/codex/hooks/names
 */

const DSH_TO_CODEX_TOOL: Readonly<Record<string, string>> = {
  bash: 'Bash',
  pwsh: 'Bash',
  edit: 'apply_patch',
  write: 'apply_patch',
  subagent: 'spawn_agent',
  todo_write: 'update_plan',
}

/** Translate a DSH tool name to the Codex name hooks expect. */
export function codexToolName(dshToolName: string): string {
  return DSH_TO_CODEX_TOOL[dshToolName] ?? dshToolName
}
