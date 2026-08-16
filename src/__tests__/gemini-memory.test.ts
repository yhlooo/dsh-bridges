import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { collectMemorySections, expandImports } from '../agents/gemini-cli/memory.js'
import { GeminiSettingsLoader } from '../agents/gemini-cli/settings.js'
import { fx } from './fixture-paths.js'

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

const USER_DIR = fx('home', 'u', '.gemini')

function makeLoader(files: Map<string, string>): GeminiSettingsLoader {
  return new GeminiSettingsLoader(silent, new TreeFs(files), { userGeminiDir: USER_DIR })
}

async function collect(files: Map<string, string>, cwd = fx('proj')) {
  return collectMemorySections(cwd, silent, new TreeFs(files), makeLoader(files))
}

describe('gemini GEMINI.md memory', () => {
  it('collects the global file and the workspace chain up to the git boundary, root-first', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.gemini', 'GEMINI.md'), '# global'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'GEMINI.md'), '# proj'],
      [fx('proj', 'sub', 'GEMINI.md'), '# sub'],
      [fx('parent', 'GEMINI.md'), '# outside'], // above the .git boundary → excluded
    ])
    // cwd is /proj/sub; boundary at /proj stops the walk.
    const sections = await collect(files, fx('proj', 'sub'))
    expect(sections.map((section) => section.kind)).toEqual(['user', 'project', 'project'])
    expect(sections.map((section) => section.content.trim())).toEqual(['# global', '# proj', '# sub'])
  })

  it('walks to the filesystem root when no boundary marker exists (capped by discoveryMaxDirs)', async () => {
    const files = new Map<string, string>([
      [fx('proj', 'sub', 'deep', 'GEMINI.md'), '# deep'],
      [fx('proj', 'GEMINI.md'), '# proj'],
    ])
    const sections = await collect(files, fx('proj', 'sub', 'deep'))
    expect(sections.map((section) => section.content.trim())).toEqual(['# proj', '# deep'])
  })

  it('honors context.fileName and context.memoryBoundaryMarkers', async () => {
    const files = new Map<string, string>([
      [
        fx('home', 'u', '.gemini', 'settings.json'),
        JSON.stringify({ context: { fileName: 'CTX.md', memoryBoundaryMarkers: ['BOUNDARY'] } }),
      ],
      [fx('home', 'u', '.gemini', 'CTX.md'), '# global ctx'],
      [fx('proj', 'BOUNDARY', 'x'), 'x'],
      [fx('proj', 'CTX.md'), '# proj ctx'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.content.trim())).toEqual(['# global ctx', '# proj ctx'])
  })

  it('does not inject anything when neither scope has a context file', async () => {
    const files = new Map<string, string>([[fx('proj', '.git', 'HEAD'), 'x']])
    expect(await collect(files)).toEqual([])
  })
})

describe('gemini @-import expansion', () => {
  it('expands @./relative imports inline and deduplicates by canonical path', async () => {
    const files = new Map<string, string>([
      [fx('proj', 'GEMINI.md'), '# main\n@./docs/style.md\n'],
      [fx('proj', 'docs', 'style.md'), '# style\n@./more.md\n'],
      [fx('proj', 'docs', 'more.md'), '# more\n@./style.md\n'], // cycle back → dropped
    ])
    const expanded = await expandImports('# main\n@./docs/style.md\n', fx('proj', 'GEMINI.md'), new TreeFs(files), silent)
    expect(expanded).toContain('# style')
    expect(expanded).toContain('# more')
    // The cyclic import line stays as a literal reference (deduped), not infinite.
    expect(expanded.split('@./style.md').length - 1).toBe(1)
  })

  it('expands @/absolute imports and keeps missing imports as literal lines', async () => {
    const files = new Map<string, string>([[fx('shared', 'rules.md'), '# shared rules']])
    const expanded = await expandImports(
      `@${fx('shared', 'rules.md')}\n@./missing.md\n`,
      fx('proj', 'GEMINI.md'),
      new TreeFs(files),
      silent,
    )
    expect(expanded).toContain('# shared rules')
    expect(expanded).toContain('@./missing.md')
  })
})
