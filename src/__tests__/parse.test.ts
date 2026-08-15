import { describe, expect, it } from 'vitest'
import { firstParagraph, FrontmatterError, parseSkillFile, splitFrontmatter } from '../agents/claude-code/skills/parse.js'

describe('splitFrontmatter', () => {
  it('splits a fenced frontmatter block from the body', () => {
    const text = '---\nname: deploy\n---\n\nDeploy the app.\n'
    const { raw, body } = splitFrontmatter(text)
    expect(raw).toBe('name: deploy')
    expect(body).toBe('\nDeploy the app.\n')
  })

  it('treats a file without frontmatter as body only', () => {
    const text = 'Just some instructions.\n'
    const { raw, body } = splitFrontmatter(text)
    expect(raw).toBeUndefined()
    expect(body).toBe(text)
  })

  it('does not match a fence that is not at the very start', () => {
    const text = 'Intro.\n---\nname: x\n---\n'
    expect(splitFrontmatter(text).raw).toBeUndefined()
  })
})

describe('parseSkillFile', () => {
  it('defaults both invocation surfaces to permitted without frontmatter', () => {
    const parsed = parseSkillFile('# Title\n\nDo things.\n')
    expect(parsed.frontmatter.modelInvocable).toBe(true)
    expect(parsed.frontmatter.userInvocable).toBe(true)
    expect(parsed.body).toBe('# Title\n\nDo things.\n')
  })

  it('maps disable-model-invocation to the inverted model policy', () => {
    const parsed = parseSkillFile('---\ndisable-model-invocation: true\n---\nbody\n')
    expect(parsed.frontmatter.modelInvocable).toBe(false)
  })

  it('accepts Claude Code boolean forms for user-invocable', () => {
    for (const form of ['true', 'yes', 'on', '1']) {
      const parsed = parseSkillFile(`---\nuser-invocable: ${form}\n---\nbody\n`)
      expect(parsed.frontmatter.userInvocable).toBe(true)
    }
    for (const form of ['false', 'no', 'off', '0']) {
      const parsed = parseSkillFile(`---\nuser-invocable: ${form}\n---\nbody\n`)
      expect(parsed.frontmatter.userInvocable).toBe(false)
    }
  })

  it('fails closed on invalid invocation booleans', () => {
    expect(() => parseSkillFile('---\nuser-invocable: sometimes\n---\nbody\n')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('---\ndisable-model-invocation: maybe\n---\nbody\n')).toThrow(FrontmatterError)
  })

  it('rejects malformed YAML', () => {
    expect(() => parseSkillFile('---\nname: [unclosed\n---\nbody\n')).toThrow(FrontmatterError)
  })

  it('rejects non-mapping frontmatter', () => {
    expect(() => parseSkillFile('---\n- a\n- b\n---\nbody\n')).toThrow(FrontmatterError)
  })

  it('keeps the metadata map and drops non-map metadata', () => {
    const withMap = parseSkillFile('---\nmetadata:\n  owner: platform\n---\nbody\n')
    expect(withMap.frontmatter.metadata).toEqual({ owner: 'platform' })
    const withScalar = parseSkillFile('---\nmetadata: nope\n---\nbody\n')
    expect(withScalar.frontmatter.metadata).toBeUndefined()
  })

  it('reads description and when_to_use', () => {
    const parsed = parseSkillFile('---\ndescription: Deploys\nwhen_to_use: When releasing\n---\nbody\n')
    expect(parsed.frontmatter.description).toBe('Deploys')
    expect(parsed.frontmatter.whenToUse).toBe('When releasing')
  })
})

describe('firstParagraph', () => {
  it('skips the leading markdown title and blank lines', () => {
    expect(firstParagraph('# My Skill\n\nThis is the first paragraph.\n\nSecond one.\n')).toBe('This is the first paragraph.')
  })

  it('joins wrapped lines of the first paragraph', () => {
    expect(firstParagraph('first line\nsecond line\n\nnext paragraph\n')).toBe('first line second line')
  })

  it('handles a body with no title', () => {
    expect(firstParagraph('directly the paragraph\nmore\n')).toBe('directly the paragraph more')
  })
})
