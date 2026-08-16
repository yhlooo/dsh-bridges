# dsh-bridges usage guide

[中文](README.zh.md)

The detailed usage documentation for every bridge: install and verify, the full
configuration reference, and per-tool behavior (skills/commands, memory,
hooks) with its limitations. For a quick start, see the
[root README](../../README.md).

## Install

Plugins install into a DeepSeek Harness profile with the profile plugin manager (pnpm); `<profile-name>` is `web` (the Web UI) or `headless` (one-shot CLI runs), and each profile installs its own plugins:

```sh
# from a checkout of this repository (compile src/ → lib/ first):
pnpm install && pnpm build
dsh plugin --profile <profile-name> add .

# or, once published, from a tarball / registry package:
dsh plugin --profile <profile-name> add dsh-bridges
```

The plugin manager appends the package to the profile's `dsh.profile.bundles`, and its `cordis.patch.yml` inserts one `bridges` row into the composed tree. Verify with:

```sh
dsh --profile <profile-name> --dump-config   # the row "dsh-bridges" should appear
```

Then start DeepSeek Harness in a project that has agent assets — `.claude/`, `.codebuddy/`, `.opencode/`, `.agents/skills/`, `.codex/`, `.pi/`, `.gemini/`, or `.cursor/` (plus their user-level counterparts, e.g. `~/.claude/`, `~/.gemini/`, `~/.cursor/`); assets are discovered per session workspace.

A complete example project exists for each supported agent tool
([`examples/`](../../examples/)): open one as the session workspace to observe
its skills, memory, and hooks being bridged; each directory's README describes
the verification steps.

## Config

