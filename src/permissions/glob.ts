/**
 * Glob-to-regex translation shared by hook `if` filters and permission rules.
 *
 * `*` matches any characters (including path separators — permission rules do
 * not distinguish directory levels, mirroring the existing hook-filter
 * behavior), `?` matches one character, everything else is literal. `**`
 * therefore collapses to the same expansion as `*`, which is what the
 * best-effort permission-rule contract needs.
 * @module dsh-bridges/permissions/glob
 */

/** Translate a glob pattern into an anchored regular expression. */
export function globToRegExp(pattern: string, flags = ''): RegExp {
  let source = '^'
  for (const char of pattern) {
    if (char === '*') source += '.*'
    else if (char === '?') source += '.'
    else source += escapeRegExp(char)
  }
  source += '$'
  return new RegExp(source, flags)
}

/** Anchored glob match (`*` and `?` wildcards). */
export function globMatch(pattern: string, value: string): boolean {
  return globToRegExp(pattern).test(value)
}

function escapeRegExp(char: string): string {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char
}
