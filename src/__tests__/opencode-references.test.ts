import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'
import { OpencodeSkillProvider } from '../agents/opencode/skills/provider.js'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'

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

describe('opencode references parsing', () => {
  it('resolves local paths against the config directory and skips invalid aliases', async () => {
    const files = new Map<string, string>([
      [
        '/proj/opencode.json',
        JSON.stringify({
          references: {
            docs: { path: '../docs', description: 'Product docs' },
            home: '~/notes',
            'bad alias': { path: './x' },
            sdk: { repository: 'anomalyco/opencode-sdk-js', branch: 'main' },
            hidden: { path: './secret', hidden: true },
          },
        }),
      ],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: '/home/u/.config/opencode' })
    const settings = await loader.load('/proj')
    expect(settings.references.get('docs')).toEqual({ alias: 'docs', path: '/docs', description: 'Product docs', hidden: false })
    expect(settings.references.get('home')?.path).toMatch(/\/notes$/)
    expect(settings.references.has('bad alias')).toBe(false)
    expect(settings.references.get('sdk')?.repository).toBe('anomalyco/opencode-sdk-js')
    expect(settings.references.get('hidden')?.hidden).toBe(true)
  })

  it('collects skills.paths resolved against the config directory', async () => {
    const files = new Map<string, string>([
      ['/proj/opencode.json', JSON.stringify({ skills: { paths: ['../shared-skills', '/abs/skills'] } })],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: '/home/u/.config/opencode' })
    const settings = await loader.load('/proj')
    expect(settings.skillPaths).toEqual([{ path: '/shared-skills' }, { path: '/abs/skills' }])
  })
})

describe('OpencodeSkillProvider upward discovery', () => {
  const options: SkillLookupOptions = { cwd: '/proj/sub/deep' }

  function makeProvider(files: Map<string, string>): OpencodeSkillProvider {
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: '/home/u/.config/opencode' })
    return new OpencodeSkillProvider(silent, new TreeFs(files), { userOpencodeDir: '/home/u/.config/opencode', watch: false }, loader, () => {})
  }

  it('discovers .opencode/skills from the cwd up to the git root, closest first', async () => {
    const files = new Map<string, string>([
      ['/proj/.git/HEAD', 'x'],
      ['/proj/.opencode/skills/root-skill/SKILL.md', '---\nname: root-skill\ndescription: From the repo root\n---\nBody.\n'],
      ['/proj/sub/.opencode/skills/mid-skill/SKILL.md', '---\nname: mid-skill\ndescription: From sub\n---\nBody.\n'],
      ['/proj/sub/deep/.opencode/skills/deep-skill/SKILL.md', '---\nname: deep-skill\ndescription: From deep\n---\nBody.\n'],
    ])
    const provider = makeProvider(files)
    const result = await provider.list(options)
    const candidates = Array.isArray(result) ? result : result.candidates
    const skillNames = candidates.filter((candidate) => candidate.name !== undefined).map((candidate) => candidate.name)
    expect(skillNames).toContain('deep-skill')
    expect(skillNames).toContain('mid-skill')
    expect(skillNames).toContain('root-skill')
    // closest directory first among same-rank project skills
    const deep = candidates.findIndex((candidate) => candidate.name === 'deep-skill')
    const mid = candidates.findIndex((candidate) => candidate.name === 'mid-skill')
    const root = candidates.findIndex((candidate) => candidate.name === 'root-skill')
    expect(deep).toBeLessThan(mid)
    expect(mid).toBeLessThan(root)
  })

  it('registers skills.paths extra roots', async () => {
    const files = new Map<string, string>([
      ['/proj/sub/deep/opencode.json', JSON.stringify({ skills: { paths: ['../shared'] } })],
      ['/proj/sub/shared/extra-skill/SKILL.md', '---\nname: extra-skill\ndescription: Extra\n---\nBody.\n'],
    ])
    const provider = makeProvider(files)
    const result = await provider.list(options)
    const candidates = Array.isArray(result) ? result : result.candidates
    expect(candidates.some((candidate) => candidate.name === 'extra-skill')).toBe(true)
  })
})
