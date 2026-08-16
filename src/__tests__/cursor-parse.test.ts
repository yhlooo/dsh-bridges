import { describe, expect, it } from 'vitest'
import { FrontmatterError, parseAgentFile, parseRuleFile, parseSkillFile } from '../agents/cursor/skills/parse.js'

describe('cursor skill frontmatter parsing', () => {
  it('parses the mapped fields with cursor defaults', () => {
    const parsed = parseSkillFile(
      '---\nname: deploy-skill\ndescription: Deploys.\ndisable-model-invocation: true\nuser-invocable: false\nmetadata:\n  owner: team\n---\nBody.\n',
      'deploy-skill',
    )
    expect(parsed.frontmatter.name).toBe('deploy-skill')
    expect(parsed.frontmatter.disableModelInvocation).toBe(true)
    expect(parsed.frontmatter.userInvocable).toBe(false)
    expect(parsed.frontmatter.metadata).toEqual({ owner: 'team' })
  })

  it('defaults user-invocable to true and tolerates a BOM', () => {
    const parsed = parseSkillFile('\uFEFF---\nname: bom\ndescription: d\n---\nBody.\n', 'bom')
    expect(parsed.frontmatter.userInvocable).toBe(true)
    expect(parsed.frontmatter.name).toBe('bom')
  })

  it('fails closed on missing name/description, name-folder mismatch, and malformed frontmatter', () => {
    expect(() => parseSkillFile('---\ndescription: d\n---\nBody.\n', 'f')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('---\nname: other\ndescription: d\n---\nBody.\n', 'folder')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('---\nname: x\n---\nBody.\n', 'x')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('body only\n', 'x')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('---\nname: x\ndescription: d\ndisable-model-invocation: nope\n---\nB\n', 'x')).toThrow(FrontmatterError)
  })
})

describe('cursor agent parsing', () => {
  it('parses the mapped fields and flags', () => {
    const parsed = parseAgentFile(
      '---\nname: reviewer\ndescription: Reviews.\nmodel: sonnet\nreadonly: true\nis_background: true\n---\nBe careful.\n',
      'fallback',
    )
    expect(parsed.name).toBe('reviewer')
    expect(parsed.model).toBe('sonnet')
    expect(parsed.readonly).toBe(true)
    expect(parsed.background).toBe(true)
    expect(parsed.body).toBe('Be careful.')
  })

  it('fails closed on missing description', () => {
    expect(() => parseAgentFile('---\nname: x\n---\nB\n', 'x')).toThrow(FrontmatterError)
  })
})

describe('cursor rule parsing', () => {
  it('parses alwaysApply/globs and requires frontmatter', () => {
    const parsed = parseRuleFile('---\ndescription: React patterns\nglobs: ["**/*.tsx"]\nalwaysApply: true\n---\nUse hooks.\n')
    expect(parsed.alwaysApply).toBe(true)
    expect(parsed.globs).toEqual(['**/*.tsx'])
    expect(parsed.body).toBe('Use hooks.')
    expect(() => parseRuleFile('No frontmatter.\n')).toThrow(FrontmatterError)
  })

  it('defaults alwaysApply to false', () => {
    expect(parseRuleFile('---\ndescription: conditional\n---\nB\n').alwaysApply).toBe(false)
  })
})
