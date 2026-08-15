/**
 * Tool-name translation between DSH and Claude Code.
 *
 * Claude Code hook matchers, `if` rules, and hook scripts all key on Claude
 * Code tool names (`Bash`, `Edit`, `Read`, …) and argument fields. DSH names
 * its tools differently (`bash`, `edit`, `read`, …). Hooks therefore evaluate
 * against the translated Claude Code name and receive it in the `tool_name`
 * input field, so a hook written for Claude Code runs unchanged. Unknown DSH
 * tools (MCP servers, first-party extras) keep their own name.
 * @module dsh-bridges/agents/claude-code/hooks/names
 */

const DSH_TO_CLAUDE_TOOL: Readonly<Record<string, string>> = {
  bash: 'Bash',
  pwsh: 'PowerShell',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  glob: 'Glob',
  grep: 'Grep',
  web: 'WebSearch',
  web_search: 'WebSearch',
  ask_user_question: 'AskUserQuestion',
  exit_plan_mode: 'ExitPlanMode',
  subagent: 'Agent',
  todo: 'TodoWrite',
}

/** Translate a DSH tool name to the Claude Code name hooks expect. */
export function claudeToolName(dshToolName: string): string {
  return DSH_TO_CLAUDE_TOOL[dshToolName] ?? dshToolName
}
