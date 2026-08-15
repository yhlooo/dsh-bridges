import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { collectMemorySections } from '../agents/opencode/memory.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

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
    return this.files.has(path) ? `v:${this.files.get(path)}` : undefined
  }
  async dirExists(path: string): Promise<boolean> {
    return [...this.files.keys()].some((key) => key.startsWith(`${path}/`))
  }
}

const config = { userOpencodeDir: '/home/u/.config/opencode', userClaudeDir: '/home/u/.claude', claudeCompat: true, maxBytes: 32_768 }

function collect(files: Map<string, string>, cwd = '/proj') {
  const fs = new TreeFs(files)
  const loader = new OpencodeSettingsLoader(silent, fs, { userOpencodeDir: '/home/u/.config/opencode' })
  return collectMemorySections(cwd, silent, fs, loader, config)
}

describe('opencode memory', () => {
  it('injects the global AGENTS.md and a project AGENTS.md above the cwd', async () => {
    const files = new Map<string, string>([
      ['/home/u/.config/opencode/AGENTS.md', 'Global rules.\n'],
      ['/proj/.git/HEAD', 'x'],
      ['/proj/AGENTS.md', 'Project rules.\n'],
    ])
    const sections = await collect(files, '/proj/sub')
    expect(sections.map((section) => [section.kind, section.content])).toEqual([
      ['user', 'Global rules.\n'],
      ['project', 'Project rules.\n'],
    ])
  })

  it('falls back to ~/.claude/CLAUDE.md when no global AGENTS.md exists', async () => {
    const files = new Map<string, string>([
      ['/home/u/.claude/CLAUDE.md', 'Claude global.\n'],
      ['/proj/.git/HEAD', 'x'],
      ['/proj/CLAUDE.md', 'Claude project.\n'],
    ])
    const sections = await collect(files, '/proj/sub')
    expect(sections.map((section) => section.content)).toEqual(['Claude global.\n', 'Claude project.\n'])
  })

  it('prefers AGENTS.md over CLAUDE.md per category (first match wins)', async () => {
    const files = new Map<string, string>([
      ['/home/u/.config/opencode/AGENTS.md', 'opencode global.\n'],
      ['/home/u/.claude/CLAUDE.md', 'claude global.\n'],
      ['/proj/.git/HEAD', 'x'],
      ['/proj/AGENTS.md', 'opencode parent.\n'],
      ['/proj/CLAUDE.md', 'claude parent.\n'],
    ])
    const sections = await collect(files, '/proj/sub')
    const project = sections.filter((section) => section.kind === 'project')
    expect(sections[0]!.content).toBe('opencode global.\n')
    expect(project.map((section) => section.content)).toEqual(['opencode parent.\n'])
  })

  it('walks up to the git root for the closest project rules file', async () => {
    const files = new Map<string, string>([
      ['/proj/.git/HEAD', 'x'],
      ['/proj/AGENTS.md', 'Parent rules.\n'],
    ])
    const sections = await collect(files, '/proj/sub')
    expect(sections.map((section) => section.content)).toEqual(['Parent rules.\n'])
  })

  it('skips the cwd-level AGENTS.md and CLAUDE.md that DSH already loads', async () => {
    const files = new Map<string, string>([
      ['/home/u/.config/opencode/AGENTS.md', 'Global rules.\n'],
      ['/proj/.git/HEAD', 'x'],
      ['/proj/AGENTS.md', 'Loaded by dsh.\n'],
      ['/proj/CLAUDE.md', 'Also loaded by dsh.\n'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.content)).toEqual(['Global rules.\n'])
  })

  it('injects instruction files listed in opencode.json', async () => {
    const files = new Map<string, string>([
      ['/proj/.git/HEAD', 'x'],
      ['/proj/opencode.json', JSON.stringify({ instructions: ['CONTRIBUTING.md', 'docs/*.md'] })],
      ['/proj/CONTRIBUTING.md', 'Contribute this way.\n'],
      ['/proj/docs/guide.md', 'Guide content.\n'],
    ])
    const sections = await collect(files)
    const project = sections.filter((section) => section.kind === 'project').map((section) => section.content)
    expect(project).toContain('Contribute this way.\n')
    expect(project).toContain('Guide content.\n')
  })

  it('skips remote instruction URLs', async () => {
    const files = new Map<string, string>([
      ['/proj/.git/HEAD', 'x'],
      ['/proj/opencode.json', JSON.stringify({ instructions: ['https://example.com/style.md', 'local.md'] })],
      ['/proj/local.md', 'Local content.\n'],
    ])
    const sections = await collect(files)
    expect(sections.some((section) => section.content.includes('example.com'))).toBe(false)
    expect(sections.some((section) => section.content === 'Local content.\n')).toBe(true)
  })

  it('deduplicates identical content across sections', async () => {
    const files = new Map<string, string>([
      ['/home/u/.config/opencode/AGENTS.md', 'Same text.\n'],
      ['/proj/.git/HEAD', 'x'],
      ['/proj/CLAUDE.md', 'Same text.\n'],
    ])
    const sections = await collect(files, '/proj/sub')
    expect(sections).toHaveLength(1)
  })
})
