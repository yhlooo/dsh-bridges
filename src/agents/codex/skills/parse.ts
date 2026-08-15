/**
 * Codex `SKILL.md` frontmatter parsing and field mapping.
 *
 * Codex follows the open agent skills standard: a skill is a directory with
 * a `SKILL.md` whose frontmatter must include `name` and `description`.
 * Optional metadata (`license`, `compatibility`, `metadata`, …) is ignored
 * by discovery. A skill whose required fields are missing, or whose `name`
 * does not match the directory name, is invalid, so discovery drops it with
 * a warning (fail closed).
 * @module dsh-bridges/agents/codex/skills/parse
 */
import { parse as parseYaml } from 'yaml'
import { isPlainObject } from '../../../util.js'

/** A `---`-fenced YAML frontmatter block at the very start of a file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Thrown when a file cannot be interpreted; callers fail closed. */
export class FrontmatterError extends Error {}

/** The frontmatter fields this bridge maps onto DSH skills. */
export interface ParsedSkillFrontmatter {
  /** Frontmatter `name`, already validated against the directory name. */
  name: string
  /** Routing description, as written (required by the skills standard). */
  description: string
}

export interface ParsedSkillFile {
  frontmatter: ParsedSkillFrontmatter
  /** Instruction body with the frontmatter block removed. */
  body: string
}

/**
 * Split a file into frontmatter (raw YAML text or undefined) and body.
 */
export function splitFrontmatter(text: string): { raw: string | undefined; body: string } {
  const match = FRONTMATTER_RE.exec(text)
  if (!match) return { raw: undefined, body: text }
  return { raw: match[1] ?? '', body: text.slice(match[0].length) }
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
 * Parse one Codex `SKILL.md` file.
 *
 * Throws {@link FrontmatterError} when frontmatter is missing, malformed, or
 * fails the skills-standard validation (`name` missing or not matching the
 * directory, `description` missing or empty), so discovery fails closed.
 */
export function parseSkillFile(text: string, dirName: string): ParsedSkillFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) {
    throw new FrontmatterError('Codex skills require YAML frontmatter with name and description')
  }
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(raw)
  } catch (error) {
    throw new FrontmatterError(`invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (!isPlainObject(frontmatter)) {
    throw new FrontmatterError('frontmatter must be a YAML mapping')
  }
  const name = readStringField(frontmatter, 'name')
  if (name === undefined || name.trim() === '') {
    throw new FrontmatterError('frontmatter is missing the required `name` field')
  }
  if (name !== dirName) {
    throw new FrontmatterError(`frontmatter name ${JSON.stringify(name)} does not match the directory name ${JSON.stringify(dirName)}`)
  }
  const description = readStringField(frontmatter, 'description')
  if (description === undefined || description.trim() === '') {
    throw new FrontmatterError('frontmatter is missing the required `description` field')
  }
  return { frontmatter: { name, description }, body }
}
