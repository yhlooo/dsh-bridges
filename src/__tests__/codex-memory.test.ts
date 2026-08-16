import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { collectMemorySections } from '../agents/codex/memory.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'
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

const config = { userCodexDir: fx('home', 'u', '.codex'), maxBytes: 32_768 }

function collect(files: Map<string, string>, cwd = fx('proj', 'sub')) {
  const fs = new TreeFs(files)
  const loader = new CodexSettingsLoader(silent, fs, { userCodexDir: fx('home', 'u', '.codex') })
  return collectMemorySections(cwd, silent, fs, loader, config)
}

describe('codex memory', () => {
  it('injects the global AGENTS.md plus the root-to-cwd instruction chain', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.codex', 'AGENTS.md'), 'Global guidance.\n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.override.md'), 'Root override.\n'],
      [fx('proj', 'sub', 'AGENTS.md'), 'Nested guidance.\n'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => [section.kind, section.content])).toEqual([
      ['user', 'Global guidance.\n'],
      ['project', 'Root override.\n'],
      ['project', 'Nested guidance.\n'],
    ])
  })

  it('prefers the global AGENTS.override.md over AGENTS.md', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.codex', 'AGENTS.md'), 'Base.\n'],
      [fx('home', 'u', '.codex', 'AGENTS.override.md'), 'Override.\n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
    ])
    const sections = await collect(files)
    expect(sections[0]!.content).toBe('Override.\n')
  })

  it('skips empty files', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.codex', 'AGENTS.md'), '   \n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.md'), 'Real root guidance.\n'],
    ])
    const sections = await collect(files, fx('proj'))
    expect(sections).toHaveLength(0) // root AGENTS.md is DSH-loaded; global was empty
  })

  it('skips the root plain AGENTS.md that DSH already loads, keeping overrides and nested files', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.codex', 'AGENTS.md'), 'Global.\n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.md'), 'Root dsh loads.\n'],
      [fx('proj', 'sub', 'AGENTS.md'), 'Nested.\n'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => [section.kind, section.content])).toEqual([
      ['user', 'Global.\n'],
      ['project', 'Nested.\n'],
    ])
  })

  it('honors project_doc_fallback_filenames for extra instruction filenames', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', '.codex', 'config.toml'), 'project_doc_fallback_filenames = ["TEAM.md"]\n'],
      [fx('proj', 'sub', 'TEAM.md'), 'Team guidance.\n'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.content)).toEqual(['Team guidance.\n'])
  })

  it('stops adding project files at project_doc_max_bytes', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', '.codex', 'config.toml'), 'project_doc_max_bytes = 10\n'],
      [fx('proj', 'AGENTS.override.md'), 'Root override content.\n'],
      [fx('proj', 'sub', 'AGENTS.md'), 'Nested content that should not fit.\n'],
    ])
    const sections = await collect(files)
    const project = sections.filter((section) => section.kind === 'project')
    expect(project).toHaveLength(1)
    expect(project[0]!.content).toBe('Root overr') // truncated to the 10-byte budget
  })

  it('prefers AGENTS.override.md over AGENTS.md per directory', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', 'AGENTS.md'), 'Plain.\n'],
      [fx('proj', 'sub', 'AGENTS.override.md'), 'Override.\n'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.content)).toEqual(['Override.\n'])
  })
})
