# The Claude Code bridge

[中文](claude-code.zh.md)

Bridges assets configured for Claude Code into DeepSeek Harness: `.claude/`
skills, commands, and subagent definitions; `CLAUDE.md` memory; `settings.json`
hooks and permission rules; and MCP servers. For install steps and behaviors
shared by all bridges, see the [guides index](README.md).

## Config

The bridge owns a config section under the `bridges` row; any later patch layer
can override it:

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
      mcp: true                   # bridge .mcp.json / ~/.claude.json MCP servers
      userClaudeDir: '~/.claude'  # user-level Claude Code directory
      watch: true                 # watch skill roots and republish on change
      hookTimeoutMs: 600000
      userPromptHookTimeoutMs: 30000
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Skills and commands

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
- Precedence mirrors Claude Code: personal assets override project assets; a skill overrides a same-name command at the same level. Native DeepSeek Harness skills always win on name conflicts (see [Common behaviors](README.md#common-behaviors)).
- Skill bundles keep their directory as the resource base, so supporting files (`scripts/`, `references/`, …) referenced by `SKILL.md` resolve on demand.
- Existing skill roots are watched; edits appear in the session without a restart.

## CLAUDE.md memory

DeepSeek Harness already loads root-level `CLAUDE.md`. The bridge additionally injects at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions, broadest first:

- `~/.claude/CLAUDE.md` (user)
- every ancestor directory's `CLAUDE.md` and `CLAUDE.local.md` above the working directory (filesystem-root first, `CLAUDE.local.md` after `CLAUDE.md` per directory — Claude Code's hierarchy order)
- the `CLAUDE.md` / `CLAUDE.local.md` files under `permissions.additionalDirectories`
- `.claude/CLAUDE.md` (project)
- the `outputStyle` file (`.claude/output-styles/<name>.md`, falling back to `~/.claude/output-styles/<name>.md` — a degraded mapping that injects the style's prompt section as context)
- the cwd-level `CLAUDE.local.md` (personal, gitignored)

Budget 32 KiB: the broader user-level file is dropped first, then the most specific sections are truncated. Files identical to the root `CLAUDE.md` DeepSeek Harness already loaded are skipped to avoid duplicate blocks.

## Hooks

Loads the merged `hooks` field from `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` (groups merge additively, identical handlers deduplicate, `disableAllHooks` comes from the most specific source that sets it) and runs handlers at the DeepSeek Harness lifecycles below:

| Claude Code event | DeepSeek Harness seam | Decision mapping |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext` (and exit-0 plain stdout) injected before the first prompt |
| `UserPromptSubmit` | `agent/pre-step` | `decision: "block"` / exit 2 / `continue: false` erase the prompt and show the reason; context is appended to the step |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision` `deny` → deny, `ask` → approval, `allow` → allow and skip further permission checks (deny/ask permission rules are still evaluated — see Permissions), `defer` → approval (Claude Code pauses the call for later; DeepSeek Harness has no resume seam, so the bridge prompts instead of denying); exit 2 → deny with stderr; `additionalContext` is injected |
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

## Permissions

Reads the `permissions.allow/ask/deny` rules from the same settings files (merged additively across scopes, deduplicated) and enforces them at the `tools/pre-execute` seam with Claude Code's semantics:

- Rule grammar: `Tool` or `Tool(specifier)`; tool names accept globs (`*`, `mcp__*`). Evaluation order is **deny → ask → allow**; the first match decides regardless of specificity.
- `Bash(...)` matches by command prefix (`Bash(npm run *)` matches `npm run build`; prefix matching keeps the bypass caveats the upstream docs call out, e.g. via `sudo` or pipes).
- `Read`/`Edit`/`Write` match path globs: `//path` absolute, `/path` project-relative, `~` home-relative, `./` project-relative; `permissions.additionalDirectories` also resolve `./`-style rules. Both rule and argument paths are normalized to absolute paths before comparing.
- `WebFetch(domain:example.com)` / `domain:*.example.com` matches the URL hostname (subdomain suffix); without the `domain:` prefix the whole URL is glob-matched.
- Hooks and rules compose per the upstream contract: PreToolUse hooks run first; a hook `deny` denies outright; **deny/ask rules are always evaluated — a hook `allow` cannot override a matching deny rule, and a matching ask rule still prompts**; when hooks stay silent the rules decide (deny → deny, ask → approval, allow → allow), and with no rule match the call falls back to DeepSeek Harness's own approval policy.
- Rules apply to main-conversation and subagent tool calls alike (upstream permission settings are inherited by subagents).
- Calls matching no rule keep their existing behavior; with `hooks: false` the rules still apply (the `permissions` and `hooks` switches are independent).

Not bridged (recorded as limitations): `permissions.defaultMode` and `permissions.disableBypassPermissionsMode` are read but not enforced — DeepSeek Harness owns its approval modes and the bridge has no seam to switch them; project `.claude/settings.json` allow rules apply without the workspace-trust gate upstream requires for them (the bridge has no trust state; deny/ask rules are not trust-gated upstream either); `permissions.additionalDirectories` and an explicit `autoMemoryDirectory` are likewise read without the trust gate (both load fixed file names only).

## MCP servers

Bridges Claude Code's MCP servers into DeepSeek Harness tools. Reads `~/.claude.json` `mcpServers` (user scope, always connected) and `<cwd>/.mcp.json` (project scope) — a project server overrides a same-name user server, as in Claude Code. Each server becomes one dynamically instantiated `@deepseek-ai/dsh-mcp-client` plugin whose tools register as `mcp__claude__<server>__<tool>`; instances are keyed by workspace, reconciled at session start, and re-reconciled when the config files change.

- stdio entries (`command` / `args` / `env` / `cwd`) map onto the stdio transport; `type: "http"` / `"sse"` entries with a `url` map onto the streamable-http transport (SSE degrades, a warning is logged). `${VAR}` references in `env` expand from the process environment.
- Project `.mcp.json` servers need approval upstream (`enableAllProjectMcpServers` / `enabledMcpjsonServers`); unapproved project servers are skipped with a warning instead of being silently connected, and `disabledMcpjsonServers` always skips — matching Claude Code's connect-on-approval behavior.
- Startup failures fail open (warn + skip the server). Server names are namespaced (`claude__<name>`, sanitized to `[A-Za-z0-9_-]`, capped at 32 characters).

## Subagents

Reads `.claude/agents/*.md` and `~/.claude/agents/*.md` (personal overrides project, as for Claude skills) and registers each custom subagent definition as a skill named by its frontmatter `name` (`description` required, exactly as upstream; kebab-case enforced, `plugin:name`-scoped names skipped). The skill body carries the upstream system prompt verbatim plus a delegation spec telling the model which inline `subagent`-tool parameters to pass:

- frontmatter `name` → skill name and delegation `label`
- the system-prompt body → `persona`
- `tools` → `toolFilter.allow`, `disallowedTools` → `toolFilter.deny` (upstream tool names translated to DeepSeek Harness names; unknown entries dropped with a warning)
- `model` (other than `inherit`) → `agentOptions.model`
- `maxTurns` → `maxDepth` (approximation)

DeepSeek Harness has no named-subagent registry — the skill instructs the model to delegate inline with those parameters. Not bridged (recorded as limitations): `permissionMode`, `skills`, `mcpServers`, `hooks`, `memory` (and `.claude/agent-memory*`/`~/.claude/agent-memory`), `background`, `effort`, `isolation`, `color`, `initialPrompt`; a native named-subagent registry is a core-side enhancement candidate.

## Limitations

Not bridged yet (documented per subsystem):

- **Skills**: nested `.claude/skills/` below the workspace (their qualified names are not kebab-case), enterprise/managed skills, plugin skills, synced claude.ai skills; `allowed-tools`/`disallowed-tools`, `model`, `effort`, `context: fork`/`agent`/`background`, `paths`, `shell`, and `$ARGUMENTS` substitution in bodies; the display-only frontmatter `name`/`argument-hint`/`arguments`/`license`/`compatibility` and the `$name`/`${CLAUDE_SKILL_DIR}`/`${CLAUDE_SESSION_ID}` body substitutions; skill/agent frontmatter `hooks`.
- **Memory**: `.claude/rules/*.md`, CLAUDE.md `@import`s, nested CLAUDE.md files, and auto memory in the default per-project hashed directory (an explicit `autoMemoryDirectory` is honored — its `MEMORY.md` is injected).
- **Hooks**: handler types `mcp_tool`, `prompt`, `agent`; the remaining events (`PreCompact`/`PostCompact`, `Notification`, `PermissionRequest`/`PermissionDenied`, `Setup`, `UserPromptExpansion`, `PostToolBatch`, `StopFailure`, `TeammateIdle`, `TaskCreated`/`TaskCompleted`, `Elicitation`/`ElicitationResult`, `WorktreeCreate`/`WorktreeRemove`, `ConfigChange`, `InstructionsLoaded`, `CwdChanged`, `FileChanged`, `DirectoryAdded`, `MessageDisplay`); the SessionStart decision fields `initialUserMessage`/`watchPaths`/`sessionTitle`/`reloadSkills`; `suppressOutput`/`systemMessage`/`terminalSequence` user-only channels; `CLAUDE_ENV_FILE`; `asyncRewake`; `updatedInput` rewriting (DeepSeek Harness freezes tool arguments before policy); `permissionDecision: "defer"` (mapped to approval — no resume seam).
- **MCP**: `managed-mcp.json` and server-managed enterprise servers, per-project `local`-scope servers inside `~/.claude.json`, plugin-bundled MCP servers, and in-process `type: "sdk"` entries; SSE servers connect over the streamable-http transport instead.
- **Settings**: `model` (DeepSeek Harness owns model routing), `statusLine`/`statusline.json` and `plansDirectory` (CLI-UI / ephemeral state), managed/enterprise policy files (`managed-settings.json`, `managed-mcp.json`), and `.worktreeinclude`/`keybindings.json`/`themes/` (no DeepSeek Harness equivalent).
- **Plugins**: only plugin *skills* are bridged; plugin-bundled agents, MCP servers, hooks (`hooks/hooks.json`), output styles, commands, and workflows are not (installed plugins live under `~/.claude/plugins/` and need the marketplace runtime).