Every tool bridge owns a config section under the `bridges` row; a later patch layer (the profile's `cordis.patch.yml`, a `--patch` overlay) can override any field:

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: true               # master switch for the Claude Code bridge
      skills: true                # discover .claude / ~/.claude skills and commands
      agents: true                # discover .claude / ~/.claude subagent definitions
      memory: true                # inject ~/.claude/CLAUDE.md and .claude/CLAUDE.md
      hooks: true                 # run Claude Code hooks from settings.json
      permissions: true           # enforce permissions.allow/ask/deny rules from settings.json
      mcp: true                    # bridge .mcp.json / ~/.claude.json MCP servers
      userClaudeDir: '~/.claude'  # user-level Claude Code directory
      watch: true                 # watch skill roots and republish on change
      hookTimeoutMs: 600000
      userPromptHookTimeoutMs: 30000
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    codebuddyCode:
      enabled: true                   # master switch for the CodeBuddy Code bridge
      skills: true                    # discover .codebuddy / ~/.codebuddy skills and commands
      agents: true                     # discover .codebuddy / ~/.codebuddy subagent definitions
      mcp: true                        # bridge .mcp.json / ~/.codebuddy/.mcp.json MCP servers
      memory: true                    # inject CODEBUDDY.md memory and always-apply rules
      hooks: true                     # run CodeBuddy Code hooks from settings.json
      permissions: true               # enforce permissions.allow/ask/deny rules from settings.json
      userCodebuddyDir: '~/.codebuddy'  # user-level CodeBuddy Code directory
      watch: true                     # watch skill roots and settings files
      hookTimeoutMs: 60000            # CodeBuddy Code's 60-second hook limit
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    opencode:
      enabled: true                   # master switch for the opencode bridge
      skills: true                    # discover .opencode / ~/.config/opencode skills and commands (+ JSON commands)
      memory: true                    # inject AGENTS.md rules (with CLAUDE.md fallback) and instructions files
      permissions: true               # enforce permission rules from opencode.json(c)
      mcp: true                       # bridge opencode.json(c) mcp servers
      userOpencodeDir: '~/.config/opencode'  # user-level opencode directory
      userClaudeDir: '~/.claude'      # user-level Claude Code directory for the CLAUDE.md fallback
      claudeCompat: true              # honor opencode's Claude Code compatibility fallbacks
      watch: true                     # watch asset roots and config files
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    codex:
      enabled: true                   # master switch for the Codex bridge
      skills: true                    # discover .agents/skills (cwd → repo root), ~/.agents/skills, /etc/codex/skills
      memory: true                    # inject the AGENTS.md instruction chain
      hooks: true                     # run Codex hooks from hooks.json / config.toml
      permissions: true               # apply approval_policy / sandbox_mode / default_permissions at session start
      mcp: true                       # bridge config.toml [mcp_servers] entries
      userCodexDir: '~/.codex'        # user-level Codex directory (CODEX_HOME wins when set)
      userSkillsDir: '~/.agents/skills'  # user-level skills directory
      watch: true                     # watch skill roots and settings files
      hookTimeoutMs: 600000           # Codex's 600-second hook default
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    pi:
      enabled: true                   # master switch for the pi bridge
      skills: true                    # discover .pi / ~/.pi/agent skills and prompt templates
      memory: true                    # inject the AGENTS.md / CLAUDE.md chain and APPEND_SYSTEM.md
      userPiDir: '~/.pi/agent'        # user-level pi config directory (PI_CODING_AGENT_DIR wins when set)
      watch: true                     # watch skill roots, settings files, and trust.json
      memoryMaxBytes: 32768
    geminiCli:
      enabled: true                   # master switch for the Gemini CLI bridge
      skills: true                    # discover .gemini / ~/.gemini skills and commands
      agents: true                    # discover .gemini / ~/.gemini subagent definitions
      memory: true                    # inject the GEMINI.md chain (with @imports)
      hooks: true                     # run Gemini hooks from settings.json
      permissions: true               # enforce ~/.gemini/policies/*.toml rules
      mcp: true                       # bridge settings.json mcpServers
      userGeminiDir: '~/.gemini'      # user-level Gemini directory (GEMINI_CLI_HOME wins when set)
      watch: true                     # watch skill roots and settings files
      hookTimeoutMs: 60000            # Gemini's 60-second hook default (milliseconds)
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    cursor:
      enabled: true                   # master switch for the Cursor bridge
      skills: true                    # discover .cursor / ~/.cursor skills
      agents: true                    # discover .cursor / ~/.cursor subagent definitions
      memory: true                    # inject .cursor/rules always-apply rules and subdirectory AGENTS.md
      hooks: true                     # run Cursor hooks from hooks.json
      permissions: true               # enforce cli.json / cli-config.json permission rules
      mcp: true                       # bridge .cursor/mcp.json / ~/.cursor/mcp.json servers
      userCursorDir: '~/.cursor'      # user-level Cursor directory (CURSOR_CONFIG_DIR wins when set)
      watch: true                     # watch skill roots and config files
      hookTimeoutMs: 30000            # Cursor's 30-second hook default (milliseconds)
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## The Claude Code bridge

### Skills and commands

Reads the Claude Code skill locations and registers them on the DeepSeek Harness skill registry (provider `claude-code`), so they appear in the model-facing skill catalog, load through the `skill` tool, and are invocable with `/name`:

| Claude Code location | Registered as |
| :--- | :--- |
| `~/.claude/skills/<name>/SKILL.md` (also flat `<name>.md`) | user-level skill |
| `~/.claude/commands/<name>.md` | user-level command (a skill) |
| `~/.claude/commands/<group>/<name>.md` | user-level command (a skill) named `group-name` |
| `.claude/skills/<name>/SKILL.md` (also flat `<name>.md`) | project-level skill |
| `.claude/commands/<name>.md` | project-level command (a skill) |
| `.claude/commands/<group>/<name>.md` | project-level command (a skill) named `group-name` |

Mapping rules:

- The DeepSeek Harness skill name is the directory / file name (must be kebab-case; non-kebab names are skipped with a warning).
- Nested command files are discovered recursively: the upstream slash command `/group:name` (e.g. `/opsx:explore` for `commands/opsx/explore.md`) maps onto the kebab-case skill name `group-name` (`opsx-explore`), because DeepSeek Harness skill names cannot contain `:`. A flat `group-name.md` and a nested `group/name.md` collide on the same skill name — the registry keeps whichever candidate it discovers first. Command directories are always command groups, never skill bundles, even when they contain a `SKILL.md`.
- `description` + `when_to_use` become the skill description (combined and capped at Claude Code's 1,536-character listing limit; falls back to the first body paragraph when `description` is absent).
- `disable-model-invocation` → the skill leaves the model catalog but stays user-invocable (`/name`).
- `user-invocable: false` → hidden from human invocation, model-only.
- `metadata` is carried through; other frontmatter fields (see limitations) are currently ignored.
- Precedence mirrors Claude Code: personal assets override project assets; a skill overrides a same-name command at the same level. Native DeepSeek Harness skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win over Claude assets on name conflicts — the bridge registers on the global skills layer, which nearer preset layers shadow.
- Skill bundles keep their directory as the resource base, so supporting files (`scripts/`, `references/`, …) referenced by `SKILL.md` resolve on demand.
- Existing skill roots are watched; edits appear in the session without a restart.

### CLAUDE.md memory

DeepSeek Harness already loads root-level `CLAUDE.md`. The bridge additionally injects at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions, broadest first:

- `~/.claude/CLAUDE.md` (user)
- every ancestor directory's `CLAUDE.md` and `CLAUDE.local.md` above the working directory (filesystem-root first, `CLAUDE.local.md` after `CLAUDE.md` per directory — Claude Code's hierarchy order)
- the `CLAUDE.md` / `CLAUDE.local.md` files under `permissions.additionalDirectories`
- `.claude/CLAUDE.md` (project)
- the `outputStyle` file (`.claude/output-styles/<name>.md`, falling back to `~/.claude/output-styles/<name>.md` — a degraded mapping that injects the style's prompt section as context)
- the cwd-level `CLAUDE.local.md` (personal, gitignored)

Budget 32 KiB: the broader user-level file is dropped first, then the most specific sections are truncated. Files identical to the root `CLAUDE.md` DeepSeek Harness already loaded are skipped to avoid duplicate blocks.

### Hooks

Loads the merged `hooks` field from `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` (groups merge additively, identical handlers deduplicate, `disableAllHooks` comes from the most specific source that sets it) and runs handlers at the DeepSeek Harness lifecycles below:

| Claude Code event | DeepSeek Harness seam | Decision mapping |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext` (and exit-0 plain stdout) injected before the first prompt |
| `UserPromptSubmit` | `agent/pre-step` | `decision: "block"` / exit 2 / `continue: false` erase the prompt and show the reason; context is appended to the step |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision` `deny` → deny, `ask` → approval, `allow` → allow and skip further permission checks (deny/ask permission rules are still evaluated — see Permissions), `defer` → deny (not supported); exit 2 → deny with stderr; `additionalContext` is injected |
| `PostToolUse` | `tools/post-execute` | `additionalContext`/`decision: "block"` reason/exit-2 stderr → context next to the result; `updatedToolOutput` replaces the rendered content |
| `PostToolUseFailure` | `tools/post-execute` (error results) | same as PostToolUse |
| `Stop` | `agent/turn-stopping` | `decision: "block"` / exit 2 / `additionalContext` steer a continuation, capped at Claude Code's 8 consecutive continuations |
| `SubagentStart` | `agent/session-start` (subagent sessions) | `additionalContext` (and exit-0 plain stdout) injected into the subagent; the matcher sees `generic` (DeepSeek Harness subagents carry no upstream agent type, so `*` matchers run and specific ones cannot match) |
| `SubagentStop` | `agent/turn-stopping` (subagent sessions) | `decision: "block"` / exit 2 / `additionalContext` steer a continuation, capped at Claude Code's 8 consecutive continuations |
| `SessionEnd` | `agent/disposed` | side effects only (1.5 s budget) |

Supported handler types: `command` (shell form and `args` exec form, `${CLAUDE_PROJECT_DIR}` substitution, per-handler `timeout`, `async: true`, exit codes and JSON output per the Claude Code contract) and `http` (POST of the same JSON, header env-var interpolation under `allowedEnvVars`/`httpHookAllowedEnvVars`, `allowedHttpHookUrls` allowlist).

Compatibility details:

- Hooks key on Claude Code tool names. DeepSeek Harness names differ (`bash`, `edit`, `read`, …), so the bridge translates: `bash`→`Bash`, `pwsh`→`PowerShell`, `read`→`Read`, `write`→`Write`, `edit`→`Edit`, `glob`→`Glob`, `grep`→`Grep`, `web`/`web_search`→`WebSearch`, `ask_user_question`→`AskUserQuestion`, `exit_plan_mode`→`ExitPlanMode`, `subagent`→`Agent`, `todo_write`→`TodoWrite`; unknown DeepSeek Harness tools (MCP servers, first-party extras) keep their own name. Matchers, `if` rules, and the `tool_name` field hook scripts receive the translated name, so hooks written for Claude Code run unchanged.
- Matcher semantics follow the Claude Code spec: exact-name sets (`Bash|Edit`), unanchored regex for anything else, `*`/empty matches all.
- The `if` filter supports the common `ToolName(glob)` form against one primary argument field for the mapped tools (`Bash(rm *)`, `Edit(*.ts)`, …); uninterpretable rules and tools without a mapped field fail open, matching Claude Code's best-effort contract (its deeper Bash subcommand analysis is not replicated).
- Timeouts and handler failures fail open (never block the action), as in Claude Code.
- Subagents: `UserPromptSubmit`, `Stop`, `SessionStart`, and `SessionEnd` run only for the main conversation, and `SubagentStart`/`SubagentStop` run only for subagent sessions — matching Claude Code's scoping. `PreToolUse`/`PostToolUse` also run for subagent tool calls.

### Permissions

Reads the `permissions.allow/ask/deny` rules from the same settings files (merged additively across scopes, deduplicated) and enforces them at the `tools/pre-execute` seam with Claude Code's semantics:

- Rule grammar: `Tool` or `Tool(specifier)`; tool names accept globs (`*`, `mcp__*`). Evaluation order is **deny → ask → allow**; the first match decides regardless of specificity.
- `Bash(...)` matches by command prefix (`Bash(npm run *)` matches `npm run build`; prefix matching keeps the bypass caveats the upstream docs call out, e.g. via `sudo` or pipes).
- `Read`/`Edit`/`Write` match path globs: `//path` absolute, `/path` project-relative, `~` home-relative, `./` project-relative; `permissions.additionalDirectories` also resolve `./`-style rules. Both rule and argument paths are normalized to absolute paths before comparing.
- `WebFetch(domain:example.com)` / `domain:*.example.com` matches the URL hostname (subdomain suffix); without the `domain:` prefix the whole URL is glob-matched.
- Hooks and rules compose per the upstream contract: PreToolUse hooks run first; a hook `deny` denies outright; **deny/ask rules are always evaluated — a hook `allow` cannot override a matching deny rule, and a matching ask rule still prompts**; when hooks stay silent the rules decide (deny → deny, ask → approval, allow → allow), and with no rule match the call falls back to DeepSeek Harness's own approval policy.
- Rules apply to main-conversation and subagent tool calls alike (upstream permission settings are inherited by subagents).
- Calls matching no rule keep their existing behavior; with `hooks: false` the rules still apply (the `permissions` and `hooks` switches are independent).

Not bridged (recorded as limitations): `permissions.defaultMode` and `permissions.disableBypassPermissionsMode` are read but not enforced — DeepSeek Harness owns its approval modes and the bridge has no seam to switch them; project `.claude/settings.json` allow rules apply without the workspace-trust gate upstream requires for them (the bridge has no trust state; deny/ask rules are not trust-gated upstream either).

### Subagents

Reads `.claude/agents/*.md` and `~/.claude/agents/*.md` (personal overrides project, as for Claude skills) and registers each custom subagent definition as a skill named by its frontmatter `name` (`description` required, exactly as upstream; kebab-case enforced, `plugin:name`-scoped names skipped). The skill body carries the upstream system prompt verbatim plus a delegation spec telling the model which inline `subagent`-tool parameters to pass:

- frontmatter `name` → skill name and delegation `label`
- the system-prompt body → `persona`
- `tools` → `toolFilter.allow`, `disallowedTools` → `toolFilter.deny` (upstream tool names translated to DeepSeek Harness names; unknown entries dropped with a warning)
- `model` (other than `inherit`) → `agentOptions.model`
- `maxTurns` → `maxDepth` (approximation)

DeepSeek Harness has no named-subagent registry — the skill instructs the model to delegate inline with those parameters. Not bridged (recorded as limitations): `permissionMode`, `skills`, `mcpServers`, `hooks`, `memory` (and `.claude/agent-memory*`/`~/.claude/agent-memory`), `background`, `effort`, `isolation`, `color`, `initialPrompt`; a native named-subagent registry is a core-side enhancement candidate.

### MCP servers

Bridges Claude Code's MCP servers into DeepSeek Harness tools. Reads `~/.claude.json` `mcpServers` (user scope, always connected) and `<cwd>/.mcp.json` (project scope) — a project server overrides a same-name user server, as in Claude Code. Each server becomes one dynamically instantiated `@deepseek-ai/dsh-mcp-client` plugin whose tools register as `mcp__claude__<server>__<tool>`; instances are keyed by workspace, reconciled at session start, and re-reconciled when the config files change.

- stdio entries (`command` / `args` / `env` / `cwd`) map onto the stdio transport; `type: "http"` / `"sse"` entries with a `url` map onto the streamable-http transport (SSE degrades, a warning is logged). `${VAR}` references in `env` expand from the process environment.
- Project `.mcp.json` servers need approval upstream (`enableAllProjectMcpServers` / `enabledMcpjsonServers`); unapproved project servers are skipped with a warning instead of being silently connected, and `disabledMcpjsonServers` always skips — matching Claude Code's connect-on-approval behavior.
- Startup failures fail open (warn + skip the server). Server names are namespaced (`claude__<name>`, sanitized to `[A-Za-z0-9_-]`, capped at 32 characters).

### Limitations

Not bridged yet (documented per subsystem):

- **Skills**: nested `.claude/skills/` below the workspace (their qualified names are not kebab-case), enterprise/managed skills, plugin skills, synced claude.ai skills; `allowed-tools`/`disallowed-tools`, `model`, `effort`, `context: fork`/`agent`/`background`, `paths`, `shell`, and `$ARGUMENTS` substitution in bodies; the display-only frontmatter `name`/`argument-hint`/`arguments`/`license`/`compatibility` and the `$name`/`${CLAUDE_SKILL_DIR}`/`${CLAUDE_SESSION_ID}` body substitutions; skill/agent frontmatter `hooks`.
- **Memory**: `.claude/rules/*.md`, CLAUDE.md `@import`s, nested CLAUDE.md files, and auto memory in the default per-project hashed directory (an explicit `autoMemoryDirectory` is honored — its `MEMORY.md` is injected).
- **Hooks**: handler types `mcp_tool`, `prompt`, `agent`; the remaining events (`PreCompact`/`PostCompact`, `Notification`, `PermissionRequest`/`PermissionDenied`, `Setup`, `UserPromptExpansion`, `PostToolBatch`, `StopFailure`, `TeammateIdle`, `TaskCreated`/`TaskCompleted`, `Elicitation`/`ElicitationResult`, `WorktreeCreate`/`WorktreeRemove`, `ConfigChange`, `InstructionsLoaded`, `CwdChanged`, `FileChanged`, `DirectoryAdded`, `MessageDisplay`); the SessionStart decision fields `initialUserMessage`/`watchPaths`/`sessionTitle`/`reloadSkills`; `suppressOutput`/`systemMessage`/`terminalSequence` user-only channels; `CLAUDE_ENV_FILE`; `asyncRewake`; `updatedInput` rewriting (DeepSeek Harness freezes tool arguments before policy); `permissionDecision: "defer"` (mapped to deny).
- **MCP**: `managed-mcp.json` and server-managed enterprise servers, per-project `local`-scope servers inside `~/.claude.json`, plugin-bundled MCP servers, and in-process `type: "sdk"` entries; SSE servers connect over the streamable-http transport instead.
- **Settings**: `model` (DeepSeek Harness owns model routing), `statusLine`/`statusline.json` and `plansDirectory` (CLI-UI / ephemeral state), managed/enterprise policy files (`managed-settings.json`, `managed-mcp.json`), and `.worktreeinclude`/`keybindings.json`/`themes/` (no DeepSeek Harness equivalent).
- **Plugins**: only plugin *skills* are bridged; plugin-bundled agents, MCP servers, hooks (`hooks/hooks.json`), output styles, commands, and workflows are not (installed plugins live under `~/.claude/plugins/` and need the marketplace runtime).

## The CodeBuddy Code bridge

### Skills and commands

Reads the CodeBuddy Code skill locations and registers them on the DeepSeek Harness skill registry (provider `codebuddy-code`), so they appear in the model-facing skill catalog, load through the `skill` tool, and are invocable with `/name`:

| CodeBuddy Code location | Registered as |
| :--- | :--- |
| `.codebuddy/skills/<name>/SKILL.md` | project-level skill |
| `.codebuddy/commands/<name>.md` | project-level command (a skill) |
| `~/.codebuddy/skills/<name>/SKILL.md` | user-level skill |
| `~/.codebuddy/commands/<name>.md` | user-level command (a skill) |

Mapping rules:

- The DeepSeek Harness skill name is the directory / file name (must be kebab-case; non-kebab names are skipped with a warning). Nested commands qualify as `group:name` — not kebab-case — and are skipped the same way.
- Only directory skills (`SKILL.md` inside a named directory) are read; flat `<name>.md` skills are a Claude Code extension that CodeBuddy Code does not document.
- Precedence mirrors CodeBuddy Code: **project assets override user assets** (the inverse of Claude Code, whose band the ranks therefore do not share), and a skill overrides a same-name command at the same level. Native DeepSeek Harness skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win on name conflicts — the bridge registers on the global skills layer, which nearer preset layers shadow.
- `description` + `when_to_use` become the skill description (combined and capped at 1,536 characters; falls back to the first body paragraph). `when_to_use` is not in the CodeBuddy Code docs but is honored for Claude Code asset compatibility.
- `disable-model-invocation` → the skill leaves the model catalog but stays user-invocable (`/name`). `user-invocable: false` → hidden from human invocation, model-only. `metadata` is carried through.
- The `skillOverrides` setting is applied on top: `name-only` collapses the description, `user-invocable-only` hides the skill from the model catalog, `off` hides it everywhere. Most-specific valid value wins (local > project > user), invalid values fall back per file, exactly like CodeBuddy Code.
- Skill bundles keep their directory as the resource base, so supporting files (`scripts/`, `references/`, …) referenced by `SKILL.md` resolve on demand.
- Existing skill roots and the settings files are watched; edits appear in the session without a restart.

### CODEBUDDY.md memory

DeepSeek Harness's own loader reads `AGENTS.md` and `CLAUDE.md`, not CodeBuddy Code's memory files. The bridge injects at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions:

- `~/.codebuddy/CODEBUDDY.md` (user memory) and `~/.codebuddy/rules/**` (user rules, recursive — only rules that always apply)
- `<cwd>/CODEBUDDY.md` and `<cwd>/.codebuddy/CODEBUDDY.md` (project memory; identical content collapses to one block)
- `<cwd>/CODEBUDDY.local.md` (local project memory)
- `<cwd>/.codebuddy/rules/**` (project rules, recursive — only rules that always apply)

Budget 32 KiB: broader user-level sections are dropped first, then the most specific ones are truncated. Rule frontmatter is stripped from injected content; `enabled: false` and `alwaysApply: false` rules are skipped.

### Hooks

Loads the merged `hooks` field from `~/.codebuddy/settings.json` → `.codebuddy/settings.json` → `.codebuddy/settings.local.json` (groups merge additively, identical handlers deduplicate, `disableAllHooks` comes from the most specific source that sets it) and runs handlers at the DeepSeek Harness lifecycles below:

| CodeBuddy Code event | DeepSeek Harness seam | Decision mapping |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext` (and exit-0 plain stdout) injected before the first prompt; matcher sees `startup`/`resume`/`clear`/`compact` |
| `UserPromptSubmit` | `agent/pre-step` | exit 2 / `continue: false` erase the prompt and show the reason; context is appended to the step |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision` `deny` → deny, `ask` → approval, `allow` → allow and skip further permission checks (deny/ask permission rules are still evaluated — see Permissions); exit 2 → deny with the stdout-first message; `modifiedInput` is logged and ignored; `additionalContext` is injected |
| `PostToolUse` | `tools/post-execute` | `additionalContext`/exit-2 message/legacy `decision: "block"` reason → context next to the result; `updatedToolOutput` replaces the rendered content |
| `PostToolUseFailure` | `tools/post-execute` (error results) | same as PostToolUse |
| `Stop` | `agent/turn-stopping` | exit 2 / `continue: false` / `additionalContext` steer a continuation (`stop_hook_active` set on repeats; capped at 8 consecutive continuations as a bridge safety valve) |
| `SubagentStart` | `agent/session-start` (subagent sessions) | `additionalContext` (and exit-0 plain stdout) injected into the subagent; the matcher sees `generic` (DeepSeek Harness subagents carry no upstream agent type, so `*` matchers run and specific ones cannot match) |
| `SubagentStop` | `agent/turn-stopping` (subagent sessions) | exit 2 / `continue: false` / `additionalContext` steer a continuation (`stop_hook_active` set on repeats; capped at 8 consecutive continuations) |
| `SessionEnd` | `agent/disposed` | side effects only (1.5 s budget, `reason: "other"`) |

Supported handler types: `command` (shell form and `args` exec form, `${CODEBUDDY_PROJECT_DIR}` substitution, per-handler `timeout` defaulting to CodeBuddy Code's 60 s, `async: true`, `once: true`, exit codes and JSON output per the CodeBuddy Code contract) and `http` (`method` POST/PUT/PATCH, `headers`; CodeBuddy Code documents no URL allowlist, so none is applied).

Compatibility details:

- Hooks key on CodeBuddy Code tool names. DeepSeek Harness names differ (`bash`, `edit`, `read`, …), so the bridge translates: `bash`→`Bash`, `pwsh`→`PowerShell`, `read`→`Read`, `write`→`Write`, `edit`→`Edit`, `glob`→`Glob`, `grep`→`Grep`, `web`/`web_search`→`WebSearch`, `ask_user_question`→`AskUserQuestion`, `exit_plan_mode`→`ExitPlanMode`, `subagent`→`Task`, `todo_write`→`TodoWrite`; unknown DeepSeek Harness tools (MCP servers, first-party extras) keep their own name. Matchers, `if` rules, and the `tool_name` field hook scripts receive the translated name, so hooks written for CodeBuddy Code run unchanged.
- Matcher semantics follow the CodeBuddy Code spec: `*`/empty/omitted matches all; anything else is a case-sensitive regular expression, so a plain `Write` also matches `NotebookWrite` and `^Write$` pins an exact match.
- Blocking messages follow CodeBuddy Code's exit-2 priority: stdout JSON `reason`/`stopReason`, then plain stdout, then stderr as fallback (the inverse of Claude Code's stderr-first behavior).
- The `if` filter supports the common `ToolName(glob)` form against one primary argument field for the mapped tools (`Bash(git *)`, `Edit(*.ts)`, …); uninterpretable rules and tools without a mapped field fail open.
- Timeouts and handler failures fail open (never block the action), as in CodeBuddy Code.
- Subagents: `UserPromptSubmit`, `Stop`, `SessionStart`, and `SessionEnd` run only for the main conversation, and `SubagentStart`/`SubagentStop` run only for subagent sessions — matching CodeBuddy Code's scoping. `PreToolUse`/`PostToolUse` also run for subagent tool calls.

### Permissions

Reads the `permissions.allow/ask/deny` rules from the same settings files (merged additively across scopes, deduplicated) and enforces them at the `tools/pre-execute` seam with CodeBuddy Code's semantics (deny → ask → allow; first match decides):

- **Bash**: `Bash(cmd)` matches the exact command, `Bash(git:*)` matches word-prefixes, `Bash(npm run *)` matches bash globs whose `*` crosses `/`. Compound commands split on top-level `&&`/`||`/`;`/`|` (quotes respected): deny/ask trigger when any subcommand matches, allow requires every subcommand to match, and allow rules demand an exact match when the command contains redirections — the upstream anti-sneak-in rules.
- **Read / Edit / Write**: case-insensitive path globs with upstream resolution (`//` absolute, `/` project root, `~` home, `path`/`./` cwd); a specifier without a path separator matches the file's basename at any depth. `permissions.additionalDirectories` also resolve `./`-style rules.
- **WebFetch**: `domain:example.com` matches the host and its subdomains; without `domain:` the whole URL is glob-matched.
- **MCP**: `mcp__server` matches `mcp__server__*`, exact `mcp__server__tool` rules match one tool; case and `-`/`.` are normalized to `_`. A bare `*` rule never covers MCP tools, and `mcp__*` only takes effect in deny/ask — as upstream documents.
- **Skill**: `Skill(name)` matches the skill tool's `name` argument exactly (no wildcards). **Agent**: bare `Agent` matches the subagent tool; `Agent(name)` specifiers cannot match (DeepSeek Harness subagents carry no upstream agent type).
- Hooks and rules compose per the upstream contract: PreToolUse hooks run first; deny rules always win over a hook `allow`; a matching ask rule still prompts; undecided hooks fall through to the rules; no rule match defers to DeepSeek Harness's approval policy. With `hooks: false` the rules still apply (independent switches).

Not bridged (recorded as limitations): `permissions.defaultMode`, `disableBypassPermissionsMode`, `disableAutoMode`, and `subagentPermissionMode` are read but not enforced — DeepSeek Harness owns its approval modes; the `autoMode` natural-language classifier has no equivalent; CodeBuddy Code's built-in protected-path / catastrophic-command protections are not replicated (DeepSeek Harness's sandbox and approval stack cover that layer); project allow rules apply without CodeBuddy Code's trust-tier gating (the bridge has no trust state).

### MCP servers

Bridges CodeBuddy Code's MCP servers into DeepSeek Harness tools. Reads `~/.codebuddy/.mcp.json` (plus the deprecated `~/.codebuddy/mcp.json` and the legacy `~/.codebuddy.json`) and `<cwd>/.mcp.json` (plus deprecated `<cwd>/mcp.json`) — a project server overrides a same-name user server. Each server becomes one dynamically instantiated `@deepseek-ai/dsh-mcp-client` plugin whose tools register as `mcp__codebuddy__<server>__<tool>`; instances reconcile at session start and when the config files change. stdio entries (`command`/`args`/`env`/`cwd`) map onto the stdio transport; `type: "http"`/`"sse"` entries with a `url` map onto streamable-http (`${VAR}` env references expand). Project servers follow the approval settings (`enableAllProjectMcpServers` / `enabledMcpjsonServers` / `disabledMcpjsonServers`) — unapproved ones are skipped with a warning; startup failures fail open. `strictMcpConfig` (which gates agent-frontmatter MCP) has no equivalent here and is recorded as a limitation.

### Subagents

Reads `.codebuddy/agents/*.md` and `~/.codebuddy/agents/*.md` (project overrides user, as for CodeBuddy skills) and registers each custom subagent definition as a skill named by its frontmatter `name` (`description` required; kebab-case enforced). The skill body carries the upstream system prompt verbatim plus a delegation spec telling the model which inline `subagent`-tool parameters to pass: `name` → skill name and `label`, the body → `persona`, `tools` → `toolFilter.allow`, `disallowedTools` → `toolFilter.deny` (tool names translated; unknown entries dropped with a warning), `model` (other than `inherit`/`default`) → `agentOptions.model`, `maxTurns` → `maxDepth` (approximation).

Not bridged (recorded as limitations): `permissionMode`, `skills`, `mcpServers`, `hooks`, `memory` (and the `agent-memory` directories), `background`, `effort`, `initialPrompt`; DeepSeek Harness has no named-subagent registry, so these skills instruct the model to delegate inline.

### Limitations

Not bridged yet (documented per subsystem):

- **Skills**: flat `.md` skills, nested commands (`group:name` names are not kebab-case), plugin skills; `allowed-tools`, `model`, `context: fork`, `agent`, and skill frontmatter `hooks`; inline shell-command execution, `$ARGUMENTS` substitution, and `@file` references in bodies.
- **Memory**: conditional rules (`alwaysApply: false` plus `paths`), `@import` expansion, upward-directory discovery, nested-subtree dynamic loading, Auto Memory.
- **Hooks**: handler types `prompt` and `agent` (both need an LLM evaluation); `Notification`, `PreCompact`/`PostCompact`, `PermissionRequest`/`PermissionDenied`, `Elicitation`, `FileChanged`, `Setup`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `WorktreeCreate`/`WorktreeRemove`, `TaskCreated`/`TaskCompleted`, `ElicitationResult`, and the remaining events; frontmatter hooks (and the `allowUntrustedFrontmatterHooks` gate); plugin `hooks/hooks.json`; the `transcript_path` input field (the bridge has no transcript file to point at); `suppressOutput`/`systemMessage` user-only channels (DeepSeek Harness has no non-model notice channel); `modifiedInput` rewriting (DeepSeek Harness freezes tool arguments before policy). Windows runs hooks through the system shell rather than CodeBuddy Code's forced Git Bash.
- **Plugins**: only plugin *skills* and plugin *hooks* are acknowledged as limitations; plugin-bundled commands, agents, `.mcp.json` MCP servers, `.lsp.json` LSP servers, settings overrides, and `bin/` helpers are not bridged either (plugins need the marketplace runtime).
- **Settings / model routing**: `models.json` (`.codebuddy/models.json` / `~/.codebuddy/models.json`), `model`, `agent`, `subagents`/`variantModels`, and `trustAll`/`trustedDirectories` — DeepSeek Harness owns model routing and directory trust, so these are out of scope.

## The opencode bridge

### Skills and commands

Reads the opencode asset locations and registers them on the DeepSeek Harness skill registry (provider `opencode`), so they appear in the model-facing skill catalog, load through the `skill` tool, and are invocable with `/name`:

| opencode location | Registered as |
| :--- | :--- |
| `.opencode/skills/<name>/SKILL.md` | project-level skill |
| `.opencode/commands/<name>.md` | project-level command (a skill) |
| `command.<name>` in `opencode.json(c)` | project-level command (overrides a same-name command file) |
| `~/.config/opencode/skills/<name>/SKILL.md` | user-level skill |
| `~/.config/opencode/commands/<name>.md` | user-level command (a skill) |
| `command.<name>` in `~/.config/opencode/opencode.json(c)` | user-level command (overrides a same-name command file) |

Mapping rules:

- The DeepSeek Harness skill name is the directory / file name, and must be a valid opencode name (`^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase alphanumerics with single hyphens); anything else is skipped with a warning.
- Skills require the opencode-validated frontmatter: `name` (must equal the directory name) and `description` (1–1,024 characters, capped). Missing or mismatched fields drop the skill with a warning, exactly like opencode's troubleshooting rules. `metadata` (string-to-string) is carried through; `license`/`compatibility` are ignored.
- Command bodies are the prompt templates; `description` frontmatter (or the first body paragraph) becomes the skill description. `agent`, `model`, and `subtask` are not bridged (DeepSeek Harness has no per-command agent routing).
- `.opencode/skills` is discovered **upward** from the working directory to the git root (closest directory first, as opencode walks); `skills.paths` entries in `opencode.json(c)` add extra skill roots (resolved against the config file; `skills.urls` need network and are skipped with a limitation note).
- opencode's Claude-compat (`.claude/skills`, `~/.claude/skills`) and agent-compat (`.agents/skills`, `~/.agents/skills`) skill roots are **not re-read**: the claude-code bridge already covers `.claude` assets and DeepSeek Harness's own filesystem provider covers `.agents` assets, so re-registering them would duplicate candidates.
- Precedence: project assets override user assets; a skill overrides a same-name command; JSON-configured commands override same-name command files at the same level. Native DeepSeek Harness skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win on name conflicts — the bridge registers on the global skills layer, which nearer preset layers shadow.
- Custom `agent.<id>` definitions (modes `subagent` / `all`) become delegation-spec skills: `description` is the skill description, `prompt` (inline string or `{ file: ... }`) becomes the system-prompt body, and `model` maps to `agentOptions.model`. `mode: "primary"` agents are main assistants and are not bridged.
- Existing asset roots and `opencode.json(c)` files are watched; edits appear in the session without a restart.

### AGENTS.md / CLAUDE.md rules and instructions memory

DeepSeek Harness's own loader reads the workspace-root `AGENTS.md` and `CLAUDE.md`. The bridge additionally injects at session start, in the same system-reminder framing:

- `~/.config/opencode/AGENTS.md` (global rules; `~/.claude/CLAUDE.md` is the fallback when absent, as opencode does)
- the closest `AGENTS.md` walking up from the working directory to the git root, with the closest `CLAUDE.md` as the compatibility fallback (first match wins per category); the cwd-level `AGENTS.md`/`CLAUDE.md` DeepSeek Harness already loads are skipped
- `instructions` entries from `opencode.json(c)`: local file paths and `*`/`**` glob patterns resolved against the config file's directory (remote URLs are skipped — the bridge does not fetch them)
- local `references` from `opencode.json(c)`: `@alias` → resolved absolute path + description, injected the way opencode advertises references in agent context; git `repository` references need a clone and are skipped with a warning (same no-fetch policy)

Budget 32 KiB: broader user-level sections are dropped first, then the most specific ones are truncated.

### Permissions

Reads the `permission` field from `opencode.json(c)` (global + project layers; per family the most specific layer that defines it wins) and enforces it at the `tools/pre-execute` seam with opencode's semantics:

- Grammar: a bare string (`permission: "allow" | "ask" | "deny"`) or an object keyed by family — `*` (default), `read`, `edit` (covers `edit`/`write`), `glob`, `grep`, `bash`, `task`, `skill`, `question`, `websearch`, `external_directory`, plus `lsp`/`doom_loop` (see limitations). Families hold either an action or ordered `pattern → action` rules where the **last matching rule wins** (put `"*"` first, specific rules after, as opencode documents).
- Wildcards are opencode's (`*` any chars, `?` one char); `~`/`$HOME` expand at the pattern start; worktree-relative patterns match paths relative to the working directory.
- Built-in defaults apply when `permission` is configured: most families allow, `external_directory` asks, and reads deny `.env` / `.env.*` except `.env.example` — the upstream defaults.
- DeepSeek Harness tool mapping: `read`→read, `edit`/`write`→edit, `glob`→glob, `grep`→grep, `bash`→bash, `subagent`→task (family-level only; subagent-type patterns have no DeepSeek Harness field), `skill`→skill (matches the skill name), `ask_user_question`→question, `web`/`web_search`→websearch (matches the query). Tools with no opencode family (`todo_write`, `pwsh`, `exit_plan_mode`, MCP tools, …) defer to DeepSeek Harness's own approval policy.
- `external_directory` triggers when a read/edit/write path falls outside the working directory; its default is `ask`, matching opencode.
- When **no** config layer defines `permission`, the bridge stays out of the way and DeepSeek Harness policy applies unchanged. When it is defined, calls on mapped families that match no rule resolve to opencode's permissive defaults — the upstream posture carries over (allow skips approval, ask prompts, deny blocks); unmapped tools always defer to DeepSeek Harness.

Not bridged (recorded as limitations): `doom_loop` (repeat-detection has no seam), `webfetch` (no URL-fetch tool), `lsp` (no LSP tool), the deprecated legacy `tools` boolean config, and per-agent permission overrides (`agent.<name>.permission` — DeepSeek Harness sessions carry no opencode agent identity).

### MCP servers

Bridges opencode's `mcp` config (`opencode.json(c)`, project overrides global per name) into DeepSeek Harness tools as `mcp__opencode__<server>__<tool>`. `type: "local"` entries map `command` (an array: executable + args, per opencode's format) and `environment` onto the stdio transport; `type: "remote"` entries map `url` (+ optional `headers`) onto streamable-http. `enabled: false` skips a server; startup failures fail open. OAuth credential flows for remote servers have no DeepSeek Harness seam and are recorded as a limitation.

### Limitations

Not bridged yet (documented per subsystem):

- **Skills / commands**: nested command directories (not documented by opencode), `$ARGUMENTS`/`$1`/`!`command``/`@file` substitution in command templates, `agent`/`model`/`subtask` command options, `agent.<id>` `mode: "primary"` agents and per-agent `permission`/`temperature` overrides (subagent-mode agents are bridged as delegation-spec skills), `skills.urls` (network), and `references` git repositories (network).
- **Memory**: `OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` / `OPENCODE_CONFIG_CONTENT` overrides, remote/managed config layers, upward config-file discovery (project `opencode.json` is read at the cwd only; `.opencode/skills` upward discovery is bridged), `{env:…}`/`{file:…}` substitution in config.
- **Plugins / tools**: opencode's JavaScript plugin system (its event hooks need the opencode runtime) and custom tools have no file-format bridge here.
- **Runtime / model config**: `formatter`, `lsp`, `experimental.*` (including the documented `policies`), custom `provider` definitions, and `model`/`small_model` defaults — DeepSeek Harness owns model routing, formatting, and diagnostics; these are out of scope (no file-format bridge).
- **CLI / UI**: `share`/`autoshare`/`username`/`logLevel`/`layout`/`tool_output`/`enterprise`/`server`/`shell`/`watcher`/`snapshot`/`compaction`/`attachment.image`/`autoupdate`/provider switches/`default_agent`/`subagent_depth`, `.opencode/themes/`, `tui.json`/`OPENCODE_TUI_CONFIG`, `keybinds`, and `.opencode/modes/` — cosmetic or runtime concerns with no DeepSeek Harness equivalent.
- **Overlap note**: when `claudeCode.memory` is also enabled, the `~/.claude/CLAUDE.md` fallback can be injected twice (once per bridge); keep one of the two memory switches off, or accept the duplicate block.

## The Codex bridge

### Skills

Reads the Codex skill locations and registers them on the DeepSeek Harness skill registry (provider `codex`):

| Codex location | Registered as |
| :--- | :--- |
| `$CWD/.agents/skills/<name>/SKILL.md`, then every parent folder up to the repository root | project-level skill (closest directory first) |
| `~/.agents/skills/<name>/SKILL.md` | user-level skill |
| `/etc/codex/skills/<name>/SKILL.md` | system-level skill |

Mapping rules:

- The DeepSeek Harness skill name is the directory name (must be kebab-case). Frontmatter must include `name` (matching the directory) and `description` (capped at 1,024 characters) per the agent-skills standard; invalid skills are dropped with a warning.
- Precedence: project skills (closest directory first) override user skills, which override system skills. Native DeepSeek Harness skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win on name conflicts.
- Skills disabled via `[[skills.config]]` entries (`path` + `enabled = false`) in `config.toml` are skipped; relative paths resolve against the config file's `.codex/` directory.
- Custom `[agents.<name>]` roles become delegation-spec skills too: the role's `description` is the skill description, the role's `config_file` TOML content becomes the body, and a `model` key inside it maps to `agentOptions.model`.
- The repository root is found with `project_root_markers` (default `['.git']`); without a marker only the current directory is checked, as Codex does. Skill roots and settings files are watched.

### AGENTS.md instruction-chain memory

DeepSeek Harness's own loader reads the workspace-root `AGENTS.md`. The bridge additionally injects Codex's instruction chain at session start, in the same system-reminder framing:

- `developer_instructions` from the most specific config layer (injected first, as Codex does)
- `$CODEX_HOME/AGENTS.override.md` if present, else `$CODEX_HOME/AGENTS.md` (first non-empty wins; `CODEX_HOME` is honored)
- one file per directory walking from the repository root down to the working directory: `AGENTS.override.md` > `AGENTS.md` > `project_doc_fallback_filenames`; files closer to the working directory come later and override earlier guidance
- the root-level plain `AGENTS.md` is skipped (DeepSeek Harness already loads it); empty files are skipped; project accumulation stops at `project_doc_max_bytes` (32 KiB default)

Budget 32 KiB for the injected block: broader user-level sections are dropped first, then the most specific ones are truncated.

### Hooks

Loads hooks from `hooks.json` and inline `[hooks]` tables in `config.toml`, across every active layer — `/etc/codex/`, `~/.codex/`, and every `.codex/` folder from the repository root down to the working directory (hooks merge additively; identical handlers deduplicate; `[features].hooks = false` from the most specific layer disables them all) — and runs handlers at the DeepSeek Harness lifecycles below:

| Codex event | DeepSeek Harness seam | Decision mapping |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext` and exit-0 plain stdout injected; matcher sees `startup`/`resume`/`clear`/`compact` |
| `SubagentStart` | `agent/session-start` (subagents) | `additionalContext` and exit-0 plain stdout injected into the subagent; matcher sees the agent type |
| `UserPromptSubmit` | `agent/pre-step` | `decision: "block"` / exit 2 / `continue: false` erase the prompt and show the reason; context is appended to the step |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision: "deny"` / legacy `decision: "block"` / exit 2 → deny; `permissionDecision: "ask"` is ignored (Codex parses but does not support it); `additionalContext` injected; `updatedInput` is logged and ignored |
| `PostToolUse` | `tools/post-execute` | `decision: "block"` / exit 2 / `continue: false` replace the tool result with the hook feedback (as Codex does); `additionalContext` added next to the result |
| `Stop` | `agent/turn-stopping` | `decision: "block"` / exit 2 steer a continuation whose prompt is the hook reason (`stop_hook_active` set on repeats); `continue: false` wins and stops; capped at 8 consecutive continuations as a bridge safety valve |
| `SubagentStop` | `agent/turn-stopping` (subagents) | same as Stop, steering the subagent |
| `SessionEnd` | `agent/disposed` | side effects only (1 s budget, `reason: "other"`; main thread only) |

Supported handlers: `type: "command"` only (Codex runs `prompt`/`agent` through an LLM and skips them itself), run through the shell with JSON input on stdin, `timeout` in seconds (default 600; 1 s for SessionEnd), `async: true` (background run, output discarded by the bridge), `commandWindows` on Windows; exit codes and JSON output per the Codex contract.

Compatibility details:

- Hooks key on Codex tool names. DeepSeek Harness names differ, so the bridge translates: `bash`/`pwsh`→`Bash`, `edit`/`write`→`apply_patch`, `subagent`→`spawn_agent`, `todo_write`→`update_plan`; unknown DeepSeek Harness tools (MCP servers, first-party extras) keep their own name. Matcher aliases are honored too: `Edit`/`Write` match `apply_patch`, `Agent` matches `spawn_agent`.
- Matcher semantics follow the Codex spec: `*`/empty/omitted matches all; anything else is a JavaScript regular expression (unparseable matchers fail closed). There is no `if` filter in Codex hooks.
- Timeouts and handler failures fail open (never block the action), as in Codex.
- Subagents: `SessionStart`/`SessionEnd`/`UserPromptSubmit`/`Stop` run only for the main conversation, `SubagentStart`/`SubagentStop` only for subagents, and `PreToolUse`/`PostToolUse` for both — matching Codex's event scoping.

### Permissions (approval / sandbox policy)

Reads `approval_policy`, `sandbox_mode`, and `default_permissions` from the merged config layers and applies them to each session at `agent/session-start` (main conversations and subagent sessions alike):

- **`sandbox_mode`**: `read-only` / `workspace-write` / `danger-full-access` map 1:1 onto DeepSeek Harness sandbox modes through the session's `sandbox/mode` override.
- **`approval_policy`**: `never` → DeepSeek Harness approval policy `never` (auto-approve); `untrusted` / `on-request` / deprecated `on-failure` / `granular` → `ask` (Codex prompts for approvals under all of these; DeepSeek Harness's `ask` delegates to the composed answerers). A `granular` table's per-category switches (`sandbox_approval`, `rules`, `mcp_elicitations`, `request_permissions`, `skill_approval`) are logged but not enforced.
- **`default_permissions`**: applies only when it names a built-in profile — `:read-only`, `:workspace`, `:danger-full-access` — and then wins over `sandbox_mode`, as the profile is Codex's current mechanism. Custom `[permissions.<name>]` profiles are read but not applied.
- **Only explicitly configured values apply**: Codex's own defaults (read-only sandbox, `untrusted` approvals) never override the DeepSeek Harness deployment's policy.

Not bridged (recorded as limitations): `[sandbox_workspace_write]` `writable_roots` / `network_access` / `exclude_tmpdir_env_var` / `exclude_slash_tmp` (DeepSeek Harness sessions have no per-session writable-roots override), custom permission profiles' filesystem/network rule tables, `approvals_reviewer` / `[auto_review]` guardian policy (no reviewer-subagent approval flow in DeepSeek Harness), and per-category granular approval switches.

### MCP servers

Bridges Codex's `[mcp_servers.<id>]` tables (from every active config layer; the most specific layer defines each id) into DeepSeek Harness tools as `mcp__codex__<server>__<tool>`. `url` entries map onto the streamable-http transport (with `http_headers` plus a bearer token from `bearer_token_env_var`); `command` entries map onto stdio (`args`, `env`, `env_vars` whitelisted from the process environment, `cwd`). `enabled = false` skips a server; startup failures fail open with a warning. Not bridged (recorded as limitations): `auth` (oauth/chatgpt credential flows), `scopes`, `enabled_tools`/`disabled_tools` and per-tool approval modes, `required` semantics (a required server that fails to start still only warns), and Codex's project-trust gating (project `[mcp_servers]` connect unconditionally; the DeepSeek Harness tool approval stack gates their tools).

### Limitations

Not bridged yet (documented per subsystem):

- **Skills**: `agents/openai.yaml` metadata (`allow_implicit_invocation`, tool dependencies), plugin-bundled skills, symlinked skill folders (the bridge reads them through the filesystem, but does not resolve symlink identity), the curated plugin catalog.
- **Memory**: `model_instructions_file` (replaces the built-in instructions — out of scope), Codex's 8,000-character initial-list budget (DeepSeek Harness applies its own catalog budgets).
- **Hooks**: `PermissionRequest` (no DeepSeek Harness seam for "about to ask for approval"), `PreCompact`/`PostCompact` (no pre-compaction seam; the `compact` session-start source runs SessionStart hooks instead), Codex's hook trust-review flow (`/hooks` — the bridge runs hooks the way the other bridges do, without a trust gate), background-hook output delivery at the next safe point, `systemMessage`/`suppressOutput` user-only channels, `additionalContextLimit` spilling (the bridge caps context by characters instead), plugin-bundled and managed `requirements.toml` hooks, `transcript_path` (the bridge has no transcript file to point at), `updatedInput` rewriting (DeepSeek Harness freezes tool arguments before policy).
- **Rules / config**: `rules/*.rules` (experimental Starlark DSL), `notify`, `[agents.<name>]` role options beyond `description`/`config_file` (per-role tool filters, `model` outside the config file, and the role's permission gates), `requirements.toml`, profile files (`--profile`), plugin-bundled MCP servers (`plugins.<plugin>.mcp_servers`), and untrusted-project gating beyond an explicit `projects["<path>"].trust_level = "untrusted"` entry (which now skips the project `.codex/` layers — the bridge has no interactive trust flow, so unlisted paths are read unconditionally).
- **Other config**: `web_search`/`tools.web_search` modes, `[features].*` runtime flags (only `features.hooks` is read), `[shell_environment_policy]` (applies to bridge-spawned children only — same seam as settings `env`), `[apps]` connectors, `[memories]`, `[history]`, `tool_output_token_limit`, `file_opener`, `[otel]`, `[desktop]`/`[tui]`, and auth/notice/logging keys — DeepSeek Harness owns these layers; model/provider selection (`model`, `review_model`, `model_provider`, `[model_providers]`, `model_reasoning_*`, `model_auto_compact_token_limit*`) is host-plane and out of scope.

## The pi bridge

pi (earendil-works' Rust coding agent) has no hook configuration, no permission-rule system, and no MCP config — its TypeScript extension event bus is the equivalent of those, and extensions are out of scope (like opencode's plugin API). The bridge therefore covers two surfaces: skills/prompt templates and context-file memory.

### Skills and prompt templates

Reads the pi asset locations and registers them on the DeepSeek Harness skill registry (provider `pi`), so they appear in the model-facing skill catalog and are invocable with `/name`:

| pi location | Registered as |
| :--- | :--- |
| `$PI_DIR/skills/<name>/SKILL.md` (recursive; `$PI_DIR` = `PI_CODING_AGENT_DIR` or `~/.pi/agent`) | user-level skill |
| `$PI_DIR/skills/<name>.md` (flat root files) | user-level skill |
| `.pi/skills/<name>/SKILL.md` and flat `.md` (project, trust-gated) | project-level skill |
| `$PI_DIR/prompts/<name>.md` / `.pi/prompts/<name>.md` (non-recursive, project trust-gated) | skill (slash-command template; `/name` gesture) |
| settings `skills` / `prompts` arrays (file or directory paths) | skill at the declaring layer's band |

Mapping rules:

- The skill name is the frontmatter `name` (pi allows it to differ from the directory name; the directory/file name is only the fallback when `name` is absent — pi's source behavior). Names must be kebab-case for DeepSeek Harness; a pi-legal name that is not kebab-case is skipped with a warning (no transliteration).
- `description` is required (pi does not load a skill without one; the bridge skips it with a warning). It is capped at pi's 1,024-character limit.
- `disable-model-invocation: true` → the skill leaves the model catalog but stays user-invocable (`/skill:name` upstream, `/name` here); invalid values warn and default to false (pi is lenient).
- `metadata` is carried through; `allowed-tools` (experimental), `license`, `compatibility`, and unknown fields are ignored (limitations).
- Precedence mirrors pi's source load order: the global locations load before the project ones and same-name collisions keep the first skill found, so personal assets override project assets; a skill overrides a same-name prompt template at the same level. Native DeepSeek Harness skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win on name conflicts — the bridge registers on the global skills layer, which nearer preset layers shadow.
- The `.agents/skills` locations pi also reads are deliberately not re-read: DeepSeek Harness's own filesystem provider covers `.agents` assets, so re-registering them would duplicate candidates.
- Project `.pi/skills`, `.pi/prompts`, and the project `.pi/settings.json` load only when the project is trusted. The bridge resolves trust the way pi's non-interactive mode does: the closest saved decision for the working directory or a parent in `$PI_DIR/trust.json` wins, else the global `defaultProjectTrust` (`ask` default and `never` skip project resources, `always` trusts them — there is no prompt in a non-interactive session, so `ask` counts as untrusted). The `project_trust` extension event is not bridged.
- Existing skill roots, settings files, and `trust.json` are watched; edits appear in the session without a restart.

### Context-file memory

DeepSeek Harness already loads the repository-root `AGENTS.md`. The bridge additionally injects at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions:

- `$PI_DIR/AGENTS.md` (global, loaded regardless of project trust)
- one file per directory walking from the filesystem root down to the working directory — per directory the first non-empty of `AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD` (pi's source-verified candidate order; `AGENTS.override.md` replaces that directory's `AGENTS.md`/`CLAUDE.md`); files deduplicate by canonical path
- `$PI_DIR/APPEND_SYSTEM.md`, then the trusted project `.pi/APPEND_SYSTEM.md` (pi appends both to the system prompt)

The repository root's plain `AGENTS.md` is skipped when it is exactly the file DeepSeek Harness already loaded. Budget 32 KiB: the broader global file is dropped first, then the most specific sections are truncated.

### Limitations

Not bridged yet (documented per subsystem):

- **Extensions**: `~/.pi/agent/extensions/*.ts` / `.pi/extensions/*.ts` and extension events (`tool_call` interception, `tool_result` rewriting, `project_trust`, …) — a TypeScript runtime equivalent of opencode's plugin API; no DeepSeek Harness seam is bridged for it.
- **Memory**: `.pi/SYSTEM.md` / `$PI_DIR/SYSTEM.md` (whole system-prompt replacement — DeepSeek Harness owns the system prompt); `--no-context-files` and `--prompt-template` CLI flags are per-run options with no persistent config.
- **Skills**: `allowed-tools` (experimental pre-approved tool lists), `license` / `compatibility` display fields, `enableSkillCommands` (DeepSeek Harness `/name` invocation always works; the setting is read for documentation parity), packages (`pi.skills` in `package.json` / `skills/` package dirs), CLI `--skill` paths, and the `.agents/skills` roots (covered by DeepSeek Harness's native provider instead).
- **Permissions / MCP / subagents**: pi has none built in (trust gating and tool allowlists are its whole surface; MCP and subagents arrive through extensions, which are out of scope).
- **Trust**: interactive trust prompts and the `project_trust` extension event are not available; `ask` therefore resolves to untrusted in DeepSeek Harness sessions (pi's own non-interactive behavior).

## The Gemini CLI bridge

### Skills, commands, and subagents

Reads the Gemini CLI asset locations and registers them on the DeepSeek Harness skill registry (provider `gemini-cli`), so they appear in the model-facing skill catalog and are invocable with `/name`:

| Gemini CLI location | Registered as |
| :--- | :--- |
| `~/.gemini/skills/<name>/SKILL.md` (user) and `.gemini/skills/<name>/SKILL.md` (workspace) | skill (directory skills, non-recursive) |
| `~/.gemini/commands/<name>.toml` / `.gemini/commands/<name>.toml` | command (a skill; the TOML `prompt` is the body) |
| `~/.gemini/agents/*.md` / `.gemini/agents/*.md` | subagent definition as a delegation-spec skill |

Mapping rules:

- The skill name is the frontmatter `name` (falling back to the directory name when absent); names must be kebab-case for DeepSeek Harness. Command names come from the file name — nested paths yield namespaced `dir:name` commands, which are not kebab-case and are skipped with a warning (no transliteration).
- `description` is required for skills (fail closed); command `description` is optional (falls back to the first paragraph of the prompt).
- Precedence follows Gemini's discovery tiers (built-in < extension < user < workspace): **workspace assets override user assets**, and a skill overrides a same-name command at the same level. Native DeepSeek Harness skills (`.dsh/skills`, `.agents/skills`, runtime skills) still win on name conflicts — the bridge registers on the global skills layer, which nearer preset layers shadow. The `.agents/skills` alias locations are deliberately not re-read (DeepSeek Harness's filesystem provider covers `.agents` assets).
- `skills.disabled` names and the `skills.enabled` master switch come from settings.json.
- Subagents reuse the delegation-spec pattern: `name` / `description` / `tools` (Gemini tool names translated to DeepSeek Harness names; `*` and `mcp_*` wildcards are dropped — omitting `tools` already means "all") / `model` (→ `agentOptions.model`) / `max_turns` (→ `maxDepth`). `kind: remote` (A2A) agents are skipped; `mcpServers`, `temperature`, and `timeout_mins` are recorded as limitations.
- Existing skill roots and settings files are watched; edits appear in the session without a restart.

### GEMINI.md memory

Injects the Gemini context-file chain at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions:

- `~/.gemini/GEMINI.md` (global)
- the workspace `GEMINI.md` and the same file in every parent directory up to the memory boundary (the first directory containing a `context.memoryBoundaryMarkers` entry — default `[" .git"]`), root-first
- `context.fileName` renames the file (string or list, default `GEMINI.md`); `context.discoveryMaxDirs` caps the walk (default 200)

`@./relative/path.md` and `@/absolute/path.md` imports are expanded inline (canonical-path dedup, cycle-capped, missing imports kept as literal lines). Gemini's JIT loading — context files discovered when a tool touches a directory — has no DeepSeek Harness seam and is recorded as a limitation. Budget 32 KiB: the broader global file is dropped first, then the most specific sections are truncated.

### Hooks

Loads the merged `hooks` field from `<cwd>/.gemini/settings.json` → `~/.gemini/settings.json` → `/etc/gemini-cli/settings.json` (groups merge additively, identical handlers deduplicate) and runs command hooks at the DeepSeek Harness lifecycles below (main sessions only for session-level events; tool events also run for subagent tool calls):

| Gemini event | DeepSeek Harness seam | Decision mapping |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext` (and non-JSON stdout) injected before the first prompt |
| `SessionEnd` | `agent/disposed` | side effects only (1.5 s budget) |
| `BeforeAgent` | `agent/pre-step` | `decision: "deny"` / exit 2 erase the prompt and show the reason; `continue: false` maps to the same (DeepSeek Harness cannot save-but-block); `additionalContext` is appended |
| `AfterAgent` | `agent/turn-stopping` | `decision: "deny"` / exit 2 steer a retry (capped at 8); `additionalContext` is injected; `continue: false` has no halt seam (warning) |
| `BeforeTool` | `tools/pre-execute` | `decision: "deny"` / exit 2 → deny with reason; `additionalContext` injected; `hookSpecificOutput.tool_input` rewriting and `continue: false` are not supported (DeepSeek Harness freezes tool arguments) |
| `AfterTool` | `tools/post-execute` | `decision: "deny"` / exit 2 replace the rendered result with the reason; `additionalContext` appended; `tailToolCallRequest` is not supported |

Compatibility details:

- Hooks key on Gemini tool names. DeepSeek Harness names differ, so the bridge translates: `bash`/`pwsh`→`run_shell_command`, `read`→`read_file`, `write`→`write_file`, `edit`→`replace`, `glob`→`list_directory`, `grep`→`search_file_content`, `web`→`web_fetch`, `web_search`→`google_web_search`, `ask_user_question`→`ask_user`, `exit_plan_mode`→`exit_plan_mode`, `todo_write`→`write_todos`, `skill`→`activate_skill`; unknown DeepSeek Harness tools (MCP servers, first-party extras) keep their own name. Matchers, and the `tool_name` field hook scripts receive, use the translated name.
- Matcher semantics follow the Gemini spec: **regular expressions** for tool events (`BeforeTool`, `AfterTool`), **exact strings** for lifecycle events, `*` / empty matches all. Unparseable regexes never match (fail open).
- I/O follows the Gemini "golden rule": stdin JSON; stdout may contain only the final JSON object — any other output fails the hook and becomes a `systemMessage` (action allowed); exit 0 with `{"decision":"deny"}` blocks with `reason`; exit 2 blocks with stderr as the reason; other exit codes are non-fatal warnings. Timeouts (per-handler `timeout` in **milliseconds**, default 60,000) and handler failures fail open.
- `suppressOutput` (telemetry only) and group `sequential` (the bridge runs handlers sequentially regardless) have no observable effect.
- Not bridged (no seam): `BeforeModel`, `AfterModel`, `BeforeToolSelection`, `PreCompress`, `Notification`.

### Permissions (Policy Engine)

Bridges the user-tier policy rules from `~/.gemini/policies/*.toml` into the `tools/pre-execute` permission seam (the workspace tier is disabled upstream, issue #18186, and is therefore not read either; admin/built-in policies live in the Gemini installation and are out of scope — DeepSeek Harness's own approval policy fills that role):

- `[[rule]]` entries: `toolName` (glob wildcards such as `*` / `mcp_*`, string or array), `subagent`, `mcpName`, `argsPattern` (JSON-object subset with deep equality), `commandPrefix` / `commandRegex` (run_shell_command only), `decision` (`allow` / `deny` / `ask_user`), `priority` (0–999), `denyMessage`.
- Evaluation follows Gemini: `final = 4 (user tier) + priority/1000`; rules run highest-first and the **first full match** decides. Tool names are translated first; subagent delegations match rules naming the agent (`toolName` or the `subagent` field compares the delegation label).
- `ask_user` maps to the DeepSeek Harness approval channel (`ask`), like the other bridges; `deny` uses `denyMessage` as the reason.
- Hooks and rules compose: a BeforeTool hook `deny` denies outright; a hook `allow` does not override a matching deny rule; with no hook decision the rules decide.
- Recorded limitations: `modes`-gated rules are inactive (DeepSeek Harness has no upstream approval-mode state), `interactive: true` rules are inactive (headless sessions), `toolAnnotations` can never match (no annotations seam), and `allowRedirection` handling is not applied.

### MCP servers

Bridges Gemini's settings.json `mcpServers` into DeepSeek Harness tools as `mcp__gemini__<server>__<tool>`. Per entry the transport picks `httpUrl` (streamable-http) > `url` (SSE, degraded to streamable-http with a warning) > `command` (stdio with `args` / `env` / `cwd`); `${VAR}` / `${VAR:-DEFAULT}` references expand from the process environment and relative `cwd` resolves against the declaring settings file. `mcp.allowed` filters the connected set, `mcp.excluded` always skips; startup failures fail open. Not bridged (recorded as limitations): `includeTools` / `excludeTools` (no per-tool filter seam), `trust` gating (read but not enforced — the DeepSeek Harness tool approval stack gates the tools), OAuth (`targetAudience` / `targetServiceAccount`), and admin-tier controls.

### Limitations

Not bridged yet (documented per subsystem):

- **Skills**: nested skill directories, built-in and extension skills (they live inside the Gemini installation), skill enable/disable gestures (`/skills`) are runtime state; `scripts`/`references`/`assets` bundles work through the resource base.
- **Commands**: namespaced `dir:name` commands (not kebab-case), `!{...}` shell-execution and `@{...}` file-injection markers (the body is passed through verbatim; the markers are not evaluated), `{{args}}` substitution happens through DeepSeek Harness's own `/name <args>` append behavior.
- **Memory**: JIT context-file loading, the Memory tool's per-project private memory directory and auto-memory (experimental), `.env` loading.
- **Hooks**: `BeforeModel` / `AfterModel` / `BeforeToolSelection` / `PreCompress` / `Notification`; AfterAgent's `prompt` / `prompt_response` are empty (DeepSeek Harness does not expose the final response text at turn-stopping); `hookSpecificOutput.tool_input` rewriting, `tailToolCallRequest`, `continue: false` (no halt seam), `transcript_path` (no transcript file), `suppressOutput`.
- **Permissions**: workspace/admin/built-in tiers, `modes` / `interactive` / `toolAnnotations` / `allowRedirection` semantics (see above).
- **Subagents**: `kind: remote` (A2A), inline `mcpServers`, `temperature`, `timeout_mins`, `@name` forced delegation (the skill instructs the model to delegate instead).
- **MCP**: see the MCP section above.
- **Other**: extensions (bundled commands/hooks/skills/agents/MCP/policies/themes), themes, output formats, sandbox and trusted-folders, browser agents, notifications, and settings `env` for model-side shell calls (bridge-spawned children only) — DeepSeek Harness owns these layers; model routing (`model`, `GEMINI_MODEL`) is host-plane and out of scope.

## The Cursor bridge

Cursor's asset layout splits between the IDE and the CLI (`agent` binary). The bridge covers the assets the CLI documents as readable: skills, subagents, rules, hooks, CLI permissions, and MCP.

### Skills and subagents

Reads the Cursor skill locations and registers them on the DeepSeek Harness skill registry (provider `cursor`), so they appear in the model-facing skill catalog and are invocable with `/name`:

| Cursor location | Registered as |
| :--- | :--- |
| `~/.cursor/skills/**/SKILL.md` (user) and `.cursor/skills/**/SKILL.md` (project) | skill (recursive discovery; the skill identity is the folder containing `SKILL.md`) |
| `~/.cursor/agents/*.md` / `.cursor/agents/*.md` | subagent definition as a delegation-spec skill |

Mapping rules:

- The skill name is the frontmatter `name` (falling back to the folder name); `description` is required (fail closed). Names must be kebab-case for DeepSeek Harness.
- `disable-model-invocation: true` → the skill leaves the model catalog but stays user-invocable; `user-invocable: false` → hidden from human invocation, model-only; `metadata` is carried through. `paths` / legacy `globs` path scoping and nested-folder scoping are recorded as limitations.
- Precedence: project assets override user assets (Cursor documents project > user for subagents); a skill overrides a same-name agent at the same level. Native DeepSeek Harness skills still win on name conflicts (the bridge registers on the global skills layer, which nearer preset layers shadow). The compat roots (`.agents/skills`, `.claude/skills`, `.codex/skills`) are deliberately not re-read — the filesystem provider and the other bridges cover them.
- Subagents reuse the delegation-spec pattern (`name` / `description` / `model` → `agentOptions.model`); `readonly` and `is_background` are recorded as limitations.

### Rules memory

Injects Cursor's persistent instructions at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions:

- every `.cursor/rules/**/*.mdc` file with `alwaysApply: true` (the rules directory anchors at the repository root)
- `AGENTS.md` files in subdirectories between the repository root (exclusive) and the working directory (inclusive)

Relevance-based rules (no `alwaysApply`), glob-scoped rules, `.md` files under `.cursor/rules` (ignored upstream without frontmatter), user rules (Cursor settings, not files), and the root `CLAUDE.md` (already injected by the claude-code bridge) are recorded as limitations. Budget 32 KiB, truncated with a marker when exceeded.

### Hooks

Loads the merged hooks from `.cursor/hooks.json` (project) and `~/.cursor/hooks.json` (user; identical handlers deduplicate; enterprise/team tiers are out of scope) and runs command hooks at the DeepSeek Harness lifecycles below (session events run on main sessions, subagent events on subagent sessions, tool events on both):

| Cursor event | DeepSeek Harness seam | Decision mapping |
| :--- | :--- | :--- |
| `sessionStart` | `agent/session-start` | fire-and-forget; `additional_context` injected |
| `sessionEnd` | `agent/disposed` | side effects only (1.5 s budget) |
| `beforeSubmitPrompt` | `agent/pre-step` | `continue: false` blocks the prompt and shows `user_message` |
| `preToolUse` | `tools/pre-execute` | `permission: "deny"` / exit 2 → deny (`agent_message`); `updated_input` rewriting unsupported (DeepSeek Harness freezes tool arguments) |
| `postToolUse` / `postToolUseFailure` | `tools/post-execute` | `additional_context` appended (`failure_type` passed on errors) |
| `stop` | `agent/turn-stopping` | `followup_message` steers a continuation (per-script `loop_limit`, default 5) |
| `afterAgentResponse` | `agent/turn-stopping` | `additional_context` injected (the response text is not exposed) |
| `subagentStart` | `agent/session-start` (subagents) | `additional_context`; `permission: "deny"` has no deny seam (warning) |
| `subagentStop` | `agent/turn-stopping` (subagents) | `followup_message` steers (per-script `loop_limit`) |
| `beforeShellExecution` / `afterShellExecution` | pre/post-execute for `bash`/`pwsh` | matcher runs against the **command text** |
| `beforeReadFile` / `afterFileEdit` | pre-execute (`read`) / post-execute (`edit`/`write`) | matcher runs against the **file path** |
| `beforeMCPExecution` / `afterMCPExecution` | pre/post-execute for MCP tools | matcher runs against the tool name |

Compatibility details:

- Hooks key on Cursor tool names; the bridge translates: `bash`/`pwsh`→`Shell`, `read`→`Read`, `write`→`Write`, `edit`→`Edit`, `glob`→`Glob`, `grep`→`Grep`, `web`→`WebFetch`, `web_search`→`WebSearch`, `ask_user_question`→`AskUserQuestion`, `exit_plan_mode`→`ExitPlanMode`, `subagent`→`Task`, `todo_write`→`TodoWrite`; MCP tools keep their own name. Matchers and the `tool_name` payload use the translated name.
- Matcher semantics: a regex tested unanchored against the hook-specific field (`Shell|Read|Write` for tool names, `curl|wget` containment for command text); `*` / empty matches all; unparseable patterns never match.
- Exit codes follow Cursor: `0` uses the JSON output, `2` blocks (≡ `permission: "deny"`), anything else fails open — unless the handler sets `failClosed: true`, which turns crash/timeout/invalid-JSON into a block. Timeouts are per-handler (seconds; default 30).
- Not bridged: prompt-type hooks (they need an LLM), `preCompact`, `afterAgentThought`, `workspaceOpen`, and the Tab hooks (IDE-only).

### Permissions

Enforces the CLI permission tokens from `~/.cursor/cli-config.json` → `.cursor/cli.json` (`permissions.allow` / `permissions.deny`; the most specific layer wins each list) at the `tools/pre-execute` seam:

- `Shell(commandBase)` — glob on the command's first token, plus `command:args` (the args part is globbed against the rest of the command line)
- `Read(pathOrGlob)` / `Write(pathOrGlob)` — `**` / `*` / `?` globs against the file path; a token of one type never matches another tool
- `WebFetch(domainOrPattern)` — exact hostname or `*.domain` subdomain suffix
- `Mcp(server:tool)` — globs per part against the runtime `mcp__cursor__<server>__<tool>` names (the bridge namespace is stripped, so rules written as Cursor's `mcp__<server>__<tool>` hit their target)

**deny wins over allow**; there is no ask level, so unmatched calls fall through to the DeepSeek Harness approval policy. Hook decisions compose first (a hook deny wins; a hook allow does not override a matching deny rule). Recorded limitations: `approvalMode` is read but not enforced (DeepSeek Harness owns its approval modes), and `permissions.json` (`mcpAllowlist` / `terminalAllowlist` / `autoRun`) tunes Cursor's own prompt flows and is read but not enforced.

### MCP servers

Bridges `.cursor/mcp.json` and `~/.cursor/mcp.json` `mcpServers` into DeepSeek Harness tools as `mcp__cursor__<server>__<tool>` (project overrides user per name). stdio entries (`command` / `args` / `env` / `envFile`) spawn with Cursor's configuration-variable interpolation (`${env:VAR}`, `${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`, `${/}`); remote `url` entries connect over streamable-http with header interpolation. `auth` OAuth flows are recorded as a limitation.

### Limitations

Not bridged yet (documented per subsystem):

- **Skills**: `paths` / legacy `globs` path scoping, nested-folder auto-scoping, plugin-provided skills.
- **Memory**: relevance-based and glob-scoped rules, user rules (Cursor settings), the root `CLAUDE.md` (covered by the claude-code bridge), `.cursorrules` (legacy).
- **Hooks**: prompt-type hooks, `preCompact`, `afterAgentThought`, `workspaceOpen`, Tab hooks, enterprise/team hook tiers, `updated_input` / `updated_mcp_tool_output` rewriting, `env` from `sessionStart` (per-session environment has no seam).
- **Permissions**: `approvalMode`, `permissions.json` semantics, sandbox.json (network policy / extra paths have no per-session seam).
- **MCP**: `auth` credential flows.
- **Other**: `~/.cursor/settings.json` (IDE settings; only `enabled_plugins` reaches the CLI), themes — DeepSeek Harness owns these layers; model routing is host-plane and out of scope. Cursor's third-party Claude Code hooks compatibility (Cursor reads `.claude/settings*.json` hooks and translates event/tool names itself) is not re-read — the claude-code bridge covers the original files with Claude semantics. `.cursorignore` / `.cursorindexingignore` (DeepSeek Harness owns its ignore layer), `worktrees.json` (worktree setup scripts), and the ACP server mode (`agent acp`) are also out of scope.
