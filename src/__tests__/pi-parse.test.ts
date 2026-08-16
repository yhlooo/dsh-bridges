import { describe, expect, it } from 'vitest'
import { firstParagraph, FrontmatterError, parsePromptFile, parseSkillFile, splitFrontmatter } from '../agents/pi/skills/parse.js'

describe('pi skill frontmatter parsing', () => {
  it('parses the mapped fields and defaults disable-model-invocation to false', () => {
    const parsed = parseSkillFile(
      '---\nname: pdf-tools\ndescription: Works with PDFs.\nmetadata:\n  owner: team\nlicense: MIT\ncompatibility: node 20\n---\nBody.\n',
      'fallback',
    )
    expect(parsed.frontmatter.name).toBe('pdf-tools')
    expect(parsed.frontmatter.description).toBe('Works with PDFs.')
    expect(parsed.frontmatter.disableModelInvocation).toBe(false)
    expect(parsed.frontmatter.metadata).toEqual({ owner: 'team' })
    expect(parsed.body).toBe('Body.\n')
    expect(parsed.warnings).toEqual([])
  })

  it('falls back to the directory name when `name` is missing (pi source behavior)', () => {
    const parsed = parseSkillFile('---\ndescription: Works with PDFs.\n---\nBody.\n', 'dir-name')
    expect(parsed.frontmatter.name).toBe('dir-name')
  })

  it('allows a name that differs from the parent directory', () => {
    const parsed = parseSkillFile('---\nname: other-name\ndescription: d\n---\nBody.\n', 'dir-name')
    expect(parsed.frontmatter.name).toBe('other-name')
  })

  it('maps disable-model-invocation and warns leniently on invalid booleans', () => {
    const parsed = parseSkillFile('---\ndescription: d\ndisable-model-invocation: true\n---\nBody.\n', 's')
    expect(parsed.frontmatter.disableModelInvocation).toBe(true)
    const lenient = parseSkillFile('---\ndescription: d\ndisable-model-invocation: maybe\n---\nBody.\n', 's')
    expect(lenient.frontmatter.disableModelInvocation).toBe(false)
    expect(lenient.warnings).toHaveLength(1)
    const stringBool = parseSkillFile('---\ndescription: d\ndisable-model-invocation: "true"\n---\nBody.\n', 's')
    expect(stringBool.frontmatter.disableModelInvocation).toBe(true)
  })

  it('warns (not throws) on non-mapping metadata', () => {
    const parsed = parseSkillFile('---\ndescription: d\nmetadata: 12\n---\nBody.\n', 's')
    expect(parsed.frontmatter.metadata).toBeUndefined()
    expect(parsed.warnings).toHaveLength(1)
  })

  it('fails closed on missing description (pi does not load such skills)', () => {
    expect(() => parseSkillFile('---\nname: s\n---\nBody.\n', 's')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('---\nname: s\ndescription: "  "\n---\nBody.\n', 's')).toThrow(FrontmatterError)
  })

  it('fails closed on missing or malformed frontmatter', () => {
    expect(() => parseSkillFile('Just a body.\n', 's')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('---\nname: [broken\n---\nBody.\n', 's')).toThrow(FrontmatterError)
    expect(() => parseSkillFile('---\n- a\n- b\n---\nBody.\n', 's')).toThrow(FrontmatterError)
  })

  it('parses a BOM-prefixed file with CRLF line endings', () => {
    const parsed = parseSkillFile('\uFEFF---\r\nname: bom-skill\r\ndescription: BOM skill\r\n---\r\nBody.\r\n', 'fallback')
    expect(parsed.frontmatter.name).toBe('bom-skill')
    expect(parsed.frontmatter.description).toBe('BOM skill')
    expect(parsed.body).toBe('Body.\r\n')
  })
})

describe('pi prompt template parsing', () => {
  it('parses an optional description and keeps the template body verbatim', () => {
    const parsed = parsePromptFile('---\ndescription: Reviews the diff.\nargument-hint: [file]\n---\nReview $1 please.\n')
    expect(parsed.description).toBe('Reviews the diff.')
    expect(parsed.body).toBe('Review $1 please.\n')
  })

  it('treats a body without frontmatter as a plain template', () => {
    const parsed = parsePromptFile('# Review\n\nCheck $@.\n')
    expect(parsed.description).toBeUndefined()
    expect(parsed.body).toBe('# Review\n\nCheck $@.\n')
    expect(parsed.warnings).toEqual([])
  })

  it('fails closed on malformed frontmatter', () => {
    expect(() => parsePromptFile('---\ndescription: [broken\n---\nBody.\n')).toThrow(FrontmatterError)
  })
})

describe('helpers', () => {
  it('splitFrontmatter separates raw YAML from the body', () => {
    expect(splitFrontmatter('---\na: b\n---\nbody\n')).toEqual({ raw: 'a: b', body: 'body\n' })
    expect(splitFrontmatter('no frontmatter')).toEqual({ raw: undefined, body: 'no frontmatter' })
  })

  it('firstParagraph skips a leading title heading', () => {
    expect(firstParagraph('# Title\n\nFirst paragraph line one\nsecond line\n\nMore.\n')).toBe('First paragraph line one second line')
    expect(firstParagraph('Just one paragraph.\n')).toBe('Just one paragraph.')
  })
})
