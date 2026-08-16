import { describe, expect, it } from 'vitest'
import { evaluateRules, splitCompoundCommand } from '../permissions/engine.js'
import { fx } from './fixture-paths.js'
import { parseToolSpecifierRules } from '../permissions/parse.js'
import type { RuleSet } from '../permissions/types.js'

const ctx = { cwd: fx('proj'), home: fx('home', 'u'), dialect: 'codebuddy' as const }

function rules(entries: Partial<Record<'allow' | 'ask' | 'deny', string[]>>): RuleSet {
  return {
    allow: parseToolSpecifierRules('allow', entries.allow),
    ask: parseToolSpecifierRules('ask', entries.ask),
    deny: parseToolSpecifierRules('deny', entries.deny),
  }
}

describe('splitCompoundCommand', () => {
  it('splits on top-level operators', () => {
    expect(splitCompoundCommand('git status && rm -rf /tmp')).toEqual(['git status', 'rm -rf /tmp'])
    expect(splitCompoundCommand('a; b | c || d')).toEqual(['a', 'b', 'c', 'd'])
  })

  it('respects quotes', () => {
    expect(splitCompoundCommand('echo "a && b"')).toEqual(['echo "a && b"'])
    expect(splitCompoundCommand("echo 'x;y' | cat")).toEqual(["echo 'x;y'", 'cat'])
  })
})

describe('codebuddy Bash rules', () => {
  it('matches exact commands only', () => {
    const set = rules({ deny: ['Bash(npm run build)'] })
    expect(evaluateRules(set, 'Bash', { command: 'npm run build' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Bash', { command: 'npm run build --watch' }, ctx)).toBeUndefined()
  })

  it('matches :* word prefixes', () => {
    const set = rules({ deny: ['Bash(git:*)'] })
    expect(evaluateRules(set, 'Bash', { command: 'git status' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Bash', { command: 'git push origin main' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Bash', { command: 'github-cli' }, ctx)).toBeUndefined()
  })

  it('matches wildcard globs with * crossing slashes', () => {
    const set = rules({ deny: ['Bash(ls *)'] })
    expect(evaluateRules(set, 'Bash', { command: 'ls -al /tmp/x' }, ctx)?.kind).toBe('deny')
  })

  it('deny triggers when any subcommand of a compound command matches', () => {
    const set = rules({ deny: ['Bash(rm *)'] })
    expect(evaluateRules(set, 'Bash', { command: 'git status && rm -rf /tmp' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Bash', { command: 'git status && npm test' }, ctx)).toBeUndefined()
  })

  it('allow requires every subcommand of a compound command to match', () => {
    const set = rules({ allow: ['Bash(git:*)'] })
    expect(evaluateRules(set, 'Bash', { command: 'git status' }, ctx)?.kind).toBe('allow')
    expect(evaluateRules(set, 'Bash', { command: 'git status && rm *' }, ctx)).toBeUndefined()
  })

  it('allow demands an exact match when redirections are present', () => {
    const set = rules({ allow: ['Bash(git:*)'] })
    expect(evaluateRules(set, 'Bash', { command: 'git log > out.txt' }, ctx)).toBeUndefined()
    const exact = rules({ allow: ['Bash(git log > out.txt)'] })
    expect(evaluateRules(exact, 'Bash', { command: 'git log > out.txt' }, ctx)?.kind).toBe('allow')
  })
})

describe('codebuddy file rules', () => {
  it('matches case-insensitively', () => {
    const set = rules({ deny: ['Read(./.env)'] })
    expect(evaluateRules(set, 'Read', { file_path: fx('proj', '.ENV') }, ctx)?.kind).toBe('deny')
  })

  it('matches a bare filename at any depth', () => {
    const set = rules({ deny: ['Read(.env)'] })
    expect(evaluateRules(set, 'Read', { file_path: fx('proj', 'a', 'b', '.env') }, ctx)?.kind).toBe('deny')
  })

  it('matches full-path globs with project-relative /', () => {
    const set = rules({ deny: ['Edit(/src/**/*.ts)'] })
    expect(evaluateRules(set, 'Edit', { file_path: fx('proj', 'src', 'foo', 'bar.ts') }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Edit', { file_path: fx('proj', 'test', 'foo.ts') }, ctx)).toBeUndefined()
  })
})

describe('codebuddy MCP rules', () => {
  it('matches a server prefix rule', () => {
    const set = rules({ deny: ['mcp__puppeteer'] })
    expect(evaluateRules(set, 'mcp__puppeteer__navigate', {}, ctx)?.kind).toBe('deny')
  })

  it('matches an exact tool rule', () => {
    const set = rules({ deny: ['mcp__puppeteer__navigate'] })
    expect(evaluateRules(set, 'mcp__puppeteer__navigate', {}, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'mcp__puppeteer__screenshot', {}, ctx)).toBeUndefined()
  })

  it('normalizes case and -/. to _', () => {
    const set = rules({ deny: ['mcp__web-search'] })
    expect(evaluateRules(set, 'mcp__web_search__run', {}, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'mcp__WEB_SEARCH__run', {}, ctx)?.kind).toBe('deny')
  })

  it('keeps a bare * from covering MCP tools', () => {
    const set = rules({ deny: ['*'] })
    expect(evaluateRules(set, 'Bash', { command: 'x' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'mcp__puppeteer__navigate', {}, ctx)).toBeUndefined()
  })

  it('ignores mcp__* in the allow bucket', () => {
    const set = rules({ allow: ['mcp__*'] })
    expect(evaluateRules(set, 'mcp__puppeteer__navigate', {}, ctx)).toBeUndefined()
    const denySet = rules({ deny: ['mcp__*'] })
    expect(evaluateRules(denySet, 'mcp__puppeteer__navigate', {}, ctx)?.kind).toBe('deny')
  })
})

describe('codebuddy Skill rules', () => {
  it('matches the skill name exactly', () => {
    const set = rules({ deny: ['Skill(dangerous-skill)'] })
    expect(evaluateRules(set, 'Skill', { name: 'dangerous-skill' }, ctx)?.kind).toBe('deny')
    expect(evaluateRules(set, 'Skill', { name: 'safe-skill' }, ctx)).toBeUndefined()
  })
})

describe('codebuddy Agent rules', () => {
  it('matches bare Agent but not name specifiers (no DSH field)', () => {
    const bare = rules({ deny: ['Agent'] })
    expect(evaluateRules(bare, 'Agent', {}, ctx)?.kind).toBe('deny')
    const named = rules({ deny: ['Agent(Explore)'] })
    expect(evaluateRules(named, 'Agent', {}, ctx)).toBeUndefined()
  })
})
