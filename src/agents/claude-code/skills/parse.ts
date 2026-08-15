/**
 * Claude Code `SKILL.md` / command-file frontmatter parsing and field mapping.
 * @module dsh-bridges/agents/claude-code/skills/parse
 */
import { parse as parseYaml } from 'yaml'
import { isPlainObject, parseClaudeBoolean } from '../../../util.js'

/** A `---`-fenced YAML frontmatter block at the very start of a file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Thrown when frontmatter exists but cannot be interpreted; callers fail closed. */
export class FrontmatterError extends Error {}

/** The frontmatter fields this bridge maps onto DSH skills. */
export interface ParsedFrontmatter {
  /** Display name (Claude Code uses the directory/file name for invocation). */
  name?: string
  /** Routing description, as written. */
  description?: string
  /** Additional routing guidance, as written. */
  whenToUse?: string
  /** Resolved model-invocation policy (inverse of `disable-model-invocation`). */
  modelInvocable: boolean
  /** Resolved user-invocation policy from `user-invocable`. */
  userInvocable: boolean
  /** Free-form metadata map, when the file supplies one. */
  metadata?: Readonly<Record<string, unknown>>
}

export interface ParsedSkillFile {
  frontmatter: ParsedFrontmatter
  /** Instruction body with the frontmatter block removed. */
  body: string
}

function readStringField(frontmatter: Record<string, unknown>, key: string): string | undefined {
  const value = frontmatter[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new FrontmatterError(`frontmatter field ${JSON.stringify(key)} must be a string`)
  }
  return value
}

/**
 * Split a skill file into frontmatter (raw YAML text or undefined) and body.
 */
export function splitFrontmatter(text: string): { raw: string | undefined; body: string } {
  const match = FRONTMATTER_RE.exec(text)
  if (!match) return { raw: undefined, body: text }
  return { raw: match[1] ?? '', body: text.slice(match[0].length) }
}

/**
 * Parse one skill file into the bridge's frontmatter mapping plus the body.
 *
 * Throws {@link FrontmatterError} for malformed YAML or wrong-typed invocation
 * fields so discovery can fail closed (drop the entry with a warning) instead
 * of guessing at a permissive policy.
 */
export function parseSkillFile(text: string): ParsedSkillFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) return { frontmatter: { modelInvocable: true, userInvocable: true }, body }
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(raw)
  } catch (error) {
    throw new FrontmatterError(`invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (frontmatter === null || frontmatter === undefined) {
    return { frontmatter: { modelInvocable: true, userInvocable: true }, body }
  }
  if (!isPlainObject(frontmatter)) {
    throw new FrontmatterError('frontmatter must be a YAML mapping')
  }
  const metadata = frontmatter['metadata']
  let modelInvocable: boolean
  let userInvocable: boolean
  try {
    modelInvocable = !parseClaudeBoolean(frontmatter['disable-model-invocation'], false)
    userInvocable = parseClaudeBoolean(frontmatter['user-invocable'], true)
  } catch (error) {
    throw new FrontmatterError((error as Error).message)
  }
  return {
    frontmatter: {
      name: readStringField(frontmatter, 'name'),
      description: readStringField(frontmatter, 'description'),
      whenToUse: readStringField(frontmatter, 'when_to_use'),
      modelInvocable,
      userInvocable,
      metadata: isPlainObject(metadata) ? Object.freeze({ ...metadata }) : undefined,
    },
    body,
  }
}

/**
 * Derive a routing description from the body the way Claude Code does when a
 * file omits `description`: the first non-empty paragraph after the title.
 */
export function firstParagraph(body: string): string {
  const lines = body.split(/\r?\n/)
  let index = 0
  while (index < lines.length && lines[index]?.trim() === '') index++
  // A leading markdown heading is the skill's title, not its description.
  if (index < lines.length && /^#\s/.test(lines[index] ?? '')) index++
  while (index < lines.length && lines[index]?.trim() === '') index++
  const paragraph: string[] = []
  while (index < lines.length) {
    const line = lines[index]
    if (line === undefined || line.trim() === '') break
    paragraph.push(line.trim())
    index++
  }
  return paragraph.join(' ')
}
