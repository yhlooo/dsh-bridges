# 变更日志

本项目的所有重要变更都记录在此文件中。

## 0.2.4 - 2026-08-19

### 新增

- `claude-code` 与 `codebuddy-code` 示例项目的 `UserPromptSubmit` hook 现在还会在提交的提示词旁注入一行上下文，演示退出码 0 纯文本 stdout 的上下文注入路径（`examples/`）。

### 变更

- 注入消息统一携带显式的 `dsh-bridges:` 来源标识：hook 消息用 `dsh-bridges:<tool>-hooks/<事件名>`（如 `dsh-bridges:claude-code-hooks/UserPromptSubmit`）；记忆消息以桥接资产命名（`dsh-bridges:CLAUDE.md`、`dsh-bridges:AGENTS.md`、`dsh-bridges:CODEBUDDY.md`、`dsh-bridges:GEMINI.md`、`dsh-bridges:.cursor/rules`、`dsh-bridges:references`）。Web GUI 会把该标识显示在「上下文注入」标签旁。
- DeepSeek Harness 核心已读取的指令文件不再重复注入：项目根到工作目录每层目录的 `AGENTS.md` / `CLAUDE.md` 及其 `.local` 变体交由核心加载（claude-code、codex、pi、opencode 记忆桥接）。

## 0.2.3 - 2026-08-17

### 修复

- `capString` 可能返回超出请求上限的字符数；hook 输出截断现在严格不超 `maxChars`。

## 0.2.2 - 2026-08-17

### 新增

- `probe:upstream` 现在跟踪 Pi 的 npm 发行版（`scripts/upstream-probe.mjs`）。

### 变更

- 使用指南重构为逐工具页面 + 共享索引（`docs/guides/`）；工具名按官方拼写统一大小写（OpenCode、Pi）。

### 修复

- MCP 服务器对账：修正变更检测与 session-cwd 回退。
- hook 运行器：async hook 通过 stdin 接收 JSON 载荷并排空管道；超时输出丢弃而非解析；`defer` 决策映射为审批。
- Cursor hooks：保留 handler matcher，用户级 hook 从配置目录运行。
- OpenCode 权限：内置 `.env` 读拒绝规则在通配规则下保持生效。

## 0.2.1 - 2026-08-16

### 新增

- 嵌套 skills 与 commands 映射为 kebab-case 的 `group-name` 技能：Claude Code 嵌套命令、CodeBuddy Code 嵌套技能与命令、Gemini CLI 嵌套命名空间命令。

## 0.2.0 - 2026-08-16

### 新增

- 首次发布：桥接 Claude Code、CodeBuddy Code、OpenCode、Codex、Pi、Gemini CLI、Cursor——从各工具的项目级与用户级目录发现 skills/commands、记忆、hooks、权限规则、MCP 服务器与子代理定义并桥接进 DeepSeek Harness。
- 每个桥接工具的示例项目（`examples/`）、逐工具使用指南（`docs/guides/`）与上游参考资料（`docs/reference/`）。
