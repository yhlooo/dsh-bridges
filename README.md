# dsh-bridges

English | [中文](README_CN.md)

> This project is implemented by DeepSeek Harness.

[![CI](https://github.com/yhlooo/dsh-bridges/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yhlooo/dsh-bridges/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/dsh-bridges)](https://www.npmjs.com/package/dsh-bridges)
[![npm downloads](https://img.shields.io/npm/dm/dsh-bridges)](https://www.npmjs.com/package/dsh-bridges)
[![license](https://img.shields.io/github/license/yhlooo/dsh-bridges)](LICENSE)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that bridges projects already configured for Claude Code, CodeBuddy Code, OpenCode, Codex, Pi, Gemini CLI, or Cursor into DeepSeek Harness, so existing skills, commands, memory, and hooks continue to work without any migration.

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

## Support matrix

Assets are discovered per session workspace, from project and user-level locations. All bridges are enabled by default and can be configured or disabled from any patch layer:

```yaml
# example: disable the Pi bridge
- id: bridges
  config:
    pi:
      enabled: false
```

| Agent tool | Skills / commands | Memory | Hooks | Permissions | MCP | Guide |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| Claude Code | ✓ | ✓ | ✓ | ✓ | ✓ | [`claude-code`](docs/guides/claude-code.md) |
| CodeBuddy Code | ✓ | ✓ | ✓ | ✓ | ✓ | [`codebuddy-code`](docs/guides/codebuddy-code.md) |
| OpenCode | ✓ | ✓ | — | ✓ | ✓ | [`opencode`](docs/guides/opencode.md) |
| Codex | ✓ | ✓ | ✓ | ✓ | ✓ | [`codex`](docs/guides/codex.md) |
| Pi | ✓ | ✓ | — | — | — | [`pi`](docs/guides/pi.md) |
| Gemini CLI | ✓ | ✓ | ✓ | ✓ | ✓ | [`gemini-cli`](docs/guides/gemini-cli.md) |
| Cursor | ✓ | ✓ | ✓ | ✓ | ✓ | [`cursor`](docs/guides/cursor.md) |

## Resources

- Usage guide (install and verify, shared behaviors, per-tool deep dives): [`docs/guides/`](docs/guides/README.md)
- Example projects, one per bridged agent tool: [`examples/`](examples/)
- Upstream reference material (official specs): [`docs/reference/`](docs/reference/)
- Contributor documentation: [`docs/development/`](docs/development/)
