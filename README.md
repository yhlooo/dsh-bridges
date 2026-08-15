# dsh-bridges

A [dsh](https://github.com/deepseek-ai/deepseek-harness) (DeepSeek Harness) plugin that bridges dsh into projects already configured for other coding agents, so a project set up for Claude Code, Codex, opencode, or CodeBuddy keeps working when you run dsh on it.

> 🚧 **Under construction.** Phase 1 (current): Claude Code compatibility. Codex / opencode / CodeBuddy bridges are planned for later phases.

## Packages

| Package | Status | What it bridges |
| :--- | :--- | :--- |
| [`@dsh-bridges/claude-code`](packages/claude-code) | ✅ phase 1 | Claude Code **skills**, **commands**, **hooks**, and **CLAUDE.md memory** |

## Install

Plugins install into a dsh profile with the profile plugin manager (pnpm):

```sh
# from a checkout of this repository:
dsh plugin --profile <name> add ./packages/claude-code

# or from a published tarball / registry package:
dsh plugin --profile <name> add @dsh-bridges/claude-code
```

The plugin manager appends the package to the profile's `dsh.profile.bundles`, and its `cordis.patch.yml` inserts one `claude-code` bridge row into the composed tree. Verify with:

```sh
dsh --profile <name> --dump-config   # the row "@dsh-bridges/claude-code" should appear
```

Then start dsh in a project that has Claude Code assets (`.claude/`, `~/.claude/`); the assets are discovered per session workspace.

## What the Claude Code bridge does

### Skills and commands

Reads the Claude Code skill locations and registers them on dsh's skill registry (provider `claude-code`), so they appear in the model-facing skill catalog, load through the `skill` tool, and are invocable with `/name`:

| Claude Code location | Registered as |
| :--- | :--- |
| `~/.claude/skills/<name>/SKILL.md` (also flat `<name>.md`) | user-level skill |
| `~/.claude/commands/<name>.md` | user-level command (a skill) |
| `.claude/skills/<name>/SKILL.md` (also flat `<name>.md`) | project-level skill |
| `.claude/commands/<name>.md` | project-level command (a skill) |

Mapping rules:

- The DSH skill name is the directory / file name (must be kebab-case; non-kebab names are skipped with a warning).
- `description` + `when_to_use` become the skill description (combined and capped at Claude Code's 1,536-character listing limit; falls back to the first body paragraph when `description` is absent).
- `disable-model-invocation` → the skill leaves the model catalog but stays user-invocable (`/name`).
- `user-invocable: false` → hidden from human invocation, model-only.
- `metadata` is carried through; other frontmatter fields (see limitations) are currently ignored.
- Precedence mirrors Claude Code: personal assets override project assets; a skill overrides a same-name command at the same level. DSH-native skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win over Claude assets on name conflicts.
- Skill bundles keep their directory as the resource base, so supporting files (`scripts/`, `references/`, …) referenced by `SKILL.md` resolve on demand.
- Existing skill roots are watched; edits appear in the session without a restart.

### CLAUDE.md memory

DSH already loads root-level `CLAUDE.md`. The bridge additionally injects `~/.claude/CLAUDE.md` (user) and `.claude/CLAUDE.md` (project) at session start, in the same system-reminder framing dsh uses for workspace instructions, with a 32 KiB budget (broader files dropped first).

### Hooks

Loads the merged `hooks` field from `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` (groups merge additively, identical handlers deduplicate, `disableAllHooks` comes from the most specific source that sets it) and runs handlers at the DSH lifecycles below:

| Claude Code event | DSH seam | Decision mapping |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext` (and exit-0 plain stdout) injected before the first prompt |
| `UserPromptSubmit` | `agent/pre-step` | `decision: "block"` / exit 2 / `continue: false` erase the prompt and show the reason; context is appended to the step |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision` `deny` → deny, `ask` → approval, `allow` → allow, `defer` → deny (not supported); exit 2 → deny with stderr |
| `PostToolUse` | `tools/post-execute` | `additionalContext`/`decision: "block"` reason/exit-2 stderr → context next to the result; `updatedToolOutput` replaces the rendered content |
| `PostToolUseFailure` | `tools/post-execute` (error results) | same as PostToolUse |
| `Stop` | `agent/turn-stopping` | `decision: "block"` / exit 2 / `additionalContext` steer a continuation, capped at Claude Code's 8 consecutive continuations |
| `SessionEnd` | `agent/disposed` | side effects only (1.5 s budget) |

Supported handler types: `command` (shell form and `args` exec form, `${CLAUDE_PROJECT_DIR}` substitution, per-handler `timeout`, `async: true`, exit codes and JSON output per the Claude Code contract) and `http` (POST of the same JSON, header env-var interpolation under `allowedEnvVars`/`httpHookAllowedEnvVars`, `allowedHttpHookUrls` allowlist).

Compatibility details:

- Hooks key on Claude Code tool names. DSH names differ (`bash`, `edit`, `read`, …), so the bridge translates: `bash`→`Bash`, `pwsh`→`PowerShell`, `read`→`Read`, `write`→`Write`, `edit`→`Edit`, `glob`→`Glob`, `grep`→`Grep`, `web`/`web_search`→`WebSearch`, `ask_user_question`→`AskUserQuestion`, `exit_plan_mode`→`ExitPlanMode`, `subagent`→`Agent`, `todo`→`TodoWrite`. Matchers, `if` rules, and the `tool_name` field hook scripts receive the Claude Code name, so hooks written for Claude Code run unchanged.
- Matcher semantics follow the Claude Code spec: exact-name sets (`Bash|Edit`), unanchored regex for anything else, `*`/empty matches all.
- The `if` filter supports the common `ToolName(glob)` form against one primary argument per tool (`Bash(rm *)`, `Edit(*.ts)`, …) and fails open when uninterpretable, matching Claude Code's best-effort contract (its deeper Bash subcommand analysis is not replicated).
- Timeouts and handler failures fail open (never block the action), as in Claude Code.

## Phase-1 limitations

Not bridged yet (documented per subsystem):

- **Skills**: nested `.claude/skills/` below the workspace (their qualified names are not kebab-case), enterprise/managed skills, plugin skills, synced claude.ai skills; `allowed-tools`/`disallowed-tools`, `model`, `effort`, `context: fork`/`agent`/`background`, `paths`, `shell`, and `$ARGUMENTS` substitution in bodies; skill/agent frontmatter `hooks`.
- **Memory**: `.claude/rules/*.md`, CLAUDE.md `@import`s, and nested CLAUDE.md files.
- **Hooks**: handler types `mcp_tool`, `prompt`, `agent`; `PreCompact`/`PostCompact`, `Notification`, `SubagentStart`/`SubagentStop`, `PermissionRequest`/`PermissionDenied`, and the remaining async events; `CLAUDE_ENV_FILE`; `asyncRewake`; `updatedInput` rewriting (dsh freezes tool arguments before policy); `permissionDecision: "defer"` (mapped to deny). `PreToolUse` hooks also run for subagent tool calls, matching Claude Code.

## Development

```sh
pnpm install
pnpm build    # compile packages/*/src → lib
pnpm test     # vitest unit tests
```

End-to-end smoke test (installs the bridge into the headless profile and runs it in a fixture project):

```sh
dsh plugin --profile headless add ./packages/claude-code
cd /tmp/claude-fixture   # any project with .claude/ assets
dsh --profile headless "list the skills available in your catalog"
```

Reference materials for each bridge target live in [`docs/reference/`](docs/reference/), including the official Claude Code skills/commands/hooks specs used for phase 1.
