# The Codex bridge

[中文](codex.zh.md)

Bridges assets configured for Codex into DeepSeek Harness: `.agents/` skills,
the `AGENTS.md` instruction chain, `hooks.json` / `config.toml` hooks,
approval/sandbox policy, and `[mcp_servers]` entries. For install steps and
behaviors shared by all bridges, see the [guides index](README.md).

## Config

The bridge owns a config section under the `bridges` row; any later patch layer
can override it:

```yaml
- id: bridges
  config:
    codex:
      enabled: true                      # master switch for the Codex bridge
      skills: true                       # discover .agents/skills (cwd → repo root), ~/.agents/skills, /etc/codex/skills
      memory: true                       # inject the AGENTS.md instruction chain
      hooks: true                        # run Codex hooks from hooks.json / config.toml
      permissions: true                  # apply approval_policy / sandbox_mode / default_permissions at session start
      mcp: true                          # bridge config.toml [mcp_servers] entries
      userCodexDir: '~/.codex'           # user-level Codex directory (CODEX_HOME wins when set)
      userSkillsDir: '~/.agents/skills'  # user-level skills directory
      watch: true                        # watch skill roots and settings files
      hookTimeoutMs: 600000              # Codex's 600-second hook default
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Skills

Reads the Codex skill locations and registers them on the DeepSeek Harness skill registry (provider `codex`):

| Codex location | Registered as |
| :--- | :--- |
| `$CWD/.agents/skills/<name>/SKILL.md`, then every parent folder up to the repository root | project-level skill (closest directory first) |
| `~/.agents/skills/<name>/SKILL.md` | user-level skill |
| `/etc/codex/skills/<name>/SKILL.md` | system-level skill |

Mapping rules:

- The DeepSeek Harness skill name is the directory name (must be kebab-case). Frontmatter must include `name` (matching the directory) and `description` (capped at 1,024 characters) per the agent-skills standard; invalid skills are dropped with a warning.
- Precedence: project skills (closest directory first) override user skills, which override system skills. Native DeepSeek Harness skills always win on name conflicts (see [Common behaviors](README.md#common-behaviors)).
- Skills disabled via `[[skills.config]]` entries (`path` + `enabled = false`) in `config.toml` are skipped; relative paths resolve against the config file's `.codex/` directory.
- Custom `[agents.<name>]` roles become delegation-spec skills too: the role's `description` is the skill description, the role's `config_file` TOML content becomes the body, and a `model` key inside it maps to `agentOptions.model`.
- The repository root is found with `project_root_markers` (default `['.git']`); without a marker only the current directory is checked, as Codex does. Skill roots and settings files are watched.

## AGENTS.md instruction-chain memory

DeepSeek Harness's own loader reads `AGENTS.md` (and `CLAUDE.md`) at every directory from the project root down to the working directory. The bridge additionally injects Codex's instruction chain at session start, in the same system-reminder framing:

- `developer_instructions` from the most specific config layer (injected first, as Codex does)
- `$CODEX_HOME/AGENTS.override.md` if present, else `$CODEX_HOME/AGENTS.md` (first non-empty wins; `CODEX_HOME` is honored)
- one file per directory walking from the repository root down to the working directory: `AGENTS.override.md` > `AGENTS.md` > `project_doc_fallback_filenames`; files closer to the working directory come later and override earlier guidance
- plain `AGENTS.md` files are skipped at every level (DeepSeek Harness already loads them); empty files are skipped; project accumulation stops at `project_doc_max_bytes` (32 KiB default)

Budget 32 KiB for the injected block: broader user-level sections are dropped first, then the most specific ones are truncated.

## Hooks

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

## Permissions (approval / sandbox policy)

Reads `approval_policy`, `sandbox_mode`, and `default_permissions` from the merged config layers and applies them to each session at `agent/session-start` (main conversations and subagent sessions alike):

- **`sandbox_mode`**: `read-only` / `workspace-write` / `danger-full-access` map 1:1 onto DeepSeek Harness sandbox modes through the session's `sandbox/mode` override.
- **`approval_policy`**: `never` → DeepSeek Harness approval policy `never` (auto-approve); `untrusted` / `on-request` / deprecated `on-failure` / `granular` → `ask` (Codex prompts for approvals under all of these; DeepSeek Harness's `ask` delegates to the composed answerers). A `granular` table's per-category switches (`sandbox_approval`, `rules`, `mcp_elicitations`, `request_permissions`, `skill_approval`) are logged but not enforced.
- **`default_permissions`**: applies only when it names a built-in profile — `:read-only`, `:workspace`, `:danger-full-access` — and then wins over `sandbox_mode`, as the profile is Codex's current mechanism. Custom `[permissions.<name>]` profiles are read but not applied.
- **Only explicitly configured values apply**: Codex's own defaults (read-only sandbox, `untrusted` approvals) never override the DeepSeek Harness deployment's policy.

Not bridged (recorded as limitations): `[sandbox_workspace_write]` `writable_roots` / `network_access` / `exclude_tmpdir_env_var` / `exclude_slash_tmp` (DeepSeek Harness sessions have no per-session writable-roots override), custom permission profiles' filesystem/network rule tables, `approvals_reviewer` / `[auto_review]` guardian policy (no reviewer-subagent approval flow in DeepSeek Harness), and per-category granular approval switches.

## MCP servers

Bridges Codex's `[mcp_servers.<id>]` tables (from every active config layer; the most specific layer defines each id) into DeepSeek Harness tools as `mcp__codex__<server>__<tool>`. `url` entries map onto the streamable-http transport (with `http_headers` plus a bearer token from `bearer_token_env_var`); `command` entries map onto stdio (`args`, `env`, `env_vars` whitelisted from the process environment, `cwd`). `enabled = false` skips a server; startup failures fail open with a warning. Not bridged (recorded as limitations): `auth` (oauth/chatgpt credential flows), `scopes`, `enabled_tools`/`disabled_tools` and per-tool approval modes, `required` semantics (a required server that fails to start still only warns), and Codex's project-trust gating (project `[mcp_servers]` connect unconditionally; the DeepSeek Harness tool approval stack gates their tools).

## Limitations

Not bridged yet (documented per subsystem):

- **Skills**: `agents/openai.yaml` metadata (`allow_implicit_invocation`, tool dependencies), plugin-bundled skills, symlinked skill folders (the bridge reads them through the filesystem, but does not resolve symlink identity), the curated plugin catalog.
- **Memory**: `model_instructions_file` (replaces the built-in instructions — out of scope), Codex's 8,000-character initial-list budget (DeepSeek Harness applies its own catalog budgets).
- **Hooks**: `PermissionRequest` (no DeepSeek Harness seam for "about to ask for approval"), `PreCompact`/`PostCompact` (no pre-compaction seam; the `compact` session-start source runs SessionStart hooks instead), Codex's hook trust-review flow (`/hooks` — the bridge runs hooks the way the other bridges do, without a trust gate), background-hook output delivery at the next safe point, `systemMessage`/`suppressOutput` user-only channels, `additionalContextLimit` spilling (the bridge caps context by characters instead), plugin-bundled and managed `requirements.toml` hooks, `transcript_path` (the bridge has no transcript file to point at), `updatedInput` rewriting (DeepSeek Harness freezes tool arguments before policy).
- **Rules / config**: `rules/*.rules` (experimental Starlark DSL), `notify`, `[agents.<name>]` role options beyond `description`/`config_file` (per-role tool filters, `model` outside the config file, and the role's permission gates), `requirements.toml`, profile files (`--profile`), plugin-bundled MCP servers (`plugins.<plugin>.mcp_servers`), and untrusted-project gating beyond an explicit `projects["<path>"].trust_level = "untrusted"` entry (which now skips the project `.codex/` layers — the bridge has no interactive trust flow, so unlisted paths are read unconditionally).
- **Other config**: `web_search`/`tools.web_search` modes, `[features].*` runtime flags (only `features.hooks` is read), `[shell_environment_policy]` (applies to bridge-spawned children only — same seam as settings `env`), `[apps]` connectors, `[memories]`, `[history]`, `tool_output_token_limit`, `file_opener`, `[otel]`, `[desktop]`/`[tui]`, and auth/notice/logging keys — DeepSeek Harness owns these layers; model/provider selection (`model`, `review_model`, `model_provider`, `[model_providers]`, `model_reasoning_*`, `model_auto_compact_token_limit*`) is host-plane and out of scope.

