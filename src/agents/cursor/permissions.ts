/**
 * Cursor CLI permissions bridging: `permissions.allow` / `permissions.deny`
 * rule tokens from `cli.json` / `cli-config.json` → the `tools/pre-execute`
 * permission seam.
 *
 * Rule tokens: `Shell(commandBase)` (glob on the command's first token, plus
 * `command:args`), `Read(pathOrGlob)` / `Write(pathOrGlob)` (glob on the
 * file path), `WebFetch(domainOrPattern)` (exact domain or `*.domain`), and
 * `Mcp(server:tool)` (wildcards `*`). Matching is per-tool-type: a token of
 * one type never matches another tool. **deny wins over allow**; there is no
 * ask level (unmatched calls fall through to the DeepSeek Harness approval
 * policy).
 *
 * Recorded limitations: `approvalMode` is read but not enforced (DeepSeek
 * Harness owns its approval modes); `permissions.json`
 * (`mcpAllowlist` / `terminalAllowlist` / `autoRun`) tunes Cursor's own
 * prompt flows and is read but not enforced.
 * @module dsh-bridges/agents/cursor/permissions
 */
import type { Context } from '@deepseek-ai/cordis'
import type { ToolExecution } from '@deepseek-ai/dsh-tools'
import type { BridgeLogger } from '../../util.js'
import type { RuleVerdict } from '../../permissions/types.js'
import { cursorToolName } from './hooks/names.js'

type TokenKind = 'shell' | 'read' | 'write' | 'webfetch' | 'mcp'

interface ParsedToken {
  kind: TokenKind
  pattern: string
  /** `command:args` form: match the command base plus an args substring. */
  argsPart?: string
}

/** Evaluate allow/deny token lists against one tool execution (exported for tests). */
export function evaluateCursorPermissions(allow: readonly string[], deny: readonly string[], exec: ToolExecution): RuleVerdict {
  const name = cursorToolName(exec.name)
  const args = exec.arguments
  let allowed = false
  for (const raw of allow) {
    const token = parseToken(raw)
    if (token !== undefined && tokenMatches(token, name, args)) {
      allowed = true
      break
    }
  }
  for (const raw of deny) {
    const token = parseToken(raw)
    if (token !== undefined && tokenMatches(token, name, args)) {
      return { kind: 'deny', reason: `denied by a Cursor permission rule (${raw})` }
    }
  }
  if (allowed) return { kind: 'allow' }
  return undefined
}

export function parseToken(raw: string): ParsedToken | undefined {
  const match = /^(Shell|Read|Write|WebFetch|Mcp)\((.*)\)$/.exec(raw.trim())
  if (!match) return undefined
  const kindName = match[1]!
  const inner = match[2]!
  const kind: TokenKind =
    kindName === 'Shell'
      ? 'shell'
      : kindName === 'Read'
        ? 'read'
        : kindName === 'Write'
          ? 'write'
          : kindName === 'WebFetch'
            ? 'webfetch'
            : 'mcp'
  if (kind === 'shell') {
    const colon = inner.indexOf(':')
    if (colon >= 0) return { kind, pattern: inner.slice(0, colon), argsPart: inner.slice(colon + 1) }
  }
  return { kind, pattern: inner }
}

function tokenMatches(token: ParsedToken, toolName: string, args: unknown): boolean {
  switch (token.kind) {
    case 'shell': {
      if (toolName !== 'Shell') return false
      const command = typeof args === 'object' && args !== null ? (args as { command?: unknown }).command : undefined
      if (typeof command !== 'string') return false
      const base = command.trim().split(/\s+/)[0] ?? ''
      if (!globMatch(token.pattern, base)) return false
      if (token.argsPart !== undefined && token.argsPart !== '*') {
        const rest = command.trim().slice(base.length).trim()
        if (!globMatch(token.argsPart, rest)) return false
      }
      return true
    }
    case 'read': {
      if (toolName !== 'Read') return false
      return pathMatches(token.pattern, readPath(args))
    }
    case 'write': {
      if (toolName !== 'Write' && toolName !== 'Edit') return false
      return pathMatches(token.pattern, readPath(args))
    }
    case 'webfetch': {
      if (toolName !== 'WebFetch') return false
      const url = typeof args === 'object' && args !== null ? (args as { url?: unknown }).url : undefined
      if (typeof url !== 'string') return false
      const host = safeHostname(url)
      if (host === undefined) return false
      return globMatch(token.pattern, host)
    }
    case 'mcp': {
      if (!toolName.includes('__')) {
        if (toolName !== 'mcp' && toolName !== 'Mcp') return false
      }
      const [server, tool] = splitMcp(toolName)
      const patternParts = token.pattern.split(/:(.*)/s)
      const patternServer = patternParts[0] ?? '*'
      const patternTool = patternParts[1] ?? '*'
      return globMatch(patternServer, server) && globMatch(patternTool, tool)
    }
  }
}

function readPath(args: unknown): string | undefined {
  if (typeof args !== 'object' || args === null) return undefined
  const record = args as { file_path?: unknown; path?: unknown }
  if (typeof record.file_path === 'string') return record.file_path
  if (typeof record.path === 'string') return record.path
  return undefined
}

function pathMatches(pattern: string, path: string | undefined): boolean {
  if (path === undefined) return false
  const normalized = path.replace(/\\/g, '/')
  return globMatch(pattern, normalized)
}

function safeHostname(url: string): string | undefined {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

function splitMcp(toolName: string): [string, string] {
  const withoutPrefix = toolName.replace(/^mcp__/, '')
  const index = withoutPrefix.indexOf('__')
  if (index < 0) return [withoutPrefix, '*']
  return [withoutPrefix.slice(0, index), withoutPrefix.slice(index + 2)]
}

/** Glob with `*` / `**` / `?` wildcards (Cursor's documented pattern set). */
export function globMatch(pattern: string, value: string): boolean {
  let regex = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        regex += '.*'
        i++
      } else {
        regex += '[^/]*'
      }
    } else if (char === '?') {
      regex += '.'
    } else {
      regex += /[.*+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char
    }
  }
  return new RegExp(`^${regex}$`).test(value)
}

/** Register the permission evaluator (returned so the hook bridge can compose). */
export function createPermissionsEvaluator(
  ctx: Context,
  logger: BridgeLogger,
  loadRules: (cwd: string | undefined) => Promise<{ allow: readonly string[]; deny: readonly string[] }>,
): (exec: ToolExecution) => Promise<RuleVerdict> {
  const evaluator = async (exec: ToolExecution): Promise<RuleVerdict> => {
    const agent = exec.agent
    if (!agent) return undefined
    try {
      const { allow, deny } = await loadRules(agent.session.header.cwd)
      if (allow.length === 0 && deny.length === 0) return undefined
      return evaluateCursorPermissions(allow, deny, exec)
    } catch (error) {
      logger.warn(`cursor: permission rules failed: ${error instanceof Error ? error.message : String(error)}`)
      return undefined
    }
  }
  return evaluator
}
