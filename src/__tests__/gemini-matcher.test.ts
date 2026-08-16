import { describe, expect, it } from 'vitest'
import { matchGeminiMatcher } from '../agents/gemini-cli/hooks/matcher.js'
import { geminiToolName, translateGeminiAgentTools } from '../agents/gemini-cli/hooks/names.js'

describe('gemini matcher semantics', () => {
  it('matches tool events with unanchored regex', () => {
    expect(matchGeminiMatcher('run_shell_command', 'BeforeTool', 'run_shell_command')).toBe(true)
    expect(matchGeminiMatcher('read_.*', 'AfterTool', 'read_file')).toBe(true)
    expect(matchGeminiMatcher('^write_file$', 'BeforeTool', 'write_file')).toBe(true)
    expect(matchGeminiMatcher('write_file', 'BeforeTool', 'read_file')).toBe(false)
  })

  it('matches lifecycle events with exact strings only', () => {
    expect(matchGeminiMatcher('startup', 'SessionStart', 'startup')).toBe(true)
    expect(matchGeminiMatcher('startup', 'SessionStart', 'resume')).toBe(false)
    expect(matchGeminiMatcher('start.*', 'SessionStart', 'startup')).toBe(false) // regex does not apply
  })

  it('treats * and empty matchers as match-all and invalid regex as never-match', () => {
    expect(matchGeminiMatcher(undefined, 'BeforeTool', 'x')).toBe(true)
    expect(matchGeminiMatcher('', 'BeforeTool', 'x')).toBe(true)
    expect(matchGeminiMatcher('*', 'BeforeTool', 'x')).toBe(true)
    expect(matchGeminiMatcher('([broken', 'BeforeTool', 'x')).toBe(false)
  })
})

describe('gemini tool-name translations', () => {
  it('maps every documented DSH tool to its Gemini name', () => {
    const table: Record<string, string> = {
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
    for (const [dsh, upstream] of Object.entries(table)) expect(geminiToolName(dsh)).toBe(upstream)
    expect(geminiToolName('mcp_server_tool')).toBe('mcp_server_tool') // passthrough
  })

  it('translates agent tool lists and drops wildcards', () => {
    expect(translateGeminiAgentTools(['read_file', 'run_shell_command'])).toEqual({ tools: ['read', 'bash'], dropped: [] })
    expect(translateGeminiAgentTools(['*', 'mcp_*'])).toEqual({ tools: [], dropped: ['*', 'mcp_*'] })
  })
})
