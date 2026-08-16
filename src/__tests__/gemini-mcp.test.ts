import { describe, expect, it } from 'vitest'
import { normalizeGeminiServer } from '../agents/gemini-cli/mcp.js'
import type { RawGeminiMcpServer } from '../agents/gemini-cli/settings.js'
import { fx } from './fixture-paths.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

const base = { baseDir: '/gemini' } as Pick<RawGeminiMcpServer, 'baseDir'>

describe('gemini MCP normalization', () => {
  it('prefers httpUrl over url over command', () => {
    const entry: RawGeminiMcpServer = { ...base, httpUrl: 'https://h', url: 'https://s', command: 'cmd' }
    const normalized = normalizeGeminiServer('db', entry, 120_000, silent)!
    expect(normalized.config.transport).toBe('streamable-http')
    expect((normalized.config as { url?: string }).url).toBe('https://h')

    const sse = normalizeGeminiServer('db', { ...base, url: 'https://s', command: 'cmd' }, 120_000, silent)!
    expect(sse.config.transport).toBe('streamable-http')

    const stdio = normalizeGeminiServer('db', { ...base, command: 'mdb', args: ['--x'], env: { TOKEN: '${VAR}' } }, 120_000, silent)!
    expect(stdio.config.transport).toBe('stdio')
    expect((stdio.config as { command?: string }).command).toBe('mdb')
  })

  it('sanitizes server names and warns on untrusted servers', () => {
    const normalized = normalizeGeminiServer('bad name!', { ...base, command: 'x', trust: false }, 120_000, silent)!
    expect(normalized.config.serverName).not.toContain(' ')
  })

  it('resolves relative cwd against the declaring settings directory', () => {
    const normalized = normalizeGeminiServer(
      'db',
      { ...base, baseDir: fx('proj', '.gemini'), command: 'x', cwd: 'servers' },
      120_000,
      silent,
    )!
    expect((normalized.config as { cwd?: string }).cwd).toBe(fx('proj', '.gemini', 'servers'))
  })
})
