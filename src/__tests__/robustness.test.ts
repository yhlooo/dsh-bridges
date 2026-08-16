/**
 * Adversarial-input corpus shared by the bridge parsers (quality.md §3.3):
 * BOM/CRLF text, malformed TOML/YAML/JSONC, broken entries inside otherwise
 * valid files — every parser must fail soft and never take the bridge down.
 */
import { describe, expect, it } from 'vitest'
import { sep } from 'node:path'
import { fx } from './fixture-paths.js'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { AgentDefinitionError, parseAgentDefinition } from '../agent-definitions.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'
import { CursorSkillProvider } from '../agents/cursor/skills/provider.js'
import { CursorSettingsLoader } from '../agents/cursor/settings.js'
import { GeminiSkillProvider } from '../agents/gemini-cli/skills/provider.js'
import { GeminiSettingsLoader } from '../agents/gemini-cli/settings.js'
import { PiSkillProvider } from '../agents/pi/skills/provider.js'
import { PiSettingsLoader } from '../agents/pi/settings.js'
import { readJsonServerFiles } from '../mcp-bridge.js'
import { normalizeClaudeStyleEntry } from '../mcp-bridge.js'

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

describe('agent definitions: BOM / CRLF / malformed YAML', () => {
  it('parses a BOM-prefixed file with CRLF line endings', () => {
    const text = '\uFEFF---\r\nname: reviewer\r\ndescription: Reviews\r\ntools: Read, Grep\r\n---\r\nBe careful.\r\n'
    const definition = parseAgentDefinition(text)
    expect(definition.name).toBe('reviewer')
    expect(definition.tools).toEqual(['Read', 'Grep'])
    expect(definition.body).toContain('Be careful.')
  })

  it('fails closed on malformed YAML and wrong-typed fields', () => {
    expect(() => parseAgentDefinition('---\nname: [broken\n---\nBody')).toThrow(AgentDefinitionError)
    expect(() => parseAgentDefinition('---\nname: x\ndescription: y\ntools: {}\n---\nBody')).not.toThrow()
    expect(() => parseAgentDefinition('---\nname: x\ndescription: 42\n---\nBody')).toThrow(AgentDefinitionError)
    expect(parseAgentDefinition('---\nname: x\ndescription: y\nmaxTurns: -3\n---\nBody').maxTurns).toBeUndefined()
  })
})

describe('codex settings: malformed TOML and broken entries fail soft', () => {
  it('skips a broken layer and still loads the healthy one', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.codex', 'config.toml'), 'not [ valid toml'],
      [fx('proj', '.codex', 'config.toml'), '[mcp_servers.ok]\ncommand = "m"\n'],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: fx('home', 'u', '.codex') })
    const settings = await loader.load(fx('proj'))
    expect(settings.mcpServers.has('ok')).toBe(true)
  })

  it('drops invalid mcp_servers and agents entries individually', async () => {
    const files = new Map<string, string>([
      [
        fx('proj', '.codex', 'config.toml'),
        '[mcp_servers.bad]\nargs = "not-an-array"\n\n[mcp_servers.good]\ncommand = "m"\n\n[agents.role]\ndescription = 42\n\n[agents.valid-role]\ndescription = "A role"\nconfig_file = "role.toml"\n',
      ],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: fx('home', 'u', '.codex') })
    const settings = await loader.load(fx('proj'))
    expect(settings.mcpServers.has('good')).toBe(true)
    expect(settings.mcpServers.get('bad')?.command).toBeUndefined()
    expect(settings.agents.has('valid-role')).toBe(true)
    expect(settings.agents.has('role')).toBe(false)
  })

  it('ignores non-string trust_level values', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codex', 'config.toml'), '[projects."/proj"]\ntrust_level = 42\n\n[mcp_servers.ok]\ncommand = "m"\n'],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: fx('home', 'u', '.codex') })
    const settings = await loader.load(fx('proj'))
    expect(settings.mcpServers.has('ok')).toBe(true) // not gated by the invalid entry
  })
})

