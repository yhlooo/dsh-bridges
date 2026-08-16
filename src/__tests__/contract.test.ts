/**
 * Contract golden table (quality.md §3.2): the rank bands, the exact rank
 * slots per asset kind, and the hook tool-name translations are pinned here
 * so a drift is visible in three places at once (this test, the provider
 * constants, and the guides' tables).
 *
 * The lesson this guards (AGENTS.md): DSH's todo tool is `todo_write`, so the
 * hook name tables must map `todo_write` → `TodoWrite` (claude/codebuddy) and
 * `todo_write` → `update_plan` (codex) — `todo` matches nothing.
 */
import { describe, expect, it } from 'vitest'
import { fx } from './fixture-paths.js'
import { sep } from 'node:path'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { ClaudeSkillProvider } from '../agents/claude-code/skills/provider.js'
import { CodebuddySkillProvider } from '../agents/codebuddy-code/skills/provider.js'
import { CodebuddySettingsLoader } from '../agents/codebuddy-code/settings.js'
import { OpencodeSkillProvider } from '../agents/opencode/skills/provider.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'
import { CodexSkillProvider } from '../agents/codex/skills/provider.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'
import { CursorSkillProvider } from '../agents/cursor/skills/provider.js'
import { CursorSettingsLoader } from '../agents/cursor/settings.js'
import { GeminiSkillProvider } from '../agents/gemini-cli/skills/provider.js'
import { GeminiSettingsLoader } from '../agents/gemini-cli/settings.js'
import { PiSkillProvider } from '../agents/pi/skills/provider.js'
import { PiSettingsLoader } from '../agents/pi/settings.js'
import { claudeToolName } from '../agents/claude-code/hooks/names.js'
import { codebuddyToolName } from '../agents/codebuddy-code/hooks/names.js'
import { codexToolName } from '../agents/codex/hooks/names.js'
import { geminiToolName } from '../agents/gemini-cli/hooks/names.js'
import { cursorToolName } from '../agents/cursor/hooks/names.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

class TreeFs implements FsAdapter {
  constructor(public files: Map<string, string>) {}

  private children(path: string): BridgeDirEntry[] {
    const prefix = path.endsWith(sep) ? path : `${path}${sep}`
    const names = new Set<string>()
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      if (rest === '') continue
      names.add(rest.split(sep)[0]!)
    }
    return [...names].map((name) => ({
      name,
      isDir: [...this.files.keys()].some((key) => key.startsWith(`${prefix}${name}${sep}`)),
      isFile: ![...this.files.keys()].some((key) => key.startsWith(`${prefix}${name}${sep}`)),
    }))
  }

  async listDir(path: string): Promise<BridgeDirEntry[]> {
    if (![...this.files.keys()].some((key) => key.startsWith(path))) {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
    return this.children(path)
  }
  async readText(path: string): Promise<string> {
    const value = this.files.get(path)
    if (value === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return value
  }
  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path)
  }
  async stamp(path: string): Promise<string | undefined> {
    return this.files.has(path) ? `v:${this.files.get(path)}` : undefined
  }
  async dirExists(path: string): Promise<boolean> {
    return [...this.files.keys()].some((key) => key.startsWith(`${path}/`))
  }
}

const options: SkillLookupOptions = { cwd: fx('proj') }

async function candidates(provider: { list(options: SkillLookupOptions): Promise<unknown> }): Promise<{ name: string; rank: number }[]> {
  const result = (await provider.list(options)) as { candidates?: { name: string; rank: number }[] } | { name: string; rank: number }[]
  return Array.isArray(result) ? result : (result.candidates ?? [])
}

