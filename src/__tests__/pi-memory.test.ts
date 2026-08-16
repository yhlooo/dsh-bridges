import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { collectMemorySections } from '../agents/pi/memory.js'
import { PiSettingsLoader } from '../agents/pi/settings.js'
import { fx } from './fixture-paths.js'

const silent = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

/** An in-memory adapter that lists a path's direct children from the file map. */
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

const USER_PI_DIR = fx('home', 'u', '.pi', 'agent')

function makeLoader(files: Map<string, string>): PiSettingsLoader {
  return new PiSettingsLoader(silent, new TreeFs(files), { userPiDir: USER_PI_DIR })
}

async function collect(files: Map<string, string>, cwd = fx('proj')) {
  return collectMemorySections(cwd, silent, new TreeFs(files), makeLoader(files))
}

describe('pi context-file memory', () => {
  it('collects the global file and the per-directory chain, root first', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'AGENTS.md'), '# global'],
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'CLAUDE.md'), '# proj claude'],
      [fx('proj', 'sub', 'AGENTS.md'), '# sub'],
    ])
    const sections = await collect(files, fx('proj', 'sub'))
    expect(sections.map((section) => section.kind)).toEqual(['user', 'project', 'project'])
    // Order: global, then ancestors root-first, then cwd.
    expect(sections.map((section) => section.content.trim())).toEqual(['# global', '# proj claude', '# sub'])
  })

  it('uses AGENTS.override.md instead of AGENTS.md/CLAUDE.md per directory', async () => {
    const files = new Map<string, string>([
      [fx('proj', 'AGENTS.md'), '# plain'],
      [fx('proj', 'CLAUDE.md'), '# claude'],
      [fx('proj', 'AGENTS.override.md'), '# override'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.content.trim())).toEqual(['# override'])
  })

  it('honors the candidate order including case variants and skips empty files', async () => {
    const files = new Map<string, string>([
      [fx('proj', 'AGENTS.md'), '   '], // empty → skipped
      [fx('proj', 'AGENTS.MD'), '# upper agents'],
      [fx('proj', 'CLAUDE.MD'), '# upper claude'],
    ])
    const sections = await collect(files)
    expect(sections.map((section) => section.content.trim())).toEqual(['# upper agents'])
  })

  it('skips the repository-root AGENTS.md that DSH already loads', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'AGENTS.md'), '# root agents'],
      [fx('proj', 'sub', 'AGENTS.md'), '# sub agents'],
    ])
    const sections = await collect(files, fx('proj', 'sub'))
    expect(sections.map((section) => section.content.trim())).toEqual(['# sub agents'])
  })

  it('deduplicates by canonical path across the walk', async () => {
    const files = new Map<string, string>([
      [fx('proj', 'AGENTS.md'), '# same'],
      [fx('proj', '.git', 'HEAD'), 'x'],
    ])
    const sections = await collect(files)
    expect(sections).toHaveLength(0) // only the root file exists and DSH loads it
  })

  it('injects the global and trusted-project APPEND_SYSTEM.md files', async () => {
    const files = new Map<string, string>([
      [fx('home', 'u', '.pi', 'agent', 'settings.json'), JSON.stringify({ defaultProjectTrust: 'always' })],
      [fx('home', 'u', '.pi', 'agent', 'APPEND_SYSTEM.md'), '# global append'],
      [fx('proj', '.pi', 'APPEND_SYSTEM.md'), '# project append'],
    ])
    const sections = await collect(files)
    expect(sections.filter((section) => section.kind === 'append-system').map((section) => section.content.trim())).toEqual([
      '# global append',
      '# project append',
    ])
  })

  it('skips the project APPEND_SYSTEM.md when the project is untrusted', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.pi', 'APPEND_SYSTEM.md'), '# project append'],
      // no global settings → defaultProjectTrust ask → untrusted
    ])
    const sections = await collect(files)
    expect(sections).toHaveLength(0)
  })

  it('walks above the repository root toward the filesystem root', async () => {
    // cwd is /proj/sub/deep: ancestors /proj/sub, /proj, and / are all walked.
    const files = new Map<string, string>([
      [fx('proj', '.git', 'HEAD'), 'x'],
      [fx('proj', 'sub', 'deep', 'AGENTS.md'), '# deep'],
      [fx('proj', 'CLAUDE.md'), '# proj claude'],
    ])
    const sections = await collect(files, fx('proj', 'sub', 'deep'))
    expect(sections.map((section) => section.content.trim())).toEqual(['# proj claude', '# deep'])
  })

  it('treats the cwd AGENTS.md as DSH-loaded when no repository root exists', async () => {
    const files = new Map<string, string>([[fx('proj', 'AGENTS.md'), '# only agents']])
    const sections = await collect(files)
    expect(sections).toHaveLength(0)
  })
})
