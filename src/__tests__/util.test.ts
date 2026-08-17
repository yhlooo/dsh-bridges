/**
 * Coverage for the shared utilities in src/util.ts, focused on the capString
 * maxChars guarantee: the 2026-08-16 audit found the old tail arithmetic let
 * output reach ~1.4x the budget whenever the marker consumed the tail
 * allowance.
 */
import { describe, expect, it } from 'vitest'
import { capString } from '../util.js'

describe('capString', () => {
  it('returns values at or under the budget unchanged', () => {
    expect(capString('hello', 10)).toBe('hello')
    expect(capString('1234567890', 10)).toBe('1234567890')
    expect(capString('', 0)).toBe('')
  })

  it('never exceeds maxChars across budgets and input sizes', () => {
    const value = 'x'.repeat(10_000)
    for (const maxChars of [0, 1, 2, 3, 5, 20, 50, 100, 300, 1024, 1536, 10_000]) {
      expect(capString(value, maxChars).length, `maxChars=${maxChars}`).toBeLessThanOrEqual(maxChars)
    }
  })

  it('middle-truncates around the marker with the truncation count', () => {
    const capped = capString('x'.repeat(1000), 100)
    expect(capped).toContain('[900 characters truncated]')
    // head = min(70, 100 - 34) = 66; the marker fills the remaining budget
    expect(capped.startsWith('x'.repeat(66))).toBe(true)
    expect(capped).toHaveLength(100)
  })

  it('keeps head and tail around the marker when the budget allows', () => {
    const capped = capString('a'.repeat(1000), 300)
    // head = floor(300 * 0.7) = 210, marker = 34 chars, tail = the remaining 56
    expect(capped.startsWith('a'.repeat(210))).toBe(true)
    expect(capped.endsWith('a'.repeat(56))).toBe(true)
    expect(capped).toHaveLength(300)
  })

  it('shortens the marker wording for pathologically small budgets', () => {
    const value = 'x'.repeat(500)
    expect(capString(value, 5)).toBe('xx...')
    expect(capString(value, 2)).toBe('xx')
  })
})
