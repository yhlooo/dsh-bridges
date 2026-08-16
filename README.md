# dsh-bridges

English | [中文](README_CN.md)

> This project is implemented by DeepSeek Harness.

[![CI](https://github.com/yhlooo/dsh-bridges/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yhlooo/dsh-bridges/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/dsh-bridges)](https://www.npmjs.com/package/dsh-bridges)
[![npm downloads](https://img.shields.io/npm/dm/dsh-bridges)](https://www.npmjs.com/package/dsh-bridges)
[![license](https://img.shields.io/github/license/yhlooo/dsh-bridges)](LICENSE)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that bridges projects already configured for Claude Code, CodeBuddy Code, opencode, Codex, pi, Gemini CLI, or Cursor into DeepSeek Harness, so existing skills, commands, memory, and hooks continue to work without any migration.

## Quick start

```sh
# the general form:
#   dsh plugin --profile <profile-name> add dsh-bridges
#   dsh --profile <profile-name>

# Web UI example:
dsh plugin --profile web add dsh-bridges
dsh web    # = dsh --profile web
```

```sh
# headless (one-shot CLI) is also supported — the invoking directory is the workspace:
dsh plugin --profile headless add dsh-bridges
cd my-project
dsh --profile headless "list the skills available in your catalog"
```

To install from a checkout of this repository, build it first: `pnpm install && pnpm build && dsh plugin --profile <profile-name> add .`

Complete example projects for each agent tool are available in [`examples/`](examples/) (`claude-code`, `codebuddy-code`, `opencode`, `codex`, `pi`, `gemini-cli`, `cursor`); open one as the session workspace to observe its skills, memory, and hooks being bridged.

All bridges are enabled by default and can be configured or disabled individually from any patch layer:

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: true     # master switch for this bridge
      skills: true      # .claude skills and commands
      memory: true      # CLAUDE.md memory
      hooks: true       # settings.json hooks
      permissions: true # settings.json permission rules (allow/ask/deny)
```

Full per-bridge configuration and behavior: [`docs/guides/`](docs/guides/README.md)

## What it bridges

| Assets already in your project | What DeepSeek Harness provides |
| :--- | :--- |
| `.claude/` `.codebuddy/` `.opencode/` `.agents/` `.pi/` `.gemini/` `.cursor/` skills and commands | model skill catalog + `/name` invocation |
| `CLAUDE.md`, `CODEBUDDY.md`, `AGENTS.md`, `GEMINI.md` chains and rules | session-start memory injection |
| `settings.json`, `hooks.json`, `config.toml` hooks | the same hooks at DeepSeek Harness lifecycles |
| `settings.json` `permissions` rules, policy files, CLI rules | the same allow/ask/deny decisions on tool calls |
| `.mcp.json`, `config.toml`, `opencode.json`, `mcp.json` MCP servers | bridged MCP tools |

## Supported agents

| Agent | Skills / commands | Memory | Hooks | Permissions | MCP |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Claude Code | `.claude/skills`, `.claude/commands`, `.claude/agents` (+ `~/.claude`) | `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md` | `settings.json` hooks (SessionStart, UserPromptSubmit, Pre/PostToolUse(+Failure), Stop, SessionEnd) | `settings.json` permission rules (allow/ask/deny: Bash prefixes, paths, domains) | `.mcp.json` + `~/.claude.json` MCP servers |
| CodeBuddy Code | `.codebuddy/skills`, `.codebuddy/commands`, `.codebuddy/agents` (+ `~/.codebuddy`) | `CODEBUDDY.md`, `~/.codebuddy/CODEBUDDY.md`, `.codebuddy/rules/` | `settings.json` hooks (SessionStart, UserPromptSubmit, Pre/PostToolUse(+Failure), Stop, SessionEnd) | `settings.json` permission rules (allow/ask/deny: exact/prefix/glob Bash, case-insensitive paths, MCP, Skill) | `.mcp.json` + `~/.codebuddy/.mcp.json` MCP servers |
| opencode | `.opencode/skills`, `.opencode/commands` (+ `~/.config/opencode`), `command.*` in `opencode.json` | `AGENTS.md` (+ `CLAUDE.md` fallback), `instructions` files | — (opencode has no hooks config; its plugin API is out of scope) | `permission` rules from `opencode.json(c)` (families, last-match-wins patterns, `external_directory`, built-in defaults) | `opencode.json(c)` `mcp` servers |
| Codex | `.agents/skills` (cwd → repo root), `~/.agents/skills`, `/etc/codex/skills` | `~/.codex/AGENTS.md` + per-directory `AGENTS.md` chain | `hooks.json` / `config.toml` hooks (SessionStart, SubagentStart, UserPromptSubmit, Pre/PostToolUse, Stop, SubagentStop, SessionEnd) | `config.toml` approval/sandbox policy (`approval_policy`, `sandbox_mode`, built-in `default_permissions` profiles) | `config.toml` `[mcp_servers]` entries |
| pi | `.pi/skills`, `.pi/prompts` (+ `~/.pi/agent`; project assets are trust-gated) | `AGENTS.md` / `CLAUDE.md` chain + `APPEND_SYSTEM.md` | — (pi has no hooks config; its extension event bus is out of scope) | — (pi has no permission-rule system) | — (pi has no MCP config) |
| Gemini CLI | `.gemini/skills`, `.gemini/commands`, `.gemini/agents` (+ `~/.gemini`) | `GEMINI.md` chain (with `@` imports) | `settings.json` hooks (SessionStart, BeforeAgent, AfterAgent, Before/AfterTool, SessionEnd) | `~/.gemini/policies/*.toml` rules (user tier, allow/deny/ask_user) | `settings.json` `mcpServers` |
| Cursor | `.cursor/skills`, `.cursor/agents` (+ `~/.cursor`) | `.cursor/rules/*.mdc` (alwaysApply) + subdirectory `AGENTS.md` | `hooks.json` hooks (sessionStart, beforeSubmitPrompt, pre/postToolUse, stop, subagent events, beforeShellExecution, …) | `cli.json` / `cli-config.json` `Shell()`/`Read()`/`Write()`/`WebFetch()`/`Mcp()` rules (deny > allow) | `.cursor/mcp.json` + `~/.cursor/mcp.json` |

## Resources

- Example projects, one per bridged agent tool: [`examples/`](examples/)
- Usage guide (per-bridge details, full config reference, what is not bridged yet): [`docs/guides/`](docs/guides/README.md)
- Bridge-target reference materials (official upstream specs): [`docs/reference/`](docs/reference/)
- Contributor documentation (how to add a new agent tool, integration surface, pitfalls): [`docs/development/`](docs/development/)
