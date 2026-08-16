import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { ClaudeMcpManager, expandEnvReferences, normalizeServer, sanitizeServerName } from '../agents/claude-code/mcp.js'
import { SettingsLoader } from '../agents/claude-code/hooks/settings.js'

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
  async dirExists(): Promise<boolean> {
    return false
  }
}

describe('normalizeServer', () => {
  it('maps a stdio entry onto the stdio transport', () => {
    const server = normalizeServer('notion', { command: 'npx', args: ['-y', 'server'], env: { TOKEN: '${NOTION_TOKEN}' } }, 120_000)
    expect(server?.config.transport).toBe('stdio')
    if (server?.config.transport === 'stdio') {
      expect(server.config.serverName).toBe('claude__notion')
      expect(server.config.command).toBe('npx')
      expect(server.config.args).toEqual(['-y', 'server'])
    }
  })

  it('maps http/sse entries onto the streamable-http transport', () => {
    const server = normalizeServer('remote', { type: 'http', url: 'https://example.com/mcp', headers: { Authorization: 'x' } }, 120_000)
    expect(server?.config.transport).toBe('streamable-http')
    const sse = normalizeServer('legacy', { type: 'sse', url: 'https://example.com/sse' }, 120_000)
    expect(sse?.config.transport).toBe('streamable-http')
  })

  it('rejects entries without a command or url', () => {
    expect(normalizeServer('broken', { args: [] }, 120_000)).toBeUndefined()
  })

  it('sanitizes server names into the dsh namespace', () => {
    expect(sanitizeServerName('my.server', 'claude')).toBe('claude__my_server')
    expect(sanitizeServerName('', 'claude')).toBeUndefined()
    expect(sanitizeServerName('!@#$', 'claude')).toBe('claude______')
  })
})

describe('expandEnvReferences', () => {
  it('expands ${VAR} references from the environment', () => {
    process.env['MCP_TEST_TOKEN'] = 'secret'
    expect(expandEnvReferences('token=${MCP_TEST_TOKEN}')).toBe('token=secret')
    delete process.env['MCP_TEST_TOKEN']
  })

  it('keeps unknown references verbatim', () => {
    expect(expandEnvReferences('${DEFINITELY_UNSET_VAR_XYZ}')).toBe('${DEFINITELY_UNSET_VAR_XYZ}')
  })
})

describe('ClaudeMcpManager.reconcile', () => {
  function makeManager(files: Map<string, string>, pluginCalls: unknown[]): ClaudeMcpManager {
    const ctx = {
      plugin: (plugin: unknown, config: unknown) => {
        pluginCalls.push(config)
        const fiber: any = Promise.resolve({ dispose: () => Promise.resolve() })
        fiber.dispose = () => Promise.resolve()
        return fiber
      },
      on: () => {},
    } as never
    const settingsLoader = new SettingsLoader(silent, new TreeFs(files), { userClaudeDir: '/home/u/.claude' })
    return new ClaudeMcpManager(
      ctx,
      silent,
      new TreeFs(files),
      { userClaudeDir: '/home/u/.claude', toolCallTimeoutMs: 120_000 },
      settingsLoader,
    )
  }

  it('registers user servers and lets approved project servers override same-name user ones', async () => {
    const pluginCalls: unknown[] = []
    const files = new Map<string, string>([
      ['/home/u/.claude.json', JSON.stringify({ mcpServers: { shared: { command: 'a' }, useronly: { command: 'b' } } })],
      ['/proj/.mcp.json', JSON.stringify({ mcpServers: { shared: { command: 'c' } } })],
      ['/proj/.claude/settings.json', JSON.stringify({ enabledMcpjsonServers: ['shared'] })],
    ])
    const manager = makeManager(files, pluginCalls)
    await manager.reconcile('/proj')
    expect(pluginCalls).toHaveLength(2)
    const configs = pluginCalls as { serverName: string }[]
    expect(configs.map((config) => config.serverName).sort()).toEqual(['claude__shared', 'claude__useronly'])
    const shared = configs.find((config) => config.serverName === 'claude__shared')
    if (shared && shared.transport === 'stdio') expect(shared.command).toBe('c') // project overrides user
  })

  it('skips unapproved project servers unless enabled', async () => {
    const pluginCalls: unknown[] = []
    const files = new Map<string, string>([
      ['/proj/.mcp.json', JSON.stringify({ mcpServers: { unapproved: { command: 'a' }, approved: { command: 'b' } } })],
      ['/proj/.claude/settings.json', JSON.stringify({ enabledMcpjsonServers: ['approved'] })],
    ])
    const manager = makeManager(files, pluginCalls)
    await manager.reconcile('/proj')
    const configs = pluginCalls as { serverName: string }[]
    expect(configs.map((config) => config.serverName)).toEqual(['claude__approved'])
  })

  it('registers all project servers when enableAllProjectMcpServers is set', async () => {
    const pluginCalls: unknown[] = []
    const files = new Map<string, string>([
      ['/proj/.mcp.json', JSON.stringify({ mcpServers: { any: { command: 'a' } } })],
      ['/proj/.claude/settings.json', JSON.stringify({ enableAllProjectMcpServers: true })],
    ])
    const manager = makeManager(files, pluginCalls)
    await manager.reconcile('/proj')
    expect((pluginCalls as { serverName: string }[]).map((config) => config.serverName)).toEqual(['claude__any'])
  })

  it('disposes removed servers on re-reconcile', async () => {
    const pluginCalls: unknown[] = []
    const disposals: number[] = []
    const files = new Map<string, string>([
      ['/proj/.mcp.json', JSON.stringify({ mcpServers: { one: { command: 'a' } } })],
      ['/proj/.claude/settings.json', JSON.stringify({ enableAllProjectMcpServers: true })],
    ])
    const ctx = {
      plugin: (_plugin: unknown, _config: unknown) => {
        pluginCalls.push(_config)
        const fiber: any = Promise.resolve({
          dispose: () => {
            disposals.push(1)
            return Promise.resolve()
          },
        })
        fiber.dispose = () => {
          disposals.push(1)
          return Promise.resolve()
        }
        return fiber
      },
      on: () => {},
    } as never
    const settingsLoader = new SettingsLoader(silent, new TreeFs(files), { userClaudeDir: '/home/u/.claude' })
    const manager = new ClaudeMcpManager(
      ctx,
      silent,
      new TreeFs(files),
      { userClaudeDir: '/home/u/.claude', toolCallTimeoutMs: 120_000 },
      settingsLoader,
    )
    await manager.reconcile('/proj')
    files.delete('/proj/.mcp.json')
    await manager.reconcile('/proj')
    expect(disposals.length).toBe(1)
  })
})
