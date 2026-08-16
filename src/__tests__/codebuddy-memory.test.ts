import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { collectMemorySections } from '../agents/codebuddy-code/memory.js'

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
  async stamp(): Promise<string | undefined> {
    return 'v1'
  }
  async dirExists(path: string): Promise<boolean> {
    return [...this.files.keys()].some((key) => key.startsWith(`${path}/`))
  }
}

const config = { userCodebuddyDir: '/home/u/.codebuddy', maxBytes: 32_768 }

async function collect(files: Map<string, string>, cwd = '/proj') {
  return collectMemorySections(cwd, silent, new TreeFs(files), config)
}

describe('collectMemorySections', () => {
  it('collects user and project memory files plus local memory in order', async () => {
    const files = new Map<string, string>([
      ['/home/u/.codebuddy/CODEBUDDY.md', 'user memory'],
      ['/proj/CODEBUDDY.md', 'project root memory'],
      ['/proj/CODEBUDDY.local.md', 'local memory'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.label)).toEqual(['/home/u/.codebuddy/CODEBUDDY.md', 'CODEBUDDY.md', 'CODEBUDDY.local.md'])
    expect(sections.map((section) => section.kind)).toEqual(['user', 'project', 'project'])
  })

  it('reads .codebuddy/CODEBUDDY.md and deduplicates identical content', async () => {
    const files = new Map<string, string>([
      ['/proj/CODEBUDDY.md', 'same content'],
      ['/proj/.codebuddy/CODEBUDDY.md', 'same content'],
    ])
    const sections = await collect(files)
    expect(sections).toHaveLength(1)
    expect(sections[0]!.label).toBe('CODEBUDDY.md')
  })

  it('collects recursive always-apply rules and strips their frontmatter', async () => {
    const files = new Map<string, string>([
      ['/proj/.codebuddy/rules/style.md', '---\nalwaysApply: true\n---\nRule body.\n'],
      ['/proj/.codebuddy/rules/nested/deep.md', 'Deep rule.\n'],
      ['/home/u/.codebuddy/rules/prefs.md', '---\nenabled: true\n---\nUser prefs.\n'],
    ])
    const sections = await collect(files)
    const labels = sections.map((section) => section.label)
    expect(labels).toContain('/home/u/.codebuddy/rules/prefs.md')
    expect(labels).toContain('/proj/.codebuddy/rules/style.md')
    expect(labels).toContain('/proj/.codebuddy/rules/nested/deep.md')
    const style = sections.find((section) => section.label.endsWith('style.md'))
    expect(style?.content).toBe('Rule body.\n')
    expect(style?.kind).toBe('project')
    const prefs = sections.find((section) => section.label.endsWith('prefs.md'))
    expect(prefs?.kind).toBe('user')
  })

  it('skips disabled and conditional rules', async () => {
    const files = new Map<string, string>([
      ['/proj/.codebuddy/rules/always.md', 'Always.\n'],
      ['/proj/.codebuddy/rules/off.md', '---\nenabled: false\n---\nOff.\n'],
      ['/proj/.codebuddy/rules/conditional.md', '---\nalwaysApply: false\npaths: src/**/*.ts\n---\nConditional.\n'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.label)).toEqual(['/proj/.codebuddy/rules/always.md'])
  })

  it('returns an empty list without CodeBuddy assets', async () => {
    const files = new Map<string, string>([['/proj/README.md', 'x']])
    expect(await collect(files)).toEqual([])
  })

  it('loads a malformed-frontmatter rule as whole text (fail open)', async () => {
    const files = new Map<string, string>([['/proj/.codebuddy/rules/broken.md', '---\nname: [unclosed\n---\nBroken frontmatter.\n']])
    const sections = await collect(files)
    expect(sections).toHaveLength(1)
    expect(sections[0]!.content).toContain('Broken frontmatter.')
  })
})
