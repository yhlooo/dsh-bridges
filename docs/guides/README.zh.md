# dsh-bridges 使用指南

[English](README.md)

安装并验证插件、了解各桥接共有的行为，然后打开对应工具页面。快速上手指南见[根目录 README](../../README_CN.md)。

## 安装

插件通过 profile 的插件管理器（pnpm）安装到某个 DeepSeek Harness profile；`<profile-name>` 取 `web`（Web GUI）或 `headless`（一次性 CLI 运行），每个 profile 独立安装插件：

```sh
# 从 npm registry 安装：
dsh plugin --profile <profile-name> add dsh-bridges

# 或从本仓库 checkout 安装（先编译 src/ → lib/）：
pnpm install && pnpm build
dsh plugin --profile <profile-name> add .
```

插件管理器会把该包追加到 profile 的 `dsh.profile.bundles`，其 `cordis.patch.yml` 向组合树注入一行 `bridges`。验证：

```sh
dsh --profile <profile-name> --dump-config   # 应能看到 "dsh-bridges" 这一行
```

然后在带有 agent 资产（`.claude/`、`.codebuddy/`、`.opencode/`、`.agents/skills/`、`.codex/`、`.pi/`、`.gemini/`、`.cursor/`，以及它们 `~/` 下的用户级对应目录，如 `~/.claude/`、`~/.gemini/`、`~/.cursor/`）的项目里启动 DeepSeek Harness；资产按会话工作区发现。

每个受支持的 agent 工具在 [`examples/`](../../examples/) 下各有一个完整示例项目：以示例目录作为会话工作区打开，即可观察其 skills、memory 与 hooks 的桥接效果，各目录 README 说明逐项验证方式。

## 配置

每个工具桥接在 `bridges` 行下各占一个配置段；后续 patch 层（profile 的 `cordis.patch.yml`、`--patch` 覆盖层）可以覆盖任意字段：

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: false   # 禁用 Claude Code 桥接
```

各工具页面列出完整配置块（含默认值）。

## 公共行为

所有桥接共享以下规则；工具页只记录差异。

- **原生技能在同名冲突时胜出。** DeepSeek Harness 原生技能（`.dsh/skills`、`.agents/skills`、运行时技能）遮蔽同名桥接资产——桥接注册在全局技能层，会被更近的 preset 层遮蔽。
- **核心已加载的指令文件不重复注入。** DeepSeek Harness 核心自行读取项目根到 cwd 每层目录的 `AGENTS.md` / `CLAUDE.md` 及 `.local` 变体；桥接只注入上游工具特有、核心不覆盖的资产（`~/.claude/CLAUDE.md`、`.claude/CLAUDE.md`、`CODEBUDDY.md`、`GEMINI.md`、`.cursor/rules` 等）。
- **记忆预算。** 会话开始的记忆注入每个桥接上限 32 KiB：先丢弃较宽泛的用户级片段，再截断最具体的片段。
- **热更新。** 技能根目录与 settings 文件被监听，编辑即刻出现在运行中的会话，无需重启。
- **工具名翻译。** hooks 以上游工具名寻址；各桥接把它们翻译为 DeepSeek Harness 工具名（映射表见各工具页），为上游工具写好的 hooks 原样可用。
- **失败放行（fail open）。** hook 超时与 handler 失败绝不阻塞动作，与上游契约一致（Cursor 的 `failClosed: true` 是可选例外）。

## 各桥接

| 工具 | 覆盖内容 | 指南 |
| :--- | :--- | :--- |
| Claude Code | `.claude/` 的 skills、commands 与 subagents；`CLAUDE.md` 记忆；`settings.json` 的 hooks 与权限规则；MCP 服务器 | [`claude-code`](claude-code.zh.md) · [English](claude-code.md) |
| CodeBuddy Code | `.codebuddy/` 的 skills、commands 与 subagents；`CODEBUDDY.md` 记忆与规则；`settings.json` 的 hooks 与权限规则；MCP 服务器 | [`codebuddy-code`](codebuddy-code.zh.md) · [English](codebuddy-code.md) |
| OpenCode | `.opencode/` 的 skills 与 commands（含 JSON 命令）；`AGENTS.md` 与 `instructions` 记忆；`opencode.json(c)` 权限规则；MCP 服务器 | [`opencode`](opencode.zh.md) · [English](opencode.md) |
| Codex | `.agents/` skills；`AGENTS.md` 指令链；`hooks.json` / `config.toml` 的 hooks；审批 / 沙箱策略；`[mcp_servers]` 条目 | [`codex`](codex.zh.md) · [English](codex.md) |
| Pi | `.pi/` 的 skills 与 prompt 模板；上下文文件记忆 | [`pi`](pi.zh.md) · [English](pi.md) |
| Gemini CLI | `.gemini/` 的 skills、commands 与 subagents；`GEMINI.md` 记忆；`settings.json` 的 hooks 与 `mcpServers`；策略规则 | [`gemini-cli`](gemini-cli.zh.md) · [English](gemini-cli.md) |
| Cursor | `.cursor/` 的 skills 与 subagents；规则记忆；`hooks.json` 的 hooks；CLI 权限规则；MCP 服务器 | [`cursor`](cursor.zh.md) · [English](cursor.md) |
