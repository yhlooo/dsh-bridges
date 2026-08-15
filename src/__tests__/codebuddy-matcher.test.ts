import { describe, expect, it } from 'vitest'
import { globMatch, matchIf, matchMatcher, primaryMatchField } from '../agents/codebuddy-code/hooks/matcher.js'

describe('matchMatcher', () => {
  it('matches everything for star, empty, and omitted matchers', () => {
    expect(matchMatcher('*', 'Bash')).toBe(true)
    expect(matchMatcher('', 'Bash')).toBe(true)
    expect(matchMatcher(undefined, 'Bash')).toBe(true)
  })

  it('treats any other value as a case-sensitive regular expression', () => {
    expect(matchMatcher('Write', 'Write')).toBe(true)
    // A plain string is an unanchored regex: it matches substrings.
    expect(matchMatcher('Write', 'NotebookWrite')).toBe(true)
    expect(matchMatcher('^Write$', 'NotebookWrite')).toBe(false)
    expect(matchMatcher('^Write$', 'Write')).toBe(true)
    expect(matchMatcher('Edit|Write', 'Write')).toBe(true)
    expect(matchMatcher('mcp__memory__.*', 'mcp__memory__read_file')).toBe(true)
    expect(matchMatcher('mcp__.*__write.*', 'mcp__github__write_file')).toBe(true)
  })

  it('is case-sensitive', () => {
    expect(matchMatcher('write', 'Write')).toBe(false)
  })

  it('fails closed on invalid regular expressions', () => {
    expect(matchMatcher('[unclosed', 'anything')).toBe(false)
  })
})

describe('globMatch', () => {
  it('matches star and question wildcards', () => {
    expect(globMatch('git *', 'git push origin')).toBe(true)
    expect(globMatch('git *', 'npm test')).toBe(false)
    expect(globMatch('*.ts', 'src/index.ts')).toBe(true)
    expect(globMatch('*.ts', 'src/index.js')).toBe(false)
    expect(globMatch('file?.txt', 'file1.txt')).toBe(true)
  })
})

describe('primaryMatchField', () => {
  it('selects the documented field per tool', () => {
    expect(primaryMatchField('Bash', { command: 'npm test' })).toBe('npm test')
    expect(primaryMatchField('PowerShell', { command: 'Get-ChildItem' })).toBe('Get-ChildItem')
    expect(primaryMatchField('Edit', { file_path: '/x/a.ts' })).toBe('/x/a.ts')
    expect(primaryMatchField('WebSearch', { query: 'hooks' })).toBe('hooks')
    expect(primaryMatchField('Task', { subagent_type: 'Explore' })).toBeUndefined()
    expect(primaryMatchField('Unknown', { command: 'x' })).toBeUndefined()
    expect(primaryMatchField('Bash', 'not-an-object')).toBeUndefined()
  })
})

describe('matchIf', () => {
  it('passes an absent rule', () => {
    expect(matchIf(undefined, 'Bash', {})).toBe(true)
  })

  it('matches ToolName(glob) against the primary field', () => {
    expect(matchIf('Bash(git *)', 'Bash', { command: 'git push' })).toBe(true)
    expect(matchIf('Bash(git *)', 'Bash', { command: 'npm test' })).toBe(false)
    expect(matchIf('Edit(*.ts)', 'Edit', { file_path: '/src/a.ts' })).toBe(true)
  })

  it('does not run for a different tool', () => {
    expect(matchIf('Bash(rm *)', 'Edit', { file_path: 'rm -rf /' })).toBe(false)
  })

  it('fails open on uninterpretable rules', () => {
    expect(matchIf('not a rule', 'Bash', { command: 'x' })).toBe(true)
    expect(matchIf('Bash(**)', 'Bash', {})).toBe(true)
  })
})
