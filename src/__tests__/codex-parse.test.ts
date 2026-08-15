import { describe, expect, it } from 'vitest'
import { FrontmatterError, parseSkillFile, splitFrontmatter } from '../agents/codex/skills/parse.js'

describe('splitFrontmatter', () => {
  it('splits frontmatter from the body', () => {
    const { raw, body } = splitFrontmatter('---\nname: x\ndescription: y\n---\nBody.\n')
    expect(raw).toBe('name: x\ndescription: y')
    expect(body).toBe('Body.\n')
  })
})

describe('parseSkillFile', () => {
  it('parses a valid skill', () => {
    const parsed = parseSkillFile('---\nname: git-release\ndescription: Create releases\n---\n\n# Body\n', 'git-release')
    expect(parsed.frontmatter.name).toBe('git-release')
    expect(parsed.frontmatter.description).toBe('Create releases')
    expect(parsed.body).toContain('# Body')
  })

  it('fails closed when frontmatter is missing', () => {
    expect(() => parseSkillFile('# no frontmatter\n', 'skill-a')).toThrow(FrontmatterError)
  })

  it('fails closed when name is missing', () => {
    expect(() => parseSkillFile('---\ndescription: x\n---\nBody.\n', 'skill-a')).toThrow(/required `name`/)
  })

  it('fails closed when name does not match the directory', () => {
    expect(() => parseSkillFile('---\nname: other\ndescription: x\n---\nBody.\n', 'skill-a')).toThrow(/does not match the directory name/)
  })

  it('fails closed when description is missing', () => {
    expect(() => parseSkillFile('---\nname: skill-a\n---\nBody.\n', 'skill-a')).toThrow(/required `description`/)
  })

  it('fails closed on malformed YAML', () => {
    expect(() => parseSkillFile('---\nname: [broken\n---\nBody.\n', 'skill-a')).toThrow(/invalid YAML/)
  })
})
