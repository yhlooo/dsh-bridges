# The Cursor bridge

[中文](cursor.zh.md)

Bridges assets configured for Cursor into DeepSeek Harness: `.cursor/` skills
and subagent definitions, always-apply rules memory, `hooks.json` hooks, CLI
permission rules, and MCP servers. For install steps and behaviors shared by
all bridges, see the [guides index](README.md).

## Config

The bridge owns a config section under the `bridges` row; any later patch layer
can override it:

```yaml
- id: bridges
  config:
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

## Skills and subagents

Reads the Cursor skill locations and registers them on the DeepSeek Harness skill registry (provider `cursor`), so they appear in the model-facing skill catalog and are invocable with `/name`:

| Cursor location | Registered as |
| :--- | :--- |
| `~/.cursor/skills/**/SKILL.md` (user) and `.cursor/skills/**/SKILL.md` (project) | skill (recursive discovery; the skill identity is the folder containing `SKILL.md`) |
| `~/.cursor/agents/*.md` / `.cursor/agents/*.md` | subagent definition as a delegation-spec skill |

Mapping rules:

- The skill name is the frontmatter `name` (falling back to the folder name); `description` is required (fail closed). Names must be kebab-case for DeepSeek Harness.
- `disable-model-invocation: true` → the skill leaves the model catalog but stays user-invocable; `user-invocable: false` → hidden from human invocation, model-only; `metadata` is carried through. `paths` / legacy `globs` path scoping and nested-folder scoping are recorded as limitations.
- Precedence: project assets override user assets (Cursor documents project > user for subagents); a skill overrides a same-name agent at the same level. Native DeepSeek Harness skills always win on name conflicts (see [Common behaviors](README.md#common-behaviors)). The compat roots (`.agents/skills`, `.claude/skills`, `.codex/skills`) are deliberately not re-read — the filesystem provider and the other bridges cover them.
- Subagents reuse the delegation-spec pattern (`name` / `description` / `model` → `agentOptions.model`); `readonly` and `is_background` are recorded as limitations.

## Rules memory

Injects Cursor's persistent instructions at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions:

- every `.cursor/rules/**/*.mdc` file with `alwaysApply: true` (the rules directory anchors at the repository root)
- `AGENTS.md` files in subdirectories between the repository root (exclusive) and the working directory (inclusive)

Relevance-based rules (no `alwaysApply`), glob-scoped rules, `.md` files under `.cursor/rules` (ignored upstream without frontmatter), user rules (Cursor settings, not files), and the root `CLAUDE.md` (already injected by the claude-code bridge) are recorded as limitations. Budget 32 KiB, truncated with a marker when exceeded.

## Hooks

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

## Permissions

Enforces the CLI permission tokens from `~/.cursor/cli-config.json` → `.cursor/cli.json` (`permissions.allow` / `permissions.deny`; the most specific layer wins each list) at the `tools/pre-execute` seam:

- `Shell(commandBase)` — glob on the command's first token, plus `command:args` (the args part is globbed against the rest of the command line)
- `Read(pathOrGlob)` / `Write(pathOrGlob)` — `**` / `*` / `?` globs against the file path; a token of one type never matches another tool
- `WebFetch(domainOrPattern)` — exact hostname or `*.domain` subdomain suffix
- `Mcp(server:tool)` — globs per part against the runtime `mcp__cursor__<server>__<tool>` names (the bridge namespace is stripped, so rules written as Cursor's `mcp__<server>__<tool>` hit their target)

**deny wins over allow**; there is no ask level, so unmatched calls fall through to the DeepSeek Harness approval policy. Hook decisions compose first (a hook deny wins; a hook allow does not override a matching deny rule). Recorded limitations: `approvalMode` is read but not enforced (DeepSeek Harness owns its approval modes), and `permissions.json` (`mcpAllowlist` / `terminalAllowlist` / `autoRun`) tunes Cursor's own prompt flows and is read but not enforced.

## MCP servers

Bridges `.cursor/mcp.json` and `~/.cursor/mcp.json` `mcpServers` into DeepSeek Harness tools as `mcp__cursor__<server>__<tool>` (project overrides user per name). stdio entries (`command` / `args` / `env` / `envFile`) spawn with Cursor's configuration-variable interpolation (`${env:VAR}`, `${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}`, `${/}`); remote `url` entries connect over streamable-http with header interpolation. `auth` OAuth flows are recorded as a limitation.

## Limitations

Not bridged yet (documented per subsystem):

- **Skills**: `paths` / legacy `globs` path scoping, nested-folder auto-scoping, plugin-provided skills.
- **Memory**: relevance-based and glob-scoped rules, user rules (Cursor settings), the root `CLAUDE.md` (covered by the claude-code bridge), `.cursorrules` (legacy).
- **Hooks**: prompt-type hooks, `preCompact`, `afterAgentThought`, `workspaceOpen`, Tab hooks, enterprise/team hook tiers, `updated_input` / `updated_mcp_tool_output` rewriting, `env` from `sessionStart` (per-session environment has no seam).
- **Permissions**: `approvalMode`, `permissions.json` semantics, sandbox.json (network policy / extra paths have no per-session seam).
- **MCP**: `auth` credential flows.
- **Other**: `~/.cursor/settings.json` (IDE settings; only `enabled_plugins` reaches the CLI), themes — DeepSeek Harness owns these layers; model routing is host-plane and out of scope. Cursor's third-party Claude Code hooks compatibility (Cursor reads `.claude/settings*.json` hooks and translates event/tool names itself) is not re-read — the claude-code bridge covers the original files with Claude semantics. `.cursorignore` / `.cursorindexingignore` (DeepSeek Harness owns its ignore layer), `worktrees.json` (worktree setup scripts), and the ACP server mode (`agent acp`) are also out of scope.
