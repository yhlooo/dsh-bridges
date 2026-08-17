# The CodeBuddy Code bridge

[中文](codebuddy-code.zh.md)

Bridges assets configured for CodeBuddy Code into DeepSeek Harness:
`.codebuddy/` skills, commands, and subagent definitions; `CODEBUDDY.md` memory
and always-apply rules; `settings.json` hooks and permission rules; and MCP
servers. For install steps and behaviors shared by all bridges, see the
[guides index](README.md).

## Config

The bridge owns a config section under the `bridges` row; any later patch layer
can override it:

```yaml
- id: bridges
  config:
    codebuddyCode:
      enabled: true                      # master switch for the CodeBuddy Code bridge
      skills: true                       # discover .codebuddy / ~/.codebuddy skills and commands
      agents: true                       # discover .codebuddy / ~/.codebuddy subagent definitions
      mcp: true                          # bridge .mcp.json / ~/.codebuddy/.mcp.json MCP servers
      memory: true                       # inject CODEBUDDY.md memory and always-apply rules
      hooks: true                        # run CodeBuddy Code hooks from settings.json
      permissions: true                  # enforce permissions.allow/ask/deny rules from settings.json
      userCodebuddyDir: '~/.codebuddy'   # user-level CodeBuddy Code directory
      watch: true                        # watch skill roots and settings files
      hookTimeoutMs: 60000               # CodeBuddy Code's 60-second hook limit
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Skills and commands

Reads the CodeBuddy Code skill locations and registers them on the DeepSeek Harness skill registry (provider `codebuddy-code`), so they appear in the model-facing skill catalog, load through the `skill` tool, and are invocable with `/name`:

| CodeBuddy Code location | Registered as |
| :--- | :--- |
| `.codebuddy/skills/<name>/SKILL.md` (also nested `<group>/<name>/SKILL.md`) | project-level skill (nested: named `group-name`) |
| `.codebuddy/commands/<name>.md` (also nested `<group>/<name>.md`) | project-level command (a skill; nested: named `group-name`) |
| `~/.codebuddy/skills/<name>/SKILL.md` (also nested `<group>/<name>/SKILL.md`) | user-level skill (nested: named `group-name`) |
| `~/.codebuddy/commands/<name>.md` (also nested `<group>/<name>.md`) | user-level command (a skill; nested: named `group-name`) |

Mapping rules:

- The DeepSeek Harness skill name is the directory / file name (must be kebab-case; non-kebab names are skipped with a warning).
- Nested assets are discovered recursively: the upstream qualified name `group:name` (`skills/pathto/skill/SKILL.md` → the `pathto:skill` skill, `commands/frontend/build.md` → the `/frontend:build` command) maps onto the kebab-case skill name `group-name` (`pathto-skill`, `frontend-build`), because DeepSeek Harness skill names cannot contain `:`. Directories whose own qualified name is not kebab-case are skipped wholesale. A flat `group-name.md` and a nested `group/name.md` collide on the same skill name — the registry keeps whichever candidate it discovers first.
- Only directory skills (`SKILL.md` inside a named directory) are read; flat `<name>.md` skills are a Claude Code extension that CodeBuddy Code does not document.
- Precedence mirrors CodeBuddy Code: **project assets override user assets** (the inverse of Claude Code, whose band the ranks therefore do not share), and a skill overrides a same-name command at the same level. Native DeepSeek Harness skills always win on name conflicts (see [Common behaviors](README.md#common-behaviors)).
- `description` + `when_to_use` become the skill description (combined and capped at 1,536 characters; falls back to the first body paragraph). `when_to_use` is not in the CodeBuddy Code docs but is honored for Claude Code asset compatibility.
- `disable-model-invocation` → the skill leaves the model catalog but stays user-invocable (`/name`). `user-invocable: false` → hidden from human invocation, model-only. `metadata` is carried through.
- The `skillOverrides` setting is applied on top: `name-only` collapses the description, `user-invocable-only` hides the skill from the model catalog, `off` hides it everywhere. Most-specific valid value wins (local > project > user), invalid values fall back per file, exactly like CodeBuddy Code. Nested skills accept both the kebab-case name (`pathto-skill`) and the upstream qualified name (`pathto:skill`) as keys.
- Skill bundles keep their directory as the resource base, so supporting files (`scripts/`, `references/`, …) referenced by `SKILL.md` resolve on demand.
- Existing skill roots and the settings files are watched; edits appear in the session without a restart.

## CODEBUDDY.md memory

DeepSeek Harness's own loader reads `AGENTS.md` and `CLAUDE.md`, not CodeBuddy Code's memory files. The bridge injects at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions:

- `~/.codebuddy/CODEBUDDY.md` (user memory) and `~/.codebuddy/rules/**` (user rules, recursive — only rules that always apply)
- `<cwd>/CODEBUDDY.md` and `<cwd>/.codebuddy/CODEBUDDY.md` (project memory; identical content collapses to one block)
- `<cwd>/CODEBUDDY.local.md` (local project memory)
- `<cwd>/.codebuddy/rules/**` (project rules, recursive — only rules that always apply)

Budget 32 KiB: broader user-level sections are dropped first, then the most specific ones are truncated. Rule frontmatter is stripped from injected content; `enabled: false` and `alwaysApply: false` rules are skipped.

## Hooks

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

## Permissions

Reads the `permissions.allow/ask/deny` rules from the same settings files (merged additively across scopes, deduplicated) and enforces them at the `tools/pre-execute` seam with CodeBuddy Code's semantics (deny → ask → allow; first match decides):

- **Bash**: `Bash(cmd)` matches the exact command, `Bash(git:*)` matches word-prefixes, `Bash(npm run *)` matches bash globs whose `*` crosses `/`. Compound commands split on top-level `&&`/`||`/`;`/`|` (quotes respected): deny/ask trigger when any subcommand matches, allow requires every subcommand to match, and allow rules demand an exact match when the command contains redirections — the upstream anti-sneak-in rules.
- **Read / Edit / Write**: case-insensitive path globs with upstream resolution (`//` absolute, `/` project root, `~` home, `path`/`./` cwd); a specifier without a path separator matches the file's basename at any depth. `permissions.additionalDirectories` also resolve `./`-style rules.
- **WebFetch**: `domain:example.com` matches the host and its subdomains; without `domain:` the whole URL is glob-matched.
- **MCP**: `mcp__server` matches `mcp__server__*`, exact `mcp__server__tool` rules match one tool; case and `-`/`.` are normalized to `_`. A bare `*` rule never covers MCP tools, and `mcp__*` only takes effect in deny/ask — as upstream documents.
- **Skill**: `Skill(name)` matches the skill tool's `name` argument exactly (no wildcards). **Agent**: bare `Agent` matches the subagent tool; `Agent(name)` specifiers cannot match (DeepSeek Harness subagents carry no upstream agent type).
- Hooks and rules compose per the upstream contract: PreToolUse hooks run first; deny rules always win over a hook `allow`; a matching ask rule still prompts; undecided hooks fall through to the rules; no rule match defers to DeepSeek Harness's approval policy. With `hooks: false` the rules still apply (independent switches).

Not bridged (recorded as limitations): `permissions.defaultMode`, `disableBypassPermissionsMode`, `disableAutoMode`, and `subagentPermissionMode` are read but not enforced — DeepSeek Harness owns its approval modes; the `autoMode` natural-language classifier has no equivalent; CodeBuddy Code's built-in protected-path / catastrophic-command protections are not replicated (DeepSeek Harness's sandbox and approval stack cover that layer); project allow rules apply without CodeBuddy Code's trust-tier gating (the bridge has no trust state).

## MCP servers

Bridges CodeBuddy Code's MCP servers into DeepSeek Harness tools. Reads `~/.codebuddy/.mcp.json` (plus the deprecated `~/.codebuddy/mcp.json` and the legacy `~/.codebuddy.json`) and `<cwd>/.mcp.json` (plus deprecated `<cwd>/mcp.json`) — a project server overrides a same-name user server. Each server becomes one dynamically instantiated `@deepseek-ai/dsh-mcp-client` plugin whose tools register as `mcp__codebuddy__<server>__<tool>`; instances reconcile at session start and when the config files change. stdio entries (`command`/`args`/`env`/`cwd`) map onto the stdio transport; `type: "http"`/`"sse"` entries with a `url` map onto streamable-http (`${VAR}` env references expand). Project servers follow the approval settings (`enableAllProjectMcpServers` / `enabledMcpjsonServers` / `disabledMcpjsonServers`) — unapproved ones are skipped with a warning; startup failures fail open. `strictMcpConfig` (which gates agent-frontmatter MCP) has no equivalent here and is recorded as a limitation.

## Subagents

Reads `.codebuddy/agents/*.md` and `~/.codebuddy/agents/*.md` (project overrides user, as for CodeBuddy skills) and registers each custom subagent definition as a skill named by its frontmatter `name` (`description` required; kebab-case enforced). The skill body carries the upstream system prompt verbatim plus a delegation spec telling the model which inline `subagent`-tool parameters to pass: `name` → skill name and `label`, the body → `persona`, `tools` → `toolFilter.allow`, `disallowedTools` → `toolFilter.deny` (tool names translated; unknown entries dropped with a warning), `model` (other than `inherit`/`default`) → `agentOptions.model`, `maxTurns` → `maxDepth` (approximation).

Not bridged (recorded as limitations): `permissionMode`, `skills`, `mcpServers`, `hooks`, `memory` (and the `agent-memory` directories), `background`, `effort`, `initialPrompt`; DeepSeek Harness has no named-subagent registry, so these skills instruct the model to delegate inline.

## Limitations

Not bridged yet (documented per subsystem):

- **Skills**: flat `.md` skills, plugin skills; `allowed-tools`, `model`, `context: fork`, `agent`, and skill frontmatter `hooks`; inline shell-command execution, `$ARGUMENTS` substitution, and `@file` references in bodies.
- **Memory**: conditional rules (`alwaysApply: false` plus `paths`), `@import` expansion, upward-directory discovery, nested-subtree dynamic loading, Auto Memory.
- **Hooks**: handler types `prompt` and `agent` (both need an LLM evaluation); `Notification`, `PreCompact`/`PostCompact`, `PermissionRequest`/`PermissionDenied`, `Elicitation`, `FileChanged`, `Setup`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `WorktreeCreate`/`WorktreeRemove`, `TaskCreated`/`TaskCompleted`, `ElicitationResult`, and the remaining events; frontmatter hooks (and the `allowUntrustedFrontmatterHooks` gate); plugin `hooks/hooks.json`; the `transcript_path` input field (the bridge has no transcript file to point at); `suppressOutput`/`systemMessage` user-only channels (DeepSeek Harness has no non-model notice channel); `modifiedInput` rewriting (DeepSeek Harness freezes tool arguments before policy). Windows runs hooks through the system shell rather than CodeBuddy Code's forced Git Bash.
- **Plugins**: only plugin *skills* and plugin *hooks* are acknowledged as limitations; plugin-bundled commands, agents, `.mcp.json` MCP servers, `.lsp.json` LSP servers, settings overrides, and `bin/` helpers are not bridged either (plugins need the marketplace runtime).
- **Settings / model routing**: `models.json` (`.codebuddy/models.json` / `~/.codebuddy/models.json`), `model`, `agent`, `subagents`/`variantModels`, and `trustAll`/`trustedDirectories` — DeepSeek Harness owns model routing and directory trust, so these are out of scope.

