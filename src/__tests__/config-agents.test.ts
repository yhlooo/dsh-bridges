import { describe, expect, it } from 'vitest'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { CodexSkillProvider } from '../agents/codex/skills/provider.js'
import { CodexSettingsLoader } from '../agents/codex/settings.js'
import { OpencodeSkillProvider } from '../agents/opencode/skills/provider.js'
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

const options: SkillLookupOptions = { cwd: '/proj' }

describe('codex [agents] roles', () => {
  it('registers config roles as delegation-spec skills', async () => {
    const files = new Map<string, string>([
      ['/home/u/.codex/config.toml', '[agents.security-review]\ndescription = "Security review role"\nconfig_file = "security-review.toml"\n'],
      ['/home/u/.codex/security-review.toml', 'model = "gpt-5"\ndeveloper_instructions = "Look for vulnerabilities."'],
    ])
    const loader = new CodexSettingsLoader(silent, new TreeFs(files), { userCodexDir: '/home/u/.codex' })
    const provider = new CodexSkillProvider(silent, new TreeFs(files), { userCodexDir: '/home/u/.codex', userSkillsDir: '/home/u/.agents/skills', watch: false }, loader, () => {})
    const result = await provider.list(options)
    const candidates = Array.isArray(result) ? result : result.candidates
    const role = candidates.find((candidate) => candidate.name === 'security-review')
    expect(role).toBeDefined()
    expect(role?.description).toContain('Security review role')
    const loaded = await provider.get(role!, options)
    expect(loaded?.content).toContain('label: "security-review"')
    expect(loaded?.content).toContain('agentOptions.model: "gpt-5"')
    expect(loaded?.content).toContain('Look for vulnerabilities.')
  })
})

describe('opencode agent.<id> definitions', () => {
  it('registers subagent-mode agents as delegation-spec skills and skips primary ones', async () => {
    const files = new Map<string, string>([
      [
        '/proj/opencode.json',
        JSON.stringify({
          agent: {
            reviewer: { mode: 'subagent', description: 'Reviews code', prompt: 'You review code carefully.', model: 'gpt-5' },
            builder: { mode: 'primary', description: 'Main builder' },
          },
        }),
      ],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: '/home/u/.config/opencode' })
    const provider = new OpencodeSkillProvider(silent, new TreeFs(files), { userOpencodeDir: '/home/u/.config/opencode', watch: false }, loader, () => {})
    const result = await provider.list(options)
    const candidates = Array.isArray(result) ? result : result.candidates
    expect(candidates.some((candidate) => candidate.name === 'reviewer')).toBe(true)
    expect(candidates.some((candidate) => candidate.name === 'builder')).toBe(false)
    const reviewer = candidates.find((candidate) => candidate.name === 'reviewer')
    const loaded = await provider.get(reviewer!, options)
    expect(loaded?.content).toContain('label: "reviewer"')
    expect(loaded?.content).toContain('You review code carefully.')
    expect(loaded?.content).toContain('agentOptions.model: "gpt-5"')
  })
})
