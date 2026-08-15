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
  `codebuddy-code`, `opencode`, `codex`). Each provider owns a distinct rank
  band (claude 105–120, codebuddy 125–140, opencode 145–160, codex 165–175);
  lower rank wins within a layer, and inside one band assets follow the
  upstream tool's precedence (Claude Code: personal > project; CodeBuddy
  Code / opencode / Codex: project > user) and skills outrank same-level
  commands.
- Every bridge skill provider registers on the **global** skills layer, so
  preset-layer native skills (`.dsh/skills`, `.agents/skills`, runtime skills)
  shadow bridged assets on name conflicts via layer order. Never justify that
  win with rank numbers — the bridge bands numerically outrank runtime skills
  (250) within one layer, and only the layer order saves the precedence.
- Config sections on the `bridges` row are named after the tool
  (`claudeCode`, `codebuddyCode`, `opencode`, `codex`), each with an `enabled`
  master switch and per-bridge knobs.
- Injected-message `source.plugin` ids are per subsystem (`<tool>-memory`,
  `<tool>-hooks`, e.g. `claude-code-memory`, `codebuddy-code-hooks`), and hook
  `tool_name` payloads carry the upstream tool's names (`Bash`, `Edit`, …),
  never dsh's.

## Documentation Conventions

### README

- The two root READMEs are the **user-facing entry point**. Keep them short
  (about one screen) and lead with a quick start that shows the payoff —
  install, run in an existing agent project, show what the user gets — rather
  than a feature list.
- Detailed usage (install & verify, the full config reference, per-bridge
  skills/memory/hooks behavior, limitations) lives in `docs/guides/`; the
  README links there. Development details (build/test commands, smoke tests,
  directory layout) never go into the README — link to `docs/development/`.
- `README.md` (English) and `README_CN.md` (Chinese) must stay in sync: every
  change is made to both, and each starts with a language-switcher header
  (`English | [中文](README_CN.md)` / `[English](README.md) | 中文`) followed
  by the note `> This project is implemented by DeepSeek Harness.` (CN:
  `> 该项目由 DeepSeek Harness 实现。`).
- In prose, always spell out **DeepSeek Harness** — never `dsh`/`DSH`. Keep
  the short form only where it is an identifier: CLI commands (`dsh plugin`,
  `dsh --profile`), the package name `dsh-bridges`, config keys
  (`dsh.profile.bundles`), and paths (`.dsh/skills`).
- Documented behavior must match the code. Example that bit us: dsh's todo
  tool is `todo_write`, so the hook name-mapping tables must map
  `todo_write`→`TodoWrite` — a `todo` entry matches nothing.

### docs/ layout

- `docs/guides/` — user-facing usage guides. English in `README.md`, Chinese
  in `README.zh.md`; the `.zh.md` suffix marks Chinese versions.
- `docs/reference/` — the official upstream docs of each bridge target, kept
  verbatim.
- `docs/development/` — contributor guides (in Chinese), including the
  checklist for adding a new bridge.

### Adding a bridge updates docs in this order

1. `docs/reference/<tool>/` — collect the official upstream specs first.
2. `docs/guides/` — add the tool's section (skills/commands, memory, hooks,
   limitations) and its config block, in both languages.
3. Root READMEs (both languages) — status callout, supported-agents table row,
   and the guides/reference links.

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
