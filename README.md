# dsh-bridges

English | [中文](README_CN.md)

> This project is implemented by DeepSeek Harness.

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that bridges projects already configured for Claude Code, CodeBuddy Code, opencode, or Codex into DeepSeek Harness — your skills, commands, memory, and hooks keep working with zero migration.

> 🚧 **Status.** Phases 1–4: Claude Code, CodeBuddy Code, opencode, Codex (shipped). More agents planned.

## Quick start

```sh
# 1. install once into a DeepSeek Harness profile
dsh plugin --profile <name> add dsh-bridges

# 2. run DeepSeek Harness in a project already set up for another agent — that's it
cd my-claude-project        # has .claude/ assets
dsh --profile <name> "list the skills available in your catalog"
# → every .claude skill & command becomes a /name skill, CLAUDE.md is injected,
#   and the project's settings.json hooks run unchanged. No migration.
```

From a checkout of this repository, install with `pnpm install && pnpm build && dsh plugin --profile <name> add .`

Ready-made demo projects for each agent tool live in [`examples/`](examples/) (`claude-code`, `codebuddy-code`, `opencode`, `codex`): open one as the session workspace to see its skills, memory, and hooks bridged.

Every bridge is on by default; tune or disable any of them from a patch layer:

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: true     # master switch for this bridge
      skills: true      # .claude skills & commands
      memory: true      # CLAUDE.md memory
      hooks: true       # settings.json hooks
```

Full per-bridge configuration and behavior: [`docs/guides/`](docs/guides/README.md)

## What it bridges

| Your project already has | Works in DeepSeek Harness as |
| :--- | :--- |
| `.claude/` `.codebuddy/` `.opencode/` `.agents/` skills & commands | model skill catalog + `/name` invocation |
| `CLAUDE.md`, `CODEBUDDY.md`, `AGENTS.md` chains & rules | session-start memory injection |
| `settings.json`, `hooks.json`, `config.toml` hooks | the same hooks at DeepSeek Harness lifecycles |

## Supported agents

| Agent | Status | Skills / commands | Memory | Hooks |
| :--- | :--- | :--- | :--- | :--- |
| Claude Code | ✅ phase 1 | `.claude/skills`, `.claude/commands` (+ `~/.claude`) | `.claude/CLAUDE.md`, `~/.claude/CLAUDE.md` | `settings.json` hooks (SessionStart, UserPromptSubmit, Pre/PostToolUse(+Failure), Stop, SessionEnd) |
| CodeBuddy Code | ✅ phase 2 | `.codebuddy/skills`, `.codebuddy/commands` (+ `~/.codebuddy`) | `CODEBUDDY.md`, `~/.codebuddy/CODEBUDDY.md`, `.codebuddy/rules/` | `settings.json` hooks (SessionStart, UserPromptSubmit, Pre/PostToolUse(+Failure), Stop, SessionEnd) |
| opencode | ✅ phase 3 | `.opencode/skills`, `.opencode/commands` (+ `~/.config/opencode`), `command.*` in `opencode.json` | `AGENTS.md` (+ `CLAUDE.md` fallback), `instructions` files | — (opencode has no hooks config; its plugin API is out of scope) |
| Codex | ✅ phase 4 | `.agents/skills` (cwd → repo root), `~/.agents/skills`, `/etc/codex/skills` | `~/.codex/AGENTS.md` + per-directory `AGENTS.md` chain | `hooks.json` / `config.toml` hooks (SessionStart, SubagentStart, UserPromptSubmit, Pre/PostToolUse, Stop, SubagentStop, SessionEnd) |

## Resources

- Example projects, one per bridged agent tool: [`examples/`](examples/)
- Usage guide (per-bridge details, full config reference, what is not bridged yet): [`docs/guides/`](docs/guides/README.md)
- Bridge-target reference materials (official upstream specs): [`docs/reference/`](docs/reference/)
- Contributor documentation (how to add a new agent tool, integration surface, pitfalls): [`docs/development/`](docs/development/)
