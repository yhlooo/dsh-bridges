/**
 * The argument field a `Tool(specifier)` rule tests per upstream tool name.
 *
 * Permission rules are written against upstream tool names (`Bash`, `Edit`,
 * `Read`, `WebFetch`, …), so the map keys on those names while the fields are
 * the DSH tool argument names. Tools without an entry match by tool name only
 * (`Tool` bare rules still work; a specifier can never match).
 *
 * Field kinds drive specifier semantics:
 * - `command` — prefix glob against the command string (upstream documents
 *   Bash permission matching as prefix-based, with its known bypass caveats);
 * - `path` — glob against the resolved file path, with upstream rule-path
 *   resolution (`//` absolute, `/` project-relative, `~` home, `./` project);
 * - `url` — `domain:…` subdomain match or plain glob against the URL string;
 * - `text` — anchored glob against the field value.
 * @module dsh-bridges/permissions/fields
 */
import { isPlainObject } from '../util.js'

export interface ToolFieldSpec {
  /** DSH tool argument field name. */
  field: string
  kind: 'command' | 'path' | 'text' | 'url'
}

/** Default field map (Claude Code / CodeBuddy Code tool names). */
export const DEFAULT_TOOL_FIELDS: Readonly<Record<string, ToolFieldSpec>> = {
  Bash: { field: 'command', kind: 'command' },
  PowerShell: { field: 'command', kind: 'command' },
  Edit: { field: 'file_path', kind: 'path' },
  Write: { field: 'file_path', kind: 'path' },
  Read: { field: 'file_path', kind: 'path' },
  Glob: { field: 'pattern', kind: 'text' },
  Grep: { field: 'pattern', kind: 'text' },
  WebFetch: { field: 'url', kind: 'url' },
  WebSearch: { field: 'query', kind: 'text' },
}

/** Read the primary argument field of a tool call for rule matching. */
export function primaryField(toolName: string, args: unknown, fields: Readonly<Record<string, ToolFieldSpec>> = DEFAULT_TOOL_FIELDS): string | undefined {
  const spec = fields[toolName]
  if (spec === undefined || !isPlainObject(args)) return undefined
  const value = args[spec.field]
  return typeof value === 'string' ? value : undefined
}
