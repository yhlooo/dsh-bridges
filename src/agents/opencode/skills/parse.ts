/**
 * opencode `SKILL.md` / command-file frontmatter parsing and field mapping.
 *
 * opencode recognizes exactly these frontmatter fields on a skill: `name`
 * (required, must equal the directory name), `description` (required, 1–1024
 * characters), `license`, `compatibility`, and `metadata` (a string-to-string
 * map). Unknown fields are ignored. A skill whose required fields are missing
 * or whose `name` does not match its directory is invalid in opencode, so
 * discovery drops it with a warning (fail closed).
 *
 * Command files use a different frontmatter vocabulary: optional
 * `description`, `agent`, and `model`; the body is the prompt template. Only
 * `description` maps onto DSH; the rest are ignored by discovery.
 * @module dsh-bridges/agents/opencode/skills/parse
 */
import { parse as parseYaml } from 'yaml'
import { isPlainObject } from '../../../util.js'

/** A `---`-fenced YAML frontmatter block at the very start of a file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** opencode's skill-name rule: lowercase alphanumerics separated by single hyphens. */
const OPENCODE_NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Thrown when a file cannot be interpreted; callers fail closed. */
export class FrontmatterError extends Error {}

/** The frontmatter fields this bridge maps onto DSH skills. */
export interface ParsedSkillFrontmatter {
  /** Frontmatter `name`, already validated against the directory name. */
  name: string
  /** Routing description, as written (required by opencode). */
  description: string
  /** Free-form string-to-string metadata map, when the file supplies one. */
  metadata?: Readonly<Record<string, string>>
}

export interface ParsedSkillFile {
  frontmatter: ParsedSkillFrontmatter
  /** Instruction body with the frontmatter block removed. */
  body: string
}

export interface ParsedCommandFile {
  /** Routing description from frontmatter, when present. */
  description?: string
  /** Prompt template body with the frontmatter block removed. */
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
 * Parse one opencode `SKILL.md` file.
 *
 * Throws {@link FrontmatterError} when frontmatter is missing, malformed, or
 * fails opencode's validation (`name` missing or not matching the directory,
 * `description` missing or empty), so discovery fails closed like opencode
 * does.
 */
export function parseSkillFile(text: string, dirName: string): ParsedSkillFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) {
    throw new FrontmatterError('opencode skills require YAML frontmatter with name and description')
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
  if (!OPENCODE_NAME_RE.test(name)) {
    throw new FrontmatterError(`frontmatter name ${JSON.stringify(name)} is not a valid opencode skill name`)
  }
  if (name !== dirName) {
    throw new FrontmatterError(`frontmatter name ${JSON.stringify(name)} does not match the directory name ${JSON.stringify(dirName)}`)
  }
  const description = readStringField(frontmatter, 'description')
  if (description === undefined || description.trim() === '') {
    throw new FrontmatterError('frontmatter is missing the required `description` field')
  }
  const metadata = frontmatter['metadata']
  let metadataMap: Readonly<Record<string, string>> | undefined
  if (metadata !== undefined && metadata !== null) {
    if (!isPlainObject(metadata)) {
      throw new FrontmatterError('frontmatter field "metadata" must be a string-to-string map')
    }
    const entries: Record<string, string> = {}
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value !== 'string') continue // opencode documents a string-to-string map
      entries[key] = value
    }
    metadataMap = Object.freeze(entries)
  }
  return {
    frontmatter: { name, description, metadata: metadataMap },
    body,
  }
}

/**
 * Parse one opencode command file (`.opencode/commands/<name>.md`).
 *
 * Frontmatter is optional; only `description` is mapped, `agent` / `model`
 * are ignored. Malformed frontmatter drops the command with a warning (the
 * file cannot be interpreted safely), matching the fail-closed rule used for
 * skills.
 */
export function parseCommandFile(text: string): ParsedCommandFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) return { body }
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(raw)
  } catch (error) {
    throw new FrontmatterError(`invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (frontmatter === null || frontmatter === undefined) return { body }
  if (!isPlainObject(frontmatter)) {
    throw new FrontmatterError('frontmatter must be a YAML mapping')
  }
  return { description: readStringField(frontmatter, 'description'), body }
}

/**
 * Derive a routing description from the body when a command omits
 * `description`: the first non-empty paragraph after an optional title.
 */
export function firstParagraph(body: string): string {
  const lines = body.split(/\r?\n/)
  let index = 0
  while (index < lines.length && lines[index]?.trim() === '') index++
  // A leading markdown heading is the command's title, not its description.
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

/** Whether a name satisfies opencode's skill-name validation. */
export function isOpencodeName(name: string): boolean {
  return OPENCODE_NAME_RE.test(name)
}
