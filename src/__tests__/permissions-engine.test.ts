import { describe, expect, it } from 'vitest'
import { evaluateRules } from '../permissions/engine.js'
import { parseToolSpecifierRule, parseToolSpecifierRules } from '../permissions/parse.js'
import type { RuleSet } from '../permissions/types.js'

const ctx = { cwd: '/proj', home: '/home/u' }

function rules(entries: Partial<Record<'allow' | 'ask' | 'deny', string[]>>): RuleSet {
  return {
    allow: parseToolSpecifierRules('allow', entries.allow),
    ask: parseToolSpecifierRules('ask', entries.ask),
    deny: parseToolSpecifierRules('deny', entries.deny),
  }
}

describe('parseToolSpecifierRule', () => {
  it('parses bare tool names', () => {
    expect(parseToolSpecifierRule('Bash', 'deny')).toEqual({ kind: 'deny', tool: 'Bash', specifier: undefined, raw: 'Bash' })
  })

  it('parses tool names with glob characters', () => {
    expect(parseToolSpecifierRule('mcp__*', 'deny')?.tool).toBe('mcp__*')
    expect(parseToolSpecifierRule('*', 'deny')?.tool).toBe('*')
  })

  it('parses a specifier with nested parentheses up to the last close', () => {
    const parsed = parseToolSpecifierRule('Bash(node -e "console.log(1)")', 'allow')
    expect(parsed?.tool).toBe('Bash')
    expect(parsed?.specifier).toBe('node -e "console.log(1)"')
  })

  it('rejects empty and malformed rules', () => {
    expect(parseToolSpecifierRule('', 'deny')).toBeUndefined()
    expect(parseToolSpecifierRule('Bash(', 'deny')).toBeUndefined()
    expect(parseToolSpecifierRule('Bash()', 'deny')).toBeUndefined()
    expect(parseToolSpecifierRule('Bad Name', 'deny')).toBeUndefined()
  })

  it('drops non-string entries from arrays', () => {
    expect(parseToolSpecifierRules('deny', ['Bash', 3, null, 'Read(./.env)'])).toHaveLength(2)
  })
})

describe('evaluateRules', () => {
  it('evaluates deny before ask before allow', () => {
    const set = rules({ deny: ['Bash'], ask: ['Bash'], allow: ['Bash'] })
    const verdict = evaluateRules(set, 'Bash', { command: 'git status' }, ctx)
    expect(verdict).toEqual({ kind: 'deny', reason: 'denied by permission rule "Bash"' })
  })

  it('asks when only an ask rule matches', () => {
    const set = rules({ ask: ['Bash(git *)'], allow: ['Bash'] })
    const verdict = evaluateRules(set, 'Bash', { command: 'git status' }, ctx)
    expect(verdict).toEqual({ kind: 'ask', reason: 'approval required by permission rule "Bash(git *)"' })
  })

  it('allows when only an allow rule matches', () => {
    const verdict = evaluateRules(rules({ allow: ['Read'] }), 'Read', { file_path: '/proj/a.txt' }, ctx)
    expect(verdict).toEqual({ kind: 'allow' })
  })

  it('returns undefined when no rule matches, deferring to harness policy', () => {
    expect(evaluateRules(rules({ deny: ['Bash(rm *)'] }), 'Bash', { command: 'git status' }, ctx)).toBeUndefined()
    expect(evaluateRules(rules({}), 'Bash', { command: 'git status' }, ctx)).toBeUndefined()
  })

  it('matches Bash rules by command prefix', () => {
    const set = rules({ deny: ['Bash(npm run *)'] })
    expect(evaluateRules(set, 'Bash', { command: 'npm run build' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Bash', { command: 'echo npm run x' }, ctx)).toBeUndefined()
  })

  it('matches tool-name globs such as mcp__*', () => {
    const set = rules({ deny: ['mcp__*'] })
    expect(evaluateRules(set, 'mcp__github__delete_repo', {}, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Bash', { command: 'x' }, ctx)).toBeUndefined()
  })

  it('matches Read rules against project-relative paths', () => {
    const set = rules({ deny: ['Read(./.env)', 'Read(./secrets/**)'] })
    expect(evaluateRules(set, 'Read', { file_path: '/proj/.env' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Read', { file_path: '/proj/secrets/db/pass.txt' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Read', { file_path: '/proj/src/a.ts' }, ctx)).toBeUndefined()
  })

  it('resolves ~, // and / rule-path forms', () => {
    const home = rules({ deny: ['Read(~/.aws/credentials)'] })
    expect(evaluateRules(home, 'Read', { file_path: '/home/u/.aws/credentials' }, ctx)?.kind).toBe('deny')

    const absolute = rules({ deny: ['Read(//etc/passwd)'] })
    expect(evaluateRules(absolute, 'Read', { file_path: '/etc/passwd' }, ctx)?.kind).toBe('deny')

    const projectRelative = rules({ deny: ['Read(/docs/plan.md)'] })
    expect(evaluateRules(projectRelative, 'Read', { file_path: '/proj/docs/plan.md' }, ctx)?.kind).toBe('deny')
  })

  it('also resolves ./ rules against additionalDirectories', () => {
    const set = rules({ deny: ['Read(./notes.txt)'] })
    const verdict = evaluateRules(set, 'Read', { file_path: '/other/notes.txt' }, { ...ctx, additionalDirectories: ['/other'] })
    expect(verdict?.kind).toBe('deny')
  })

  it('matches WebFetch domain rules', () => {
    const set = rules({ deny: ['WebFetch(domain:example.com)'] })
    expect(evaluateRules(set, 'WebFetch', { url: 'https://example.com/x' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'WebFetch', { url: 'https://api.example.com/x' }, ctx)).toBeUndefined()
    const wildcard = rules({ deny: ['WebFetch(domain:*.example.com)'] })
    expect(evaluateRules(wildcard, 'WebFetch', { url: 'https://api.example.com/x' }, ctx)?.kind).toBe('deny')
  })

  it('never matches a specifier on a tool without a mapped field', () => {
    const set = rules({ deny: ['Agent(security-reviewer)'] })
    expect(evaluateRules(set, 'Agent', {}, ctx)).toBeUndefined()
  })

  it('matches bare tool names on unmapped tools', () => {
    const set = rules({ deny: ['Agent'] })
    expect(evaluateRules(set, 'Agent', {}, ctx)?.kind).toBe('deny')
  })
})
