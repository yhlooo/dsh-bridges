import { sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { evaluatePolicy, GeminiPolicyLoader } from '../agents/gemini-cli/permissions.js'
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

const USER_DIR = fx('home', 'u', '.gemini')

function makeLoader(files: Map<string, string>): GeminiPolicyLoader {
  return new GeminiPolicyLoader(silent, new TreeFs(files), USER_DIR)
}

function exec(name: string, args: Record<string, unknown>): ToolExecution {
  return {
    callId: 'call-1' as never,
    rootCallId: 'call-1' as never,
    name,
    arguments: args,
    agent: undefined as never,
    signal: new AbortController().signal,
    token: Symbol('t') as never,
  }
}

const POLICY = `
[[rule]]
toolName = "run_shell_command"
commandPrefix = "git push"
decision = "deny"
denyMessage = "no force pushes"

[[rule]]
toolName = "run_shell_command"
commandPrefix = "git status"
decision = "allow"
priority = 50

[[rule]]
toolName = "run_shell_command"
commandPrefix = "rm "
decision = "deny"
denyMessage = "no rm"

[[rule]]
toolName = "read_file"
decision = "ask_user"

[[rule]]
toolName = "mcp_*"
decision = "allow"

[[rule]]
toolName = "run_shell_command"
commandPrefix = "sudo rm "
decision = "deny"
modes = ["yolo"]
denyMessage = "yolo rm"

[[rule]]
toolName = "ask_user"
decision = "deny"
interactive = true
denyMessage = "interactive only"
`

describe('gemini policy engine', () => {
  it('evaluates the highest-priority first match: deny wins over allow', async () => {
    const loader = makeLoader(new Map([[fx('home', 'u', '.gemini', 'policies', 'a.toml'), POLICY]]))
    const rules = await loader.load()
    expect(rules.length).toBe(7)
    expect(evaluatePolicy(rules, exec('bash', { command: 'git push origin main' }))).toEqual({ kind: 'deny', reason: 'no force pushes' })
    expect(evaluatePolicy(rules, exec('bash', { command: 'git status' }))).toEqual({ kind: 'allow' })
    expect(evaluatePolicy(rules, exec('bash', { command: 'rm -rf /tmp/x' }))).toEqual({ kind: 'deny', reason: 'no rm' })
  })

  it('matches argsPattern by deep equality and commandRegex', async () => {
    const policy =
      '[[rule]]\ntoolName = "write_file"\nargsPattern = { file_path = "/etc/passwd" }\ndecision = "deny"\n[[rule]]\ntoolName = "run_shell_command"\ncommandRegex = "^rm -rf"\ndecision = "deny"\n'
    const loader = makeLoader(new Map([[fx('home', 'u', '.gemini', 'policies', 'a.toml'), policy]]))
    const rules = await loader.load()
    expect(evaluatePolicy(rules, exec('write', { file_path: '/etc/passwd', content: 'x' }))).toEqual({
      kind: 'deny',
      reason: 'denied by a Gemini CLI policy rule',
    })
    expect(evaluatePolicy(rules, exec('write', { file_path: '/tmp/x', content: 'x' }))).toBeUndefined()
    expect(evaluatePolicy(rules, exec('bash', { command: 'rm -rf node_modules' }))).toEqual({
      kind: 'deny',
      reason: 'denied by a Gemini CLI policy rule',
    })
  })

  it('maps ask_user to the DSH approval channel and ignores mode-gated + interactive rules', async () => {
    const loader = makeLoader(new Map([[fx('home', 'u', '.gemini', 'policies', 'a.toml'), POLICY]]))
    const rules = await loader.load()
    expect(evaluatePolicy(rules, exec('read', { file_path: 'x' }))).toEqual({ kind: 'ask', reason: undefined })
    // The mode-gated `sudo rm` deny rule is inactive (no upstream approval mode).
    expect(evaluatePolicy(rules, exec('bash', { command: 'sudo rm -rf /' }))).toBeUndefined()
    // The interactive-only ask_user rule is inactive in headless sessions.
    expect(evaluatePolicy(rules, exec('ask_user_question', {}))).toBeUndefined()
  })

  it('matches subagent delegations by the agent label and mcp tools by server', async () => {
    const policy =
      '[[rule]]\ntoolName = "code-reviewer"\ndecision = "deny"\n[[rule]]\ntoolName = "mcp_*"\nsubagent = "browser"\ndecision = "deny"\n'
    const loader = makeLoader(new Map([[fx('home', 'u', '.gemini', 'policies', 'a.toml'), policy]]))
    const rules = await loader.load()
    expect(evaluatePolicy(rules, exec('subagent', { label: 'code-reviewer' }))).toEqual({
      kind: 'deny',
      reason: 'denied by a Gemini CLI policy rule',
    })
    expect(evaluatePolicy(rules, exec('subagent', { label: 'other' }))).toBeUndefined()
  })

  it('fails soft on broken policy TOML', async () => {
    const loader = makeLoader(
      new Map([
        [fx('home', 'u', '.gemini', 'policies', 'broken.toml'), '[[rule]\ntoolName = [oops\n'],
        [fx('home', 'u', '.gemini', 'policies', 'good.toml'), '[[rule]]\ntoolName = "read_file"\ndecision = "deny"\n'],
      ]),
    )
    const rules = await loader.load()
    expect(rules.length).toBe(1)
  })
})
