# dsh-bridges usage guide

[中文](README.zh.md)

Install and verify the plugin, read the behaviors shared by every bridge, then
open the page for your agent tool. For a quick start, see the
[root README](../../README.md).

## Install

Plugins install into a DeepSeek Harness profile with the profile plugin manager (pnpm); `<profile-name>` is `web` (the Web UI) or `headless` (one-shot CLI runs), and each profile installs its own plugins:

```sh
# from the npm registry:
dsh plugin --profile <profile-name> add dsh-bridges

# or from a checkout of this repository (compile src/ → lib/ first):
pnpm install && pnpm build
dsh plugin --profile <profile-name> add .
```

The plugin manager appends the package to the profile's `dsh.profile.bundles`, and its `cordis.patch.yml` inserts one `bridges` row into the composed tree. Verify with:

```sh
dsh --profile <profile-name> --dump-config   # the row "dsh-bridges" should appear
```

Then start DeepSeek Harness in a project that has agent assets — `.claude/`, `.codebuddy/`, `.opencode/`, `.agents/skills/`, `.codex/`, `.pi/`, `.gemini/`, or `.cursor/` (plus their user-level counterparts, e.g. `~/.claude/`, `~/.gemini/`, `~/.cursor/`); assets are discovered per session workspace.

A complete example project exists for each supported agent tool ([`examples/`](../../examples/)): open one as the session workspace to observe its skills, memory, and hooks being bridged; each directory's README describes the verification steps.

## Config

Every tool bridge owns a config section under the `bridges` row; a later patch layer (the profile's `cordis.patch.yml`, a `--patch` overlay) can override any field:

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: false   # disable the Claude Code bridge
```

Each tool page lists its full config block with defaults.

## Common behaviors

All bridges share the rules below; tool pages note only deviations.

- **Native skills win on name conflicts.** Native DeepSeek Harness skills (`.dsh/skills`, `.agents/skills`, runtime skills) shadow bridged assets of the same name — bridges register on the global skills layer, which nearer preset layers shadow.
- **Memory budget.** Session-start memory injection is capped at 32 KiB per bridge: broader user-level sections are dropped first, then the most specific sections are truncated.
- **Live reload.** Skill roots and settings files are watched; edits appear in the running session without a restart.
- **Tool-name translation.** Hooks key on upstream tool names; each bridge translates them to DeepSeek Harness names (mapping table on each tool page), so hooks written for the upstream tool run unchanged.
- **Fail open.** Hook timeouts and handler failures never block the action, matching the upstream contracts (Cursor's `failClosed: true` is the opt-in exception).

## Bridges

| Agent tool | What it covers | Guide |
| :--- | :--- | :--- |
| Claude Code | `.claude/` skills, commands, and subagents; `CLAUDE.md` memory; `settings.json` hooks and permission rules; MCP servers | [`claude-code`](claude-code.md) · [中文](claude-code.zh.md) |
| CodeBuddy Code | `.codebuddy/` skills, commands, and subagents; `CODEBUDDY.md` memory and rules; `settings.json` hooks and permission rules; MCP servers | [`codebuddy-code`](codebuddy-code.md) · [中文](codebuddy-code.zh.md) |
| OpenCode | `.opencode/` skills and commands (incl. JSON commands); `AGENTS.md` and `instructions` memory; `opencode.json(c)` permission rules; MCP servers | [`opencode`](opencode.md) · [中文](opencode.zh.md) |
| Codex | `.agents/` skills; `AGENTS.md` instruction chain; `hooks.json` / `config.toml` hooks; approval/sandbox policy; `[mcp_servers]` entries | [`codex`](codex.md) · [中文](codex.zh.md) |
| Pi | `.pi/` skills and prompt templates; context-file memory | [`pi`](pi.md) · [中文](pi.zh.md) |
| Gemini CLI | `.gemini/` skills, commands, and subagents; `GEMINI.md` memory; `settings.json` hooks and `mcpServers`; policy rules | [`gemini-cli`](gemini-cli.md) · [中文](gemini-cli.zh.md) |
| Cursor | `.cursor/` skills and subagents; rules memory; `hooks.json` hooks; CLI permission rules; MCP servers | [`cursor`](cursor.md) · [中文](cursor.zh.md) |
