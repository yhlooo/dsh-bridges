# The Gemini CLI bridge

[中文](gemini-cli.zh.md)

Bridges assets configured for Gemini CLI into DeepSeek Harness: `.gemini/`
skills, commands, and subagent definitions; `GEMINI.md` memory; `settings.json`
hooks and `mcpServers`; and Policy Engine rules. For install steps and
behaviors shared by all bridges, see the [guides index](README.md).

## Config

The bridge owns a config section under the `bridges` row; any later patch layer
can override it:

```yaml
- id: bridges
  config:
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
```

## Skills, commands, and subagents

Reads the Gemini CLI asset locations and registers them on the DeepSeek Harness skill registry (provider `gemini-cli`), so they appear in the model-facing skill catalog and are invocable with `/name`:

| Gemini CLI location | Registered as |
| :--- | :--- |
| `~/.gemini/skills/<name>/SKILL.md` (user) and `.gemini/skills/<name>/SKILL.md` (workspace) | skill (directory skills, non-recursive) |
| `~/.gemini/commands/<name>.toml` / `.gemini/commands/<name>.toml` (also nested `<group>/<name>.toml`) | command (a skill; the TOML `prompt` is the body; nested: named `group-name`) |
| `~/.gemini/agents/*.md` / `.gemini/agents/*.md` | subagent definition as a delegation-spec skill |

Mapping rules:

- The skill name is the frontmatter `name` (falling back to the directory name when absent); names must be kebab-case for DeepSeek Harness. Command names come from the file path: nested files yield the upstream namespaced command with the path separator converted to `:` (`commands/git/commit.toml` → `/git:commit`), which maps onto the kebab-case skill name `git-commit` — DeepSeek Harness skill names cannot contain `:`. Directories whose own qualified name is not kebab-case are skipped wholesale.
- `description` is required for skills (fail closed); command `description` is optional (falls back to the first paragraph of the prompt).
- Precedence follows Gemini's discovery tiers (built-in < extension < user < workspace): **workspace assets override user assets**, and a skill overrides a same-name command at the same level. Native DeepSeek Harness skills always win on name conflicts (see [Common behaviors](README.md#common-behaviors)). The `.agents/skills` alias locations are deliberately not re-read (DeepSeek Harness's filesystem provider covers `.agents` assets).
- `skills.disabled` names and the `skills.enabled` master switch come from settings.json.
- Subagents reuse the delegation-spec pattern: `name` / `description` / `tools` (Gemini tool names translated to DeepSeek Harness names; `*` and `mcp_*` wildcards are dropped — omitting `tools` already means "all") / `model` (→ `agentOptions.model`) / `max_turns` (→ `maxDepth`). `kind: remote` (A2A) agents are skipped; `mcpServers`, `temperature`, and `timeout_mins` are recorded as limitations.
- Existing skill roots and settings files are watched; edits appear in the session without a restart.

## GEMINI.md memory

Injects the Gemini context-file chain at session start, in the same system-reminder framing DeepSeek Harness uses for workspace instructions:

- `~/.gemini/GEMINI.md` (global)
- the workspace `GEMINI.md` and the same file in every parent directory up to the memory boundary (the first directory containing a `context.memoryBoundaryMarkers` entry — default `[" .git"]`), root-first
- `context.fileName` renames the file (string or list, default `GEMINI.md`); `context.discoveryMaxDirs` caps the walk (default 200)

`@./relative/path.md` and `@/absolute/path.md` imports are expanded inline (canonical-path dedup, cycle-capped, missing imports kept as literal lines). Gemini's JIT loading — context files discovered when a tool touches a directory — has no DeepSeek Harness seam and is recorded as a limitation. Budget 32 KiB: the broader global file is dropped first, then the most specific sections are truncated.

## Hooks

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

## Permissions (Policy Engine)

