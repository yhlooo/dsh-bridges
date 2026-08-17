import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { CursorSettingsLoader, parseJsonc } from '../agents/cursor/settings.js'
import { fx } from './fixture-paths.js'

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
    return [...this.files.keys()].some((key) => key.startsWith(`${path}${sep}`))
  }
}

const USER_DIR = fx('home', 'u', '.cursor')

function makeLoader(files: Map<string, string>): CursorSettingsLoader {
  return new CursorSettingsLoader(silent, new TreeFs(files), { userCursorDir: USER_DIR })
}

describe('cursor settings', () => {
  it('reads permissions.allow/deny from cli.json and cli-config.json (project wins)', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.cursor', 'cli-config.json'),
        JSON.stringify({ permissions: { allow: ['Shell(ls)'], deny: ['Shell(rm)'] }, approvalMode: 'default' }),
      ],
      [fx('proj', '.cursor', 'cli.json'), JSON.stringify({ permissions: { allow: ['Read(src/**)'] } })],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.permissionAllow).toEqual(['Read(src/**)'])
    expect(loaded.permissionDeny).toEqual(['Shell(rm)'])
    expect(loaded.approvalMode).toBe('default')
  })

  it('merges hooks from project and user with handler dedup', async () => {
    const handler = { type: 'command', command: './audit.sh', timeout: 30 }
    const files = new Map<string, string>([
      [fx('home', 'u', '.cursor', 'hooks.json'), JSON.stringify({ hooks: { preToolUse: [handler] } })],
      [
        fx('proj', '.cursor', 'hooks.json'),
        JSON.stringify({ hooks: { preToolUse: [handler, { command: './other.sh', matcher: 'Shell' }] } }),
      ],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    const groups = loaded.byEvent.get('preToolUse') ?? []
    expect(groups.flatMap((group) => group.hooks)).toHaveLength(2)
    // A handler-level matcher is preserved on its group (not dropped).
    const scoped = groups.find((group) => group.hooks.some((hook) => hook.command === './other.sh'))
    expect(scoped?.matcher).toBe('Shell')
    expect(scoped?.cwd).toBeUndefined() // project hooks run in the session working dir
    // User-level hooks run from the user config dir.
    const user = groups.find((group) => group.hooks.some((hook) => hook.command === './audit.sh'))
    expect(user?.cwd).toBe(USER_DIR)
  })

  it('parses JSONC config files (comments stripped)', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.cursor', 'cli.json'), '{\n  // allow listing\n  "permissions": { "allow": ["Shell(ls)" /* basic */] }\n}\n'],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.permissionAllow).toEqual(['Shell(ls)'])
  })

  it('reads mcpServers and permissions.json fields, failing soft on broken files', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { db: { type: 'stdio', command: 'mdb', envFile: 'servers/.env' } } }),
      ],
      [fx('proj', '.cursor', 'mcp.json'), '{ broken'],
      [fx('home', 'u', '.cursor', 'permissions.json'), JSON.stringify({ mcpAllowlist: ['db'], terminalAllowlist: ['npm'] })],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.mcpServers.get('db')?.command).toBe('mdb')
    expect(loaded.mcpAllowlist).toEqual(['db'])
    expect(loaded.terminalAllowlist).toEqual(['npm'])
  })

  it('honors CURSOR_CONFIG_DIR over the configured directory', () => {
    const previous = process.env['CURSOR_CONFIG_DIR']
    process.env['CURSOR_CONFIG_DIR'] = fx('custom', 'cursor')
    try {
      expect(makeLoader(new Map()).userDir()).toBe(fx('custom', 'cursor'))
    } finally {
      if (previous === undefined) delete process.env['CURSOR_CONFIG_DIR']
      else process.env['CURSOR_CONFIG_DIR'] = previous
    }
  })
})

describe('parseJsonc', () => {
  it('strips line and block comments without touching strings', () => {
    expect(parseJsonc('{"a": "http://x", "b": /* c */ 1, // d\n"e": 2}')).toEqual({ a: 'http://x', b: 1, e: 2 })
  })
})
