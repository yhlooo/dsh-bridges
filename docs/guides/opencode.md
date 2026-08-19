# The OpenCode bridge

[中文](opencode.zh.md)

Bridges assets configured for OpenCode into DeepSeek Harness: `.opencode/`
skills and commands (including `command.*` JSON commands), `AGENTS.md` rules
and `instructions` memory, `opencode.json(c)` permission rules, and MCP
servers. OpenCode has no hooks configuration; its plugin API is out of scope.
For install steps and behaviors shared by all bridges, see the
[guides index](README.md).

## Config

The bridge owns a config section under the `bridges` row; any later patch layer
can override it:

```yaml
- id: bridges
  config:
    opencode:
      enabled: true                   # master switch for the OpenCode bridge
      skills: true                    # discover .opencode / ~/.config/opencode skills and commands (+ JSON commands)
      memory: true                    # inject AGENTS.md rules (with CLAUDE.md fallback) and instructions files
      permissions: true               # enforce permission rules from opencode.json(c)
      mcp: true                       # bridge opencode.json(c) mcp servers
      userOpencodeDir: '~/.config/opencode'  # user-level OpenCode directory
      userClaudeDir: '~/.claude'      # user-level Claude Code directory for the CLAUDE.md fallback
      claudeCompat: true              # honor OpenCode's Claude Code compatibility fallbacks
      watch: true                     # watch asset roots and config files
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Skills and commands

Reads the OpenCode asset locations and registers them on the DeepSeek Harness skill registry (provider `opencode`), so they appear in the model-facing skill catalog, load through the `skill` tool, and are invocable with `/name`:

| OpenCode location | Registered as |
| :--- | :--- |
| `.opencode/skills/<name>/SKILL.md` | project-level skill |
| `.opencode/commands/<name>.md` | project-level command (a skill) |
| `command.<name>` in `opencode.json(c)` | project-level command (overrides a same-name command file) |
| `~/.config/opencode/skills/<name>/SKILL.md` | user-level skill |
| `~/.config/opencode/commands/<name>.md` | user-level command (a skill) |
| `command.<name>` in `~/.config/opencode/opencode.json(c)` | user-level command (overrides a same-name command file) |

Mapping rules:

- The DeepSeek Harness skill name is the directory / file name, and must be a valid OpenCode name (`^[a-z0-9]+(-[a-z0-9]+)*$` — lowercase alphanumerics with single hyphens); anything else is skipped with a warning.
- Skills require the OpenCode-validated frontmatter: `name` (must equal the directory name) and `description` (1–1,024 characters, capped). Missing or mismatched fields drop the skill with a warning, exactly like OpenCode's troubleshooting rules. `metadata` (string-to-string) is carried through; `license`/`compatibility` are ignored.
- Command bodies are the prompt templates; `description` frontmatter (or the first body paragraph) becomes the skill description. `agent`, `model`, and `subtask` are not bridged (DeepSeek Harness has no per-command agent routing).
- `.opencode/skills` is discovered **upward** from the working directory to the git root (closest directory first, as OpenCode walks); `skills.paths` entries in `opencode.json(c)` add extra skill roots (resolved against the config file; `skills.urls` need network and are skipped with a limitation note).
- OpenCode's Claude-compat (`.claude/skills`, `~/.claude/skills`) and agent-compat (`.agents/skills`, `~/.agents/skills`) skill roots are **not re-read**: the claude-code bridge already covers `.claude` assets and DeepSeek Harness's own filesystem provider covers `.agents` assets, so re-registering them would duplicate candidates.
- Precedence: project assets override user assets; a skill overrides a same-name command; JSON-configured commands override same-name command files at the same level. Native DeepSeek Harness skills always win on name conflicts (see [Common behaviors](README.md#common-behaviors)).
- Custom `agent.<id>` definitions (modes `subagent` / `all`) become delegation-spec skills: `description` is the skill description, `prompt` (inline string or `{ file: ... }`) becomes the system-prompt body, and `model` maps to `agentOptions.model`. `mode: "primary"` agents are main assistants and are not bridged.
- Existing asset roots and `opencode.json(c)` files are watched; edits appear in the session without a restart.

## AGENTS.md / CLAUDE.md rules and instructions memory

DeepSeek Harness's own loader reads `AGENTS.md` and `CLAUDE.md` at every directory from the project root down to the working directory. The bridge additionally injects at session start, in the same system-reminder framing:

- `~/.config/opencode/AGENTS.md` (global rules; `~/.claude/CLAUDE.md` is the fallback when absent, as OpenCode does)
- the closest `AGENTS.md` walking up from the working directory to the git root, with the closest `CLAUDE.md` as the compatibility fallback (first match wins per category); inside a repository this file always sits on DeepSeek Harness's instruction chain and is skipped — without a git root, files above the cwd are still injected
- `instructions` entries from `opencode.json(c)`: local file paths and `*`/`**` glob patterns resolved against the config file's directory (remote URLs are skipped — the bridge does not fetch them)
- local `references` from `opencode.json(c)`: `@alias` → resolved absolute path + description, injected the way OpenCode advertises references in agent context; git `repository` references need a clone and are skipped with a warning (same no-fetch policy)

Budget 32 KiB: broader user-level sections are dropped first, then the most specific ones are truncated.

## Permissions

Reads the `permission` field from `opencode.json(c)` (global + project layers; per family the most specific layer that defines it wins) and enforces it at the `tools/pre-execute` seam with OpenCode's semantics:

- Grammar: a bare string (`permission: "allow" | "ask" | "deny"`) or an object keyed by family — `*` (default), `read`, `edit` (covers `edit`/`write`), `glob`, `grep`, `bash`, `task`, `skill`, `question`, `websearch`, `external_directory`, plus `lsp`/`doom_loop` (see limitations). Families hold either an action or ordered `pattern → action` rules where the **last matching rule wins** (put `"*"` first, specific rules after, as OpenCode documents).
- Wildcards are OpenCode's (`*` any chars, `?` one char); `~`/`$HOME` expand at the pattern start; worktree-relative patterns match paths relative to the working directory.
- Built-in defaults apply when `permission` is configured: most families allow, `external_directory` asks, and reads deny `.env` / `.env.*` except `.env.example` — the upstream defaults.
- DeepSeek Harness tool mapping: `read`→read, `edit`/`write`→edit, `glob`→glob, `grep`→grep, `bash`→bash, `subagent`→task (family-level only; subagent-type patterns have no DeepSeek Harness field), `skill`→skill (matches the skill name), `ask_user_question`→question, `web`/`web_search`→websearch (matches the query). Tools with no OpenCode family (`todo_write`, `pwsh`, `exit_plan_mode`, MCP tools, …) defer to DeepSeek Harness's own approval policy.
- `external_directory` triggers when a read/edit/write path falls outside the working directory; its default is `ask`, matching OpenCode.
- When **no** config layer defines `permission`, the bridge stays out of the way and DeepSeek Harness policy applies unchanged. When it is defined, calls on mapped families that match no rule resolve to OpenCode's permissive defaults — the upstream posture carries over (allow skips approval, ask prompts, deny blocks); unmapped tools always defer to DeepSeek Harness.

Not bridged (recorded as limitations): `doom_loop` (repeat-detection has no seam), `webfetch` (no URL-fetch tool), `lsp` (no LSP tool), the deprecated legacy `tools` boolean config, and per-agent permission overrides (`agent.<name>.permission` — DeepSeek Harness sessions carry no OpenCode agent identity).

## MCP servers

Bridges OpenCode's `mcp` config (`opencode.json(c)`, project overrides global per name) into DeepSeek Harness tools as `mcp__opencode__<server>__<tool>`. `type: "local"` entries map `command` (an array: executable + args, per OpenCode's format) and `environment` onto the stdio transport; `type: "remote"` entries map `url` (+ optional `headers`) onto streamable-http. `enabled: false` skips a server; startup failures fail open. OAuth credential flows for remote servers have no DeepSeek Harness seam and are recorded as a limitation.

## Limitations

Not bridged yet (documented per subsystem):

- **Skills / commands**: nested command directories (not documented by OpenCode), `$ARGUMENTS`/`$1`/`!`command``/`@file` substitution in command templates, `agent`/`model`/`subtask` command options, `agent.<id>` `mode: "primary"` agents and per-agent `permission`/`temperature` overrides (subagent-mode agents are bridged as delegation-spec skills), `skills.urls` (network), and `references` git repositories (network).
- **Memory**: `OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` / `OPENCODE_CONFIG_CONTENT` overrides, remote/managed config layers, upward config-file discovery (project `opencode.json` is read at the cwd only; `.opencode/skills` upward discovery is bridged), `{env:…}`/`{file:…}` substitution in config.
- **Plugins / tools**: OpenCode's JavaScript plugin system (its event hooks need the OpenCode runtime) and custom tools have no file-format bridge here.
- **Runtime / model config**: `formatter`, `lsp`, `experimental.*` (including the documented `policies`), custom `provider` definitions, and `model`/`small_model` defaults — DeepSeek Harness owns model routing, formatting, and diagnostics; these are out of scope (no file-format bridge).
- **CLI / UI**: `share`/`autoshare`/`username`/`logLevel`/`layout`/`tool_output`/`enterprise`/`server`/`shell`/`watcher`/`snapshot`/`compaction`/`attachment.image`/`autoupdate`/provider switches/`default_agent`/`subagent_depth`, `.opencode/themes/`, `tui.json`/`OPENCODE_TUI_CONFIG`, `keybinds`, and `.opencode/modes/` — cosmetic or runtime concerns with no DeepSeek Harness equivalent.
- **Overlap note**: when `claudeCode.memory` is also enabled, the `~/.claude/CLAUDE.md` fallback can be injected twice (once per bridge); keep one of the two memory switches off, or accept the duplicate block.

