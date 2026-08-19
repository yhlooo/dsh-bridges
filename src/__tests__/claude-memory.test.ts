import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fx } from './fixture-paths.js'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { collectMemorySections } from '../agents/claude-code/memory.js'
import { SettingsLoader } from '../agents/claude-code/hooks/settings.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

class TreeFs implements FsAdapter {
  constructor(public files: Map<string, string>) {}
  async listDir(): Promise<BridgeDirEntry[]> {
    return []
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

function makeLoader(files: Map<string, string>): SettingsLoader {
  return new SettingsLoader(silent, new TreeFs(files), { userClaudeDir: fx('home', 'u', '.claude') })
}

const config = { userClaudeDir: fx('home', 'u', '.claude'), maxBytes: 32_768 }

describe('collectMemorySections', () => {
  it('injects the configured outputStyle file (project before user)', async () => {
    const files = new Map<string, string>([
      [fx('repo', '.claude', 'settings.json'), JSON.stringify({ outputStyle: 'explanatory' })],
      [fx('repo', '.claude', 'output-styles', 'explanatory.md'), 'Be extra explanatory.'],
      [fx('home', 'u', '.claude', 'output-styles', 'explanatory.md'), 'User-level style.'],
    ])
    const sections = await collectMemorySections(fx('repo'), silent, new TreeFs(files), { ...config, settingsLoader: makeLoader(files) })
    const style = sections.find((section) => section.kind === 'output-style')
    expect(style?.content).toBe('Be extra explanatory.')
  })

  it('collects user and hierarchy files in order, skipping DSH-loaded ones', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.claude', 'CLAUDE.md'), 'user memory'],
      [fx('repo', 'CLAUDE.md'), 'repo memory'],
      [fx('repo', '.claude', 'CLAUDE.md'), 'project memory'],
      [fx('repo', 'CLAUDE.local.md'), 'repo local memory'],
      [fx('repo', 'apps', 'CLAUDE.md'), 'api memory'],
      [fx('repo', 'apps', 'api', 'CLAUDE.local.md'), 'local memory'],
    ])
    const sections = await collectMemorySections(fx('repo', 'apps', 'api'), silent, new TreeFs(files), config)
    expect(sections.map((section) => section.label)).toEqual([
      fx('home', 'u', '.claude', 'CLAUDE.md'),
      fx('repo', 'CLAUDE.md'),
      fx('repo', 'CLAUDE.local.md'),
      fx('repo', 'apps', 'CLAUDE.md'),
    ])
    expect(sections[0]?.kind).toBe('user')
    expect(sections[3]?.kind).toBe('hierarchy')
  })

  it('skips hierarchy CLAUDE.md identical to the cwd-level file the core loads', async () => {
    const files = new Map<string, string>([
      [fx('repo', 'CLAUDE.md'), 'same content'],
      [fx('repo', 'apps', 'api', 'CLAUDE.md'), 'same content'],
    ])
    const sections = await collectMemorySections(fx('repo', 'apps', 'api'), silent, new TreeFs(files), config)
    expect(sections.map((section) => section.label)).toEqual([])
  })

  it('skips chain-level CLAUDE.md and CLAUDE.local.md that DSH already loads', async () => {
    const files = new Map<string, string>([
      [fx('repo', '.git', 'HEAD'), 'x'],
      [fx('repo', 'CLAUDE.md'), 'repo memory'],
      [fx('repo', 'CLAUDE.local.md'), 'repo local memory'],
      [fx('repo', 'apps', 'CLAUDE.md'), 'app memory'],
      [fx('CLAUDE.md'), 'fs memory'],
    ])
    const sections = await collectMemorySections(fx('repo', 'apps'), silent, new TreeFs(files), config)
    expect(sections.map((section) => section.label)).toEqual([fx('CLAUDE.md')])
  })

  it('rejects path-like outputStyle names instead of reading outside the style roots', async () => {
    const files = new Map<string, string>([
      [fx('repo', '.claude', 'settings.json'), JSON.stringify({ outputStyle: '../../outside' })],
      // The traversal would resolve to <repo>/outside.md via
      // .claude/output-styles/../../outside.md; it must never be read.
      [fx('repo', 'outside.md'), 'SECRET OUTSIDE'],
    ])
    const sections = await collectMemorySections(fx('repo'), silent, new TreeFs(files), { ...config, settingsLoader: makeLoader(files) })
    expect(sections.find((section) => section.kind === 'output-style')).toBeUndefined()
    expect(JSON.stringify(sections)).not.toContain('SECRET OUTSIDE')
  })

  it('loads memory files from permissions.additionalDirectories', async () => {
    const files = new Map<string, string>([
      [fx('other', 'CLAUDE.md'), 'other memory'],
      [fx('repo', '.claude', 'settings.json'), JSON.stringify({ permissions: { additionalDirectories: ['../other'] } })],
    ])
    const sections = await collectMemorySections(fx('repo'), silent, new TreeFs(files), { ...config, settingsLoader: makeLoader(files) })
    expect(sections.map((section) => section.kind)).toContain('additional')
    expect(sections.find((section) => section.kind === 'additional')?.content).toBe('other memory')
  })

  it('returns only the user section without a workspace', async () => {
    const files = new Map<string, string>([[fx('home', 'u', '.claude', 'CLAUDE.md'), 'user memory']])
    const sections = await collectMemorySections(undefined, silent, new TreeFs(files), config)
    expect(sections.map((section) => section.kind)).toEqual(['user'])
  })
})
