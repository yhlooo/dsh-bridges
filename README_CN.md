# dsh-bridges

[English](README.md) | 中文

> 该项目由 DeepSeek Harness 实现。

[![CI](https://github.com/yhlooo/dsh-bridges/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yhlooo/dsh-bridges/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/dsh-bridges)](https://www.npmjs.com/package/dsh-bridges)
[![npm downloads](https://img.shields.io/npm/dm/dsh-bridges)](https://www.npmjs.com/package/dsh-bridges)
[![license](https://img.shields.io/github/license/yhlooo/dsh-bridges)](LICENSE)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：把已经为 Claude Code、CodeBuddy Code、opencode、Codex 配置好的项目桥接进 DeepSeek Harness——skills、commands、记忆、hooks 无需任何迁移即可继续生效。

## 快速上手

```sh
# 1. 安装一次到某个 DeepSeek Harness profile
dsh plugin --profile <name> add dsh-bridges

# 2. 在已经为其他 agent 配置好的项目里启动 DeepSeek Harness
cd my-claude-project        # 已有 .claude/ 资产
dsh --profile <name> "list the skills available in your catalog"
# → .claude 技能与命令注册为 /名字 技能，CLAUDE.md 被注入，
#   项目中的 settings.json hooks 原样运行。
```

从本仓库源码安装（需先编译）：`pnpm install && pnpm build && dsh plugin --profile <name> add .`

每个受支持的 agent 工具在 [`examples/`](examples/) 下各有一个完整示例项目
（`claude-code`、`codebuddy-code`、`opencode`、`codex`）；以示例目录作为会话
工作区打开，即可观察其 skills、memory 与 hooks 的桥接效果。

所有桥接默认启用，并可通过 patch 层逐一调整或禁用：

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: true     # 本桥接总开关
      skills: true      # .claude 技能与命令
      memory: true      # CLAUDE.md 记忆
      hooks: true       # settings.json hooks
      permissions: true # settings.json 权限规则（allow/ask/deny）
```

各桥接的完整配置与行为说明：[`docs/guides/`](docs/guides/README.zh.md)

## 桥接了什么

| 项目里已有的资产 | DeepSeek Harness 提供的桥接 |
| :--- | :--- |
| `.claude/` `.codebuddy/` `.opencode/` `.agents/` 技能与命令 | 模型技能目录 + `/名字` 调用 |
| `CLAUDE.md`、`CODEBUDDY.md`、`AGENTS.md` 链与规则 | 会话开始时的记忆注入 |
| `settings.json`、`hooks.json`、`config.toml` hooks | 同样的 hooks 运行在 DeepSeek Harness 生命周期 |
| `settings.json` 的 `permissions` 规则 | 同样的 allow/ask/deny 决策作用于工具调用 |

## 支持的 agent 工具

| 工具 | Skills / commands | Memory | Hooks | Permissions |
| :--- | :--- | :--- | :--- | :--- |
| Claude Code | `.claude/skills`、`.claude/commands`（含 `~/.claude`） | `.claude/CLAUDE.md`、`~/.claude/CLAUDE.md` | `settings.json` hooks（SessionStart、UserPromptSubmit、Pre/PostToolUse(+Failure)、Stop、SessionEnd） | `settings.json` permissions 规则（allow/ask/deny，含 Bash 前缀、路径、域名匹配） |
| CodeBuddy Code | `.codebuddy/skills`、`.codebuddy/commands`（含 `~/.codebuddy`） | `CODEBUDDY.md`、`~/.codebuddy/CODEBUDDY.md`、`.codebuddy/rules/` | `settings.json` hooks（SessionStart、UserPromptSubmit、Pre/PostToolUse(+Failure)、Stop、SessionEnd） | `settings.json` permissions 规则（allow/ask/deny：精确/前缀/glob Bash、大小写不敏感路径、MCP、Skill） |
| opencode | `.opencode/skills`、`.opencode/commands`（含 `~/.config/opencode`）、`opencode.json` 的 `command.*` | `AGENTS.md`（含 `CLAUDE.md` 回退）、`instructions` 文件 | —（opencode 无 hooks 配置；其插件 API 不在范围内） | `opencode.json(c)` 的 `permission` 规则（家族分组、末条命中、`external_directory`、内置默认） |
| Codex | `.agents/skills`（cwd → 仓库根）、`~/.agents/skills`、`/etc/codex/skills` | `~/.codex/AGENTS.md` + 逐目录 `AGENTS.md` 链 | `hooks.json` / `config.toml` hooks（SessionStart、SubagentStart、UserPromptSubmit、Pre/PostToolUse、Stop、SubagentStop、SessionEnd） | `config.toml` 审批/沙箱策略（`approval_policy`、`sandbox_mode`、内置 `default_permissions` 档案） |

## 资源

- 每个桥接目标一个示例项目：[`examples/`](examples/)
- 使用指南（各桥接细节、完整配置参考、尚未桥接的部分）：[`docs/guides/`](docs/guides/README.zh.md)
- 各桥接目标的参考资料（官方上游规范）：[`docs/reference/`](docs/reference/)
- 贡献者文档（如何新增一个 agent 工具、集成面、踩坑）：[`docs/development/`](docs/development/)
