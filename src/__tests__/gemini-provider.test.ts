import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
import { GeminiSkillProvider } from '../agents/gemini-cli/skills/provider.js'
import { GeminiSettingsLoader } from '../agents/gemini-cli/settings.js'
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

const USER_DIR = fx('home', 'u', '.gemini')
const OPTIONS: SkillLookupOptions = { cwd: fx('proj') }

function makeProvider(files: Map<string, string>): GeminiSkillProvider {
  const fs = new TreeFs(files)
  const settings = new GeminiSettingsLoader(silent, fs, { userGeminiDir: USER_DIR })
  return new GeminiSkillProvider(silent, fs, { userGeminiDir: USER_DIR, watch: false, agents: true }, settings, () => {})
}

async function list(provider: GeminiSkillProvider): Promise<{ name: string; rank: number }[]> {
  const result = (await provider.list(OPTIONS)) as { candidates: { name: string; rank: number }[] }
  return result.candidates.map((candidate) => ({ name: candidate.name, rank: candidate.rank }))
}

const SKILL = (description = 'd') => `---\ndescription: ${description}\n---\nBody.\n`

describe('gemini skill/command/agent discovery', () => {
  it('discovers project and user skills with project-before-user ranks', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.gemini', 'skills', 'u-skill', 'SKILL.md'), SKILL()],
      [fx('proj', '.gemini', 'skills', 'p-skill', 'SKILL.md'), SKILL()],
    ])
    const found = await list(makeProvider(files))
    const byName = new Map(found.map((entry) => [entry.name, entry.rank]))
    expect(byName.get('p-skill')).toBe(205)
    expect(byName.get('u-skill')).toBe(210)
  })

  it('discovers top-level command TOMLs and skips nested namespaced commands', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.gemini', 'commands', 'review.toml'), 'description = "reviews"\nprompt = "Review."\n'],
      [fx('proj', '.gemini', 'commands', 'git', 'commit.toml'), 'prompt = "Commit."\n'],
    ])
    const found = await list(makeProvider(files))
    expect(found.map((entry) => entry.name)).toEqual(['review'])
    expect(found[0]!.rank).toBe(207)
  })

  it('registers a skill over a same-name command at the same level (rank order)', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.gemini', 'skills', 'same', 'SKILL.md'), SKILL('skill')],
      [fx('proj', '.gemini', 'commands', 'same.toml'), 'prompt = "Cmd."\n'],
    ])
    const found = await list(makeProvider(files))
    // Both candidates register; the skill's lower rank wins same-name conflicts
    // in the registry.
    expect(found.map((entry) => [entry.name, entry.rank])).toEqual([
      ['same', 205],
      ['same', 207],
    ])
  })

  it('honors skills.disabled and the skills.enabled master switch', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.gemini', 'settings.json'), JSON.stringify({ skills: { disabled: ['u-skill'] } })],
      [fx('home', 'u', '.gemini', 'skills', 'u-skill', 'SKILL.md'), SKILL()],
      [fx('home', 'u', '.gemini', 'skills', 'keep', 'SKILL.md'), SKILL()],
    ])
    const provider = makeProvider(files)
    const found = await list(provider)
    expect(found.map((entry) => entry.name)).toEqual(['keep'])
    files.set(fx('home', 'u', '.gemini', 'settings.json'), JSON.stringify({ skills: { enabled: false } }))
    expect(await list(provider)).toEqual([])
  })

  it('bridges agent definitions as delegation-spec skills with translated tools', async () => {
    const files = new Map<string, string>([
      [
        fx('proj', '.gemini', 'agents', 'reviewer.md'),
        '---\nname: reviewer\ndescription: Reviews diffs.\ntools: [read_file, run_shell_command]\n---\nBe careful.\n',
      ],
      [fx('proj', '.gemini', 'agents', 'remote-one.md'), '---\nname: remote-one\ndescription: Remote.\nkind: remote\n---\nBody.\n'],
    ])
    const provider = makeProvider(files)
    const found = await list(provider)
    expect(found.map((entry) => [entry.name, entry.rank])).toEqual([['reviewer', 206]])
    const result = (await provider.list(OPTIONS)) as { candidates: { name: string; locator: unknown }[] }
    const definition = await provider.get(result.candidates[0] as never, OPTIONS)
    const content = (definition as { content?: string }).content ?? ''
    expect(content).toContain('Be careful.')
    expect(content).toContain('"read"')
    expect(content).toContain('"bash"')
  })

  it('skips skills whose names are not kebab-case', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.gemini', 'skills', 'UPPER', 'SKILL.md'), '---\nname: UPPER\ndescription: d\n---\nBody.\n'],
    ])
    const found = await list(makeProvider(files))
    expect(found).toEqual([])
  })
})
