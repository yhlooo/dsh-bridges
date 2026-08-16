/**
 * DSH → Gemini CLI tool-name translations (the hooks' `tool_name` payload
 * and policy `toolName` conditions use Gemini names, never DSH names).
 * @module dsh-bridges/agents/gemini-cli/hooks/names
 */

/** DSH tool name → Gemini CLI tool name. */
const DSH_TO_GEMINI_TOOL: Readonly<Record<string, string>> = {
  bash: 'run_shell_command',
  pwsh: 'run_shell_command',
  read: 'read_file',
  write: 'write_file',
  edit: 'replace',
  glob: 'list_directory',
  grep: 'search_file_content',
  web: 'web_fetch',
  web_search: 'google_web_search',
  ask_user_question: 'ask_user',
  exit_plan_mode: 'exit_plan_mode',
  todo_write: 'write_todos',
  skill: 'activate_skill',
}

export function geminiToolName(dshName: string): string {
  return DSH_TO_GEMINI_TOOL[dshName] ?? dshName
}

/** Gemini agent `tools` entries → DSH tool names for delegation specs. */
const GEMINI_TO_DSH_TOOL: Readonly<Record<string, string>> = {
  run_shell_command: 'bash',
  read_file: 'read',
  write_file: 'write',
  replace: 'edit',
  list_directory: 'glob',
  search_file_content: 'grep',
  web_fetch: 'web',
  google_web_search: 'web_search',
  ask_user: 'ask_user_question',
  exit_plan_mode: 'exit_plan_mode',
  write_todos: 'todo_write',
  activate_skill: 'skill',
}

export function translateGeminiAgentTools(entries: readonly string[]): { tools: string[]; dropped: string[] } {
  const tools: string[] = []
  const dropped: string[] = []
  for (const entry of entries) {
    const trimmed = entry.trim()
    if (trimmed === '') continue
    const mapped = GEMINI_TO_DSH_TOOL[trimmed]
    if (mapped !== undefined) {
      tools.push(mapped)
    } else if (trimmed === '*' || trimmed.startsWith('mcp_')) {
      // `*` means "all tools" (equivalent to omitting the filter upstream);
      // `mcp_*` / `mcp_server_*` wildcards have no DSH tool-filter form.
      dropped.push(trimmed)
    } else {
      tools.push(trimmed) // unknown concrete names pass through; DSH rejects them loudly
    }
  }
  return { tools, dropped }
}
