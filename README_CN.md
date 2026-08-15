# dsh-bridges

[English](README.md) | 中文

> 该项目由 DeepSeek Harness 实现。

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：把已经为 Claude Code、CodeBuddy Code、opencode、Codex 配置好的项目桥接进 DeepSeek Harness——skills、commands、记忆、hooks 零迁移继续生效。

> 🚧 **状态。** 一至四期：Claude Code、CodeBuddy Code、opencode、Codex（已交付）。更多 agent 计划中。

## 快速上手

```sh
# 1. 安装一次到某个 DeepSeek Harness profile
dsh plugin --profile <name> add dsh-bridges

# 2. 在已经为其他 agent 配置好的项目里启动 DeepSeek Harness——完事
cd my-claude-project        # 已有 .claude/ 资产
dsh --profile <name> "list the skills available in your catalog"
# → 每个 .claude 技能 / 命令都变成 /名字 技能，CLAUDE.md 自动注入，
#   项目里的 settings.json hooks 原样运行。零迁移。
```

从本仓库 checkout 安装：`pnpm install && pnpm build && dsh plugin --profile <name> add .`

每个受支持的 agent 工具各有一个现成示例项目，位于 [`examples/`](examples/)
（`claude-code`、`codebuddy-code`、`opencode`、`codex`）：把示例目录作为会话
工作区打开，即可看到它的 skills、memory 与 hooks 如何被桥接。

每个桥接默认开启，可通过 patch 层调整或关闭任意一个：

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: true     # 本桥接总开关
      skills: true      # .claude 技能与命令
      memory: true      # CLAUDE.md 记忆
      hooks: true       # settings.json hooks
```

各桥接的完整配置与行为说明：[`docs/guides/`](docs/guides/README.zh.md)

## 桥接了什么

| 你的项目里已有 | 在 DeepSeek Harness 中变为 |
| :--- | :--- |
| `.claude/` `.codebuddy/` `.opencode/` `.agents/` 技能与命令 | 模型技能目录 + `/名字` 调用 |
| `CLAUDE.md`、`CODEBUDDY.md`、`AGENTS.md` 链与规则 | 会话开始时的记忆注入 |
| `settings.json`、`hooks.json`、`config.toml` hooks | 同样的 hooks 跑在 DeepSeek Harness 生命周期 |

## 支持的 agent 工具

| 工具 | 状态 | Skills / commands | Memory | Hooks |
| :--- | :--- | :--- | :--- | :--- |
| Claude Code | ✅ 一期 | `.claude/skills`、`.claude/commands`（含 `~/.claude`） | `.claude/CLAUDE.md`、`~/.claude/CLAUDE.md` | `settings.json` hooks（SessionStart、UserPromptSubmit、Pre/PostToolUse(+Failure)、Stop、SessionEnd） |
| CodeBuddy Code | ✅ 二期 | `.codebuddy/skills`、`.codebuddy/commands`（含 `~/.codebuddy`） | `CODEBUDDY.md`、`~/.codebuddy/CODEBUDDY.md`、`.codebuddy/rules/` | `settings.json` hooks（SessionStart、UserPromptSubmit、Pre/PostToolUse(+Failure)、Stop、SessionEnd） |
| opencode | ✅ 三期 | `.opencode/skills`、`.opencode/commands`（含 `~/.config/opencode`）、`opencode.json` 的 `command.*` | `AGENTS.md`（含 `CLAUDE.md` 回退）、`instructions` 文件 | —（opencode 无 hooks 配置；其插件 API 不在范围内） |
| Codex | ✅ 四期 | `.agents/skills`（cwd → 仓库根）、`~/.agents/skills`、`/etc/codex/skills` | `~/.codex/AGENTS.md` + 逐目录 `AGENTS.md` 链 | `hooks.json` / `config.toml` hooks（SessionStart、SubagentStart、UserPromptSubmit、Pre/PostToolUse、Stop、SubagentStop、SessionEnd） |

## 资源

- 每个桥接目标一个示例项目：[`examples/`](examples/)
- 使用指南（各桥接细节、完整配置参考、尚未桥接的部分）：[`docs/guides/`](docs/guides/README.zh.md)
- 各桥接目标的参考资料（官方上游规范）：[`docs/reference/`](docs/reference/)
- 贡献者文档（如何新增一个 agent 工具、集成面、踩坑）：[`docs/development/`](docs/development/)
