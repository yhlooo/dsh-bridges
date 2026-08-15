#!/bin/sh
# Supporting script for the changelog-writer skill.
# Prints conventional commits since the given tag, grouped by type.
set -eu

previous_tag="${1:?usage: draft-release-notes.sh <previous-tag>}"

printf '## Unreleased\n\n'
git log --no-merges --format='%s' "${previous_tag}..HEAD" | while IFS= read -r line; do
  type=$(printf '%s\n' "$line" | sed -n 's/^\([a-z]*\)!\{0,1\}[(:].*/\1/p')
  [ -n "$type" ] || type="other"
  case "$type" in
    feat) printf '%s\n' "$line" | sed 's/^/### Features\n\n- /' ;;
    fix)  printf '%s\n' "$line" | sed 's/^/### Fixes\n\n- /' ;;
    *)    printf '%s\n' "$line" | sed 's/^/### Other\n\n- /' ;;
  esac
done
