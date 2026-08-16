/**
 * DSH → Cursor tool-name translations (the hooks' `tool_name` payload and
 * matchers use Cursor names, never DSH names).
 * @module dsh-bridges/agents/cursor/hooks/names
 */

/** DSH tool name → Cursor tool name. */
const DSH_TO_CURSOR_TOOL: Readonly<Record<string, string>> = {
  bash: 'Shell',
  pwsh: 'Shell',
  read: 'Read',
  write: 'Write',
  edit: 'Edit',
  glob: 'Glob',
  grep: 'Grep',
  web: 'WebFetch',
  web_search: 'WebSearch',
  ask_user_question: 'AskUserQuestion',
  exit_plan_mode: 'ExitPlanMode',
  subagent: 'Task',
  todo_write: 'TodoWrite',
}

export function cursorToolName(dshName: string): string {
  return DSH_TO_CURSOR_TOOL[dshName] ?? dshName
}
