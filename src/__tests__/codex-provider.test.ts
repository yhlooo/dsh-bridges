import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { CodexSkillProvider } from '../agents/codex/skills/provider.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
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

function makeProvider(files: Map<string, string>): CodexSkillProvider {
  const fs = new TreeFs(files)
  const settings = new CodexSettingsLoader(silent, fs, { userCodexDir: fx('home', 'u', '.codex') })
  return new CodexSkillProvider(
    silent,
    fs,
    { userCodexDir: fx('home', 'u', '.codex'), userSkillsDir: fx('home', 'u', '.agents', 'skills'), watch: false },
    settings,
    () => {},
  )
}

const options: SkillLookupOptions = { cwd: fx('proj', 'sub') }

describe('CodexSkillProvider.list', () => {
  it('discovers project, user, and system skill bundles', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', '.agents', 'skills', 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: Deploy\n---\nBody.\n'],
      [fx('home', 'u', '.agents', 'skills', 'personal', 'SKILL.md'), '---\nname: personal\ndescription: Personal\n---\nBody.\n'],
      [fx('etc', 'codex', 'skills', 'admin-skill', 'SKILL.md'), '---\nname: admin-skill\ndescription: Admin\n---\nBody.\n'],
    ])
    const result = await makeProvider(files).list(options)
    const names = result.candidates.map((candidate) => candidate.name).sort()
    expect(names).toEqual(['admin-skill', 'deploy', 'personal'])
  })

  it('scans .agents/skills from the cwd up to the repository root, closest first', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', '.agents', 'skills', 'inner', 'SKILL.md'), '---\nname: inner\ndescription: Inner\n---\na\n'],
      [fx('proj', '.agents', 'skills', 'root', 'SKILL.md'), '---\nname: root\ndescription: Root\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['inner', 'root'])
    // Closest directory ranks first within the project band.
    const bySource = result.candidates.map((candidate) => [candidate.name, candidate.source])
    expect(bySource[0]).toEqual(['inner', 'project-codex'])
  })

  it('checks only the current directory when no project root marker exists', async () => {
    const files = new Map<string, string>([
      [fx('proj', 'sub', '.agents', 'skills', 'inner', 'SKILL.md'), '---\nname: inner\ndescription: Inner\n---\na\n'],
      [fx('proj', '.agents', 'skills', 'root', 'SKILL.md'), '---\nname: root\ndescription: Root\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['inner'])
  })

  it('ranks project skills below user and system skills (DSH lower-rank wins)', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', '.agents', 'skills', 'shared', 'SKILL.md'), '---\nname: shared\ndescription: project\n---\na\n'],
      [fx('home', 'u', '.agents', 'skills', 'shared', 'SKILL.md'), '---\nname: shared\ndescription: user\n---\nb\n'],
      [fx('etc', 'codex', 'skills', 'shared', 'SKILL.md'), '---\nname: shared\ndescription: system\n---\nc\n'],
    ])
    const result = await makeProvider(files).list(options)
    const shared = result.candidates.filter((candidate) => candidate.name === 'shared')
    expect(Math.min(...shared.map((candidate) => candidate.rank))).toBe(165)
    expect(shared.map((candidate) => candidate.source)).toEqual(['project-codex', 'user-codex', 'system-codex'])
  })

  it('skips skills disabled via [[skills.config]]', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', '.agents', 'skills', 'off', 'SKILL.md'), '---\nname: off\ndescription: Off\n---\na\n'],
      [fx('proj', 'sub', '.agents', 'skills', 'on', 'SKILL.md'), '---\nname: on\ndescription: On\n---\nb\n'],
      [
        fx('proj', '.codex', 'config.toml'),
        `[[skills.config]]\npath = '${fx('proj', 'sub', '.agents', 'skills', 'off')}'\nenabled = false\n`,
      ],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['on'])
  })

  it('skips invalid names and skills missing required frontmatter', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', '.agents', 'skills', 'camelCase', 'SKILL.md'), '---\nname: camelCase\ndescription: x\n---\na\n'],
      [fx('proj', 'sub', '.agents', 'skills', 'no-desc', 'SKILL.md'), '---\nname: no-desc\n---\nb\n'],
      [fx('proj', 'sub', '.agents', 'skills', 'good', 'SKILL.md'), '---\nname: good\ndescription: y\n---\nc\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['good'])
  })

  it('ignores flat md files in skills directories', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', '.agents', 'skills', 'flat.md'), '---\nname: flat\ndescription: x\n---\na\n'],
      [fx('proj', 'sub', '.agents', 'skills', 'bundle', 'SKILL.md'), '---\nname: bundle\ndescription: y\n---\nb\n'],
    ])
    const result = await makeProvider(files).list(options)
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(['bundle'])
  })
})

describe('CodexSkillProvider.get', () => {
  it('loads the body of a skill bundle', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', '.agents', 'skills', 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: Deploy\n---\nInstructions.\n'],
    ])
    const provider = makeProvider(files)
    const result = await provider.list(options)
    const definition = await provider.get(result.candidates[0]!, options)
    expect(definition?.content).toBe('Instructions.\n')
    expect(definition?.resourceBase).toEqual({ kind: 'directory', path: fx('proj', 'sub', '.agents', 'skills', 'deploy') })
  })
})
