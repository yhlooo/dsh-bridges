import { describe, expect, it } from 'vitest'
import { fx } from './fixture-paths.js'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { applySettings } from '../agents/codex/permissions.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'

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
    return [...this.files.keys()].some((key) => key.startsWith(`${path}/`))
  }
}

function makeLoader(files: Map<string, string>): CodexSettingsLoader {
  return new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: fx('home', 'u', '.codex') })
}

function makeAgent(): { agent: Agent; events: [string, Record<string, unknown>][] } {
  const events: [string, Record<string, unknown>][] = []
  const agent = {
    session: {
      header: { cwd: fx('proj') },
      append: (name: string, payload: Record<string, unknown>) => events.push([name, payload]),
    },
  } as unknown as Agent
  return { agent, events }
}

describe('codex approval/sandbox config parsing', () => {
  it('reads approval_policy strings and maps on-failure to on-request', async () => {
    const loader = makeLoader(new Map([[fx('home', 'u', '.codex', 'config.toml'), 'approval_policy = "never"']]))
    expect((await loader.load(fx('proj'))).approvalPolicy).toEqual({ kind: 'never' })
    const deprecated = makeLoader(new Map([[fx('home', 'u', '.codex', 'config.toml'), 'approval_policy = "on-failure"']]))
    expect((await deprecated.load(fx('proj'))).approvalPolicy).toEqual({ kind: 'on-request' })
  })

  it('reads granular approval_policy tables', async () => {
    const loader = makeLoader(
      new Map([[fx('home', 'u', '.codex', 'config.toml'), 'approval_policy = { granular = { sandbox_approval = true, rules = false } }']]),
    )
    expect((await loader.load(fx('proj'))).approvalPolicy).toEqual({ kind: 'granular', granular: { sandbox_approval: true, rules: false } })
  })

  it('drops unsupported approval_policy values and sandbox modes', async () => {
    const loader = makeLoader(new Map([[fx('home', 'u', '.codex', 'config.toml'), 'approval_policy = "bogus"\nsandbox_mode = "jail"']]))
    const loaded = await loader.load(fx('proj'))
    expect(loaded.approvalPolicy).toBeUndefined()
    expect(loaded.sandboxMode).toBeUndefined()
  })

  it('takes sandbox_mode and default_permissions from the most specific layer', async () => {
    const loader = makeLoader(
      new Map([
        [fx('home', 'u', '.codex', 'config.toml'), 'sandbox_mode = "read-only"\napproval_policy = "on-request"'],
        [fx('proj', '.codex', 'config.toml'), 'sandbox_mode = "workspace-write"\ndefault_permissions = ":read-only"'],
      ]),
    )
    const loaded = await loader.load(fx('proj'))
    expect(loaded.sandboxMode).toBe('workspace-write')
    expect(loaded.approvalPolicy).toEqual({ kind: 'on-request' })
    expect(loaded.defaultPermissionsProfile).toBe(':read-only')
  })
})

describe('applySettings', () => {
  it('writes sandbox_mode through the sandbox/mode event', () => {
    const { agent, events } = makeAgent()
    applySettings(
      {
        hooksDisabled: false,
        byEvent: new Map(),
        skillDisabledPaths: new Set(),
        projectDocMaxBytes: 0,
        projectDocFallbackFilenames: [],
        projectRootMarkers: ['.git'],
        sandboxMode: 'workspace-write',
      },
      agent,
      silent,
    )
    expect(events).toEqual([['sandbox/mode', { mode: 'workspace-write' }]])
  })

  it('lets a built-in default_permissions profile win over sandbox_mode', () => {
    const { agent, events } = makeAgent()
    applySettings(
      {
        hooksDisabled: false,
        byEvent: new Map(),
        skillDisabledPaths: new Set(),
        projectDocMaxBytes: 0,
        projectDocFallbackFilenames: [],
        projectRootMarkers: ['.git'],
        sandboxMode: 'workspace-write',
        defaultPermissionsProfile: ':read-only',
      },
      agent,
      silent,
    )
    expect(events).toEqual([['sandbox/mode', { mode: 'read-only' }]])
  })

  it('falls back to sandbox_mode for a custom profile name', () => {
    const { agent, events } = makeAgent()
    applySettings(
      {
        hooksDisabled: false,
        byEvent: new Map(),
        skillDisabledPaths: new Set(),
        projectDocMaxBytes: 0,
        projectDocFallbackFilenames: [],
        projectRootMarkers: ['.git'],
        sandboxMode: 'danger-full-access',
        defaultPermissionsProfile: 'my-profile',
      },
      agent,
      silent,
    )
    expect(events).toEqual([['sandbox/mode', { mode: 'danger-full-access' }]])
  })

  it('maps approval_policy never → never and the rest → ask', () => {
    const never = makeAgent()
    applySettings(
      {
        hooksDisabled: false,
        byEvent: new Map(),
        skillDisabledPaths: new Set(),
        projectDocMaxBytes: 0,
        projectDocFallbackFilenames: [],
        projectRootMarkers: ['.git'],
        approvalPolicy: { kind: 'never' },
      },
      never.agent,
      silent,
    )
    expect(never.events).toEqual([['approval/policy', { policy: 'never' }]])

    for (const kind of ['untrusted', 'on-request', 'granular'] as const) {
      const ask = makeAgent()
      applySettings(
        {
          hooksDisabled: false,
          byEvent: new Map(),
          skillDisabledPaths: new Set(),
          projectDocMaxBytes: 0,
          projectDocFallbackFilenames: [],
          projectRootMarkers: ['.git'],
          approvalPolicy: { kind },
        },
        ask.agent,
        silent,
      )
      expect(ask.events).toEqual([['approval/policy', { policy: 'ask' }]])
    }
  })

  it('writes nothing when neither key is configured', () => {
    const { agent, events } = makeAgent()
    applySettings(
      {
        hooksDisabled: false,
        byEvent: new Map(),
        skillDisabledPaths: new Set(),
        projectDocMaxBytes: 0,
        projectDocFallbackFilenames: [],
        projectRootMarkers: ['.git'],
      },
      agent,
      silent,
    )
    expect(events).toEqual([])
  })
})
