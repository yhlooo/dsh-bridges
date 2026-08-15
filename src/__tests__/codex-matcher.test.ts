import { describe, expect, it } from 'vitest'
import { matchMatcher } from '../agents/codex/hooks/matcher.js'

describe('matchMatcher', () => {
  it('matches everything for *, empty, and omitted matchers', () => {
    expect(matchMatcher(undefined, 'Bash')).toBe(true)
    expect(matchMatcher('', 'Bash')).toBe(true)
    expect(matchMatcher('*', 'Bash')).toBe(true)
  })

  it('tests regular expressions against the matched value', () => {
    expect(matchMatcher('^Bash$', 'Bash')).toBe(true)
    expect(matchMatcher('^Bash$', 'bash')).toBe(false)
    expect(matchMatcher('Edit|Write', 'Edit')).toBe(true)
  })

  it('applies the apply_patch aliases (Edit / Write)', () => {
    expect(matchMatcher('^Edit$', 'apply_patch')).toBe(true)
    expect(matchMatcher('^Write$', 'apply_patch')).toBe(true)
    expect(matchMatcher('^apply_patch$', 'apply_patch')).toBe(true)
    expect(matchMatcher('^Edit$', 'Bash')).toBe(false)
  })

  it('applies the spawn_agent alias (Agent)', () => {
    expect(matchMatcher('^Agent$', 'spawn_agent')).toBe(true)
    expect(matchMatcher('^Agent$', 'Bash')).toBe(false)
  })

  it('fails closed on unparseable regexes', () => {
    expect(matchMatcher('([unclosed', 'Bash')).toBe(false)
  })
})
