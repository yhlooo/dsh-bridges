import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

class TreeFs implements FsAdapter {
  constructor(public files: Map<string, string>) {}

  private children(path: string): BridgeDirEntry[] {
    const prefix = path.endsWith('/') ? path : `${path}/`
    const names = new Set<string>()
    for (const key of this.files.keys()) {
      if (!key.startsWith(prefix)) continue
      const rest = key.slice(prefix.length)
      if (rest === '') continue
      names.add(rest.split('/')[0]!)
    }
    return [...names].map((name) => ({
      name,
      isDir: [...this.files.keys()].some((key) => key.startsWith(`${prefix}${name}/`)),
      isFile: ![...this.files.keys()].some((key) => key.startsWith(`${prefix}${name}/`)),
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

function makeLoader(files: Map<string, string>): CodexSettingsLoader {
  return new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: '/home/u/.codex' })
}

const sessionHook = { type: 'command', command: 'session.py' }
const toolHook = { type: 'command', command: 'policy.py', timeout: 30 }

describe('CodexSettingsLoader', () => {
  it('merges hooks from hooks.json and inline TOML across layers, deduplicating identical handlers', async () => {
    const files = new Map<string, string>([
      ['/home/u/.codex/hooks.json', JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [sessionHook] }] } })],
      [
        '/home/u/.codex/config.toml',
        `[[hooks.PreToolUse]]\nmatcher = "^Bash$"\n[[hooks.PreToolUse.hooks]]\ntype = "command"\ncommand = "policy.py"\ntimeout = 30\n`,
      ],
      ['/proj/.codex/hooks.json', JSON.stringify({ hooks: { SessionStart: [{ matcher: 'startup', hooks: [sessionHook] }, { hooks: [{ type: 'command', command: 'extra.py' }] }] } })],
    ])
    const loaded = await makeLoader(files).load('/proj')
    const session = loaded.byEvent.get('SessionStart')!
    // The identical handler from the project layer collapsed.
    expect(session.map((group) => group.hooks.length)).toEqual([1, 1])
    expect(session.flatMap((group) => group.hooks.map((handler) => handler.command))).toEqual(['session.py', 'extra.py'])
    const pre = loaded.byEvent.get('PreToolUse')!
    expect(pre[0]!.matcher).toBe('^Bash$')
    expect(pre[0]!.hooks).toEqual([toolHook])
  })

  it('disables hooks via [features].hooks = false in the most specific layer', async () => {
    const files = new Map<string, string>([
      ['/home/u/.codex/hooks.json', JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x' }] }] } })],
      ['/proj/.codex/config.toml', '[features]\nhooks = false\n'],
    ])
    const loaded = await makeLoader(files).load('/proj')
    expect(loaded.hooksDisabled).toBe(true)
    expect(loaded.byEvent.size).toBeGreaterThan(0) // still merged, just disabled
  })

  it('collects disabled skill paths from [[skills.config]] entries, resolving relative paths', async () => {
    const files = new Map<string, string>([
      [
        '/home/u/.codex/config.toml',
        '[[skills.config]]\npath = "/home/u/.agents/skills/off-skill"\nenabled = false\n',
      ],
      ['/proj/.codex/config.toml', '[[skills.config]]\npath = ".agents/skills/proj-off"\nenabled = false\n[[skills.config]]\npath = ".agents/skills/on-skill"\nenabled = true\n'],
    ])
    const loaded = await makeLoader(files).load('/proj')
    expect(loaded.skillDisabledPaths).toContain('/home/u/.agents/skills/off-skill')
    expect(loaded.skillDisabledPaths).toContain('/proj/.codex/.agents/skills/proj-off')
    expect(loaded.skillDisabledPaths).not.toContain('/proj/.codex/.agents/skills/on-skill')
  })

  it('reads project_doc_* keys from the most specific layer with Codex defaults', async () => {
    const plain = await makeLoader(new Map()).load('/proj')
    expect(plain.projectDocMaxBytes).toBe(32 * 1024)
    expect(plain.projectDocFallbackFilenames).toEqual([])
    expect(plain.projectRootMarkers).toEqual(['.git'])

    const files = new Map<string, string>([
      [
        '/proj/.codex/config.toml',
        'project_doc_max_bytes = 100\nproject_doc_fallback_filenames = ["TEAM.md"]\nproject_root_markers = [".git", ".hg"]\n',
      ],
    ])
    const loaded = await makeLoader(files).load('/proj')
    expect(loaded.projectDocMaxBytes).toBe(100)
    expect(loaded.projectDocFallbackFilenames).toEqual(['TEAM.md'])
    expect(loaded.projectRootMarkers).toEqual(['.git', '.hg'])
  })

  it('ignores invalid TOML and JSON files with a warning', async () => {
    const files = new Map<string, string>([
      ['/home/u/.codex/config.toml', 'not = [valid toml'],
      ['/proj/.codex/hooks.json', '{broken'],
    ])
    const loaded = await makeLoader(files).load('/proj')
    expect(loaded.hooksDisabled).toBe(false)
    expect(loaded.byEvent.size).toBe(0)
  })

  it('drops malformed handlers and non-command hook types', async () => {
    const files = new Map<string, string>([
      [
        '/home/u/.codex/hooks.json',
        JSON.stringify({
          hooks: {
            Stop: [
              {
                hooks: [
                  { type: 'prompt', prompt: 'x' },
                  { type: 'command', command: '' },
                  { command: 'no-type.py' },
                  { type: 'command', command: 'ok.py' },
                ],
              },
            ],
          },
        }),
      ],
    ])
    const loaded = await makeLoader(files).load()
    const stop = loaded.byEvent.get('Stop')!
    expect(stop.flatMap((group) => group.hooks).map((handler) => handler.command)).toEqual(['ok.py'])
  })
})
