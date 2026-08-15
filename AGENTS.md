# AGENTS.md

This file is the shared memory for coding agents working in this repository
(dsh, Claude Code, Codex, opencode, CodeBuddy, ...). Follow the conventions
below in all work done here.

## Plugin Conventions

### Layout

- This repository **is the plugin**: the repo root is the `dsh-bridges` dsh
  bundle, not a monorepo of plugins. `cordis.patch.yml` inserts exactly **one**
  row; every supported agent tool is a subsystem under `src/agents/<tool>/`,
  registered from `src/index.ts`. Never add a second bundle, row, or package
  for a new agent tool.
- Adding an agent tool means: one directory `src/agents/<tool>/`, one
  registration line in `registerBridgeSubsystems()`, and one config section on
  the `bridges` row. Shared code stays in `src/util.ts` / `src/fs-adapter.ts`.
- Every side effect a subsystem registers (providers, event listeners,
  watchers, spawned children) must belong to the plugin fiber and be reversible
  on teardown.

### Naming

- Patch row `name` = the npm package name (what the loader imports); patch row
  `id` = a short semantic name: the package name minus the `@scope/dsh-`
  prefix, following the shipped bundles (`dsh-bridges` → `bridges`, like
  `@deepseek-ai/dsh-skill-filesystem` → `skill-filesystem`). The `id` is the
  stable key later patch layers override config by — never use the full
  package name as `id`.
- Skill providers: one per agent tool, named after the tool (`claude-code`,
  `codebuddy-code`; later `codex`, `opencode`, …). Each provider owns a
  distinct rank band; lower rank wins within a layer, and inside one band
  assets follow the upstream tool's precedence (Claude Code: personal > project;
  CodeBuddy Code: project > user) and skills outrank same-level commands.
- Config sections on the `bridges` row are named after the tool
  (`claudeCode`, `codebuddyCode`), each with an `enabled` master switch and
  per-bridge knobs.
- Injected-message `source.plugin` ids are per subsystem
  (`claude-code-memory`, `claude-code-hooks`, `codebuddy-code-memory`,
  `codebuddy-code-hooks`), and hook `tool_name` payloads carry the upstream
  tool's names (`Bash`, `Edit`, …), never dsh's.

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
