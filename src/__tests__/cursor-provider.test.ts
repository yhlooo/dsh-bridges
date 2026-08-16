import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
import { CursorSkillProvider } from '../agents/cursor/skills/provider.js'
import { CursorSettingsLoader } from '../agents/cursor/settings.js'
import { fx } from './fixture-paths.js'

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
    if (![...this.files.keys()].some((key) => key.startsWith(path))) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
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

const USER_DIR = fx('home', 'u', '.cursor')
const OPTIONS: SkillLookupOptions = { cwd: fx('proj') }

function makeProvider(files: Map<string, string>): CursorSkillProvider {
  const fs = new TreeFs(files)
  const settings = new CursorSettingsLoader(silent, fs, { userCursorDir: USER_DIR })
  return new CursorSkillProvider(silent, fs, { userCursorDir: USER_DIR, watch: false, agents: true }, settings, () => {})
}

async function list(
  provider: CursorSkillProvider,
): Promise<{ name: string; rank: number; modelInvocable: boolean; userInvocable: boolean }[]> {
  const result = (await provider.list(OPTIONS)) as {
    candidates: { name: string; rank: number; invocation: { modelInvocable: boolean; userInvocable: boolean } }[]
  }
  return result.candidates.map((candidate) => ({
    name: candidate.name,
    rank: candidate.rank,
    modelInvocable: candidate.invocation.modelInvocable,
    userInvocable: candidate.invocation.userInvocable,
  }))
}

const SKILL = (name: string, description = 'd') => `---\nname: ${name}\ndescription: ${description}\n---\nBody.\n`

describe('cursor skill/agent discovery', () => {
  it('discovers project and user skills with project-before-user ranks', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.cursor', 'skills', 'u-skill', 'SKILL.md'), SKILL('u-skill')],
      [fx('proj', '.cursor', 'skills', 'p-skill', 'SKILL.md'), SKILL('p-skill')],
    ])
    const found = await list(makeProvider(files))
    const byName = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(byName.get('p-skill')).toBe(225)
    expect(byName.get('u-skill')).toBe(230)
  })

  it('discovers nested SKILL.md bundles recursively', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.cursor', 'skills', 'category', 'deep-skill', 'SKILL.md'), '---\nname: deep-skill\ndescription: d\n---\nBody.\n'],
    ])
    const found = await list(makeProvider(files))
    expect(found.map((entry) => entry.name)).toEqual(['deep-skill'])
  })

  it('maps disable-model-invocation and user-invocable', async () => {
    const files = new Map<string, string>([
      [
        fx('proj', '.cursor', 'skills', 'hidden', 'SKILL.md'),
        '---\nname: hidden\ndescription: d\ndisable-model-invocation: true\nuser-invocable: false\n---\nB.\n',
      ],
    ])
    const found = await list(makeProvider(files))
    expect(found[0]!.modelInvocable).toBe(false)
    expect(found[0]!.userInvocable).toBe(false)
  })

  it('bridges agent definitions as delegation-spec skills', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.cursor', 'agents', 'reviewer.md'), '---\nname: reviewer\ndescription: Reviews.\nmodel: sonnet\n---\nBe careful.\n'],
    ])
    const provider = makeProvider(files)
    const found = await list(provider)
    expect(found.map((entry) => [entry.name, entry.rank])).toEqual([['reviewer', 226]])
    const result = (await provider.list(OPTIONS)) as { candidates: { name: string }[] }
    const definition = await provider.get(result.candidates[0] as never, OPTIONS)
    expect((definition as { content?: string }).content).toContain('Be careful.')
  })

  it('skips skills whose names are not kebab-case', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.cursor', 'skills', 'UPPER', 'SKILL.md'), '---\nname: UPPER\ndescription: d\n---\nB.\n'],
    ])
    expect(await list(makeProvider(files))).toEqual([])
  })
})
