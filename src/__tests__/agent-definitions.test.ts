import { describe, expect, it } from 'vitest'
import { fx } from './fixture-paths.js'
import { sep } from 'node:path'
import type { SkillLookupOptions } from '@deepseek-ai/dsh-skill'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { AgentDefinitionError, buildAgentSkillBody, parseAgentDefinition } from '../agent-definitions.js'
import { ClaudeSkillProvider } from '../agents/claude-code/skills/provider.js'
import { CodebuddySkillProvider } from '../agents/codebuddy-code/skills/provider.js'
import { CodebuddySettingsLoader } from '../agents/codebuddy-code/settings.js'

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
  async stamp(): Promise<string | undefined> {
    return 'v1'
  }
  async dirExists(path: string): Promise<boolean> {
    return [...this.files.keys()].some((key) => key.startsWith(`${path}/`))
  }
}

const options: SkillLookupOptions = { cwd: fx('proj') }

const AGENT_FILE = `---
name: code-reviewer
description: Review code for correctness and security before merging.
tools:
  - Bash
  - Read
  - Grep
model: claude-opus-5
maxTurns: 12
permissionMode: default
---

You are a careful code reviewer. Look for bugs, races, and security issues.
`

describe('parseAgentDefinition', () => {
  it('parses name, description, tools, model, and maxTurns', () => {
    const definition = parseAgentDefinition(AGENT_FILE)
    expect(definition.name).toBe('code-reviewer')
    expect(definition.description).toBe('Review code for correctness and security before merging.')
    expect(definition.tools).toEqual(['Bash', 'Read', 'Grep'])
    expect(definition.model).toBe('claude-opus-5')
    expect(definition.maxTurns).toBe(12)
    expect(definition.body).toContain('careful code reviewer')
  })

  it('fails closed on missing frontmatter or required fields', () => {
    expect(() => parseAgentDefinition('no frontmatter')).toThrow(AgentDefinitionError)
    expect(() => parseAgentDefinition('---\ndescription: x\n---\nBody')).toThrow(AgentDefinitionError)
    expect(() => parseAgentDefinition('---\nname: x\n---\nBody')).toThrow(AgentDefinitionError)
    expect(() => parseAgentDefinition('---\nname: "plugin:x"\ndescription: x\n---\nBody')).toThrow(AgentDefinitionError)
  })

  it('accepts comma-separated tools strings', () => {
    const definition = parseAgentDefinition('---\nname: a\ndescription: b\ntools: Bash, Edit\n---\nBody')
    expect(definition.tools).toEqual(['Bash', 'Edit'])
  })
})

describe('buildAgentSkillBody', () => {
  it('carries the system prompt plus a delegation spec with translated tools', () => {
    const body = buildAgentSkillBody(parseAgentDefinition(AGENT_FILE), silent)
    expect(body).toContain('careful code reviewer')
    expect(body).toContain('label: "code-reviewer"')
    expect(body).toContain('toolFilter.allow: ["bash","read","grep"]')
    expect(body).toContain('agentOptions.model: "claude-opus-5"')
    expect(body).toContain('maxDepth: 12')
  })

  it('omits model for inherit and omits empty tool filters', () => {
    const body = buildAgentSkillBody(parseAgentDefinition('---\nname: a\ndescription: b\nmodel: inherit\n---\nBody'), silent)
    expect(body).not.toContain('agentOptions.model')
    expect(body).not.toContain('toolFilter.allow')
  })
})

describe('ClaudeSkillProvider agent discovery', () => {
  it('lists agent files as skills named by frontmatter name', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.claude', 'agents', 'reviewer.md'), AGENT_FILE],
      [
        fx('home', 'u', '.claude', 'agents', 'personal-agent.md'),
        '---\nname: personal-agent\ndescription: Personal helper\n---\nBe helpful.\n',
      ],
    ])
    const provider = new ClaudeSkillProvider(
      silent,
      new TreeFs(files),
      { userClaudeDir: fx('home', 'u', '.claude'), watch: false, agents: true },
      () => {},
    )
    const result = await provider.list(options)
    expect(Array.isArray(result)).toBe(false)
    const candidates = Array.isArray(result) ? result : result.candidates
    const reviewer = candidates.find((candidate) => candidate.name === 'code-reviewer')
    expect(reviewer?.rank).toBe(117)
    expect(reviewer?.description).toContain('Review code')
    const personal = candidates.find((candidate) => candidate.name === 'personal-agent')
    expect(personal?.rank).toBe(107)
    expect(personal?.rank ?? 0).toBeLessThan(reviewer?.rank ?? 0) // Claude Code: personal wins over project
  })

  it('loads the delegation spec for an agent candidate', async () => {
    const files = new Map<string, string>([[fx('proj', '.claude', 'agents', 'reviewer.md'), AGENT_FILE]])
    const provider = new ClaudeSkillProvider(
      silent,
      new TreeFs(files),
      { userClaudeDir: fx('home', 'u', '.claude'), watch: false, agents: true },
      () => {},
    )
    const result = await provider.list(options)
    const candidates = Array.isArray(result) ? result : result.candidates
    const reviewer = candidates.find((candidate) => candidate.name === 'code-reviewer')
    expect(reviewer).toBeDefined()
    const loaded = await provider.get(reviewer!, options)
    expect(loaded?.content).toContain('toolFilter.allow: ["bash","read","grep"]')
  })
})

describe('CodebuddySkillProvider agent discovery', () => {
  function makeCodebuddyProvider(files: Map<string, string>): CodebuddySkillProvider {
    const loader = new CodebuddySettingsLoader(silent, new TreeFs(files), { userCodebuddyDir: fx('home', 'u', '.codebuddy') })
    return new CodebuddySkillProvider(
      silent,
      new TreeFs(files),
      { userCodebuddyDir: fx('home', 'u', '.codebuddy'), watch: false, agents: true },
      loader,
      () => {},
    )
  }

  it('lists agent files with project over user precedence', async () => {
    const files = new Map<string, string>([
      [fx('proj', '.codebuddy', 'agents', 'reviewer.md'), AGENT_FILE],
      [
        fx('home', 'u', '.codebuddy', 'agents', 'translator.md'),
        '---\nname: translator\ndescription: Translate UI strings\n---\nTranslate carefully.\n',
      ],
    ])
    const provider = makeCodebuddyProvider(files)
    const result = await provider.list(options)
    const candidates = Array.isArray(result) ? result : result.candidates
    const reviewer = candidates.find((candidate) => candidate.name === 'code-reviewer')
    const translator = candidates.find((candidate) => candidate.name === 'translator')
    expect(reviewer?.rank).toBe(132)
    expect(translator?.rank).toBe(137)
    expect(reviewer?.rank ?? 0).toBeLessThan(translator?.rank ?? 0) // project wins over user
  })
})