describe('opencode settings: broken entries fail soft', () => {
  it('keeps healthy families when one permission family is malformed', async () => {
    const files = new Map<string, string>([[fx('proj', 'opencode.json'), JSON.stringify({ permission: { bash: 42, edit: 'deny' } })]])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
    const settings = await loader.load(fx('proj'))
    expect(settings.permissions?.families.has('bash')).toBe(false)
    expect(settings.permissions?.families.get('edit')?.action).toBe('deny')
  })

  it('skips malformed mcp / references / agent entries while keeping valid ones', async () => {
    const files = new Map<string, string>([
      [
        fx('proj', 'opencode.json'),
        JSON.stringify({
          mcp: { good: { type: 'local', command: ['m'] }, bad: { type: 'bogus' } },
          references: { docs: { path: '../docs' }, broken: {} },
          agent: { ok: { mode: 'subagent', description: 'fine' }, nope: { mode: 'subagent' } },
        }),
      ],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
    const settings = await loader.load(fx('proj'))
    expect(settings.mcp.has('good')).toBe(true)
    expect(settings.mcp.has('bad')).toBe(false)
    expect(settings.references.has('docs')).toBe(true)
    expect(settings.references.has('broken')).toBe(false)
    expect(settings.agents.has('ok')).toBe(true)
    expect(settings.agents.has('nope')).toBe(false)
  })
})

describe('mcp-bridge: broken JSON files and entries fail soft', () => {
  const normalize = (name: string, entry: Record<string, unknown>) => normalizeClaudeStyleEntry(name, entry, 'test', 120_000)

  it('skips an invalid JSON file and still loads the healthy one', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.mcp.json'), '{ not json'],
      [fx('home', 'u', '.mcp.json'), JSON.stringify({ mcpServers: { db: { command: 'mdb' } } })],
    ])
    const servers = await readJsonServerFiles(new TreeFs(files), silent, [fx('proj', '.mcp.json'), fx('home', 'u', '.mcp.json')], normalize)
    expect(servers.has('db')).toBe(true)
    expect(servers.size).toBe(1)
  })

  it('drops entries without command or url, and non-string args', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.mcp.json'), JSON.stringify({ mcpServers: { broken: { args: [] }, noisy: { command: 'a', args: ['ok', 3, null] } } })],
    ])
    const servers = await readJsonServerFiles(new TreeFs(files), silent, [fx('proj', '.mcp.json')], normalize)
    expect(servers.has('broken')).toBe(false)
    expect(servers.get('noisy')?.config.transport).toBe('stdio')
  })
})

describe('pi: BOM / CRLF skills and broken settings fail soft', () => {
  it('parses a BOM-prefixed SKILL.md with CRLF line endings', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.pi', 'agent', 'skills', 'bom', 'SKILL.md'),
        '\uFEFF---\r\nname: bom-skill\r\ndescription: BOM skill\r\n---\r\nBody.\r\n',
      ],
    ])
    const loader = new PiSettingsLoader(silent, new TreeFs(files), { userPiDir: fx('home', 'u', '.pi', 'agent') })
    const provider = new PiSkillProvider(
      silent,
      new TreeFs(files),
      { userPiDir: fx('home', 'u', '.pi', 'agent'), watch: false },
      loader,
      () => {},
    )
    const result = (await provider.list({ cwd: fx('proj') })) as { candidates: { name: string }[] }
    expect(result.candidates.map((entry) => entry.name)).toEqual(['bom-skill'])
  })

  it('skips malformed skill files without taking the bridge down', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'skills', 'broken', 'SKILL.md'), '---\nname: [not yaml\n---\nBody.\n'],
      [fx('home', 'u', '.pi', 'agent', 'skills', 'good', 'SKILL.md'), '---\ndescription: good\n---\nBody.\n'],
    ])
    const loader = new PiSettingsLoader(silent, new TreeFs(files), { userPiDir: fx('home', 'u', '.pi', 'agent') })
    const provider = new PiSkillProvider(
      silent,
      new TreeFs(files),
      { userPiDir: fx('home', 'u', '.pi', 'agent'), watch: false },
      loader,
      () => {},
    )
    const result = (await provider.list({ cwd: fx('proj') })) as { candidates: { name: string }[] }
    expect(result.candidates.map((entry) => entry.name)).toEqual(['good'])
  })

  it('ignores broken settings.json and trust.json without losing user assets', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), '{ broken'],
      [fx('home', 'u', '.pi', 'agent', 'trust.json'), '[1,2,3]'], // non-mapping trust file
      [fx('home', 'u', '.pi', 'agent', 'skills', 'u-skill', 'SKILL.md'), '---\ndescription: d\n---\nBody.\n'],
      [fx('proj', '.pi', 'skills', 'p-skill', 'SKILL.md'), '---\ndescription: d\n---\nBody.\n'],
    ])
    const loader = new PiSettingsLoader(silent, new TreeFs(files), { userPiDir: fx('home', 'u', '.pi', 'agent') })
    const provider = new PiSkillProvider(
      silent,
      new TreeFs(files),
      { userPiDir: fx('home', 'u', '.pi', 'agent'), watch: false },
      loader,
      () => {},
    )
    const result = (await provider.list({ cwd: fx('proj') })) as { candidates: { name: string }[] }
    // Broken global settings fall back to defaults (ask → untrusted), so the
    // project skill stays gated; the user skill still loads.
    expect(result.candidates.map((entry) => entry.name)).toEqual(['u-skill'])
  })
})

