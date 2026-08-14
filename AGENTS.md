# AGENTS.md

This file is the shared memory for coding agents working in this repository
(dsh, Claude Code, Codex, opencode, CodeBuddy, ...). Follow the conventions
below in all work done here.

## Git Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/).

Commit message format:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

The description is a short imperative summary (e.g. "add foo bar" instead of
"added foo bar"), in lowercase, without a trailing period.

### Types

| Type       | Purpose                                                                 |
| ---------- | ----------------------------------------------------------------------- |
| `feat`     | A new feature                                                           |
| `fix`      | A bug fix                                                               |
| `docs`     | Documentation-only changes                                              |
| `style`    | Formatting only; no change to code meaning                              |
| `refactor` | Code change that neither fixes a bug nor adds a feature                 |
| `perf`     | A change that improves performance                                      |
| `test`     | Adding or correcting tests                                              |
| `build`    | Changes to the build system or external dependencies                    |
| `ci`       | Changes to CI configuration and scripts                                 |
| `chore`    | Routine tasks that do not touch src or test code (e.g. tooling, deps)   |
| `revert`   | Reverts a previous commit; reference the reverted commit in the body    |

### Breaking changes

Append `!` after the type/scope, or add a `BREAKING CHANGE:` footer:

```
feat(api)!: remove legacy bridge protocol
```

### Examples

```
feat: add claude code bridge
fix: correct codex config detection
chore: bump dev dependencies
```
