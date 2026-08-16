/**
 * Adversarial-input corpus shared by the bridge parsers (quality.md §3.3):
 * BOM/CRLF text, malformed TOML/YAML/JSONC, broken entries inside otherwise
 * valid files — every parser must fail soft and never take the bridge down.
 */
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { AgentDefinitionError, parseAgentDefinition } from '../agent-definitions.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'
import { readJsonServerFiles } from '../mcp-bridge.js'
import { normalizeClaudeStyleEntry } from '../mcp-bridge.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

class TreeFs implements FsAdapter {
  constructor(public files: Map<string, string>) {}
  async listDir(): Promise<BridgeDirEntry[]> {
    return []
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
      ['/home/u/.codex/config.toml', 'not [ valid toml'],
      ['/proj/.codex/config.toml', '[mcp_servers.ok]\ncommand = "m"\n'],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: '/home/u/.codex' })
    const settings = await loader.load('/proj')
    expect(settings.mcpServers.has('ok')).toBe(true)
  })

  it('drops invalid mcp_servers and agents entries individually', async () => {
    const files = new Map<string, string>([
      [
        '/proj/.codex/config.toml',
        '[mcp_servers.bad]\nargs = "not-an-array"\n\n[mcp_servers.good]\ncommand = "m"\n\n[agents.role]\ndescription = 42\n\n[agents.valid-role]\ndescription = "A role"\nconfig_file = "role.toml"\n',
      ],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: '/home/u/.codex' })
    const settings = await loader.load('/proj')
    expect(settings.mcpServers.has('good')).toBe(true)
    expect(settings.mcpServers.get('bad')?.command).toBeUndefined()
    expect(settings.agents.has('valid-role')).toBe(true)
    expect(settings.agents.has('role')).toBe(false)
  })

  it('ignores non-string trust_level values', async () => {
    const files = new Map<string, string>([
      ['/proj/.codex/config.toml', '[projects."/proj"]\ntrust_level = 42\n\n[mcp_servers.ok]\ncommand = "m"\n'],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: '/home/u/.codex' })
    const settings = await loader.load('/proj')
    expect(settings.mcpServers.has('ok')).toBe(true) // not gated by the invalid entry
  })
})

describe('opencode settings: broken entries fail soft', () => {
  it('keeps healthy families when one permission family is malformed', async () => {
    const files = new Map<string, string>([['/proj/opencode.json', JSON.stringify({ permission: { bash: 42, edit: 'deny' } })]])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: '/home/u/.config/opencode' })
    const settings = await loader.load('/proj')
    expect(settings.permissions?.families.has('bash')).toBe(false)
    expect(settings.permissions?.families.get('edit')?.action).toBe('deny')
  })

  it('skips malformed mcp / references / agent entries while keeping valid ones', async () => {
    const files = new Map<string, string>([
      [
        '/proj/opencode.json',
        JSON.stringify({
          mcp: { good: { type: 'local', command: ['m'] }, bad: { type: 'bogus' } },
          references: { docs: { path: '../docs' }, broken: {} },
          agent: { ok: { mode: 'subagent', description: 'fine' }, nope: { mode: 'subagent' } },
        }),
      ],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: '/home/u/.config/opencode' })
    const settings = await loader.load('/proj')
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
      ['/proj/.mcp.json', '{ not json'],
      ['/home/u/.mcp.json', JSON.stringify({ mcpServers: { db: { command: 'mdb' } } })],
    ])
    const servers = await readJsonServerFiles(new TreeFs(files), silent, ['/proj/.mcp.json', '/home/u/.mcp.json'], normalize)
    expect(servers.has('db')).toBe(true)
    expect(servers.size).toBe(1)
  })

  it('drops entries without command or url, and non-string args', async () => {
    const files = new Map<string, string>([
      ['/proj/.mcp.json', JSON.stringify({ mcpServers: { broken: { args: [] }, noisy: { command: 'a', args: ['ok', 3, null] } } })],
    ])
    const servers = await readJsonServerFiles(new TreeFs(files), silent, ['/proj/.mcp.json'], normalize)
    expect(servers.has('broken')).toBe(false)
    expect(servers.get('noisy')?.config.transport).toBe('stdio')
  })
})
