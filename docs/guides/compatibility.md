# Compatibility details: deviations from the bridged platforms

[中文](compatibility.zh.md)

This page lists, per tool, the specific places where dsh-bridges behaves
differently from the upstream platform (Claude Code, CodeBuddy Code, OpenCode,
Codex, Pi, Gemini CLI, Cursor). It only covers differences caused by a missing
DeepSeek Harness capability; the other class of gaps (plugin marketplace, CLI
UI, enterprise management, OAuth sign-in) lives in each tool page's
"Limitations" section and is not repeated here.

Every entry is marked **supported / partially supported / not supported** with
the concrete field name, an example, and the degraded behavior. "Degrades to…"
means what the bridge substitutes for the upstream feature.

## Common to all tools

- **Model selection** not supported. Every tool's `model` setting — Claude Code /
  CodeBuddy Code / Codex `model`, Codex `review_model` / `model_provider` /
  `[model_providers]`, OpenCode `model` / `small_model` / custom `provider`, and
  the model config of Gemini CLI / Cursor / Pi — has no effect: DeepSeek Harness
  picks the model at the deployment layer and the plugin cannot change it.
  - Exception: a subagent definition's `model` is written into the delegation
    spec and passed through best-effort, but may still be overridden.
- **Custom subagents** partially supported. DeepSeek Harness has no registry of
  named subagent definitions, so each one degrades to "a skill whose body is the
  system prompt plus delegation instructions." Only `tools` (tool names),
  `model`, and `maxTurns` carry over; every other frontmatter field (listed per
  tool below) is lost.

## Claude Code

- **Skill `allowed-tools` / `disallowed-tools`** not supported. Both fields are
  ignored entirely; a skill gains no extra authorization from them. The bridge
  only reads `name`, `description`, `when_to_use`, `disable-model-invocation`,
  `user-invocable`, and `metadata`.
- **Other skill frontmatter** not supported: `model`, `effort`, `context: fork` /
  `agent` / `background`, `paths`, `shell`. `$ARGUMENTS` and `${CLAUDE_SKILL_DIR}`
  in the body stay literal.
- **Slash-command namespaces** partially supported. `commands/<group>/<name>.md`
  is `/group:name`; since DeepSeek Harness skill names cannot contain `:`, it is
  transliterated to `group-name` (`/opsx:explore` → `opsx-explore`). A directory
  whose name is not kebab-case (e.g. `mySkill`) is skipped wholesale.
- **Subagent frontmatter** partially supported. `name`, `description`, `tools`
  (tool names only), `disallowedTools` (tool names only), `model`, `maxTurns`
  are translated into the delegation spec. A parameterized entry like
  `tools: ["Bash(go:*)"]` is passed through untranslated and may be rejected as
  an unknown tool name. `permissionMode`, `skills`, `mcpServers`, `hooks`,
  `memory`, `background`, `effort`, `isolation`, `color`, `initialPrompt`, and
  the `.claude/agent-memory*` directories are not supported.
- **Memory** partially supported. `~/.claude/CLAUDE.md`, `.claude/CLAUDE.md`,
  ancestor `CLAUDE.md` / `CLAUDE.local.md`, and `additionalDirectories` are
  injected; an explicit `autoMemoryDirectory` `MEMORY.md` is too. `.claude/rules/*.md`,
  `@import` in CLAUDE.md, and auto memory in the default per-project hash
  directory are not supported.
- **Hook handler types** partially supported. `command` and `http` work;
  `mcp_tool`, `prompt`, and `agent` do not.
