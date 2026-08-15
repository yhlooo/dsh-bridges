---
name: changelog-writer
description: Write a release changelog from git history using Conventional Commits.
when_to_use: Use when the user asks for a changelog, release notes, or a summary of changes since a tag. Only for repositories using Conventional Commits.
metadata:
  example: claude-code
---

# Changelog Writer

Produce a `CHANGELOG.md` section (or release-notes file) from the commits
between two tags.

## Steps

1. Find the previous tag with `git describe --tags --abbrev=0`.
2. List the commits since that tag with
   `git log --no-merges --format='%s (%h)' <previous-tag>..HEAD`.
3. Group them by Conventional Commit type (`feat`, `fix`, `docs`, …) and
   write one bullet per user-visible change, keeping the imperative style.
4. Title the section with the new version and date, e.g.
   `## 0.2.0 (2025-08-15)`.
5. Confirm the version number with the user before writing.

For a mechanical first draft you may run
`scripts/draft-release-notes.sh <previous-tag>` from this skill's directory.

## Example

## 0.2.0 (2025-08-15)

### Features

- add codex bridge

### Fixes

- correct codex config detection
