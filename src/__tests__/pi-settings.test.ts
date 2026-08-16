import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { PiSettingsLoader } from '../agents/pi/settings.js'
import { expandHome } from '../util.js'
import { fx } from './fixture-paths.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

/** An in-memory adapter that lists a path's direct children from the file map. */
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
    return [...this.files.keys()].some((key) => key.startsWith(`${path}${sep}`))
  }
}

const USER_PI_DIR = fx('home', 'u', '.pi', 'agent')

function makeLoader(files: Map<string, string>): PiSettingsLoader {
  return new PiSettingsLoader(silent, new TreeFs(files), { userPiDir: USER_PI_DIR })
}

describe('pi settings merge', () => {
  it('reads global skills/prompts arrays and resolves relative paths against the config dir', async () => {
    const absPrompts = fx('abs', 'prompts')
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.pi', 'agent', 'settings.json'),
        JSON.stringify({ skills: ['extra-skills', '~/shared/skills'], prompts: [absPrompts], enableSkillCommands: false }),
      ],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.skillPaths.map((entry) => entry.path)).toEqual([
      fx('home', 'u', '.pi', 'agent', 'extra-skills'),
      expandHome('~/shared/skills'),
    ])
    expect(loaded.skillPaths.every((entry) => entry.project === false)).toBe(true)
    expect(loaded.promptPaths.map((entry) => entry.path)).toEqual([absPrompts])
    expect(loaded.enableSkillCommands).toBe(false)
    expect(loaded.defaultProjectTrust).toBe('ask')
    expect(loaded.projectTrusted).toBe(false) // ask ≡ untrusted in non-interactive sessions
  })

  it('merges a trusted project layer and lets project arrays replace global ones', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ skills: ['global-skill'], defaultProjectTrust: 'always' })],
      [fx('proj', '.pi', 'settings.json'), JSON.stringify({ skills: ['project-skill'], prompts: ['p'] })],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.projectTrusted).toBe(true)
    expect(loaded.skillPaths.map((entry) => entry.path)).toEqual([fx('proj', '.pi', 'project-skill')])
    expect(loaded.skillPaths[0]!.project).toBe(true)
    expect(loaded.promptPaths.map((entry) => entry.path)).toEqual([fx('proj', '.pi', 'p')])
  })

  it('skips the project layer when the project is untrusted', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ defaultProjectTrust: 'never' })],
      [fx('proj', '.pi', 'settings.json'), JSON.stringify({ skills: ['project-skill'] })],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.projectTrusted).toBe(false)
    expect(loaded.skillPaths).toEqual([])
  })

  it('fails soft on broken JSON settings files', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), '{ broken json'],
      [fx('home', 'u', '.pi', 'agent', 'trust.json'), JSON.stringify({})],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.skillPaths).toEqual([])
    expect(loaded.projectTrusted).toBe(false)
  })

  it('ignores unsupported defaultProjectTrust values with the ask fallback', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ defaultProjectTrust: 'sometimes' })],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.defaultProjectTrust).toBe('ask')
    expect(loaded.projectTrusted).toBe(false)
  })

  it('honors PI_CODING_AGENT_DIR over the configured directory', () => {
    const previous = process.env['PI_CODING_AGENT_DIR']
    process.env['PI_CODING_AGENT_DIR'] = fx('custom', 'pi')
    try {
      const loader = makeLoader(new Map())
      expect(loader.piDir()).toBe(fx('custom', 'pi'))
    } finally {
      if (previous === undefined) delete process.env['PI_CODING_AGENT_DIR']
      else process.env['PI_CODING_AGENT_DIR'] = previous
    }
  })
})

describe('pi project trust resolution', () => {
  it('uses the closest saved decision for the working directory or a parent', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'trust.json'), JSON.stringify({ [fx('proj', 'sub')]: false, [fx('proj')]: true })],
    ])
    const loader = makeLoader(files)
    expect((await loader.load(fx('proj', 'sub', 'deep'))).projectTrusted).toBe(false) // closest: sub
    expect((await loader.load(fx('proj', 'other'))).projectTrusted).toBe(true) // closest: proj
  })

  it('accepts string decisions in trust.json and ignores unparseable ones', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.pi', 'agent', 'trust.json'),
        JSON.stringify({ [fx('proj')]: 'always', [fx('other')]: 'never', [fx('junk')]: 'maybe' }),
      ],
    ])
    const loader = makeLoader(files)
    expect((await loader.load(fx('proj'))).projectTrusted).toBe(true)
    expect((await loader.load(fx('other'))).projectTrusted).toBe(false)
    expect((await loader.load(fx('junk'))).projectTrusted).toBe(false) // 'maybe' ignored → ask fallback
  })

  it('treats a malformed trust.json as no decisions', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'trust.json'), '{ not json'],
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ defaultProjectTrust: 'always' })],
    ])
    const loaded = await makeLoader(files).load(fx('proj'))
    expect(loaded.projectTrusted).toBe(true) // fallback default wins when trust.json is unreadable
  })

  it('invalidates the cache when settings files change (stamp-based)', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ defaultProjectTrust: 'always' })],
      [fx('proj', '.pi', 'settings.json'), JSON.stringify({ skills: ['one'] })],
    ])
    const loader = makeLoader(files)
    expect((await loader.load(fx('proj'))).skillPaths).toHaveLength(1)
    files.set(fx('proj', '.pi', 'settings.json'), JSON.stringify({ skills: ['one', 'two'] }))
    expect((await loader.load(fx('proj'))).skillPaths).toHaveLength(2)
  })
})