- **Hook event surface** partially supported. `SessionStart`, `UserPromptSubmit`,
  `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `Stop`, `SubagentStart`,
  `SubagentStop`, `SessionEnd` fire; `PreCompact`/`PostCompact`, `Notification`,
  `PermissionRequest`/`PermissionDenied`, `Setup`, `UserPromptExpansion`,
  `PostToolBatch`, `StopFailure`, and the rest do not.
- **`updatedInput` (PreToolUse input rewriting)** not supported. DeepSeek Harness
  freezes tool arguments before policy, so the rewrite is ignored with a warning
  and the tool runs with its original arguments.
- **`permissionDecision: "defer"`** partially supported. Upstream means "pause and
  resume later"; DeepSeek Harness has no resume, so it degrades to approval.
- **SessionStart decision fields** not supported: `initialUserMessage`,
  `watchPaths`, `sessionTitle`, `reloadSkills`; `suppressOutput`, `systemMessage`,
  `terminalSequence` are also not supported.
- **Permission rules** partially supported. `allow`/`ask`/`deny` evaluate in
  deny → ask → allow order; `Bash(npm run *)` matches by command prefix;
  `Read`/`Edit`/`Write` match by path glob; `WebFetch(domain:…)` matches by
  domain. `defaultMode` and `disableBypassPermissionsMode` are read but not
  applied.
- **Settings `env`** partially supported. It applies only to hook subprocesses
  and the MCP server subprocesses the bridge starts; bash commands run by the
  model do not receive these variables.
- **MCP** partially supported. stdio / http transports work; SSE servers degrade
  to streamable-http; in-process `type: "sdk"` entries, `managed-mcp.json`, and
  plugin-bundled MCP servers are not supported.

## CodeBuddy Code

(Skills / subagents / memory / hooks mirror Claude Code; only the differences
are listed.)

- **Skill `allowed-tools` / other frontmatter** not supported, as Claude Code.
- **Permission rule `Agent(name)`** partially supported. A bare `Agent` matches;
  the name part of `Agent(some-name)` cannot match — DeepSeek Harness subagents
  have no name field to compare against.
- **Permission rule `mcp__*`** partially supported. It takes effect only in
  deny / ask rules; an allow `mcp__*` has no effect (matching upstream).
- **Permission rule `Skill(name)`** supported, exact match (no wildcards).
- **`defaultMode` (acceptEdits / auto / dontAsk / plan / bypassPermissions)**
  not supported, read but not applied; `disableBypassPermissionsMode`,
  `disableAutoMode`, `subagentPermissionMode` likewise.
- **Hook handler types `prompt` / `agent`** not supported (they need a separate
  LLM subagent, which DeepSeek Harness does not provide).
- **`modifiedInput` (input rewriting)** not supported, same as Claude Code's
  `updatedInput`.
- **MCP `strictMcpConfig`** partially supported, only for agent-frontmatter MCP
  declarations.

## OpenCode

- **Skill frontmatter** partially supported. `name`, `description`, `metadata`
  take effect; `license`, `compatibility` are ignored. Command-file frontmatter
  `agent` and `model` are ignored.
- **`permission` rules** partially supported. Family rules evaluate last-match;
  `~`/`$HOME` expansion, the `external_directory` guard for paths outside the
  working directory, and the built-in `.env` read protection are all reproduced.
  `doom_loop` (repeat detection), `webfetch` (URL-fetch tool), and `lsp` are not
  supported — DeepSeek Harness has no corresponding tool or capability.
- **`instructions` / `references`** partially supported. Local file paths are
  injected; remote URLs and git `repository` references are not (skipped with a
  warning).
- **`skills.paths` / `skills.urls`** partially supported. `paths` joins the
  skill discovery roots; `urls` is not supported (network).
- **MCP** partially supported. `type: local` (command) and `type: remote` (url +
  headers) work; remote OAuth sign-in does not.
- **Custom agents** partially supported. `subagent` / `all` modes bridge to
  delegation skills; `primary` mode is not supported. Per-role tool filtering is
  not supported.

## Codex

- **Skill frontmatter** partially supported. `name` (must equal the directory
  name) and `description` take effect; `license`, `compatibility`, `metadata`
  are ignored. `[[skills.config]]` `enabled = false` disables a skill.
- **`approval_policy`** partially supported. `never` → auto-approve; `untrusted` /
  `on-request` / `on-failure` → approval; the `granular` per-category switches
  are not supported (warning only).
- **`sandbox_mode`** supported (read-only / workspace-write / danger-full-access
  map one-to-one).
- **`[sandbox_workspace_write]`** not supported. `writable_roots`, `network_access`,
  `exclude_tmpdir_env_var`, `exclude_slash_tmp` are read but not applied —
  DeepSeek Harness has only three whole-session sandbox modes, no per-session
  writable-directory or network toggles.
- **`default_permissions`** partially supported. Only the built-ins `:read-only` /
  `:workspace` / `:danger-full-access` are recognized; custom `[permissions.<name>]`
  profiles are not.
- **Review subagent (`approvals_reviewer` / `[auto_review].policy` /
  `guardian_policy_config`)** not supported. DeepSeek Harness has no
  review-subagent approval flow.
- **Hooks** partially supported. `command` handlers work; `agent` handlers do
  not; `updatedInput` rewriting is not supported (same as Claude Code);
  `permissionDecision: "ask"` is not supported (Codex itself does not support
  ask).
- **MCP** partially supported. `command` / `url` work; `auth` (oauth / chatgpt)
  does not; `enabled_tools`, `disabled_tools`, `scopes`, `required` are read but
  not applied.
- **Custom roles `[agents.<name>]`** partially supported. `description` +
  `config_file` (body as system prompt) bridge to delegation skills; per-role
  tool filtering, permission gates, and `temperature` are not supported.
- **`[shell_environment_policy]`** partially supported, same as Claude Code's
  settings `env` (only subprocesses the bridge starts itself).
- **Runtime switches `web_search` / `tools.web_search` / `[features].*`** not
  supported.
- **Project trust `projects.<path>.trust_level`** partially supported. An
  explicit `untrusted` skips the project `.codex/` layers; unlisted paths are
  read unconditionally (upstream reads project layers only when trusted).

## Pi

- **Skill frontmatter** partially supported (lenient). `name` (may differ from
  the directory name), `description`, `metadata`, `disable-model-invocation`
  take effect.
- **Prompt-template substitution** partially supported. `$1` / `$@` / `$ARGUMENTS`
  in `.pi/prompts/*.md` stay literal; `argument-hint` is ignored.
- **`SYSTEM.md`** not supported (whole system-prompt replacement; DeepSeek Harness
  has no session-level system-prompt override).
- **`APPEND_SYSTEM.md`** partially supported, degraded to injecting a memory
  section instead of appending to the system prompt.
- **`enableSkillCommands`** read but not applied (DeepSeek Harness `/name` always
  works).
- **Project trust** supported: `defaultProjectTrust` (ask / never / always) and
  `trust.json` decisions take effect; the `project_trust` extension event does
  not.
- **Package-distributed skills (`package.json` `pi.skills` / in-package `skills/`)**
  not supported.
- **Extensions (`.pi/extensions/*.ts`)** not supported. DeepSeek Harness has no
  runtime for arbitrary TypeScript extensions.

## Gemini CLI

- **Skill / agent frontmatter** partially supported. `name`, `description` take
  effect; `kind: remote` (A2A remote agent) is not supported (skipped).
- **Agent `tools` wildcards** partially supported. Wildcard tool entries have no
  DeepSeek Harness tool-filter form and are dropped with a warning.
- **Command namespaces** partially supported. `commands/git/commit.toml` is
  `/git:commit`, transliterated to `git-commit`.
- **Memory** partially supported. `GEMINI.md` and local `@import` expansion take
  effect; JIT context loading (a GEMINI.md discovered when a tool touches a
  directory) is not supported — only the startup set is injected.
- **Hook event surface** partially supported. `BeforeAgent`, `AfterAgent`,
  `BeforeToolUse`, `AfterToolUse`, `SessionStart`, `SessionEnd` fire;
  `BeforeModel`, `AfterModel` do not.
- **`tool_input` rewriting** not supported (arguments frozen, same as Claude
  Code).
- **`continue: false`** partially supported. `BeforeAgent` `continue: false`
  degrades to erasing the prompt and showing the reason; `AfterAgent`
  `continue: false` (halt the loop) has no halt capability — warned or ignored.
- **`tailToolCallRequest`** not supported.
- **`transcript_path`** partially supported, passed as an empty string (DeepSeek
  Harness has no transcript file to point at).
- **Policy rules** partially supported. `toolName`, `subagent`, `mcpName`,
  `argsPattern`, `commandPrefix`, `commandRegex`, `decision` (allow / deny /
  ask_user) take effect; `modes`-gated rules are inactive (no upstream
  approval-mode state), `interactive: true` rules are inactive, `toolAnnotations`
  never matches, `allowRedirection` is not applied. Only the user tier
  (`~/.gemini/policies/`) is bridged; workspace / admin / built-in tiers are not.
- **MCP** partially supported. `httpUrl` (streamable-http) and `command` (stdio)
  work; `url` (SSE) degrades to streamable-http; `mcp.excluded` takes effect.

## Cursor

- **Skill frontmatter** partially supported. `name` (must equal the folder name),
  `description`, `disable-model-invocation`, `user-invocable`, `metadata` take
  effect; `paths` / legacy `globs` scoping is not supported.
- **Subagent frontmatter** partially supported. `name`, `description`, `model`
  take effect; `readonly`, `is_background` are not supported.
- **Rules (`.cursor/rules/*.mdc`)** partially supported. `alwaysApply: true`
  rules are injected; `alwaysApply: false` or `globs`-scoped rules are not
  (upstream selects them by semantic relevance, which DeepSeek Harness cannot
  do).
- **Hook event surface** partially supported. `preToolUse`, `postToolUse`,
  `userPromptSubmit`, `sessionStart`, `sessionEnd`, `stop`, `subagentStart`,
  `subagentStop` fire; `preCompact`, `afterAgentThought`, `workspaceOpen` do not.
- **`updated_input` (input rewriting)** not supported, same as Claude Code.
- **`updated_mcp_tool_output` (MCP output rewriting)** not supported.
- **`subagentStart` `permission: "deny"`** not supported, ignored (no channel to
  deny subagent creation at session-start).
- **Third-party Claude hooks compatibility layer** not supported. Cursor reads
  `.claude/settings*.json` itself and translates events/tool names (Bash→Shell,
  Edit→Write); the bridge does not mirror this and instead the Claude Code bridge
  covers the original files with Claude semantics.
- **Permissions (`cli.json`)** partially supported. The rule list takes effect;
  global/project lists merge by "the most specific layer replaces the whole
  list", which is the bridge's interpretation — upstream docs do not specify the
  merge.
- **MCP** partially supported. `type: "http"` / `"sse"` degrade to streamable-http.

## Related pages

- Per-tool limitations: [Claude Code](claude-code.md) ·
  [CodeBuddy Code](codebuddy-code.md) · [OpenCode](opencode.md) ·
  [Codex](codex.md) · [Pi](pi.md) · [Gemini CLI](gemini-cli.md) ·
  [Cursor](cursor.md)
