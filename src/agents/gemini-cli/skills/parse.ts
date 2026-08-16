/**
 * Gemini CLI SKILL.md, command TOML, and agent-definition parsing.
 *
 * Skills carry exactly two frontmatter fields (`name`, `description` — both
 * required; unknown fields ignored). The `name` is a unique slug that
 * "should match the directory name"; the bridge follows the pi precedent and
 * falls back to the directory name when `name` is absent (fail-closed only
 * on a missing `description`, which makes the skill unroutable).
 *
 * Commands are TOML files with a required `prompt` and an optional
 * `description`; the file name (relative to the `commands/` root) is the
 * command name — nested paths become namespaced `dir:name` commands, which
 * are not kebab-case and are skipped with a warning (no transliteration).
 *
 * Agent definitions use frontmatter `name` (slug) + `description` (required)
 * plus `kind` / `tools` / `model` / `max_turns`; `remote` kinds are skipped.
 * @module dsh-bridges/agents/gemini-cli/skills/parse
 */
import { parse as parseYaml } from 'yaml'
import { parse as parseToml } from 'smol-toml'
import { isPlainObject } from '../../../util.js'

/** A `---`-fenced YAML frontmatter block at the very start of a file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Thrown when a file cannot be interpreted; callers fail closed. */
export class FrontmatterError extends Error {}

export interface ParsedSkillFile {
  frontmatter: { name: string; description: string }
  body: string
}

export interface ParsedCommandFile {
  description?: string
  prompt: string
}

export interface ParsedAgentFile {
  name: string
  description: string
  body: string
  /** `tools` entries as written (Gemini tool names / wildcards). */
  tools: string[]
  model?: string
  maxTurns?: number
  /** True when `kind: "remote"` — discovery skips remote agents. */
  remote: boolean
}

export function splitFrontmatter(text: string): { raw: string | undefined; body: string } {
  const bomless = text.startsWith('\uFEFF') ? text.slice(1) : text
  const match = FRONTMATTER_RE.exec(bomless)
  if (!match) return { raw: undefined, body: bomless }
  return { raw: match[1] ?? '', body: bomless.slice(match[0].length) }
}

function readStringField(frontmatter: Record<string, unknown>, key: string): string | undefined {
  const value = frontmatter[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new FrontmatterError(`frontmatter field ${JSON.stringify(key)} must be a string`)
  return value
}

/** Parse one Gemini `SKILL.md` file (`fallbackName` = directory name). */
export function parseSkillFile(text: string, fallbackName: string): ParsedSkillFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) throw new FrontmatterError('gemini skills require YAML frontmatter with name and description')
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(raw)
  } catch (error) {
    throw new FrontmatterError(`invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (!isPlainObject(frontmatter)) throw new FrontmatterError('frontmatter must be a YAML mapping')
  const name = readStringField(frontmatter, 'name')
  const effectiveName = name && name.trim() !== '' ? name.trim() : fallbackName
  const description = readStringField(frontmatter, 'description')
  if (description === undefined || description.trim() === '') {
    throw new FrontmatterError('frontmatter is missing the required `description` field')
  }
  return { frontmatter: { name: effectiveName, description }, body }
}

/** Parse one Gemini command file (`*.toml`: `prompt` + optional `description`). */
export function parseCommandFile(text: string): ParsedCommandFile {
  let value: unknown
  try {
    value = parseToml(text)
  } catch (error) {
    throw new FrontmatterError(`invalid command TOML: ${(error as Error).message}`)
  }
  if (!isPlainObject(value)) throw new FrontmatterError('command TOML must be a table')
  const prompt = value['prompt']
  if (typeof prompt !== 'string' || prompt.trim() === '') {
    throw new FrontmatterError('command is missing the required `prompt` field')
  }
  const description =
    typeof value['description'] === 'string' && value['description'].trim() !== '' ? value['description'].trim() : undefined
  return { description, prompt }
}

/** Parse one Gemini agent definition (`.gemini/agents/*.md`). */
export function parseAgentFile(text: string, fallbackName: string): ParsedAgentFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) throw new FrontmatterError('gemini agent definitions require YAML frontmatter')
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(raw)
  } catch (error) {
    throw new FrontmatterError(`invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (!isPlainObject(frontmatter)) throw new FrontmatterError('frontmatter must be a YAML mapping')
  const name = readStringField(frontmatter, 'name')
  const effectiveName = name && name.trim() !== '' ? name.trim() : fallbackName
  const description = readStringField(frontmatter, 'description')
  if (description === undefined || description.trim() === '') {
    throw new FrontmatterError('frontmatter is missing the required `description` field')
  }
  const kind = readStringField(frontmatter, 'kind')
  const remote = kind === 'remote'
  const tools = readStringList(frontmatter['tools'])
  const model = readStringField(frontmatter, 'model')
  const maxTurnsRaw = frontmatter['max_turns']
  const maxTurns = typeof maxTurnsRaw === 'number' && Number.isInteger(maxTurnsRaw) && maxTurnsRaw > 0 ? maxTurnsRaw : undefined
  return {
    name: effectiveName,
    description: description.trim(),
    body: body.trim(),
    tools,
    model: model && model.trim() !== '' ? model.trim() : undefined,
    maxTurns,
    remote,
  }
}

function readStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== '')
  }
  return []
}

/** Derive a routing description from a body's first paragraph. */
export function firstParagraph(body: string): string {
  const lines = body.split(/\r?\n/)
  let index = 0
  while (index < lines.length && lines[index]?.trim() === '') index++
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
