/**
 * Shared small utilities for the dsh-bridges subsystems.
 * @module dsh-bridges/util
 */
import type { ChildProcess } from 'node:child_process'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'

/** Cordis-compatible logger subset used by every subsystem. */
export interface BridgeLogger {
  debug(format: string, ...args: unknown[]): void
  info(format: string, ...args: unknown[]): void
  warn(format: string, ...args: unknown[]): void
  error(format: string, ...args: unknown[]): void
}

/** Expand a leading `~` against the OS home directory; other paths pass through. */
export function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return path
}

/**
 * Terminate a hook child the same way timeout/abort handling does: the whole
 * POSIX process group, so shell grandchildren die too instead of being
 * orphaned. Windows has no process-group kill, so the direct child is killed
 * there (grandchildren leak on Windows — a known platform limitation).
 */
export function killHookChild(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === 'win32' || child.pid === undefined) child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch {
    // already gone
  }
}

/** Resolve a possibly-relative path against an optional base directory. */
export function resolvePath(path: string, base?: string): string {
  return isAbsolute(path) ? path : resolve(base ?? process.cwd(), path)
}

/** Narrow an unknown value to a plain object record. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse one Claude Code boolean form: `true`/`false` (also `yes`/`no`,
 * `on`/`off`, `1`/`0` in any letter case) or a native boolean.
 *
 * Returns `fallback` when the value is absent. Throws on any present value that
 * is not a recognized boolean so callers can fail closed like Claude Code does
 * for malformed invocation fields.
 */
export function parseClaudeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    throw new TypeError(`invalid boolean value: ${value}`)
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', 'yes', 'on', '1'].includes(normalized)) return true
    if (['false', 'no', 'off', '0'].includes(normalized)) return false
    throw new TypeError(`invalid boolean value: ${JSON.stringify(value)}`)
  }
  throw new TypeError(`invalid boolean value: ${String(value)}`)
}

/**
 * Cap a context-bound string the way Claude Code does for hook output:
 * overlong values are clipped around the middle with a marker.
 */
export function capString(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  const marker = `... [${value.length - maxChars} characters truncated] ...`
  const head = maxChars * 0.7
  const tail = value.length - head
  return value.slice(0, head) + marker + value.slice(tail)
}

/** Escape a literal `</system-reminder>` closing tag inside injected prose. */
export function escapeReminderClose(text: string): string {
  return text.replace(/<\/system-reminder>/gi, '<\\/system-reminder>')
}

/** Strip a trailing `.md` extension (case-insensitive). */
export function stripMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.md$/i, '')
}
