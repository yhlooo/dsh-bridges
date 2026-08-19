# dsh-bridges

[English](README.md) | 中文

> 该项目由 DeepSeek Harness 实现。

[![CI](https://github.com/yhlooo/dsh-bridges/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/yhlooo/dsh-bridges/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/dsh-bridges)](https://www.npmjs.com/package/dsh-bridges)
[![npm downloads](https://img.shields.io/npm/dm/dsh-bridges)](https://www.npmjs.com/package/dsh-bridges)
[![license](https://img.shields.io/github/license/yhlooo/dsh-bridges)](LICENSE)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：把已经为 Claude Code、CodeBuddy Code、OpenCode、Codex、Pi、Gemini CLI、Cursor 配置好的项目桥接进 DeepSeek Harness——skills、commands、记忆、hooks 无需迁移即可继续生效。

## 快速上手

```sh
# 一般形式：
#   dsh plugin --profile <profile-name> add dsh-bridges
#   dsh --profile <profile-name>

# Web UI 示例：
dsh plugin --profile web add dsh-bridges
dsh web    # = dsh --profile web
```

```sh
# 也支持 headless（一次性 CLI 运行），启动目录即会话工作区：
dsh plugin --profile headless add dsh-bridges
cd my-project
dsh --profile headless "list the skills available in your catalog"
```

从本仓库源码安装（需先编译）：`pnpm install && pnpm build && dsh plugin --profile <profile-name> add .`

每个受支持的 agent 工具在 [`examples/`](examples/) 下各有一个完整示例项目
（`claude-code`、`codebuddy-code`、`opencode`、`codex`、`pi`、`gemini-cli`、`cursor`）；以示例目录作为会话工作区打开，即可观察其 skills、memory 与 hooks 的桥接效果。

## 支持矩阵

资产按会话工作区发现（项目级与用户级目录）。所有桥接默认启用，可在任意 patch 层逐一调整或禁用：

```yaml
# 示例：禁用 Pi 桥接
- id: bridges
  config:
    pi:
      enabled: false
```

| 工具           | Skills / commands | 记忆 | Hooks | 权限 | MCP | 指南                                                 |
| :------------- | :---------------: | :--: | :---: | :--: | :-: | :--------------------------------------------------- |
| Claude Code    |         ✓         |  ✓   |   ✓   |  ✓   |  ✓  | [`claude-code`](docs/guides/claude-code.zh.md)       |
| CodeBuddy Code |         ✓         |  ✓   |   ✓   |  ✓   |  ✓  | [`codebuddy-code`](docs/guides/codebuddy-code.zh.md) |
| OpenCode       |         ✓         |  ✓   |   —   |  ✓   |  ✓  | [`opencode`](docs/guides/opencode.zh.md)             |
| Codex          |         ✓         |  ✓   |   ✓   |  ✓   |  ✓  | [`codex`](docs/guides/codex.zh.md)                   |
| Pi             |         ✓         |  ✓   |   —   |  —   |  —  | [`pi`](docs/guides/pi.zh.md)                         |
| Gemini CLI     |         ✓         |  ✓   |   ✓   |  ✓   |  ✓  | [`gemini-cli`](docs/guides/gemini-cli.zh.md)         |
| Cursor         |         ✓         |  ✓   |   ✓   |  ✓   |  ✓  | [`cursor`](docs/guides/cursor.zh.md)                 |

## 资源

- 使用指南（安装与验证、公共行为、逐工具深入）：[`docs/guides/`](docs/guides/README.zh.md)
- 每个桥接目标一个示例项目：[`examples/`](examples/)
- 各桥接目标的上游参考资料（官方规范）：[`docs/reference/`](docs/reference/)
- 贡献者文档：[`docs/development/`](docs/development/)
