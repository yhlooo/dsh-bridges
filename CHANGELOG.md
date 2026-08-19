# Changelog

All notable changes to this project are documented in this file.

## 0.2.4 - 2026-08-19

### Added

- The `claude-code` and `codebuddy-code` example projects' `UserPromptSubmit` hooks now also inject one line of context next to the submitted prompt, demonstrating the exit-0 plain-stdout context path (`examples/`).

### Changed

- Injected messages now carry an explicit `dsh-bridges:` source id: hook messages use `dsh-bridges:<tool>-hooks/<event>` (e.g. `dsh-bridges:claude-code-hooks/UserPromptSubmit`); memory messages name the bridged asset (`dsh-bridges:CLAUDE.md`, `dsh-bridges:AGENTS.md`, `dsh-bridges:CODEBUDDY.md`, `dsh-bridges:GEMINI.md`, `dsh-bridges:.cursor/rules`, `dsh-bridges:references`). The Web GUI renders this id next to the "Context injection" label.
- Instruction files DeepSeek Harness's own loader already reads are no longer injected twice: `AGENTS.md` / `CLAUDE.md` and their `.local` variants at every directory from the project root down to the working directory are left to the core loader (claude-code, codex, pi, and opencode memory bridges).

## 0.2.3 - 2026-08-17

### Fixed

- `capString` could return more characters than the requested maximum; hook output capping now stays within `maxChars`.

## 0.2.2 - 2026-08-17

### Added

- `probe:upstream` now tracks Pi's npm distribution (`scripts/upstream-probe.mjs`).

### Changed

- Usage guides restructured into per-tool pages with a shared index (`docs/guides/`); tool names capitalized per official spelling (OpenCode, Pi).

### Fixed

- MCP server reconciliation: corrected change detection and the session-cwd fallback.
- Hook runners: async hooks receive the JSON payload on stdin and their pipes are drained; timed-out output is discarded instead of parsed; `defer` decisions map to approval.
- Cursor hooks: handler matchers are preserved, and user-level hooks run from the config directory.
- OpenCode permissions: the built-in `.env` read-deny rule is kept under wildcard rules.

## 0.2.1 - 2026-08-16

### Added

- Nested skills and commands map onto kebab-case `group-name` skills: Claude Code nested commands, CodeBuddy Code nested skills and commands, and Gemini CLI nested namespaced commands.

## 0.2.0 - 2026-08-16

### Added

- Initial release: bridges for Claude Code, CodeBuddy Code, OpenCode, Codex, Pi, Gemini CLI, and Cursor — skills/commands, memory, hooks, permission rules, MCP servers, and subagent definitions are discovered from each tool's project and user-level locations and bridged into DeepSeek Harness.
- Example projects for every bridged tool (`examples/`), per-tool usage guides (`docs/guides/`), and upstream reference material (`docs/reference/`).
