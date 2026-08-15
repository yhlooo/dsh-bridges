import { describe, expect, it } from 'vitest'
import type { FsAdapter, BridgeDirEntry } from '../fs-adapter.js'
import { SettingsLoader } from '../hooks/settings.js'

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

function makeLoader(userJson: string, projectJson?: string, localJson?: string): SettingsLoader {
  const files = new Map<string, string>()
  files.set('/home/u/.claude/settings.json', userJson)
  if (projectJson !== undefined) files.set('/proj/.claude/settings.json', projectJson)
  if (localJson !== undefined) files.set('/proj/.claude/settings.local.json', localJson)
  return new SettingsLoader(silent, new MemoryFs(files), { userClaudeDir: '/home/u/.claude' })
}

describe('SettingsLoader', () => {
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
    const enabled = makeLoader(
      JSON.stringify({ disableAllHooks: true }),
      JSON.stringify({ disableAllHooks: false }),
    )
    expect((await enabled.load('/proj')).disabled).toBe(false)

    const disabled = makeLoader(
      JSON.stringify({ disableAllHooks: false }),
      JSON.stringify({}),
      JSON.stringify({ disableAllHooks: true }),
    )
    expect((await disabled.load('/proj')).disabled).toBe(true)
  })

  it('merges env with most-specific-wins', async () => {
    const loader = makeLoader(
      JSON.stringify({ env: { A: 'user', B: 'user' } }),
      JSON.stringify({ env: { B: 'project' } }),
    )
    const loaded = await loader.load('/proj')
    expect(loaded.env).toEqual({ A: 'user', B: 'project' })
  })

  it('merges the HTTP allowlists across sources', async () => {
    const loader = makeLoader(
      JSON.stringify({ allowedHttpHookUrls: ['https://a.example/*'], httpHookAllowedEnvVars: ['X'] }),
      JSON.stringify({ allowedHttpHookUrls: ['https://b.example/*'], httpHookAllowedEnvVars: ['Y'] }),
    )
    const loaded = await loader.load('/proj')
    expect(loaded.allowedHttpHookUrls).toEqual(['https://a.example/*', 'https://b.example/*'])
    expect(loaded.httpHookAllowedEnvVars).toEqual(['X', 'Y'])
  })

  it('ignores invalid JSON with a warning instead of throwing', async () => {
    const loader = makeLoader('{not json', JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: 'command', command: 'x.sh' }] }] } }))
    const loaded = await loader.load('/proj')
    expect(loaded.byEvent.get('Stop')).toHaveLength(1)
  })

  it('drops handlers with unsupported shapes', async () => {
    const loader = makeLoader(
      JSON.stringify({
        hooks: {
          PreToolUse: [
            { hooks: [{ type: 'command', command: 'ok.sh' }, { type: 'command' }, { type: 'prompt', prompt: 'x' }, 'junk'] },
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
})
