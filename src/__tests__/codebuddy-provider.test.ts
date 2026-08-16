import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { CodebuddySkillProvider } from '../agents/codebuddy-code/skills/provider.js'
import { CodebuddySettingsLoader } from '../agents/codebuddy-code/settings.js'
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

function makeProvider(files: Map<string, string>): CodebuddySkillProvider {
  const fs = new TreeFs(files)
  const settings = new CodebuddySettingsLoader(silent, fs, { userCodebuddyDir: fx('home', 'u', '.codebuddy') })
  return new CodebuddySkillProvider(silent, fs, { userCodebuddyDir: fx('home', 'u', '.codebuddy'), watch: false }, settings, () => {})
}

const options: SkillLookupOptions = { cwd: fx('proj') }

describe('CodebuddySkillProvider.list', () => {
  it('discovers project and user skill bundles and commands', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.codebuddy', 'skills', 'personal', 'SKILL.md'), '---\ndescription: Personal skill\n---\nBody.\n'],
      [fx('proj', '.codebuddy', 'skills', 'deploy', 'SKILL.md'), '---\ndescription: Deploy\n---\nDeploy body.\n'],
      [fx('proj', '.codebuddy', 'commands', 'lint.md'), '---\ndescription: Lint the repo\n---\nRun lint.\n'],
      [fx('home', 'u', '.codebuddy', 'commands', 'notes.md'), '# Notes\n\nTake notes.\n'],
    ])
    const result = await makeProvider(files).list(options)
    const names = result.candidates.map((candidate) => candidate.name).sort()
    expect(names).toEqual(['deploy', 'lint', 'notes', 'personal'])
  })

  it('assigns ranks: project beats user, skills beat commands (CodeBuddy precedence)', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.codebuddy', 'skills', 'shared', 'SKILL.md'), '---\ndescription: user skill\n---\na\n'],
      [fx('home', 'u', '.codebuddy', 'commands', 'shared.md'), '---\ndescription: user command\n---\nb\n'],
      [fx('proj', '.codebuddy', 'skills', 'shared', 'SKILL.md'), '---\ndescription: project skill\n---\nc\n'],
      [fx('proj', '.codebuddy', 'commands', 'shared.md'), '---\ndescription: project command\n---\nd\n'],
    ])
    const result = await makeProvider(files).list(options)
    // The registry resolves duplicate names by rank; the project skill must win.
    const sharedRanks = result.candidates.filter((candidate) => candidate.name === 'shared').map((candidate) => candidate.rank)
    expect(Math.min(...sharedRanks)).toBe(125)
    const byRank = [...result.candidates].sort((a, b) => a.rank - b.rank).map((candidate) => candidate.source)
    expect(byRank[0]).toBe('project-codebuddy')
    expect(byRank[3]).toBe('user-codebuddy')
  })

  it('reads directory skills only; flat md files in skills/ are ignored', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'flat.md'), '---\ndescription: flat\n---\na\n'],
      [fx('proj', '.codebuddy', 'skills', 'bundle', 'SKILL.md'), '---\ndescription: bundle\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['bundle'])
  })

  it('maps nested commands to kebab-case group-name skills', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'commands', 'deploy.md'), '---\ndescription: deploy\n---\na\n'],
      [fx('proj', '.codebuddy', 'commands', 'frontend', 'build.md'), '---\ndescription: build\n---\nb\n'],
      [fx('proj', '.codebuddy', 'commands', 'backend', 'deploy', 'staging.md'), '---\ndescription: staging\n---\nc\n'],
      [fx('home', 'u', '.codebuddy', 'commands', 'notes', 'daily.md'), '---\ndescription: daily\n---\nd\n'],
    ])
    const result = await makeProvider(files).list(options)
    const names = result.candidates.map((candidate) => candidate.name).sort()
    expect(names).toEqual(['backend-deploy-staging', 'deploy', 'frontend-build', 'notes-daily'])
    const nested = result.candidates.find((candidate) => candidate.name === 'frontend-build')!
    expect(nested.source).toBe('project-codebuddy')
    expect(nested.rank).toBe(130)
    expect(nested.path).toBe(fx('proj', '.codebuddy', 'commands', 'frontend', 'build.md'))
    const userNested = result.candidates.find((candidate) => candidate.name === 'notes-daily')!
    expect(userNested.source).toBe('user-codebuddy')
    expect(userNested.rank).toBe(140)
  })

  it('discovers nested skill bundles and maps them to kebab-case names', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'pathto', 'skill', 'SKILL.md'), '---\ndescription: nested skill\n---\nBody.\n'],
      [fx('proj', '.codebuddy', 'skills', 'deploy', 'SKILL.md'), '---\ndescription: deploy\n---\nb\n'],
      [fx('home', 'u', '.codebuddy', 'skills', 'team', 'tools', 'SKILL.md'), '---\ndescription: tools\n---\nc\n'],
    ])
    const result = await makeProvider(files).list(options)
    const names = result.candidates.map((candidate) => candidate.name).sort()
    expect(names).toEqual(['deploy', 'pathto-skill', 'team-tools'])
    const nested = result.candidates.find((candidate) => candidate.name === 'pathto-skill')!
    expect(nested.source).toBe('project-codebuddy')
    expect(nested.rank).toBe(125)
    expect(nested.path).toBe(fx('proj', '.codebuddy', 'skills', 'pathto', 'skill', 'SKILL.md'))
    const userNested = result.candidates.find((candidate) => candidate.name === 'team-tools')!
    expect(userNested.source).toBe('user-codebuddy')
    expect(userNested.rank).toBe(135)
  })

  it('skips nested directories whose qualified names are not kebab-case', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'opsX', 'inner', 'SKILL.md'), '---\ndescription: x\n---\na\n'],
      [fx('proj', '.codebuddy', 'skills', 'good', 'SKILL.md'), '---\ndescription: y\n---\nb\n'],
      [fx('proj', '.codebuddy', 'commands', 'myGroup', 'run.md'), '---\ndescription: z\n---\nc\n'],
      [fx('proj', '.codebuddy', 'commands', 'fine', 'run.md'), '---\ndescription: w\n---\nd\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name).sort()).toEqual(['fine-run', 'good'])
    expect(result.complete).toBe(true)
  })

  it('skips names that are not kebab-case', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'camelCase', 'SKILL.md'), '---\ndescription: nope\n---\na\n'],
      [fx('proj', '.codebuddy', 'skills', 'good-name', 'SKILL.md'), '---\ndescription: yes\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['good-name'])
  })

  it('derives the description from description/when_to_use and the first paragraph', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'with-when', 'SKILL.md'), '---\ndescription: Base\nwhen_to_use: When asked\n---\nBody.\n'],
      [fx('proj', '.codebuddy', 'skills', 'no-desc', 'SKILL.md'), '---\nname: display\n---\n# Title\n\nFell back paragraph.\n'],
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
      [fx('proj', '.codebuddy', 'skills', 'task', 'SKILL.md'), '---\ndisable-model-invocation: true\n---\na\n'],
      [fx('proj', '.codebuddy', 'skills', 'hidden', 'SKILL.md'), '---\nuser-invocable: false\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.find((candidate) => candidate.name === 'task')?.invocation.modelInvocable).toBe(false)
    expect(result.candidates.find((candidate) => candidate.name === 'hidden')?.invocation.userInvocable).toBe(false)
  })

  it('applies skillOverrides from settings on top of the frontmatter', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'always', 'SKILL.md'), '---\ndescription: normal\n---\na\n'],
      [fx('proj', '.codebuddy', 'skills', 'user-only', 'SKILL.md'), '---\ndescription: user only\n---\nb\n'],
      [fx('proj', '.codebuddy', 'skills', 'disabled', 'SKILL.md'), '---\ndescription: disabled\n---\nc\n'],
      [fx('proj', '.codebuddy', 'skills', 'name-only', 'SKILL.md'), '---\ndescription: long description\n---\nd\n'],
      [
        fx('proj', '.codebuddy', 'settings.json'),
        JSON.stringify({ skillOverrides: { 'user-only': 'user-invocable-only', disabled: 'off', 'name-only': 'name-only' } }),
      ],
    ])
    const result = await makeProvider(files).list(options)
    const always = result.candidates.find((candidate) => candidate.name === 'always')
    expect(always?.invocation).toEqual({ modelInvocable: true, userInvocable: true })
    const userOnly = result.candidates.find((candidate) => candidate.name === 'user-only')
    expect(userOnly?.invocation).toEqual({ modelInvocable: false, userInvocable: true })
    const disabled = result.candidates.find((candidate) => candidate.name === 'disabled')
    expect(disabled?.invocation).toEqual({ modelInvocable: false, userInvocable: false })
    const nameOnly = result.candidates.find((candidate) => candidate.name === 'name-only')
    expect(nameOnly?.description).toBe('')
  })

  it('applies skillOverrides to nested skills keyed by the upstream qualified name', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'pathto', 'skill', 'SKILL.md'), '---\ndescription: nested\n---\na\n'],
      [fx('proj', '.codebuddy', 'skills', 'pathto', 'other', 'SKILL.md'), '---\ndescription: other\n---\nb\n'],
      [
        fx('proj', '.codebuddy', 'settings.json'),
        JSON.stringify({ skillOverrides: { 'pathto:skill': 'off', 'pathto-other': 'user-invocable-only' } }),
      ],
    ])
    const result = await makeProvider(files).list(options)
    const byQualified = result.candidates.find((candidate) => candidate.name === 'pathto-skill')!
    expect(byQualified.invocation).toEqual({ modelInvocable: false, userInvocable: false })
    const byKebab = result.candidates.find((candidate) => candidate.name === 'pathto-other')!
    expect(byKebab.invocation).toEqual({ modelInvocable: false, userInvocable: true })
  })

  it('returns an empty catalog for a project without CodeBuddy assets', async () => {
    const files = new Map<string, string>([[fx('proj', 'README.md'), 'x']])
    const result = await makeProvider(files).list(options)
    expect(result.candidates).toEqual([])
    expect(result.complete).toBe(true)
  })
})

