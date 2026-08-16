# dsh-bridges usage guide

[中文](README.zh.md)

The detailed usage documentation for every bridge: install and verify, the full
configuration reference, and per-tool behavior (skills/commands, memory,
hooks) with its limitations. For a quick start, see the
[root README](../../README.md).

## Install

Plugins install into a DeepSeek Harness profile with the profile plugin manager (pnpm); `<name>` is `web` (the Web UI) or `headless` (one-shot CLI runs), and each profile installs its own plugins:

```sh
# from a checkout of this repository (compile src/ → lib/ first):
pnpm install && pnpm build
dsh plugin --profile <name> add .

# or, once published, from a tarball / registry package:
dsh plugin --profile <name> add dsh-bridges
```

The plugin manager appends the package to the profile's `dsh.profile.bundles`, and its `cordis.patch.yml` inserts one `bridges` row into the composed tree. Verify with:

```sh
dsh --profile <name> --dump-config   # the row "dsh-bridges" should appear
```

Then start DeepSeek Harness in a project that has agent assets — `.claude/`, `.codebuddy/`, `.opencode/`, `.agents/skills/`, or `.codex/` (plus their user-level counterparts, e.g. `~/.claude/`); assets are discovered per session workspace.

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
```

## The Claude Code bridge

### Skills and commands

Reads the Claude Code skill locations and registers them on the DeepSeek Harness skill registry (provider `claude-code`), so they appear in the model-facing skill catalog, load through the `skill` tool, and are invocable with `/name`:

| Claude Code location | Registered as |
| :--- | :--- |
| `~/.claude/skills/<name>/SKILL.md` (also flat `<name>.md`) | user-level skill |
| `~/.claude/commands/<name>.md` | user-level command (a skill) |
| `.claude/skills/<name>/SKILL.md` (also flat `<name>.md`) | project-level skill |
| `.claude/commands/<name>.md` | project-level command (a skill) |

Mapping rules:

- The DeepSeek Harness skill name is the directory / file name (must be kebab-case; non-kebab names are skipped with a warning).
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
- DSH tool mapping: `read`→read, `edit`/`write`→edit, `glob`→glob, `grep`→grep, `bash`→bash, `subagent`→task (family-level only; subagent-type patterns have no DSH field), `skill`→skill (matches the skill name), `ask_user_question`→question, `web`/`web_search`→websearch (matches the query). Unmapped tools resolve through `*` / the defaults.
- `external_directory` triggers when a read/edit/write path falls outside the working directory; its default is `ask`, matching opencode.
- When **no** config layer defines `permission`, the bridge stays out of the way and DeepSeek Harness policy applies unchanged. When it is defined, unmatched calls resolve to opencode's permissive defaults — the upstream posture carries over (allow skips approval, ask prompts, deny blocks).

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
