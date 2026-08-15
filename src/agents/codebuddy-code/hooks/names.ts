/**
 * Tool-name translation between DSH and CodeBuddy Code.
 *
 * CodeBuddy Code hook matchers, `if` rules, and hook scripts all key on
 * CodeBuddy Code tool names (`Bash`, `Edit`, `Read`, `Task`, …) and argument
 * fields. DSH names its tools differently (`bash`, `edit`, `read`, …). Hooks
 * therefore evaluate against the translated CodeBuddy Code name and receive
 * it in the `tool_name` input field, so a hook written for CodeBuddy Code runs
 * unchanged. Unknown DSH tools (MCP servers, first-party extras) keep their
 * own name.
 * @module dsh-bridges/agents/codebuddy-code/hooks/names
 */

const DSH_TO_CODEBUDDY_TOOL: Readonly<Record<string, string>> = {
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
  subagent: 'Task',
  todo_write: 'TodoWrite',
}

/** Translate a DSH tool name to the CodeBuddy Code name hooks expect. */
export function codebuddyToolName(dshToolName: string): string {
  return DSH_TO_CODEBUDDY_TOOL[dshToolName] ?? dshToolName
}
