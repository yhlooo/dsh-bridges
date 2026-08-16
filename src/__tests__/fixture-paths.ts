/**
 * Platform-aware in-memory fixture paths.
 *
 * Unit tests keep their fixtures in memory with absolute fake paths. The code
 * under test joins those paths with the platform's `node:path`, so on Windows
 * the keys must use the win32 root and separators to match. `fx()` builds them
 * with the running platform's semantics, making the same literals work on
 * POSIX (`/proj/...`) and Windows (`D:\proj\...`) alike.
 * @module dsh-bridges/__tests__/fixture-paths
 */
import { join, parse, sep } from 'node:path'

/** The running platform's absolute root ('/' or 'D:\'). */
export const fxRoot = parse(process.cwd()).root

/** Absolute fixture path joined with the platform's separator. */
export function fx(...parts: string[]): string {
  return join(fxRoot, ...parts)
}

/** Append one path segment (used by in-memory adapters instead of '/'). */
export function fxChild(parent: string, name: string): string {
  return `${parent}${sep}${name}`
}
