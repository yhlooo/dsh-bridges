import { describe, expect, it } from 'vitest'
import {
  firstParagraph,
  FrontmatterError,
  parseAgentFile,
  parseCommandFile,
  parseSkillFile,
  splitFrontmatter,
} from '../agents/gemini-cli/skills/parse.js'

describe('gemini skill frontmatter parsing', () => {
  it('parses name + description and ignores unknown fields', () => {
    const parsed = parseSkillFile('---\nname: code-reviewer\ndescription: Reviews code.\nlicense: MIT\n---\nBody.\n', 'fallback')
    expect(parsed.frontmatter).toEqual({ name: 'code-reviewer', description: 'Reviews code.' })
    expect(parsed.body).toBe('Body.\n')
  })

  it('falls back to the directory name when `name` is missing', () => {
    const parsed = parseSkillFile('---\ndescription: d\n---\nBody.\n', 'dir-name')
    expect(parsed.frontmatter.name).toBe('dir-name')
  })

  it('fails closed on missing description and malformed frontmatter', () => {
    expect(() => parseSkillFile('---\nname: x\n---\nBody.\n', 'x')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('Just a body.\n', 'x')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('---\nname: [broken\n---\nBody.\n', 'x')).toThrow(FrontmatterError)
  })

  it('parses a BOM-prefixed file with CRLF line endings', () => {
    const parsed = parseSkillFile('\uFEFF---\r\nname: bom-skill\r\ndescription: BOM skill\r\n---\r\nBody.\r\n', 'fallback')
    expect(parsed.frontmatter.name).toBe('bom-skill')
    expect(parsed.body).toBe('Body.\r\n')
  })
})

describe('gemini command TOML parsing', () => {
  it('parses prompt + optional description', () => {
    const parsed = parseCommandFile('description = "Adds a changelog entry"\nprompt = """Do the thing."""\n')
    expect(parsed.description).toBe('Adds a changelog entry')
    expect(parsed.prompt).toContain('Do the thing.')
  })

  it('fails closed on missing prompt and broken TOML', () => {
    expect(() => parseCommandFile('description = "no prompt"\n')).toThrow(FrontmatterError)
    expect(() => parseCommandFile('prompt = [broken\n')).toThrow(FrontmatterError)
  })
})

describe('gemini agent definition parsing', () => {
  it('parses the mapped frontmatter fields', () => {
    const parsed = parseAgentFile(
      '---\nname: reviewer\ndescription: Reviews diffs.\ntools: [read_file, grep_search]\nmodel: gemini-2.5-pro\nmax_turns: 12\n---\nBe careful.\n',
      'fallback',
    )
    expect(parsed.name).toBe('reviewer')
    expect(parsed.description).toBe('Reviews diffs.')
    expect(parsed.tools).toEqual(['read_file', 'grep_search'])
    expect(parsed.model).toBe('gemini-2.5-pro')
    expect(parsed.maxTurns).toBe(12)
    expect(parsed.remote).toBe(false)
    expect(parsed.body).toBe('Be careful.')
  })

  it('marks remote agents and defaults max_turns', () => {
    const parsed = parseAgentFile('---\nname: remote-one\ndescription: d\nkind: remote\n---\nBody.\n', 'fallback')
    expect(parsed.remote).toBe(true)
    expect(parsed.maxTurns).toBeUndefined()
  })

  it('fails closed on missing description', () => {
    expect(() => parseAgentFile('---\nname: x\n---\nBody.\n', 'x')).toThrow(FrontmatterError)
  })
})

describe('helpers', () => {
  it('splitFrontmatter separates raw YAML from the body', () => {
    expect(splitFrontmatter('---\na: b\n---\nbody\n')).toEqual({ raw: 'a: b', body: 'body\n' })
    expect(splitFrontmatter('plain')).toEqual({ raw: undefined, body: 'plain' })
  })

  it('firstParagraph skips a leading title heading', () => {
    expect(firstParagraph('# Title\n\nFirst line.\nsecond\n\nMore.\n')).toBe('First line. second')
  })
})
