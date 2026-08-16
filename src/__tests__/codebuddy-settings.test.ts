import { describe, expect, it } from 'vitest'
import type { FsAdapter, BridgeDirEntry } from '../fs-adapter.js'
import { CodebuddySettingsLoader } from '../agents/codebuddy-code/settings.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

class MemoryFs implements FsAdapter {
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
    const value = this.files.get(path)
    return value === undefined ? undefined : `v${value.length}`
  }
  async dirExists(): Promise<boolean> {
    return false
  }
}

function makeLoader(userJson: string, projectJson?: string, localJson?: string): CodebuddySettingsLoader {
  const files = new Map<string, string>()
  files.set('/home/u/.codebuddy/settings.json', userJson)
  if (projectJson !== undefined) files.set('/proj/.codebuddy/settings.json', projectJson)
  if (localJson !== undefined) files.set('/proj/.codebuddy/settings.local.json', localJson)
  return new CodebuddySettingsLoader(silent, new MemoryFs(files), { userCodebuddyDir: '/home/u/.codebuddy' })
}

describe('CodebuddySettingsLoader', () => {
  it('merges hook groups additively across levels', async () => {
    const loader = makeLoader(
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'a.sh' }] }] } }),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'b.sh' }] }] } }),
    )
    const loaded = await loader.load('/proj')
    expect(loaded.disabled).toBe(false)
    expect(loaded.byEvent.get('PreToolUse')).toHaveLength(2)
  })

  it('deduplicates an identical handler defined in several files', async () => {
    const handler = { type: 'command', command: 'same.sh' }
    const loader = makeLoader(
      JSON.stringify({ hooks: { Stop: [{ hooks: [handler] }] } }),
      JSON.stringify({ hooks: { Stop: [{ hooks: [handler] }] } }),
    )
    const loaded = await loader.load('/proj')
    expect(loaded.byEvent.get('Stop')?.[0]?.hooks).toHaveLength(1)
  })

  it('takes disableAllHooks from the most specific source that defines it', async () => {
    const enabled = makeLoader(JSON.stringify({ disableAllHooks: true }), JSON.stringify({ disableAllHooks: false }))
    expect((await enabled.load('/proj')).disabled).toBe(false)

    const disabled = makeLoader(JSON.stringify({ disableAllHooks: false }), JSON.stringify({}), JSON.stringify({ disableAllHooks: true }))
    expect((await disabled.load('/proj')).disabled).toBe(true)
  })

  it('merges env with most-specific-wins', async () => {
    const loader = makeLoader(JSON.stringify({ env: { A: 'user', B: 'user' } }), JSON.stringify({ env: { B: 'project' } }))
    const loaded = await loader.load('/proj')
    expect(loaded.env).toEqual({ A: 'user', B: 'project' })
  })

  it('resolves skillOverrides with most-specific valid value winning', async () => {
    const loader = makeLoader(
      JSON.stringify({ skillOverrides: { shared: 'on', userOnly: 'off' } }),
      JSON.stringify({ skillOverrides: { shared: 'off' } }),
      JSON.stringify({ skillOverrides: { shared: 'name-only' } }),
    )
    const loaded = await loader.load('/proj')
    expect(loaded.skillOverrides.get('shared')).toBe('name-only')
    expect(loaded.skillOverrides.get('userOnly')).toBe('off')
  })

  it('filters invalid override values per file, falling back to the previous valid file', async () => {
    const loader = makeLoader(
      JSON.stringify({ skillOverrides: { a: 'banana', b: 'off' } }),
      JSON.stringify({ skillOverrides: { a: 'on', c: 'also-bad' } }),
    )
    const loaded = await loader.load('/proj')
    // `a` is invalid only in the user file; the project value wins.
    expect(loaded.skillOverrides.get('a')).toBe('on')
    // `b` stays from the user file.
    expect(loaded.skillOverrides.get('b')).toBe('off')
    // `c` is invalid everywhere: treated as `on` (absent from the map).
    expect(loaded.skillOverrides.has('c')).toBe(false)
  })

  it('ignores invalid JSON with a warning instead of throwing', async () => {
    const loader = makeLoader('{not json', JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x.sh' }] }] } }))
    const loaded = await loader.load('/proj')
    expect(loaded.byEvent.get('Stop')).toHaveLength(1)
  })

  it('drops handlers with unsupported shapes (prompt/agent are not bridged)', async () => {
    const loader = makeLoader(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              hooks: [
                { type: 'command', command: 'ok.sh' },
                { type: 'command' },
                { type: 'prompt', prompt: 'x' },
                { type: 'agent', agentType: 'Explore' },
                'junk',
              ],
            },
          ],
        },
      }),
    )
    const loaded = await loader.load('/proj')
    expect(loaded.byEvent.get('PreToolUse')?.[0]?.hooks).toHaveLength(1)
  })

  it('returns a stable cached view while the files are unchanged', async () => {
    const loader = makeLoader(JSON.stringify({ env: { A: '1' } }))
    const first = await loader.load('/proj')
    const second = await loader.load('/proj')
    expect(second).toBe(first)
  })

  it('exposes the consulted settings paths for watchers', () => {
    const loader = makeLoader('{}')
    expect(loader.sourcePaths('/proj')).toEqual([
      '/home/u/.codebuddy/settings.json',
      '/proj/.codebuddy/settings.json',
      '/proj/.codebuddy/settings.local.json',
    ])
  })
})
