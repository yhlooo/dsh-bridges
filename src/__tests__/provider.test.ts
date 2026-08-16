import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { ClaudeSkillProvider } from '../agents/claude-code/skills/provider.js'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
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
  async stamp(): Promise<string | undefined> {
    return 'v1'
  }
  async dirExists(path: string): Promise<boolean> {
    return [...this.files.keys()].some((key) => key.startsWith(`${path}${sep}`))
  }
}

function makeProvider(files: Map<string, string>): ClaudeSkillProvider {
  return new ClaudeSkillProvider(silent, new TreeFs(files), { userClaudeDir: fx('home', 'u', '.claude'), watch: false }, () => {})
}

const options: SkillLookupOptions = { cwd: fx('proj') }

describe('ClaudeSkillProvider.list', () => {
  it('discovers project and user skill bundles and commands', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.claude', 'skills', 'personal', 'SKILL.md'), '---\ndescription: Personal skill\n---\nBody.\n'],
      [fx('proj', '.claude', 'skills', 'deploy', 'SKILL.md'), '---\ndescription: Deploy\n---\nDeploy body.\n'],
      [fx('proj', '.claude', 'commands', 'lint.md'), '---\ndescription: Lint the repo\n---\nRun lint.\n'],
      [fx('home', 'u', '.claude', 'commands', 'notes.md'), '# Notes\n\nTake notes.\n'],
    ])
    const result = await makeProvider(files).list(options)
    const names = result.candidates.map((candidate) => candidate.name).sort()
    expect(names).toEqual(['deploy', 'lint', 'notes', 'personal'])
  })

  it('assigns ranks: personal beats project, skills beat commands', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.claude', 'skills', 'shared', 'SKILL.md'), '---\ndescription: user skill\n---\na\n'],
      [fx('home', 'u', '.claude', 'commands', 'shared.md'), '---\ndescription: user command\n---\nb\n'],
      [fx('proj', '.claude', 'skills', 'shared', 'SKILL.md'), '---\ndescription: project skill\n---\nc\n'],
      [fx('proj', '.claude', 'commands', 'shared.md'), '---\ndescription: project command\n---\nd\n'],
    ])
    const result = await makeProvider(files).list(options)
    // The registry resolves duplicate names by rank; the user skill (105) must win.
    const sharedRanks = result.candidates.filter((candidate) => candidate.name === 'shared').map((candidate) => candidate.rank)
    expect(Math.min(...sharedRanks)).toBe(105)
    const byRank = [...result.candidates].sort((a, b) => a.rank - b.rank).map((candidate) => candidate.source)
    expect(byRank[0]).toBe('user-claude')
    expect(byRank[3]).toBe('project-claude')
  })

  it('skips the reserved synced directory in the user skills root', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.claude', 'skills', 'synced', 'SKILL.md'), '---\ndescription: synced\n---\na\n'],
      [fx('home', 'u', '.claude', 'skills', 'real', 'SKILL.md'), '---\ndescription: real\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['real'])
  })

  it('skips names that are not kebab-case', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.claude', 'skills', 'camelCase', 'SKILL.md'), '---\ndescription: nope\n---\na\n'],
      [fx('proj', '.claude', 'skills', 'good-name', 'SKILL.md'), '---\ndescription: yes\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['good-name'])
  })

  it('derives the description from when_to_use and the first paragraph', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.claude', 'skills', 'with-when', 'SKILL.md'), '---\ndescription: Base\nwhen_to_use: When asked\n---\nBody.\n'],
      [fx('proj', '.claude', 'skills', 'no-desc', 'SKILL.md'), '---\nname: display\n---\n# Title\n\nFell back paragraph.\n'],
    ])
    const result = await makeProvider(files).list(options)
    const withWhen = result.candidates.find((candidate) => candidate.name === 'with-when')
    expect(withWhen?.description).toBe('Base\nWhen asked')
    expect(withWhen?.whenToUse).toBe('When asked')
    const noDesc = result.candidates.find((candidate) => candidate.name === 'no-desc')
    expect(noDesc?.description).toBe('Fell back paragraph.')
  })

  it('maps invocation policy from the frontmatter', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.claude', 'skills', 'task', 'SKILL.md'), '---\ndisable-model-invocation: true\n---\na\n'],
      [fx('proj', '.claude', 'skills', 'hidden', 'SKILL.md'), '---\nuser-invocable: false\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.find((candidate) => candidate.name === 'task')?.invocation.modelInvocable).toBe(false)
    expect(result.candidates.find((candidate) => candidate.name === 'hidden')?.invocation.userInvocable).toBe(false)
  })

  it('returns an empty catalog for a project without Claude assets', async () => {
    const files = new Map<string, string>([[fx('proj', 'README.md'), 'x']])
    const result = await makeProvider(files).list(options)
    expect(result.candidates).toEqual([])
    expect(result.complete).toBe(true)
  })
})

describe('ClaudeSkillProvider.get', () => {
  it('loads the current body and resource base for a bundle', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.claude', 'skills', 'deploy', 'SKILL.md'), '---\ndescription: Deploy\n---\nStep one.\n'],
      [fx('proj', '.claude', 'skills', 'deploy', 'template.md'), 'x'],
    ])
    const provider = makeProvider(files)
    const { candidates } = await provider.list(options)
    const definition = await provider.get(candidates[0]!, options)
    expect(definition?.content).toBe('Step one.\n')
    expect(definition?.resourceBase).toEqual({ kind: 'directory', path: fx('proj', '.claude', 'skills', 'deploy') })
  })

  it('returns undefined when the file disappeared', async () => {
    const files = new Map<string, string>([[fx('proj', '.claude', 'skills', 'gone', 'SKILL.md'), '---\ndescription: x\n---\na\n']])
    const provider = makeProvider(files)
    const { candidates } = await provider.list(options)
    files.delete(fx('proj', '.claude', 'skills', 'gone', 'SKILL.md'))
    await expect(provider.get(candidates[0]!, options)).resolves.toBeUndefined()
  })
})
