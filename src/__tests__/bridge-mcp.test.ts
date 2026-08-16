import { describe, expect, it } from 'vitest'
import { fx } from './fixture-paths.js'
import { sep } from 'node:path'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { CodebuddyMcpManager } from '../agents/codebuddy-code/mcp.js'
import { CodebuddySettingsLoader } from '../agents/codebuddy-code/settings.js'
import { normalizeCodexServer } from '../agents/codex/mcp.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'
import { OpencodeMcpManager, normalizeOpencodeServer } from '../agents/opencode/mcp.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'

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

function fakeCtx(pluginCalls: unknown[]) {
  return {
    plugin: (_plugin: unknown, config: unknown) => {
      pluginCalls.push(config)
      const fiber: any = Promise.resolve({ dispose: () => Promise.resolve() })
      fiber.dispose = () => Promise.resolve()
      return fiber
    },
    on: () => {},
  } as never
}

describe('codebuddy MCP', () => {
  it('reads user and project mcp files with the approval policy', async () => {
    const pluginCalls: unknown[] = []
    const files = new Map<string, string>([
      [fx('home', 'u', '.codebuddy', '.mcp.json'), JSON.stringify({ mcpServers: { userdb: { command: 'a' }, shared: { command: 'b' } } })],
      [fx('proj', '.mcp.json'), JSON.stringify({ mcpServers: { teamdb: { command: 'c' }, shared: { command: 'd' } } })],
      [fx('proj', '.codebuddy', 'settings.json'), JSON.stringify({ enabledMcpjsonServers: ['teamdb', 'shared'] })],
    ])
    const loader = new CodebuddySettingsLoader(silent, new TreeFs(files), { userCodebuddyDir: fx('home', 'u', '.codebuddy') })
    const manager = new CodebuddyMcpManager(
      fakeCtx(pluginCalls),
      silent,
      new TreeFs(files),
      { userCodebuddyDir: fx('home', 'u', '.codebuddy'), toolCallTimeoutMs: 120_000 },
      loader,
    )
    await manager.reconcile(fx('proj'))
    const names = (pluginCalls as { serverName: string }[]).map((config) => config.serverName).sort()
    expect(names).toEqual(['codebuddy__shared', 'codebuddy__teamdb', 'codebuddy__userdb'])
    const shared = (pluginCalls as { serverName: string; transport: string; command?: string }[]).find(
      (config) => config.serverName === 'codebuddy__shared',
    )
    expect(shared?.command).toBe('d') // project overrides user
  })
})

describe('codex MCP', () => {
  it('parses [mcp_servers] tables from config.toml layers', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.codex', 'config.toml'),
        '[mcp_servers.github]\ncommand = "gh-mcp"\nargs = ["serve"]\nenv = { TOKEN = "${GH_TOKEN}" }\nenv_vars = ["EXTRA"]\n\n[mcp_servers.remote]\nurl = "https://mcp.example.com"\nhttp_headers = { "X-Key" = "abc" }\nbearer_token_env_var = "MCP_TOKEN"\n\n[mcp_servers.off]\ncommand = "x"\nenabled = false\n',
      ],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: fx('home', 'u', '.codex') })
    const settings = await loader.load(fx('proj'))
    expect(settings.mcpServers.size).toBe(3)
    expect(settings.mcpServers.get('github')?.command).toBe('gh-mcp')
  })

  it('normalizes stdio and http entries', () => {
    const stdio = normalizeCodexServer('github', { command: 'gh-mcp', args: ['serve'], env: { A: 'b' }, env_vars: ['EXTRA'] }, 120_000)
    expect(stdio?.config.transport).toBe('stdio')
    const http = normalizeCodexServer(
      'remote',
      { url: 'https://mcp.example.com', http_headers: { 'X-Key': 'abc' }, bearer_token_env_var: 'MCP_TOKEN' },
      120_000,
    )
    expect(http?.config.transport).toBe('streamable-http')
    expect(normalizeCodexServer('off', { command: 'x', enabled: false }, 120_000)).toBeUndefined()
  })
})

describe('opencode MCP', () => {
  it('parses the mcp object with project override', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.config', 'opencode', 'opencode.json'),
        JSON.stringify({
          mcp: {
            local: { type: 'local', command: ['npx', 'server'] },
            remote: { type: 'remote', url: 'https://mcp.example.com' },
            off: { type: 'local', command: ['x'], enabled: false },
          },
        }),
      ],
      [fx('proj', 'opencode.json'), JSON.stringify({ mcp: { local: { type: 'local', command: ['bun', 'server'] } } })],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
    const settings = await loader.load(fx('proj'))
    expect(settings.mcp.size).toBe(3)
    expect(settings.mcp.get('local')?.command).toEqual(['bun', 'server']) // project override
  })

  it('normalizes local and remote entries', () => {
    const local = normalizeOpencodeServer('local', { type: 'local', command: ['npx', 'server'], enabled: true }, 120_000)
    expect(local?.config.transport).toBe('stdio')
    const remote = normalizeOpencodeServer('remote', { type: 'remote', url: 'https://mcp.example.com', enabled: true }, 120_000)
    expect(remote?.config.transport).toBe('streamable-http')
    expect(normalizeOpencodeServer('off', { type: 'local', command: ['x'], enabled: false }, 120_000)).toBeUndefined()
  })
})

describe('opencode MCP manager', () => {
  it('reconciles configured servers', async () => {
    const pluginCalls: unknown[] = []
    const files = new Map<string, string>([
      [fx('proj', 'opencode.json'), JSON.stringify({ mcp: { mydb: { type: 'local', command: ['mdb-server'], enabled: true } } })],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
    const manager = new OpencodeMcpManager(fakeCtx(pluginCalls), silent, new TreeFs(files), { toolCallTimeoutMs: 120_000 }, loader)
    await manager.reconcile(fx('proj'))
    expect((pluginCalls as { serverName: string }[]).map((config) => config.serverName)).toEqual(['opencode__mydb'])
  })
})
