import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
import { PiSkillProvider } from '../agents/pi/skills/provider.js'
import { PiSettingsLoader } from '../agents/pi/settings.js'
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
const OPTIONS: SkillLookupOptions = { cwd: fx('proj') }

function makeProvider(files: Map<string, string>): PiSkillProvider {
  const fs = new TreeFs(files)
  const settings = new PiSettingsLoader(silent, fs, { userPiDir: USER_PI_DIR })
  return new PiSkillProvider(silent, fs, { userPiDir: USER_PI_DIR, watch: false }, settings, () => {})
}

async function list(provider: PiSkillProvider): Promise<{ name: string; rank: number; modelInvocable: boolean; userInvocable: boolean }[]> {
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

const SKILL = (description = 'd') => `---\ndescription: ${description}\n---\nBody.\n`

describe('pi skill discovery', () => {
  it('discovers user and project bundle skills with pi rank slots', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ defaultProjectTrust: 'always' })],
      [fx('home', 'u', '.pi', 'agent', 'skills', 'u-skill', 'SKILL.md'), SKILL()],
      [fx('proj', '.pi', 'skills', 'p-skill', 'SKILL.md'), SKILL()],
    ])
    const found = await list(makeProvider(files))
    expect(found.map((entry) => [entry.name, entry.rank])).toEqual([
      ['u-skill', 180],
      ['p-skill', 190],
    ])
  })

  it('uses the frontmatter name even when it differs from the directory name', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'skills', 'dir-name', 'SKILL.md'), '---\nname: front-name\ndescription: d\n---\nBody.\n'],
    ])
    const found = await list(makeProvider(files))
    expect(found.map((entry) => entry.name)).toEqual(['front-name'])
  })

  it('discovers flat root-level .md files as skills', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'skills', 'flat-skill.md'), '---\nname: flat-name\ndescription: d\n---\nBody.\n'],
    ])
    const found = await list(makeProvider(files))
    expect(found).toHaveLength(1)
    expect(found[0]!.name).toBe('flat-name')
    expect(found[0]!.rank).toBe(180)
  })

  it('discovers nested SKILL.md bundles recursively but skips hidden directories', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.pi', 'settings.json'), JSON.stringify({})],
      [fx('proj', '.pi', 'skills', 'nested', 'deep', 'SKILL.md'), '---\ndescription: d\n---\nBody.\n'],
      [fx('proj', '.pi', 'skills', '.hidden', 'SKILL.md'), SKILL('hidden')],
      [fx('proj', '.pi', 'skills', '.git', 'SKILL.md'), SKILL('git')],
    ])
    // trust: settings exist but defaultProjectTrust is ask → untrusted; use a saved decision instead
    files.set(fx('home', 'u', '.pi', 'agent', 'trust.json'), JSON.stringify({ [fx('proj')]: true }))
    const found = await list(makeProvider(files))
    expect(found.map((entry) => entry.name)).toEqual(['deep'])
  })

  it('applies disable-model-invocation (modelInvocable false, user invocation stays)', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.pi', 'agent', 'skills', 'hidden-skill', 'SKILL.md'),
        '---\ndescription: d\ndisable-model-invocation: true\n---\nBody.\n',
      ],
    ])
    const found = await list(makeProvider(files))
    expect(found[0]!.modelInvocable).toBe(false)
    expect(found[0]!.userInvocable).toBe(true)
  })

  it('skips skills without a description and names that are not kebab-case', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'skills', 'no-desc', 'SKILL.md'), '---\nname: no-desc\n---\nBody.\n'],
      [fx('home', 'u', '.pi', 'agent', 'skills', 'CamelName', 'SKILL.md'), '---\nname: CamelName\ndescription: d\n---\nBody.\n'],
    ])
    const found = await list(makeProvider(files))
    expect(found).toEqual([])
  })

  it('keeps the first skill found on same-name collisions (user wins, pi behavior)', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ defaultProjectTrust: 'always' })],
      [fx('home', 'u', '.pi', 'agent', 'skills', 'same', 'SKILL.md'), SKILL('user body')],
      [fx('proj', '.pi', 'skills', 'same', 'SKILL.md'), SKILL('project body')],
    ])
    const provider = makeProvider(files)
    const result = (await provider.list(OPTIONS)) as { candidates: { name: string; rank: number }[] }
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0]!.rank).toBe(180)
    const definition = await provider.get(result.candidates[0] as never, OPTIONS)
    // The user file is first-found; its body must load.
    expect((definition as { content?: string }).content).toContain('Body.')
  })

  it('registers a skill over a same-name prompt template at the same level', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'skills', 'same', 'SKILL.md'), SKILL('skill')],
      [fx('home', 'u', '.pi', 'agent', 'prompts', 'same.md'), '---\ndescription: prompt\n---\nTemplate.\n'],
    ])
    const found = await list(makeProvider(files))
    expect(found).toHaveLength(1)
    expect(found[0]!.rank).toBe(180) // the skill, not the prompt
  })

  it('gates the project roots on trust and keeps user roots regardless', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'skills', 'u-skill', 'SKILL.md'), SKILL()],
      [fx('proj', '.pi', 'skills', 'p-skill', 'SKILL.md'), SKILL()],
      // no settings.json → defaultProjectTrust is ask → untrusted
    ])
    const found = await list(makeProvider(files))
    expect(found.map((entry) => entry.name)).toEqual(['u-skill'])
  })

  it('discovers prompt templates (non-recursive) and settings-array paths', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.pi', 'agent', 'settings.json'),
        JSON.stringify({ defaultProjectTrust: 'always', skills: ['extra'], prompts: ['extra-p'] }),
      ],
      [fx('home', 'u', '.pi', 'agent', 'prompts', 'review.md'), '---\ndescription: reviews\n---\nReview $1.\n'],
      [fx('home', 'u', '.pi', 'agent', 'prompts', 'nested', 'deep.md'), '---\ndescription: deep\n---\nDeep.\n'],
      [fx('home', 'u', '.pi', 'agent', 'extra', 'SKILL.md'), '---\ndescription: extra\n---\nExtra.\n'],
      [fx('home', 'u', '.pi', 'agent', 'extra-p', 'one.md'), '---\ndescription: extra prompt\n---\nOne.\n'],
    ])
    const found = await list(makeProvider(files))
    expect(found.map((entry) => [entry.name, entry.rank])).toEqual([
      ['extra', 181],
      ['review', 182],
      ['one', 183],
    ])
  })

  it('ignores settings-array paths that do not exist', async () => {
    const files = new Map<string, string>([[fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ skills: ['missing'] })]])
    const found = await list(makeProvider(files))
    expect(found).toEqual([])
  })
})
