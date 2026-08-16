import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { evaluateOpencodePermissions, matchOpencodePattern } from '../agents/opencode/permissions.js'
import { fx } from './fixture-paths.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'

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
  async dirExists(): Promise<boolean> {
    return false
  }
}

function makeLoader(files: Map<string, string>): OpencodeSettingsLoader {
  return new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
}

const ctx = { cwd: fx('proj'), home: fx('home', 'u') }

function evaluate(permissionsJson: unknown, tool: string, args: unknown) {
  const config = JSON.stringify({ permission: permissionsJson })
  return async () => {
    const loader = makeLoader(new Map([[fx('proj', 'opencode.json'), config]]))
    const settings = await loader.load(fx('proj'))
    return evaluateOpencodePermissions(settings.permissions!, tool, args, ctx)
  }
}

describe('opencode permission parsing', () => {
  it('reads the string form and family granular rules', async () => {
    const config = JSON.stringify({ permission: { '*': 'ask', bash: { 'git *': 'allow', 'rm *': 'deny' } } })
    const loader = makeLoader(new Map([[fx('proj', 'opencode.json'), config]]))
    const settings = await loader.load(fx('proj'))
    expect(settings.permissions?.families.get('*')?.action).toBe('ask')
    expect(settings.permissions?.families.get('bash')?.rules).toEqual([
      ['git *', 'allow'],
      ['rm *', 'deny'],
    ])
  })

  it('lets the project layer replace a family from the global layer', async () => {
    const loader = makeLoader(
      new Map([
        [
          fx('home', 'u', '.config', 'opencode', 'opencode.json'),
          JSON.stringify({ permission: { bash: 'allow', edit: { '*.md': 'deny' } } }),
        ],
        [fx('proj', 'opencode.json'), JSON.stringify({ permission: { bash: { 'rm *': 'deny' } } })],
      ]),
    )
    const settings = await loader.load(fx('proj'))
    expect(settings.permissions?.families.get('bash')).toEqual({ rules: [['rm *', 'deny']] })
    expect(settings.permissions?.families.get('edit')).toEqual({ rules: [['*.md', 'deny']] })
  })

  it('leaves permissions undefined when nothing is configured', async () => {
    const loader = makeLoader(new Map([[fx('proj', 'opencode.json'), JSON.stringify({ instructions: ['notes.md'] })]]))
    const settings = await loader.load(fx('proj'))
    expect(settings.permissions).toBeUndefined()
  })

  it('drops unsupported action strings', async () => {
    const loader = makeLoader(new Map([[fx('proj', 'opencode.json'), JSON.stringify({ permission: { bash: 'maybe' } })]]))
    const settings = await loader.load(fx('proj'))
    expect(settings.permissions?.families.has('bash')).toBe(false)
  })
})

describe('opencode permission evaluation', () => {
  it('applies the last matching rule', async () => {
    const result = await evaluate({ bash: { '*': 'ask', 'git *': 'allow', 'git push *': 'deny' } }, 'bash', {
      command: 'git push origin',
    })()
    expect(result).toEqual({ kind: 'deny', reason: 'denied by an opencode permission rule' })
    const allowed = await evaluate({ bash: { '*': 'ask', 'git *': 'allow', 'git push *': 'deny' } }, 'bash', { command: 'git status' })()
    expect(allowed).toEqual({ kind: 'allow' })
  })

  it('enforces the built-in read .env protection when permission is configured', async () => {
    const denied = await evaluate({ bash: 'allow' }, 'read', { file_path: fx('proj', '.env') })()
    expect(denied?.kind).toBe('deny')
    const example = await evaluate({ bash: 'allow' }, 'read', { file_path: fx('proj', '.env.example') })()
    expect(example?.kind).toBe('allow')
    const normal = await evaluate({ bash: 'allow' }, 'read', { file_path: fx('proj', 'src', 'a.ts') })()
    expect(normal?.kind).toBe('allow')
  })

  it('applies the string form to every tool', async () => {
    const result = await evaluate('ask', 'todo_write', {})()
    expect(result?.kind).toBe('ask')
  })

  it('maps dsh tools onto opencode families', async () => {
    const denied = await evaluate({ edit: { '*': 'deny' } }, 'write', { file_path: fx('proj', 'a.ts') })()
    expect(denied?.kind).toBe('deny')
    const taskAsk = await evaluate({ task: 'ask' }, 'subagent', {})()
    expect(taskAsk?.kind).toBe('ask')
    const skillDeny = await evaluate({ skill: { '*': 'allow', 'danger-*': 'deny' } }, 'skill', { name: 'danger-cleanup' })()
    expect(skillDeny?.kind).toBe('deny')
  })

  it('guards paths outside the working directory with external_directory', async () => {
    const asked = await evaluate({ read: 'allow' }, 'read', { file_path: fx('outside', 'file.txt') })()
    expect(asked?.kind).toBe('ask')
    const allowed = await evaluate({ read: 'allow', external_directory: { '~/projects/**': 'allow' } }, 'read', {
      file_path: fx('home', 'u', 'projects', 'x', 'f.txt'),
    })()
    expect(allowed?.kind).toBe('allow')
    const inside = await evaluate({ read: 'allow' }, 'read', { file_path: fx('proj', 'file.txt') })()
    expect(inside?.kind).toBe('allow')
  })

  it('expands ~ and $HOME in patterns', () => {
    expect(matchOpencodePattern('~/x/*', fx('home', 'u', 'x', 'a'), 'path', ctx)).toBe(true)
    expect(matchOpencodePattern('$HOME/x/*', fx('home', 'u', 'x', 'a'), 'path', ctx)).toBe(true)
  })

  it('matches worktree-relative patterns for files under the working directory', async () => {
    const allowed = await evaluate({ edit: { '*': 'ask', 'packages/web/**': 'allow' } }, 'edit', {
      file_path: fx('proj', 'packages', 'web', 'a.mdx'),
    })()
    expect(allowed?.kind).toBe('allow')
    const asked = await evaluate({ edit: { '*': 'ask', 'packages/web/**': 'allow' } }, 'edit', { file_path: fx('proj', 'other', 'a.ts') })()
    expect(asked?.kind).toBe('ask')
  })
})