Bridges the user-tier policy rules from `~/.gemini/policies/*.toml` into the `tools/pre-execute` permission seam (the workspace tier is disabled upstream, issue #18186, and is therefore not read either; admin/built-in policies live in the Gemini installation and are out of scope — DeepSeek Harness's own approval policy fills that role):

- `[[rule]]` entries: `toolName` (glob wildcards such as `*` / `mcp_*`, string or array), `subagent`, `mcpName`, `argsPattern` (JSON-object subset with deep equality), `commandPrefix` / `commandRegex` (run_shell_command only), `decision` (`allow` / `deny` / `ask_user`), `priority` (0–999), `denyMessage`.
- Evaluation follows Gemini: `final = 4 (user tier) + priority/1000`; rules run highest-first and the **first full match** decides. Tool names are translated first; subagent delegations match rules naming the agent (`toolName` or the `subagent` field compares the delegation label).
- `ask_user` maps to the DeepSeek Harness approval channel (`ask`), like the other bridges; `deny` uses `denyMessage` as the reason.
- Hooks and rules compose: a BeforeTool hook `deny` denies outright; a hook `allow` does not override a matching deny rule; with no hook decision the rules decide.
- Recorded limitations: `modes`-gated rules are inactive (DeepSeek Harness has no upstream approval-mode state), `interactive: true` rules are inactive (headless sessions), `toolAnnotations` can never match (no annotations seam), and `allowRedirection` handling is not applied.

## MCP servers

Bridges Gemini's settings.json `mcpServers` into DeepSeek Harness tools as `mcp__gemini__<server>__<tool>`. Per entry the transport picks `httpUrl` (streamable-http) > `url` (SSE, degraded to streamable-http with a warning) > `command` (stdio with `args` / `env` / `cwd`); `${VAR}` / `${VAR:-DEFAULT}` references expand from the process environment and relative `cwd` resolves against the declaring settings file. `mcp.allowed` filters the connected set, `mcp.excluded` always skips; startup failures fail open. Not bridged (recorded as limitations): `includeTools` / `excludeTools` (no per-tool filter seam), `trust` gating (read but not enforced — the DeepSeek Harness tool approval stack gates the tools), OAuth (`targetAudience` / `targetServiceAccount`), and admin-tier controls.

## Limitations

Not bridged yet (documented per subsystem):

- **Skills**: nested skill directories, built-in and extension skills (they live inside the Gemini installation), skill enable/disable gestures (`/skills`) are runtime state; `scripts`/`references`/`assets` bundles work through the resource base.
- **Commands**: namespaced `dir:name` commands (not kebab-case), `!{...}` shell-execution and `@{...}` file-injection markers (the body is passed through verbatim; the markers are not evaluated), `{{args}}` substitution happens through DeepSeek Harness's own `/name <args>` append behavior.
- **Memory**: JIT context-file loading, the Memory tool's per-project private memory directory and auto-memory (experimental), `.env` loading.
- **Hooks**: `BeforeModel` / `AfterModel` / `BeforeToolSelection` / `PreCompress` / `Notification`; AfterAgent's `prompt` / `prompt_response` are empty (DeepSeek Harness does not expose the final response text at turn-stopping); `hookSpecificOutput.tool_input` rewriting, `tailToolCallRequest`, `continue: false` (no halt seam), `transcript_path` (no transcript file), `suppressOutput`.
- **Permissions**: workspace/admin/built-in tiers, `modes` / `interactive` / `toolAnnotations` / `allowRedirection` semantics (see above).
- **Subagents**: `kind: remote` (A2A), inline `mcpServers`, `temperature`, `timeout_mins`, `@name` forced delegation (the skill instructs the model to delegate instead).
- **MCP**: see the MCP section above.
- **Other**: extensions (bundled commands/hooks/skills/agents/MCP/policies/themes), themes, output formats, sandbox and trusted-folders, browser agents, notifications, and settings `env` for model-side shell calls (bridge-spawned children only) — DeepSeek Harness owns these layers; model routing (`model`, `GEMINI_MODEL`) is host-plane and out of scope.