describe('rank bands (golden table)', () => {
  it('claude-code ranks stay in 105–120, below the runtime-skill rank', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.claude', 'skills', 'u-skill', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.claude', 'commands', 'u-cmd.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.claude', 'agents', 'u-agent.md'), '---\nname: u-agent\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.claude', 'skills', 'p-skill', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.claude', 'commands', 'p-cmd.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.claude', 'agents', 'p-agent.md'), '---\nname: p-agent\ndescription: a\n---\nBody.\n'],
    ])
    const provider = new ClaudeSkillProvider(
      silent,
      new TreeFs(files),
      { userClaudeDir: fx('home', 'u', '.claude'), watch: false, agents: true },
      () => {},
    )
    const found = await candidates(provider)
    const ranks = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(ranks.get('u-skill')).toBe(105)
    expect(ranks.get('u-agent')).toBe(107)
    expect(ranks.get('u-cmd')).toBe(110)
    expect(ranks.get('p-skill')).toBe(115)
    expect(ranks.get('p-agent')).toBe(117)
    expect(ranks.get('p-cmd')).toBe(120)
    for (const entry of found) {
      expect(entry.rank).toBeGreaterThanOrEqual(105)
      expect(entry.rank).toBeLessThanOrEqual(120)
      expect(entry.rank).toBeLessThan(250) // runtime skills always win
    }
  })

  it('codebuddy-code ranks stay in 125–140 with project before user', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.codebuddy', 'skills', 'u-skill', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.codebuddy', 'commands', 'u-cmd.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.codebuddy', 'agents', 'u-agent.md'), '---\nname: u-agent\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.codebuddy', 'skills', 'p-skill', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.codebuddy', 'commands', 'p-cmd.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.codebuddy', 'agents', 'p-agent.md'), '---\nname: p-agent\ndescription: a\n---\nBody.\n'],
    ])
    const loader = new CodebuddySettingsLoader(silent, new TreeFs(files), { userCodebuddyDir: fx('home', 'u', '.codebuddy') })
    const provider = new CodebuddySkillProvider(
      silent,
      new TreeFs(files),
      { userCodebuddyDir: fx('home', 'u', '.codebuddy'), watch: false, agents: true },
      loader,
      () => {},
    )
    const found = await candidates(provider)
    const ranks = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(ranks.get('p-skill')).toBe(125)
    expect(ranks.get('p-cmd')).toBe(130)
    expect(ranks.get('p-agent')).toBe(132)
    expect(ranks.get('u-skill')).toBe(135)
    expect(ranks.get('u-agent')).toBe(137)
    expect(ranks.get('u-cmd')).toBe(140)
    for (const entry of found) {
      expect(entry.rank).toBeGreaterThanOrEqual(125)
      expect(entry.rank).toBeLessThanOrEqual(140)
      expect(entry.rank).toBeLessThan(250)
    }
  })

  it('opencode ranks stay in 145–160 with project before user', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.config', 'opencode', 'skills', 'u-skill', 'SKILL.md'), '---\nname: u-skill\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.config', 'opencode', 'commands', 'u-cmd.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.opencode', 'skills', 'p-skill', 'SKILL.md'), '---\nname: p-skill\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.opencode', 'commands', 'p-cmd.md'), '---\ndescription: a\n---\nBody.\n'],
      [
        fx('proj', 'opencode.json'),
        JSON.stringify({ command: { jcmd: { template: 'x' } }, agent: { ag: { mode: 'subagent', description: 'a' } } }),
      ],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
    const provider = new OpencodeSkillProvider(
      silent,
      new TreeFs(files),
      { userOpencodeDir: fx('home', 'u', '.config', 'opencode'), watch: false },
      loader,
      () => {},
    )
    const found = await candidates(provider)
    const ranks = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(ranks.get('p-skill')).toBe(145)
    expect(ranks.get('jcmd')).toBe(147)
    expect(ranks.get('ag')).toBe(149)
    expect(ranks.get('p-cmd')).toBe(150)
    expect(ranks.get('u-skill')).toBe(155)
    expect(ranks.get('u-cmd')).toBe(160)
    for (const entry of found) {
      expect(entry.rank).toBeGreaterThanOrEqual(145)
      expect(entry.rank).toBeLessThanOrEqual(160)
      expect(entry.rank).toBeLessThan(250)
    }
  })

  it('codex ranks stay in 165–175 with project < config agents < user < system', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.agents', 'skills', 'u-skill', 'SKILL.md'), '---\nname: u-skill\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.codex', 'config.toml'), '[agents.role]\ndescription = "a"\n'],
      [fx('proj', '.agents', 'skills', 'p-skill', 'SKILL.md'), '---\nname: p-skill\ndescription: a\n---\nBody.\n'],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: fx('home', 'u', '.codex') })
    const provider = new CodexSkillProvider(
      silent,
      new TreeFs(files),
      { userCodexDir: fx('home', 'u', '.codex'), userSkillsDir: fx('home', 'u', '.agents', 'skills'), watch: false },
      loader,
      () => {},
    )
    const found = await candidates(provider)
    const ranks = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(ranks.get('p-skill')).toBe(165)
    expect(ranks.get('role')).toBe(168)
    expect(ranks.get('u-skill')).toBe(170)
    for (const entry of found) {
      expect(entry.rank).toBeGreaterThanOrEqual(165)
      expect(entry.rank).toBeLessThanOrEqual(175)
      expect(entry.rank).toBeLessThan(250)
    }
  })

  it('pi ranks stay in 180–195 with personal before project (first-found wins)', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.pi', 'agent', 'settings.json'),
        JSON.stringify({ defaultProjectTrust: 'always', skills: ['extra'], prompts: ['extra-p'] }),
      ],
      [fx('home', 'u', '.pi', 'agent', 'skills', 'u-skill', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.pi', 'agent', 'prompts', 'u-prompt.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.pi', 'agent', 'extra', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.pi', 'agent', 'extra-p', 'p.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.pi', 'skills', 'p-skill', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
    ])
    const loader = new PiSettingsLoader(silent, new TreeFs(files), { userPiDir: fx('home', 'u', '.pi', 'agent') })
    const provider = new PiSkillProvider(
      silent,
      new TreeFs(files),
      { userPiDir: fx('home', 'u', '.pi', 'agent'), watch: false },
      loader,
      () => {},
    )
    const found = await candidates(provider)
    const ranks = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(ranks.get('u-skill')).toBe(180)
    expect(ranks.get('extra')).toBe(181)
    expect(ranks.get('u-prompt')).toBe(182)
    expect(ranks.get('p')).toBe(183)
    expect(ranks.get('p-skill')).toBe(190)
    for (const entry of found) {
      expect(entry.rank).toBeGreaterThanOrEqual(180)
      expect(entry.rank).toBeLessThanOrEqual(195)
      expect(entry.rank).toBeLessThan(250)
    }
  })

  it('gemini-cli ranks stay in 205–220 with workspace before user', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.gemini', 'skills', 'u-skill', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.gemini', 'commands', 'u-cmd.toml'), 'prompt = "x"\n'],
      [fx('home', 'u', '.gemini', 'agents', 'u-agent.md'), '---\nname: u-agent\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.gemini', 'skills', 'p-skill', 'SKILL.md'), '---\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.gemini', 'commands', 'p-cmd.toml'), 'prompt = "x"\n'],
      [fx('proj', '.gemini', 'agents', 'p-agent.md'), '---\nname: p-agent\ndescription: a\n---\nBody.\n'],
    ])
    const loader = new GeminiSettingsLoader(silent, new TreeFs(files), { userGeminiDir: fx('home', 'u', '.gemini') })
    const provider = new GeminiSkillProvider(
      silent,
      new TreeFs(files),
      { userGeminiDir: fx('home', 'u', '.gemini'), watch: false, agents: true },
      loader,
      () => {},
    )
    const found = await candidates(provider)
    const ranks = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(ranks.get('p-skill')).toBe(205)
    expect(ranks.get('p-agent')).toBe(206)
    expect(ranks.get('p-cmd')).toBe(207)
    expect(ranks.get('u-skill')).toBe(210)
    expect(ranks.get('u-agent')).toBe(211)
    expect(ranks.get('u-cmd')).toBe(212)
    for (const entry of found) {
      expect(entry.rank).toBeGreaterThanOrEqual(205)
      expect(entry.rank).toBeLessThanOrEqual(220)
      expect(entry.rank).toBeLessThan(250)
    }
  })

  it('cursor ranks stay in 225–240 with project before user', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.cursor', 'skills', 'u-skill', 'SKILL.md'), '---\nname: u-skill\ndescription: a\n---\nBody.\n'],
      [fx('home', 'u', '.cursor', 'agents', 'u-agent.md'), '---\nname: u-agent\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.cursor', 'skills', 'p-skill', 'SKILL.md'), '---\nname: p-skill\ndescription: a\n---\nBody.\n'],
      [fx('proj', '.cursor', 'agents', 'p-agent.md'), '---\nname: p-agent\ndescription: a\n---\nBody.\n'],
    ])
    const loader = new CursorSettingsLoader(silent, new TreeFs(files), { userCursorDir: fx('home', 'u', '.cursor') })
    const provider = new CursorSkillProvider(
      silent,
      new TreeFs(files),
      { userCursorDir: fx('home', 'u', '.cursor'), watch: false, agents: true },
      loader,
      () => {},
    )
    const found = await candidates(provider)
    const ranks = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(ranks.get('p-skill')).toBe(225)
    expect(ranks.get('p-agent')).toBe(226)
    expect(ranks.get('u-skill')).toBe(230)
    expect(ranks.get('u-agent')).toBe(231)
    for (const entry of found) {
      expect(entry.rank).toBeGreaterThanOrEqual(225)
      expect(entry.rank).toBeLessThanOrEqual(240)
      expect(entry.rank).toBeLessThan(250)
    }
  })
})

