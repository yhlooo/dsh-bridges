# dsh-bridges

English | [中文](README_CN.md)

A [dsh](https://github.com/deepseek-ai/deepseek-harness) (DeepSeek Harness) plugin that bridges dsh into projects already configured for other coding agents, so a project set up for Claude Code, Codex, opencode, or CodeBuddy keeps working when you run dsh on it.

The whole project **is one plugin** — a single bundle row (`id: bridges`) hosting one bridge subsystem per agent tool. Installing `dsh-bridges` once covers every supported tool; each tool's bridge can be toggled independently through config.

> 🚧 **Under construction.** Phase 1: Claude Code. Phase 2 (current): CodeBuddy Code. Codex / opencode bridges are planned for later phases.

## Supported agents

| Agent | Status | Skills / commands | Memory | Hooks |
| :--- | :--- | :--- | :--- | :--- |
| Claude Code | ✅ phase 1 | `.claude/skills`, `.claude/commands` (+ `~/.claude`) | `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md` | `settings.json` hooks (SessionStart, UserPromptSubmit, Pre/PostToolUse(+Failure), Stop, SessionEnd) |
| CodeBuddy Code | ✅ phase 2 | `.codebuddy/skills`, `.codebuddy/commands` (+ `~/.codebuddy`) | `CODEBUDDY.md`, `~/.codebuddy/CODEBUDDY.md`, `.codebuddy/rules/` | `settings.json` hooks (SessionStart, UserPromptSubmit, Pre/PostToolUse(+Failure), Stop, SessionEnd) |
| Codex | 🚧 planned | — | — | — |
| opencode | 🚧 planned | — | — | — |

## Install

Plugins install into a dsh profile with the profile plugin manager (pnpm):

```sh
# from a checkout of this repository (compile src/ → lib/ first):
pnpm install && pnpm build
dsh plugin --profile <name> add .

# or, once published, from the registry package:
dsh plugin --profile <name> add dsh-bridges
```

The plugin manager appends the package to the profile's `dsh.profile.bundles`, and its `cordis.patch.yml` inserts one `bridges` row into the composed tree. Verify with:

```sh
dsh --profile <name> --dump-config   # the row "dsh-bridges" should appear
```

Then start dsh in a project that has agent assets (`.claude/`, `~/.claude/`, `.codebuddy/`, `~/.codebuddy/`); assets are discovered per session workspace.

## Config

Every tool bridge owns a config section under the `bridges` row; a later patch layer (the profile's `cordis.patch.yml`, a `--patch` overlay) can override any field:

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: true               # master switch for the Claude Code bridge
      skills: true                # discover .claude / ~/.claude skills and commands
      memory: true                # inject ~/.claude/CLAUDE.md and .claude/CLAUDE.md
      hooks: true                 # run Claude Code hooks from settings.json
      userClaudeDir: '~/.claude'  # user-level Claude Code directory
      watch: true                 # watch skill roots and republish on change
      hookTimeoutMs: 600000
      userPromptHookTimeoutMs: 30000
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
    codebuddyCode:
      enabled: true                   # master switch for the CodeBuddy Code bridge
      skills: true                    # discover .codebuddy / ~/.codebuddy skills and commands
      memory: true                    # inject CODEBUDDY.md memory and always-apply rules
      hooks: true                     # run CodeBuddy Code hooks from settings.json
      userCodebuddyDir: '~/.codebuddy'  # user-level CodeBuddy Code directory
      watch: true                     # watch skill roots and settings files
      hookTimeoutMs: 60000            # CodeBuddy Code's 60-second hook limit
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
```

## The Claude Code bridge (phase 1)

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
- Precedence mirrors Claude Code: personal assets override project assets; a skill overrides a same-name command at the same level. DSH-native skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win over Claude assets on name conflicts — the bridge registers on the global skills layer, which nearer preset layers shadow.
- Skill bundles keep their directory as the resource base, so supporting files (`scripts/`, `references/`, …) referenced by `SKILL.md` resolve on demand.
- Existing skill roots are watched; edits appear in the session without a restart.

### CLAUDE.md memory

DSH already loads root-level `CLAUDE.md`. The bridge additionally injects `~/.claude/CLAUDE.md` (user) and `.claude/CLAUDE.md` (project) at session start, in the same system-reminder framing dsh uses for workspace instructions, with a 32 KiB budget (the broader user-level file is dropped first; the project file is then truncated if still over budget).

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

- Hooks key on Claude Code tool names. DSH names differ (`bash`, `edit`, `read`, …), so the bridge translates: `bash`→`Bash`, `pwsh`→`PowerShell`, `read`→`Read`, `write`→`Write`, `edit`→`Edit`, `glob`→`Glob`, `grep`→`Grep`, `web`/`web_search`→`WebSearch`, `ask_user_question`→`AskUserQuestion`, `exit_plan_mode`→`ExitPlanMode`, `subagent`→`Agent`, `todo_write`→`TodoWrite`; unknown dsh tools (MCP servers, first-party extras) keep their own name. Matchers, `if` rules, and the `tool_name` field hook scripts receive the translated name, so hooks written for Claude Code run unchanged.
- Matcher semantics follow the Claude Code spec: exact-name sets (`Bash|Edit`), unanchored regex for anything else, `*`/empty matches all.
- The `if` filter supports the common `ToolName(glob)` form against one primary argument field for the mapped tools (`Bash(rm *)`, `Edit(*.ts)`, …); uninterpretable rules and tools without a mapped field fail open, matching Claude Code's best-effort contract (its deeper Bash subcommand analysis is not replicated).
- Timeouts and handler failures fail open (never block the action), as in Claude Code.
- Subagents: `UserPromptSubmit`, `Stop`, `SessionStart`, and `SessionEnd` run only for the main conversation, as in Claude Code; `PreToolUse`/`PostToolUse` also run for subagent tool calls (`SubagentStart`/`SubagentStop` are not bridged yet).

### Phase-1 limitations

Not bridged yet (documented per subsystem):

- **Skills**: nested `.claude/skills/` below the workspace (their qualified names are not kebab-case), enterprise/managed skills, plugin skills, synced claude.ai skills; `allowed-tools`/`disallowed-tools`, `model`, `effort`, `context: fork`/`agent`/`background`, `paths`, `shell`, and `$ARGUMENTS` substitution in bodies; skill/agent frontmatter `hooks`.
- **Memory**: `.claude/rules/*.md`, CLAUDE.md `@import`s, and nested CLAUDE.md files.
- **Hooks**: handler types `mcp_tool`, `prompt`, `agent`; `PreCompact`/`PostCompact`, `Notification`, `SubagentStart`/`SubagentStop`, `PermissionRequest`/`PermissionDenied`, and the remaining async events; `CLAUDE_ENV_FILE`; `asyncRewake`; `updatedInput` rewriting (dsh freezes tool arguments before policy); `permissionDecision: "defer"` (mapped to deny).

## The CodeBuddy Code bridge (phase 2)

### Skills and commands

Reads the CodeBuddy Code skill locations and registers them on dsh's skill registry (provider `codebuddy-code`), so they appear in the model-facing skill catalog, load through the `skill` tool, and are invocable with `/name`:

| CodeBuddy Code location | Registered as |
| :--- | :--- |
| `.codebuddy/skills/<name>/SKILL.md` | project-level skill |
| `.codebuddy/commands/<name>.md` | project-level command (a skill) |
| `~/.codebuddy/skills/<name>/SKILL.md` | user-level skill |
| `~/.codebuddy/commands/<name>.md` | user-level command (a skill) |

Mapping rules:

- The DSH skill name is the directory / file name (must be kebab-case; non-kebab names are skipped with a warning). Nested commands qualify as `group:name` — not kebab-case — and are skipped the same way.
- Only directory skills (`SKILL.md` inside a named directory) are read; flat `<name>.md` skills are a Claude Code extension that CodeBuddy Code does not document.
- Precedence mirrors CodeBuddy Code: **project assets override user assets** (the inverse of Claude Code, whose band the ranks therefore do not share), and a skill overrides a same-name command at the same level. DSH-native skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win on name conflicts — the bridge registers on the global skills layer, which nearer preset layers shadow.
- `description` + `when_to_use` become the skill description (combined and capped at 1,536 characters; falls back to the first body paragraph). `when_to_use` is not in the CodeBuddy Code docs but is honored for Claude Code asset compatibility.
- `disable-model-invocation` → the skill leaves the model catalog but stays user-invocable (`/name`). `user-invocable: false` → hidden from human invocation, model-only. `metadata` is carried through.
- The `skillOverrides` setting is applied on top: `name-only` collapses the description, `user-invocable-only` hides the skill from the model catalog, `off` hides it everywhere. Most-specific valid value wins (local > project > user), invalid values fall back per file, exactly like CodeBuddy Code.
- Skill bundles keep their directory as the resource base, so supporting files (`scripts/`, `references/`, …) referenced by `SKILL.md` resolve on demand.
- Existing skill roots and the settings files are watched; edits appear in the session without a restart.

### CODEBUDDY.md memory

DSH's own loader reads `AGENTS.md` and `CLAUDE.md`, not CodeBuddy Code's memory files. The bridge injects at session start, in the same system-reminder framing dsh uses for workspace instructions:

- `~/.codebuddy/CODEBUDDY.md` (user memory) and `~/.codebuddy/rules/**` (user rules, recursive — only rules that always apply)
- `<cwd>/CODEBUDDY.md` and `<cwd>/.codebuddy/CODEBUDDY.md` (project memory; identical content collapses to one block)
- `<cwd>/CODEBUDDY.local.md` (local project memory)
- `<cwd>/.codebuddy/rules/**` (project rules, recursive — only rules that always apply)

Budget 32 KiB: broader user-level sections are dropped first, then the most specific ones are truncated. Rule frontmatter is stripped from injected content; `enabled: false` and `alwaysApply: false` rules are skipped.

### Hooks

Loads the merged `hooks` field from `~/.codebuddy/settings.json` → `.codebuddy/settings.json` → `.codebuddy/settings.local.json` (groups merge additively, identical handlers deduplicate, `disableAllHooks` comes from the most specific source that sets it) and runs handlers at the DSH lifecycles below:

| CodeBuddy Code event | DSH seam | Decision mapping |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext` (and exit-0 plain stdout) injected before the first prompt; matcher sees `startup`/`resume`/`clear`/`compact` |
| `UserPromptSubmit` | `agent/pre-step` | exit 2 / `continue: false` erase the prompt and show the reason; context is appended to the step |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision` `deny` → deny, `ask` → approval, `allow` → allow; exit 2 → deny with the stdout-first message; `modifiedInput` is logged and ignored |
| `PostToolUse` | `tools/post-execute` | `additionalContext`/exit-2 message/legacy `decision: "block"` reason → context next to the result; `updatedToolOutput` replaces the rendered content |
| `PostToolUseFailure` | `tools/post-execute` (error results) | same as PostToolUse |
| `Stop` | `agent/turn-stopping` | exit 2 / `continue: false` / `additionalContext` steer a continuation (`stop_hook_active` set on repeats; capped at 8 consecutive continuations as a bridge safety valve) |
| `SessionEnd` | `agent/disposed` | side effects only (1.5 s budget, `reason: "other"`) |

Supported handler types: `command` (shell form and `args` exec form, `${CODEBUDDY_PROJECT_DIR}` substitution, per-handler `timeout` defaulting to CodeBuddy Code's 60 s, `async: true`, `once: true`, exit codes and JSON output per the CodeBuddy Code contract) and `http` (`method` POST/PUT/PATCH, `headers`; CodeBuddy Code documents no URL allowlist, so none is applied).

Compatibility details:

- Hooks key on CodeBuddy Code tool names. DSH names differ (`bash`, `edit`, `read`, …), so the bridge translates: `bash`→`Bash`, `pwsh`→`PowerShell`, `read`→`Read`, `write`→`Write`, `edit`→`Edit`, `glob`→`Glob`, `grep`→`Grep`, `web`/`web_search`→`WebSearch`, `ask_user_question`→`AskUserQuestion`, `exit_plan_mode`→`ExitPlanMode`, `subagent`→`Task`, `todo_write`→`TodoWrite`; unknown dsh tools (MCP servers, first-party extras) keep their own name. Matchers, `if` rules, and the `tool_name` field hook scripts receive the translated name, so hooks written for CodeBuddy Code run unchanged.
- Matcher semantics follow the CodeBuddy Code spec: `*`/empty/omitted matches all; anything else is a case-sensitive regular expression, so a plain `Write` also matches `NotebookWrite` and `^Write$` pins an exact match.
- Blocking messages follow CodeBuddy Code's exit-2 priority: stdout JSON `reason`/`stopReason`, then plain stdout, then stderr as fallback (the inverse of Claude Code's stderr-first behavior).
- The `if` filter supports the common `ToolName(glob)` form against one primary argument field for the mapped tools (`Bash(git *)`, `Edit(*.ts)`, …); uninterpretable rules and tools without a mapped field fail open.
- Timeouts and handler failures fail open (never block the action), as in CodeBuddy Code.
- Subagents: `UserPromptSubmit`, `Stop`, `SessionStart`, and `SessionEnd` run only for the main conversation, as in CodeBuddy Code; `PreToolUse`/`PostToolUse` also run for subagent tool calls (`SubagentStart`/`SubagentStop` are not bridged yet).

### Phase-2 limitations

Not bridged yet (documented per subsystem):

- **Skills**: flat `.md` skills, nested commands (`group:name` names are not kebab-case), plugin skills; `allowed-tools`, `model`, `context: fork`, `agent`, and skill frontmatter `hooks`; inline shell-command execution, `$ARGUMENTS` substitution, and `@file` references in bodies.
- **Memory**: conditional rules (`alwaysApply: false` plus `paths`), `@import` expansion, upward-directory discovery, nested-subtree dynamic loading, Auto Memory.
- **Hooks**: handler types `prompt` and `agent` (both need an LLM evaluation); `Notification`, `SubagentStart`/`SubagentStop`, `PreCompact`/`PostCompact`, `PermissionRequest`/`PermissionDenied`, `Elicitation`, `FileChanged`, `Setup`, and the remaining events; frontmatter hooks (and the `allowUntrustedFrontmatterHooks` gate); plugin `hooks/hooks.json`; the `transcript_path` input field (the bridge has no transcript file to point at); `suppressOutput`/`systemMessage` user-only channels (dsh has no non-model notice channel); `modifiedInput` rewriting (dsh freezes tool arguments before policy). Windows runs hooks through the system shell rather than CodeBuddy Code's forced Git Bash.

## Layout

```
src/
├── index.ts                 # plugin entry: single bundle row, per-agent config, subsystem registry
├── util.ts / fs-adapter.ts  # shared by every bridge subsystem
└── agents/
    ├── claude-code/         # one directory per supported agent tool
    │   ├── index.ts         # subsystem registration: skills, memory, hooks
    │   ├── skills/          # the claude-code skill provider
    │   ├── memory.ts        # CLAUDE.md memory injection
    │   └── hooks/           # settings merge, matcher, runner, DSH lifecycle wiring
    └── codebuddy-code/      # the CodeBuddy Code subsystem
        ├── index.ts         # subsystem registration: skills, memory, hooks
        ├── settings.ts      # shared settings loader (hooks, env, skillOverrides)
        ├── skills/          # the codebuddy-code skill provider
        ├── memory.ts        # CODEBUDDY.md memory + rules injection
        └── hooks/           # matcher, runner, DSH lifecycle wiring
```

Adding an agent tool means adding `src/agents/<tool>/` and one line in `registerBridgeSubsystems()`; the single bundle row already covers it.

## Development

```sh
pnpm install
pnpm build    # compile src/ → lib/
pnpm test     # vitest unit tests
```

End-to-end smoke test (installs the plugin into the headless profile and runs it in a fixture project):

```sh
dsh plugin --profile headless add .
cd /tmp/claude-fixture      # any project with .claude/ assets
dsh --profile headless "list the skills available in your catalog"
cd /tmp/codebuddy-fixture   # any project with .codebuddy/ assets
dsh --profile headless "list the skills available in your catalog"
```

Reference materials for each bridge target live in [`docs/reference/`](docs/reference/), including the official Claude Code and CodeBuddy Code skills/commands/hooks specs used so far. Contributor documentation — how to add a new agent tool, the DSH integration surface, and known pitfalls — lives in [`docs/development/`](docs/development/).
