import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { OpencodeSkillProvider } from '../agents/opencode/skills/provider.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

/** An in-memory adapter that lists a path's direct children from the file map. */
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
    // Content-based stamp so settings-loader caching sees file edits in tests.
    return this.files.has(path) ? `v:${this.files.get(path)}` : undefined
  }
  async dirExists(path: string): Promise<boolean> {
    return [...this.files.keys()].some((key) => key.startsWith(`${path}/`))
  }
}

function makeProvider(files: Map<string, string>): OpencodeSkillProvider {
  const fs = new TreeFs(files)
  const settings = new OpencodeSettingsLoader(silent, fs, { userOpencodeDir: '/home/u/.config/opencode' })
  return new OpencodeSkillProvider(silent, fs, { userOpencodeDir: '/home/u/.config/opencode', watch: false }, settings, () => {})
}

const options: SkillLookupOptions = { cwd: '/proj' }

describe('OpencodeSkillProvider.list', () => {
  it('discovers project and user skills and commands', async () => {
    const files = new Map<string, string>([
      ['/proj/.opencode/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: Deploy the app\n---\nDeploy body.\n'],
      ['/proj/.opencode/commands/lint.md', '---\ndescription: Lint the repo\n---\nRun lint.\n'],
      ['/home/u/.config/opencode/skills/personal/SKILL.md', '---\nname: personal\ndescription: Personal skill\n---\nBody.\n'],
      ['/home/u/.config/opencode/commands/notes.md', '# Notes\n\nTake notes.\n'],
    ])
    const result = await makeProvider(files).list(options)
    const names = result.candidates.map((candidate) => candidate.name).sort()
    expect(names).toEqual(['deploy', 'lint', 'notes', 'personal'])
  })

  it('assigns ranks: project beats user, skills beat commands (opencode precedence)', async () => {
    const files = new Map<string, string>([
      ['/proj/.opencode/skills/shared/SKILL.md', '---\nname: shared\ndescription: project skill\n---\na\n'],
      ['/proj/.opencode/commands/shared.md', '---\ndescription: project command\n---\nb\n'],
      ['/home/u/.config/opencode/skills/shared/SKILL.md', '---\nname: shared\ndescription: user skill\n---\nc\n'],
    ])
    const result = await makeProvider(files).list(options)
    const sharedRanks = result.candidates.filter((candidate) => candidate.name === 'shared').map((candidate) => candidate.rank)
    expect(Math.min(...sharedRanks)).toBe(145)
    const byRank = [...result.candidates].sort((a, b) => a.rank - b.rank).map((candidate) => candidate.source)
    expect(byRank[0]).toBe('project-opencode')
    expect(byRank[byRank.length - 1]).toBe('user-opencode')
  })

  it('skips skills whose name does not match the directory name', async () => {
    const files = new Map<string, string>([
      ['/proj/.opencode/skills/mismatch/SKILL.md', '---\nname: other\ndescription: x\n---\na\n'],
      ['/proj/.opencode/skills/good/SKILL.md', '---\nname: good\ndescription: y\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['good'])
  })

  it('skips skills without a description (required by opencode)', async () => {
    const files = new Map<string, string>([
      ['/proj/.opencode/skills/no-desc/SKILL.md', '---\nname: no-desc\n---\na\n'],
      ['/proj/.opencode/skills/with-desc/SKILL.md', '---\nname: with-desc\ndescription: has one\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['with-desc'])
  })

  it('skips skill names that are not valid opencode names', async () => {
    const files = new Map<string, string>([
      ['/proj/.opencode/skills/git_release/SKILL.md', '---\nname: git_release\ndescription: underscore\n---\na\n'],
      ['/proj/.opencode/skills/git-release/SKILL.md', '---\nname: git-release\ndescription: hyphen\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['git-release'])
  })

  it('ignores flat md files and nested directories in commands', async () => {
    const files = new Map<string, string>([
      ['/proj/.opencode/commands/top.md', '---\ndescription: top\n---\na\n'],
      ['/proj/.opencode/commands/nested/inner.md', '---\ndescription: inner\n---\nb\n'],
      ['/proj/.opencode/commands/notmd.txt', 'x'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['top'])
  })

  it('registers JSON-configured commands from opencode.json, project overriding user', async () => {
    const files = new Map<string, string>([
      [
        '/home/u/.config/opencode/opencode.json',
        JSON.stringify({ command: { useronly: { template: 'user cmd', description: 'user only' }, shared: { template: 'user shared' } } }),
      ],
      [
        '/proj/opencode.jsonc',
        JSON.stringify({ command: { projonly: { template: 'proj cmd', description: 'proj only' }, shared: { template: 'proj shared' } } }),
      ],
    ])
    const result = await makeProvider(files).list(options)
    const byName = new Map(result.candidates.map((candidate) => [candidate.name, candidate]))
    expect([...byName.keys()].sort()).toEqual(['projonly', 'shared', 'useronly'])
    expect(byName.get('shared')!.rank).toBe(147) // project JSON command won
    expect(byName.get('useronly')!.rank).toBe(157)
  })

  it('skips JSON-configured commands whose name is not kebab-case', async () => {
    const warnings: string[] = []
    const logger = {
      debug: () => {},
      info: () => {},
      error: () => {},
      warn: (message: string) => {
        warnings.push(message)
      },
    }
    const files = new Map<string, string>([
      ['/proj/opencode.json', JSON.stringify({ command: { 'Not-Kebab': { template: 'bad' }, good: { template: 'ok' } } })],
    ])
    const fs = new TreeFs(files)
    const settings = new OpencodeSettingsLoader(logger, fs, { userOpencodeDir: '/home/u/.config/opencode' })
    const provider = new OpencodeSkillProvider(
      logger,
      fs,
      { userOpencodeDir: '/home/u/.config/opencode', watch: false },
      settings,
      () => {},
    )
    const result = await provider.list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['good'])
    expect(warnings.some((message) => message.includes('Not-Kebab'))).toBe(true)
  })

  it('derives the description from the first paragraph when a command omits it', async () => {
    const files = new Map<string, string>([['/proj/.opencode/commands/plain.md', '# Title\n\nDerived description.\n']])
    const result = await makeProvider(files).list(options)
    expect(result.candidates[0]!.description).toBe('Derived description.')
  })
})

describe('OpencodeSkillProvider.get', () => {
  it('loads the body of a skill bundle', async () => {
    const files = new Map<string, string>([
      ['/proj/.opencode/skills/deploy/SKILL.md', '---\nname: deploy\ndescription: Deploy\n---\nInstructions.\n'],
    ])
    const result = await makeProvider(files).list(options)
    const candidate = result.candidates[0]!
    const definition = await makeProvider(files).get(candidate, options)
    expect(definition?.content).toBe('Instructions.\n')
    expect(definition?.resourceBase).toEqual({ kind: 'directory', path: '/proj/.opencode/skills/deploy' })
  })

  it('loads the template of a JSON-configured command', async () => {
    const files = new Map<string, string>([
      ['/proj/opencode.json', JSON.stringify({ command: { test: { template: 'Run tests', description: 'Tests' } } })],
    ])
    const result = await makeProvider(files).list(options)
    const candidate = result.candidates[0]!
    const definition = await makeProvider(files).get(candidate, options)
    expect(definition?.content).toBe('Run tests')
  })

  it('returns undefined when a JSON command is removed from config', async () => {
    const files = new Map<string, string>([['/proj/opencode.json', JSON.stringify({ command: { test: { template: 'Run tests' } } })]])
    const provider = makeProvider(files)
    const result = await provider.list(options)
    files.set('/proj/opencode.json', JSON.stringify({ command: {} }))
    const definition = await provider.get(result.candidates[0]!, options)
    expect(definition).toBeUndefined()
  })
})
