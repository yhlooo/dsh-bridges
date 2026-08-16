/**
 * Cursor SKILL.md, agent-definition, and rule parsing.
 *
 * Skills: `name` (required) and `description` (required) frontmatter, plus
 * `disable-model-invocation`, `user-invocable`, `metadata` (carried
 * through); `paths` / legacy `globs` scoping is recorded as a limitation.
 * The skill's identity comes from its folder; nested folders are discovered
 * recursively (their path scoping cannot be expressed in DSH).
 *
 * Agents (`.cursor/agents/*.md`): `name` / `description` required, `model`
 * mapped; `readonly` and `is_background` are recorded as limitations.
 *
 * Rules (`.cursor/rules/*.mdc`): YAML frontmatter with `description`,
 * `globs`, and `alwaysApply`; files without frontmatter are ignored
 * upstream and skipped here.
 * @module dsh-bridges/agents/cursor/skills/parse
 */
import { parse as parseYaml } from 'yaml'
import { isPlainObject } from '../../../util.js'

/** A `---`-fenced YAML frontmatter block at the very start of a file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Thrown when a file cannot be interpreted; callers fail closed. */
export class FrontmatterError extends Error {}

export interface ParsedSkillFile {
  frontmatter: {
    name: string
    description: string
    disableModelInvocation: boolean
    userInvocable: boolean
    metadata?: Readonly<Record<string, string>>
  }
  body: string
}

export interface ParsedAgentFile {
  name: string
  description: string
  body: string
  model?: string
  readonly: boolean
  background: boolean
}

export interface ParsedRuleFile {
  description?: string
  globs?: string[]
  alwaysApply: boolean
  body: string
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

function readBooleanField(frontmatter: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = frontmatter[key]
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'boolean') throw new FrontmatterError(`frontmatter field ${JSON.stringify(key)} must be a boolean`)
  return value
}

/** Parse one Cursor `SKILL.md` file (`fallbackName` = folder name). */
export function parseSkillFile(text: string, fallbackName: string): ParsedSkillFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) throw new FrontmatterError('cursor skills require YAML frontmatter with name and description')
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
  const metadata = frontmatter['metadata']
  let metadataMap: Readonly<Record<string, string>> | undefined
  if (metadata !== undefined && metadata !== null) {
    if (!isPlainObject(metadata)) throw new FrontmatterError('frontmatter field "metadata" must be a string-to-string map')
    const entries: Record<string, string> = {}
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === 'string') entries[key] = value
    }
    metadataMap = Object.freeze(entries)
  }
  return {
    frontmatter: {
      name: effectiveName,
      description,
      disableModelInvocation: readBooleanField(frontmatter, 'disable-model-invocation', false),
      userInvocable: readBooleanField(frontmatter, 'user-invocable', true),
      metadata: metadataMap,
    },
    body,
  }
}

/** Parse one Cursor agent definition (`.cursor/agents/*.md`). */
export function parseAgentFile(text: string, fallbackName: string): ParsedAgentFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) throw new FrontmatterError('cursor agent definitions require YAML frontmatter')
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
  const model = readStringField(frontmatter, 'model')
  return {
    name: effectiveName,
    description: description.trim(),
    body: body.trim(),
    model: model && model.trim() !== '' ? model.trim() : undefined,
    readonly: readBooleanField(frontmatter, 'readonly', false),
    background: readBooleanField(frontmatter, 'is_background', false),
  }
}

/** Parse one Cursor rule file (`.cursor/rules/*.mdc`). */
export function parseRuleFile(text: string): ParsedRuleFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) throw new FrontmatterError('cursor rules require YAML frontmatter (description, globs, alwaysApply)')
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(raw)
  } catch (error) {
    throw new FrontmatterError(`invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (!isPlainObject(frontmatter)) throw new FrontmatterError('frontmatter must be a YAML mapping')
  const description = readStringField(frontmatter, 'description')
  const globsRaw = frontmatter['globs']
  let globs: string[] | undefined
  if (Array.isArray(globsRaw)) {
    const entries = globsRaw.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    if (entries.length > 0) globs = entries
  } else if (typeof globsRaw === 'string' && globsRaw.trim() !== '') {
    globs = [globsRaw.trim()]
  }
  return {
    description: description && description.trim() !== '' ? description.trim() : undefined,
    globs,
    alwaysApply: readBooleanField(frontmatter, 'alwaysApply', false),
    body: body.trim(),
  }
}