describe('CodebuddySkillProvider.get', () => {
  it('loads the current body and resource base for a bundle', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'deploy', 'SKILL.md'), '---\ndescription: Deploy\n---\nStep one.\n'],
      [fx('proj', '.codebuddy', 'skills', 'deploy', 'template.md'), 'x'],
    ])
    const provider = makeProvider(files)
    const { candidates } = await provider.list(options)
    const definition = await provider.get(candidates[0]!, options)
    expect(definition?.content).toBe('Step one.\n')
    expect(definition?.resourceBase).toEqual({ kind: 'directory', path: fx('proj', '.codebuddy', 'skills', 'deploy') })
  })

  it('loads a nested skill with its own directory as the resource base', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'skills', 'pathto', 'skill', 'SKILL.md'), '---\ndescription: Nested\n---\nNested body.\n'],
      [fx('proj', '.codebuddy', 'skills', 'pathto', 'skill', 'script.py'), 'x'],
    ])
    const provider = makeProvider(files)
    const { candidates } = await provider.list(options)
    const nested = candidates.find((candidate) => candidate.name === 'pathto-skill')!
    const definition = await provider.get(nested, options)
    expect(definition?.name).toBe('pathto-skill')
    expect(definition?.content).toBe('Nested body.\n')
    expect(definition?.resourceBase).toEqual({ kind: 'directory', path: fx('proj', '.codebuddy', 'skills', 'pathto', 'skill') })
  })

  it('returns undefined when the file disappeared', async () => {
    const files = new Map<string, string>([[fx('proj', '.codebuddy', 'skills', 'gone', 'SKILL.md'), '---\ndescription: x\n---\na\n']])
    const provider = makeProvider(files)
    const { candidates } = await provider.list(options)
    files.delete(fx('proj', '.codebuddy', 'skills', 'gone', 'SKILL.md'))
    await expect(provider.get(candidates[0]!, options)).resolves.toBeUndefined()
  })
})
