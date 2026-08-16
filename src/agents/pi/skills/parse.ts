/**
 * pi skill / prompt-template frontmatter parsing and field mapping.
 *
 * pi implements the Agent Skills standard *leniently*: most violations warn
 * and the skill still loads, unknown fields are ignored, and the skill `name`
 * may differ from its parent directory (frontmatter wins; when `name` is
 * missing, pi falls back to the parent directory name per its source). The
 * one hard rule is `description`: a skill without one is not loaded.
 *
 * Prompt templates are slash-command bodies (`.pi/prompts/*.md`): the file
 * name is the command name, frontmatter is optional (`description` and
 * `argument-hint`), and the body is the template with `$1`/`$@`/`$ARGUMENTS`
 * substitutions. Only `description` maps onto DSH; `argument-hint` and the
 * substitution variables are passed through verbatim (DSH appends `/name`
 * arguments the same way pi does).
 * @module dsh-bridges/agents/pi/skills/parse
 */
import { parse as parseYaml } from 'yaml'
import { isPlainObject } from '../../../util.js'

/** A `---`-fenced YAML frontmatter block at the very start of a file. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

/** Thrown when a file cannot be interpreted; callers skip the asset. */
export class FrontmatterError extends Error {}

/** The frontmatter fields this bridge maps onto DSH skills. */
export interface ParsedSkillFrontmatter {
  /** Frontmatter `name`; falls back to the directory / file name (pi behavior). */
  name: string
  /** Routing description (required by pi; a skill without one is not loaded). */
  description: string
  /** Free-form string-to-string metadata map, when the file supplies one. */
  metadata?: Readonly<Record<string, string>>
  /**
   * `disable-model-invocation` mapping: `true` hides the skill from the
   * system prompt (`/skill:name` still works upstream). Invalid values are
   * dropped to `false` and reported through {@link ParsedSkillFile.warnings}
   * (pi is lenient about them).
   */
  disableModelInvocation: boolean
}

export interface ParsedSkillFile {
  frontmatter: ParsedSkillFrontmatter
  /** Instruction body with the frontmatter block removed. */
  body: string
  /** Lenient-parse issues the caller should surface as warnings. */
  warnings: string[]
}

export interface ParsedPromptFile {
  /** Routing description from frontmatter, when present. */
  description?: string
  /** Prompt template body with the frontmatter block removed. */
  body: string
  /** Lenient-parse issues the caller should surface as warnings. */
  warnings: string[]
}

/**
 * Split a file into frontmatter (raw YAML text or undefined) and body.
 * A leading UTF-8 BOM is tolerated (the robustness corpus covers it).
 */
export function splitFrontmatter(text: string): { raw: string | undefined; body: string } {
  const bomless = text.startsWith('\uFEFF') ? text.slice(1) : text
  const match = FRONTMATTER_RE.exec(bomless)
  if (!match) return { raw: undefined, body: bomless }
  return { raw: match[1] ?? '', body: bomless.slice(match[0].length) }
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
 * Parse one pi `SKILL.md` file (or a root-level flat skill `.md`).
 *
 * `fallbackName` is the parent directory name (or the file name for flat
 * skills) and replaces a missing frontmatter `name`, matching pi's source
 * behavior. Throws {@link FrontmatterError} only for the cases where pi does
 * not load the skill (missing frontmatter, malformed YAML, non-mapping
 * frontmatter, missing `description`); everything else is a warning.
 */
export function parseSkillFile(text: string, fallbackName: string): ParsedSkillFile {
  const warnings: string[] = []
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) {
    throw new FrontmatterError('pi skills require YAML frontmatter with a description')
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
  const effectiveName = name && name.trim() !== '' ? name : fallbackName
  const description = readStringField(frontmatter, 'description')
  if (description === undefined || description.trim() === '') {
    throw new FrontmatterError('frontmatter is missing the required `description` field')
  }
  let disableModelInvocation = false
  const rawDisable = frontmatter['disable-model-invocation']
  if (rawDisable !== undefined && rawDisable !== null) {
    if (typeof rawDisable === 'boolean') {
      disableModelInvocation = rawDisable
    } else if (typeof rawDisable === 'string' && ['true', 'false'].includes(rawDisable.trim().toLowerCase())) {
      disableModelInvocation = rawDisable.trim().toLowerCase() === 'true'
    } else {
      // pi warns about most violations and keeps loading; DSH defaults to
      // model-invocable rather than dropping the skill over this field.
      warnings.push(`invalid boolean for disable-model-invocation (${JSON.stringify(rawDisable)}); treated as false`)
    }
  }
  const metadata = frontmatter['metadata']
  let metadataMap: Readonly<Record<string, string>> | undefined
  if (metadata !== undefined && metadata !== null) {
    if (!isPlainObject(metadata)) {
      warnings.push('metadata must be a string-to-string map; ignored')
    } else {
      const entries: Record<string, string> = {}
      for (const [key, value] of Object.entries(metadata)) {
        if (typeof value !== 'string') continue
        entries[key] = value
      }
      metadataMap = Object.freeze(entries)
    }
  }
  return {
    frontmatter: { name: effectiveName, description, metadata: metadataMap, disableModelInvocation },
    body,
    warnings,
  }
}

/**
 * Parse one pi prompt template (`.pi/prompts/<name>.md`).
 *
 * Frontmatter is optional; only `description` is mapped (falling back to the
 * body's first paragraph in the provider). `argument-hint` and substitution
 * variables stay in the body verbatim. Malformed frontmatter drops the
 * template with a warning (fail closed), matching the skill rule.
 */
export function parsePromptFile(text: string): ParsedPromptFile {
  const { raw, body } = splitFrontmatter(text)
  if (raw === undefined) return { body, warnings: [] }
  let frontmatter: unknown
  try {
    frontmatter = parseYaml(raw)
  } catch (error) {
    throw new FrontmatterError(`invalid YAML frontmatter: ${(error as Error).message}`)
  }
  if (frontmatter === null || frontmatter === undefined) return { body, warnings: [] }
  if (!isPlainObject(frontmatter)) {
    throw new FrontmatterError('frontmatter must be a YAML mapping')
  }
  return { description: readStringField(frontmatter, 'description'), body, warnings: [] }
}

/** Derive a routing description from the body when a prompt omits one. */
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