describe('gemini-cli: BOM / CRLF skills and broken config fail soft', () => {
  it('parses a BOM-prefixed SKILL.md with CRLF line endings', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.gemini', 'skills', 'bom', 'SKILL.md'), '\uFEFF---\r\nname: bom-skill\r\ndescription: BOM skill\r\n---\r\nBody.\r\n'],
    ])
    const loader = new GeminiSettingsLoader(silent, new TreeFs(files), { userGeminiDir: fx('home', 'u', '.gemini') })
    const provider = new GeminiSkillProvider(
      silent,
      new TreeFs(files),
      { userGeminiDir: fx('home', 'u', '.gemini'), watch: false, agents: true },
      loader,
      () => {},
    )
    const result = (await provider.list({ cwd: fx('proj') })) as { candidates: { name: string }[] }
    expect(result.candidates.map((entry) => entry.name)).toEqual(['bom-skill'])
  })

  it('skips malformed skills and commands without taking the bridge down', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.gemini', 'skills', 'broken', 'SKILL.md'), '---\nname: [not yaml\n---\nBody.\n'],
      [fx('proj', '.gemini', 'skills', 'good', 'SKILL.md'), '---\ndescription: good\n---\nBody.\n'],
      [fx('proj', '.gemini', 'commands', 'bad.toml'), 'prompt = [broken\n'],
      [fx('proj', '.gemini', 'commands', 'ok.toml'), 'prompt = "fine"\n'],
    ])
    const loader = new GeminiSettingsLoader(silent, new TreeFs(files), { userGeminiDir: fx('home', 'u', '.gemini') })
    const provider = new GeminiSkillProvider(
      silent,
      new TreeFs(files),
      { userGeminiDir: fx('home', 'u', '.gemini'), watch: false, agents: true },
      loader,
      () => {},
    )
    const result = (await provider.list({ cwd: fx('proj') })) as { candidates: { name: string }[] }
    expect(result.candidates.map((entry) => entry.name).sort()).toEqual(['good', 'ok'])
  })

  it('ignores broken settings.json and policy TOML without losing assets', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.gemini', 'settings.json'), '{ broken'],
      [fx('home', 'u', '.gemini', 'policies', 'bad.toml'), '[[rule]\ntoolName = [oops\n'],
      [fx('home', 'u', '.gemini', 'skills', 'u-skill', 'SKILL.md'), '---\ndescription: d\n---\nBody.\n'],
    ])
    const loader = new GeminiSettingsLoader(silent, new TreeFs(files), { userGeminiDir: fx('home', 'u', '.gemini') })
    const provider = new GeminiSkillProvider(
      silent,
      new TreeFs(files),
      { userGeminiDir: fx('home', 'u', '.gemini'), watch: false, agents: true },
      loader,
      () => {},
    )
    const result = (await provider.list({ cwd: fx('proj') })) as { candidates: { name: string }[] }
    expect(result.candidates.map((entry) => entry.name)).toEqual(['u-skill'])
  })
})

describe('cursor: BOM / CRLF skills and broken JSONC config fail soft', () => {
  it('parses a BOM-prefixed SKILL.md and ignores malformed siblings', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.cursor', 'skills', 'bom', 'SKILL.md'), '\uFEFF---\r\nname: bom-skill\r\ndescription: BOM skill\r\n---\r\nBody.\r\n'],
      [fx('proj', '.cursor', 'skills', 'broken', 'SKILL.md'), '---\nname: [not yaml\n---\nBody.\n'],
      [fx('proj', '.cursor', 'skills', 'no-desc', 'SKILL.md'), '---\nname: no-desc\n---\nBody.\n'],
    ])
    const loader = new CursorSettingsLoader(silent, new TreeFs(files), { userCursorDir: fx('home', 'u', '.cursor') })
    const provider = new CursorSkillProvider(
      silent,
      new TreeFs(files),
      { userCursorDir: fx('home', 'u', '.cursor'), watch: false, agents: true },
      loader,
      () => {},
    )
    const result = (await provider.list({ cwd: fx('proj') })) as { candidates: { name: string }[] }
    expect(result.candidates.map((entry) => entry.name)).toEqual(['bom-skill'])
  })

  it('ignores broken cli.json / hooks.json / mcp.json without losing healthy files', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.cursor', 'cli.json'), '{ broken'],
      [fx('proj', '.cursor', 'hooks.json'), '[]'],
      [fx('proj', '.cursor', 'mcp.json'), '{"mcpServers": "nope"}'],
      [fx('home', 'u', '.cursor', 'cli-config.json'), JSON.stringify({ permissions: { allow: ['Shell(ls)'] } })],
    ])
    const loaded = await new CursorSettingsLoader(silent, new TreeFs(files), { userCursorDir: fx('home', 'u', '.cursor') }).load(fx('proj'))
    expect(loaded.permissionAllow).toEqual(['Shell(ls)'])
    expect(loaded.mcpServers.size).toBe(0)
    expect(loaded.byEvent.size).toBe(0)
  })
})
