import { join, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { GeminiSettingsLoader } from '../agents/gemini-cli/settings.js'
import { fx } from './fixture-paths.js'

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
    if (![...this.files.keys()].some((key) => key.startsWith(path))) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
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
    return [...this.files.keys()].some((key) => key.startsWith(`${path}${sep}`))
  }
}

const USER_DIR = fx('home', 'u', '.gemini')
const SYS_DIR = fx('etc', 'gemini-cli')

function makeLoader(files: Map<string, string>): GeminiSettingsLoader {
  return new GeminiSettingsLoader(silent, new TreeFs(files), { userGeminiDir: USER_DIR })
}

describe('gemini settings merge', () => {
  it('merges hooks additively and deduplicates identical handlers', async () => {
    const handler = { type: 'command', command: 'echo hi' }
    const other = { type: 'command', command: 'echo bye' }
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.gemini', 'settings.json'),
        JSON.stringify({ hooks: { BeforeTool: [{ matcher: 'run_shell_command', hooks: [handler] }] } }),
      ],
      [
        fx('proj', '.gemini', 'settings.json'),
        JSON.stringify({
          hooks: {
            BeforeTool: [
              { matcher: 'run_shell_command', hooks: [handler] },
              { matcher: 'read_file', hooks: [other] },
            ],
          },
        }),
      ],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    const groups = loaded.byEvent.get('BeforeTool') ?? []
    expect(groups).toHaveLength(2) // the duplicate group collapsed, the new one merged
    expect(groups.flatMap((group) => group.hooks)).toHaveLength(2)
  })

  it('lets the most specific layer win per mcpServers name and scalar keys', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.gemini', 'settings.json'),
        JSON.stringify({ mcpServers: { db: { command: 'userdb' } }, context: { fileName: 'CTX.md' } }),
      ],
      [
        fx('proj', '.gemini', 'settings.json'),
        JSON.stringify({ mcpServers: { db: { command: 'projdb' }, web: { httpUrl: 'https://x' } } }),
      ],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.mcpServers.get('db')?.command).toBe('projdb')
    expect(loaded.mcpServers.get('web')?.httpUrl).toBe('https://x')
    expect(loaded.contextFileName).toEqual(['CTX.md'])
  })

  it('reads skills.enabled / skills.disabled and mcp.allowed / mcp.excluded', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.gemini', 'settings.json'),
        JSON.stringify({ skills: { enabled: false, disabled: ['a', 'b'] }, mcp: { allowed: ['db'], excluded: ['web'] } }),
      ],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.skillsEnabled).toBe(false)
    expect(loaded.skillsDisabled).toEqual(new Set(['a', 'b']))
    expect(loaded.mcpAllowed).toEqual(['db'])
    expect(loaded.mcpExcluded).toEqual(['web'])
  })

  it('fails soft on broken JSON settings files', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.gemini', 'settings.json'), '{ broken'],
      [
        fx('proj', '.gemini', 'settings.json'),
        JSON.stringify({ hooks: { BeforeTool: [{ hooks: [{ type: 'command', command: 'ok' }] }] } }),
      ],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.byEvent.get('BeforeTool')).toHaveLength(1)
    expect(loaded.contextFileName).toEqual(['GEMINI.md'])
  })

  it('drops mcpServers entries without a transport and invalid hook handlers', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.gemini', 'settings.json'),
        JSON.stringify({
          mcpServers: { broken: { args: [] }, good: { command: 'x' } },
          hooks: { BeforeTool: [{ hooks: [{ type: 'http', url: 'x' }, 3] }] },
        }),
      ],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.mcpServers.has('broken')).toBe(false)
    expect(loaded.mcpServers.has('good')).toBe(true)
    expect(loaded.byEvent.get('BeforeTool')).toBeUndefined() // http type and non-objects dropped
  })

  it('honors GEMINI_CLI_HOME over the configured directory', () => {
    const previous = process.env['GEMINI_CLI_HOME']
    process.env['GEMINI_CLI_HOME'] = fx('custom', 'gemini')
    try {
      const loader = makeLoader(new Map())
      expect(loader.userDir()).toBe(fx('custom', 'gemini'))
    } finally {
      if (previous === undefined) delete process.env['GEMINI_CLI_HOME']
      else process.env['GEMINI_CLI_HOME'] = previous
    }
  })

  it('invalidates the cache when settings files change (stamp-based)', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.gemini', 'settings.json'), JSON.stringify({ context: { discoveryMaxDirs: 10 } })],
    ])
    const loader = makeLoader(files)
    expect((await loader.load(fx('proj'))).discoveryMaxDirs).toBe(10)
    files.set(fx('home', 'u', '.gemini', 'settings.json'), JSON.stringify({ context: { discoveryMaxDirs: 42 } }))
    expect((await loader.load(fx('proj'))).discoveryMaxDirs).toBe(42)
  })
})

describe('gemini settings path resolution', () => {
  it('resolves the system settings path through resolve()', async () => {
    const files = new Map<string, string>([[join(SYS_DIR, 'settings.json'), JSON.stringify({ context: { fileName: 'SYS.md' } })]])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.contextFileName).toEqual(['SYS.md'])
  })
})