describe('hook tool-name translations (golden table)', () => {
  it('claude-code maps every documented DSH tool to its upstream name', () => {
    const table: Record<string, string> = {
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
      todo_write: 'TodoWrite', // the AGENTS.md lesson: `todo` matches nothing
    }
    for (const [dsh, upstream] of Object.entries(table)) expect(claudeToolName(dsh)).toBe(upstream)
    expect(claudeToolName('mcp__server__tool')).toBe('mcp__server__tool') // unknown passthrough
  })

  it('codebuddy-code maps every documented DSH tool to its upstream name', () => {
    const table: Record<string, string> = {
      bash: 'Bash',
      read: 'Read',
      edit: 'Edit',
      subagent: 'Task',
      todo_write: 'TodoWrite',
    }
    for (const [dsh, upstream] of Object.entries(table)) expect(codebuddyToolName(dsh)).toBe(upstream)
    expect(codebuddyToolName('mcp__server__tool')).toBe('mcp__server__tool')
  })

  it('codex maps every documented DSH tool to its upstream name', () => {
    const table: Record<string, string> = {
      bash: 'Bash',
      pwsh: 'Bash',
      edit: 'apply_patch',
      write: 'apply_patch',
      subagent: 'spawn_agent',
      todo_write: 'update_plan',
    }
    for (const [dsh, upstream] of Object.entries(table)) expect(codexToolName(dsh)).toBe(upstream)
    expect(codexToolName('mcp__server__tool')).toBe('mcp__server__tool')
  })

  it('gemini-cli maps every documented DSH tool to its upstream name', () => {
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

  it('cursor maps every documented DSH tool to its upstream name', () => {
    const table: Record<string, string> = {
      bash: 'Shell',
      pwsh: 'Shell',
      read: 'Read',
      write: 'Write',
      edit: 'Edit',
      glob: 'Glob',
      grep: 'Grep',
      web: 'WebFetch',
      web_search: 'WebSearch',
      subagent: 'Task',
      todo_write: 'TodoWrite',
    }
    for (const [dsh, upstream] of Object.entries(table)) expect(cursorToolName(dsh)).toBe(upstream)
    expect(cursorToolName('mcp__server__tool')).toBe('mcp__server__tool')
  })
})
