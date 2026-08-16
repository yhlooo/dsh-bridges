import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { collectMemorySections } from '../agents/cursor/memory.js'
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

describe('cursor rules memory', () => {
  it('collects alwaysApply .mdc rules recursively and skips conditional ones', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.cursor', 'rules', 'style.mdc'), '---\ndescription: style\nalwaysApply: true\n---\nUse tabs.\n'],
      [fx('proj', '.cursor', 'rules', 'react.mdc'), '---\ndescription: react\nglobs: ["**/*.tsx"]\n---\nUse hooks.\n'],
      [fx('proj', '.cursor', 'rules', 'nested', 'deep.mdc'), '---\ndescription: deep\nalwaysApply: true\n---\nDeep rules.\n'],
      [fx('proj', '.cursor', 'rules', 'plain.md'), '# ignored (no frontmatter, .md extension)'],
    ])
    const sections = await collectMemorySections(fx('proj'), silent, new TreeFs(files))
    expect(sections.map((section) => section.content.trim()).sort()).toEqual(['Deep rules.', 'Use tabs.'])
  })

  it('collects subdirectory AGENTS.md files but skips the repository root one', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.md'), '# root (DSH loads this)'],
      [fx('proj', 'sub', 'AGENTS.md'), '# sub agents'],
    ])
    const sections = await collectMemorySections(fx('proj', 'sub'), silent, new TreeFs(files))
    expect(sections.map((section) => section.content.trim())).toEqual(['# sub agents'])
  })

  it('returns nothing when no cursor assets exist', async () => {
    const files = new Map<string, string>([[fx('proj', '.git', 'HEAD'), 'x']])
    expect(await collectMemorySections(fx('proj'), silent, new TreeFs(files))).toEqual([])
  })
})
