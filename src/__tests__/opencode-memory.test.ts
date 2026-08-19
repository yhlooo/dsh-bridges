import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { collectMemorySections } from '../agents/opencode/memory.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'
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

const config = {
  userOpencodeDir: fx('home', 'u', '.config', 'opencode'),
  userClaudeDir: fx('home', 'u', '.claude'),
  claudeCompat: true,
  maxBytes: 32_768,
}

function collect(files: Map<string, string>, cwd = fx('proj')) {
  const fs = new TreeFs(files)
  const loader = new OpencodeSettingsLoader(silent, fs, { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
  return collectMemorySections(cwd, silent, fs, loader, config)
}

describe('opencode memory', () => {
  it('injects the global AGENTS.md and skips the chain-level project rules DSH already loads', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.config', 'opencode', 'AGENTS.md'), 'Global rules.\n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.md'), 'Project rules.\n'],
    ])
    const sections = await collect(files, fx('proj', 'sub'))
    expect(sections.map((section) => [section.kind, section.content])).toEqual([['user', 'Global rules.\n']])
  })

  it('falls back to ~/.claude/CLAUDE.md when no global AGENTS.md exists', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.claude', 'CLAUDE.md'), 'Claude global.\n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'CLAUDE.md'), 'Claude project.\n'],
    ])
    const sections = await collect(files, fx('proj', 'sub'))
    expect(sections.map((section) => section.content)).toEqual(['Claude global.\n'])
  })

  it('prefers AGENTS.md over CLAUDE.md per category (first match wins)', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.config', 'opencode', 'AGENTS.md'), 'opencode global.\n'],
      [fx('home', 'u', '.claude', 'CLAUDE.md'), 'claude global.\n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.md'), 'opencode parent.\n'],
      [fx('proj', 'CLAUDE.md'), 'claude parent.\n'],
    ])
    const sections = await collect(files, fx('proj', 'sub'))
    const project = sections.filter((section) => section.kind === 'project')
    expect(sections[0]!.content).toBe('opencode global.\n')
    expect(project.map((section) => section.content)).toEqual([])
  })

  it('skips the closest project rules file inside the repository (DSH already loads it)', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.md'), 'Parent rules.\n'],
    ])
    const sections = await collect(files, fx('proj', 'sub'))
    expect(sections.map((section) => section.content)).toEqual([])
  })

  it('keeps the closest AGENTS.md above the cwd when no repository root exists', async () => {
    const files = new Map<string, string>([[fx('proj', 'AGENTS.md'), 'Parent rules.\n']])
    const sections = await collect(files, fx('proj', 'sub'))
    expect(sections.map((section) => section.content)).toEqual(['Parent rules.\n'])
  })

  it('skips the cwd-level AGENTS.md and CLAUDE.md that DSH already loads', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.config', 'opencode', 'AGENTS.md'), 'Global rules.\n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.md'), 'Loaded by dsh.\n'],
      [fx('proj', 'CLAUDE.md'), 'Also loaded by dsh.\n'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.content)).toEqual(['Global rules.\n'])
  })

  it('injects instruction files listed in opencode.json', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'opencode.json'), JSON.stringify({ instructions: ['CONTRIBUTING.md', 'docs/*.md'] })],
      [fx('proj', 'CONTRIBUTING.md'), 'Contribute this way.\n'],
      [fx('proj', 'docs', 'guide.md'), 'Guide content.\n'],
    ])
    const sections = await collect(files)
    const project = sections.filter((section) => section.kind === 'project').map((section) => section.content)
    expect(project).toContain('Contribute this way.\n')
    expect(project).toContain('Guide content.\n')
  })

  it('skips remote instruction URLs', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'opencode.json'), JSON.stringify({ instructions: ['https://example.com/style.md', 'local.md'] })],
      [fx('proj', 'local.md'), 'Local content.\n'],
    ])
    const sections = await collect(files)
    expect(sections.some((section) => section.content.includes('example.com'))).toBe(false)
    expect(sections.some((section) => section.content === 'Local content.\n')).toBe(true)
  })

  it('deduplicates identical content across sections', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.config', 'opencode', 'AGENTS.md'), 'Same text.\n'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'CLAUDE.md'), 'Same text.\n'],
    ])
    const sections = await collect(files, fx('proj', 'sub'))
    expect(sections).toHaveLength(1)
  })
})
