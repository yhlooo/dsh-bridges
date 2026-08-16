import { describe, expect, it } from 'vitest'
import {
  firstParagraph,
  FrontmatterError,
  isOpencodeName,
  parseCommandFile,
  parseSkillFile,
  splitFrontmatter,
} from '../agents/opencode/skills/parse.js'
import { stripJsoncComments } from '../agents/opencode/settings.js'

describe('splitFrontmatter', () => {
  it('splits frontmatter from the body', () => {
    const { raw, body } = splitFrontmatter('---\nname: x\n---\nBody.\n')
    expect(raw).toBe('name: x')
    expect(body).toBe('Body.\n')
  })

  it('returns no frontmatter when the file does not start with one', () => {
    const { raw, body } = splitFrontmatter('# Title\n\nBody.\n')
    expect(raw).toBeUndefined()
    expect(body).toBe('# Title\n\nBody.\n')
  })
})

describe('parseSkillFile', () => {
  it('parses a valid skill and maps description plus metadata', () => {
    const parsed = parseSkillFile(
      '---\nname: git-release\ndescription: Create releases\nlicense: MIT\ncompatibility: opencode\nmetadata:\n  audience: maintainers\n---\n\n# Body\n',
      'git-release',
    )
    expect(parsed.frontmatter.name).toBe('git-release')
    expect(parsed.frontmatter.description).toBe('Create releases')
    expect(parsed.frontmatter.metadata).toEqual({ audience: 'maintainers' })
    expect(parsed.body).toContain('# Body')
  })

  it('fails closed when frontmatter is missing', () => {
    expect(() => parseSkillFile('# no frontmatter\n', 'skill-a')).toThrow(FrontmatterError)
  })

  it('fails closed when name is missing', () => {
    expect(() => parseSkillFile('---\ndescription: x\n---\nBody.\n', 'skill-a')).toThrow(/required `name`/)
  })

  it('fails closed when name does not match the directory', () => {
    expect(() => parseSkillFile('---\nname: other-name\ndescription: x\n---\nBody.\n', 'skill-a')).toThrow(
      /does not match the directory name/,
    )
  })

  it('fails closed when description is missing', () => {
    expect(() => parseSkillFile('---\nname: skill-a\n---\nBody.\n', 'skill-a')).toThrow(/required `description`/)
  })

  it('fails closed on invalid YAML', () => {
    expect(() => parseSkillFile('---\nname: [broken\n---\nBody.\n', 'skill-a')).toThrow(/invalid YAML/)
  })

  it('fails closed on non-mapping frontmatter', () => {
    expect(() => parseSkillFile('---\n- a\n- b\n---\nBody.\n', 'skill-a')).toThrow(/YAML mapping/)
  })

  it('drops non-string metadata values', () => {
    const parsed = parseSkillFile('---\nname: skill-a\ndescription: x\nmetadata:\n  keep: value\n  drop: 42\n---\nBody.\n', 'skill-a')
    expect(parsed.frontmatter.metadata).toEqual({ keep: 'value' })
  })
})

describe('isOpencodeName', () => {
  it('accepts lowercase-hyphen names and rejects underscores', () => {
    expect(isOpencodeName('git-release')).toBe(true)
    expect(isOpencodeName('a1-b2')).toBe(true)
    expect(isOpencodeName('git_release')).toBe(false)
    expect(isOpencodeName('Git-Release')).toBe(false)
    expect(isOpencodeName('-leading')).toBe(false)
    expect(isOpencodeName('double--hyphen')).toBe(false)
  })
})

describe('parseCommandFile', () => {
  it('parses the description and keeps the body as the template', () => {
    const parsed = parseCommandFile('---\ndescription: Run tests\nagent: build\nmodel: m\n---\nRun the tests.\n')
    expect(parsed.description).toBe('Run tests')
    expect(parsed.body).toBe('Run the tests.\n')
  })

  it('tolerates a missing frontmatter block', () => {
    const parsed = parseCommandFile('Run the tests.\n')
    expect(parsed.description).toBeUndefined()
    expect(parsed.body).toBe('Run the tests.\n')
  })

  it('fails closed on malformed YAML', () => {
    expect(() => parseCommandFile('---\ndescription: [broken\n---\nBody.\n')).toThrow(FrontmatterError)
  })
})

describe('firstParagraph', () => {
  it('skips blank lines and a leading title', () => {
    expect(firstParagraph('# Title\n\nFirst paragraph line.\n')).toBe('First paragraph line.')
  })
})

describe('stripJsoncComments', () => {
  it('strips line and block comments outside strings', () => {
    expect(stripJsoncComments('{\n  // line comment\n  "a": "keep // me", /* block */\n  "b": 1\n}')).toBe(
      '{\n  \n  "a": "keep // me", \n  "b": 1\n}',
    )
  })

  it('keeps strings with escaped quotes intact', () => {
    expect(stripJsoncComments('{"a": "x\\" // not a comment"}')).toBe('{"a": "x\\" // not a comment"}')
  })
})
