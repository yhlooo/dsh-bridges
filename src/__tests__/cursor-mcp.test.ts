import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { interpolateCursor, normalizeCursorServer } from '../agents/cursor/mcp.js'
import type { RawCursorMcpServer } from '../agents/cursor/settings.js'
import { fx } from './fixture-paths.js'

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
    return [...this.files.keys()].some((key) => key.startsWith(`${path}${sep}`))
  }
}

describe('cursor MCP normalization', () => {
  it('normalizes stdio entries with ${env:} and ${workspaceFolder} interpolation plus envFile', async () => {
    process.env['CURSOR_TEST_TOKEN'] = 'secret-token'
    try {
      const fs = new TreeFs(new Map([[fx('proj', '.cursor', 'servers', '.env'), 'EXTRA=from-file\n']]))
      const entry: RawCursorMcpServer = {
        baseDir: fx('proj', '.cursor'),
        type: 'stdio',
        command: '${env:CURSOR_TEST_TOKEN}-wrapper',
        args: ['--dir', '${workspaceFolder}/src'],
        env: { TOKEN: '${env:CURSOR_TEST_TOKEN}' },
        envFile: 'servers/.env',
      }
      const normalized = await normalizeCursorServer(fs, 'db', entry, fx('proj'), 120_000)!
      expect(normalized.config.transport).toBe('stdio')
      expect((normalized.config as { command?: string }).command).toBe('secret-token-wrapper')
      expect((normalized.config as { args?: string[] }).args).toEqual(['--dir', `${fx('proj')}/src`])
      expect((normalized.config as { env?: Record<string, string> }).env).toEqual({ TOKEN: 'secret-token', EXTRA: 'from-file' })
    } finally {
      delete process.env['CURSOR_TEST_TOKEN']
    }
  })

  it('normalizes remote entries to streamable-http with header interpolation', async () => {
    const fs = new TreeFs(new Map())
    const entry: RawCursorMcpServer = {
      baseDir: fx('proj', '.cursor'),
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer ${env:TOKEN}' },
    }
    const normalized = await normalizeCursorServer(fs, 'web', entry, fx('proj'), 120_000)!
    expect(normalized.config.transport).toBe('streamable-http')
    expect((normalized.config as { headers?: Record<string, string> }).headers).toEqual({ Authorization: 'Bearer ' })
  })

  it('interpolates cursor references', () => {
    expect(interpolateCursor('${workspaceFolder}/x ${env:HOME}', '/ws')).toBe(`/ws/x ${process.env['HOME'] ?? ''}`)
  })
})
