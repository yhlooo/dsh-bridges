import { describe, expect, it } from 'vitest'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import { evaluateCursorPermissions, globMatch, parseToken } from '../agents/cursor/permissions.js'

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

describe('cursor permission tokens', () => {
  it('parses the five token kinds and the command:args form', () => {
    expect(parseToken('Shell(git)')).toEqual({ kind: 'shell', pattern: 'git' })
    expect(parseToken('Shell(curl:*)')).toEqual({ kind: 'shell', pattern: 'curl', argsPart: '*' })
    expect(parseToken('Read(src/**)')).toEqual({ kind: 'read', pattern: 'src/**' })
    expect(parseToken('Write(package.json)')).toEqual({ kind: 'write', pattern: 'package.json' })
    expect(parseToken('WebFetch(*.example.com)')).toEqual({ kind: 'webfetch', pattern: '*.example.com' })
    expect(parseToken('Mcp(datadog:*)')).toEqual({ kind: 'mcp', pattern: 'datadog:*' })
    expect(parseToken('garbage')).toBeUndefined()
  })

  it('matches shell command bases with globs and args parts', () => {
    expect(evaluateCursorPermissions([], ['Shell(rm)'], exec('bash', { command: 'rm -rf /tmp/x' }))).toEqual({
      kind: 'deny',
      reason: 'denied by a Cursor permission rule (Shell(rm))',
    })
    expect(evaluateCursorPermissions([], ['Shell(git)'], exec('bash', { command: 'npm test' }))).toBeUndefined()
    expect(evaluateCursorPermissions([], ['Shell(curl:*)'], exec('bash', { command: 'curl https://x' }))).toEqual({
      kind: 'deny',
      reason: 'denied by a Cursor permission rule (Shell(curl:*))',
    })
  })

  it('deny wins over allow', () => {
    const allow = ['Shell(*)']
    const deny = ['Shell(rm)']
    expect(evaluateCursorPermissions(allow, deny, exec('bash', { command: 'rm x' }))).toEqual({
      kind: 'deny',
      reason: 'denied by a Cursor permission rule (Shell(rm))',
    })
    expect(evaluateCursorPermissions(allow, deny, exec('bash', { command: 'git status' }))).toEqual({ kind: 'allow' })
    expect(evaluateCursorPermissions([], [], exec('bash', { command: 'git status' }))).toBeUndefined()
  })

  it('matches read/write path globs per tool type', () => {
    const allow = ['Read(src/**/*.ts)', 'Write(package.json)']
    const deny = ['Write(**/*.key)']
    expect(evaluateCursorPermissions(allow, deny, exec('read', { file_path: 'src/a/b.ts' }))).toEqual({ kind: 'allow' })
    expect(evaluateCursorPermissions(allow, deny, exec('read', { file_path: 'README.md' }))).toBeUndefined()
    expect(evaluateCursorPermissions(allow, deny, exec('write', { file_path: 'package.json' }))).toEqual({ kind: 'allow' })
    expect(evaluateCursorPermissions(allow, deny, exec('write', { file_path: 'keys/secret.key' }))).toEqual({
      kind: 'deny',
      reason: 'denied by a Cursor permission rule (Write(**/*.key))',
    })
    // A read token never matches a write call.
    expect(evaluateCursorPermissions(['Read(*)'], [], exec('write', { file_path: 'x' }))).toBeUndefined()
  })

  it('matches WebFetch domain patterns', () => {
    expect(evaluateCursorPermissions([], ['WebFetch(malicious.com)'], exec('web', { url: 'https://malicious.com/x' }))).toEqual({
      kind: 'deny',
      reason: 'denied by a Cursor permission rule (WebFetch(malicious.com))',
    })
    expect(evaluateCursorPermissions(['WebFetch(*.example.com)'], [], exec('web', { url: 'https://docs.example.com/x' }))).toEqual({
      kind: 'allow',
    })
  })

  it('matches Mcp(server:tool) tokens against mcp__server__tool names', () => {
    const allow = ['Mcp(datadog:*)']
    const deny = ['Mcp(*:delete_everything)']
    expect(evaluateCursorPermissions(allow, deny, exec('mcp__datadog__list_metrics', {}))).toEqual({ kind: 'allow' })
    expect(evaluateCursorPermissions(allow, deny, exec('mcp__datadog__delete_everything', {}))).toEqual({
      kind: 'deny',
      reason: 'denied by a Cursor permission rule (Mcp(*:delete_everything))',
    })
    expect(evaluateCursorPermissions(allow, deny, exec('mcp__other__list_metrics', {}))).toBeUndefined()
  })
})

describe('cursor glob', () => {
  it('supports * ** and ? wildcards', () => {
    expect(globMatch('src/**/*.ts', 'src/a/b.ts')).toBe(true)
    expect(globMatch('src/*', 'src/a/b.ts')).toBe(false)
    expect(globMatch('file?.txt', 'file1.txt')).toBe(true)
    expect(globMatch('file?.txt', 'file12.txt')).toBe(false)
  })
})
