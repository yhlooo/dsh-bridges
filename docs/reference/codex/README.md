# Codex 参考资料

来源：<https://learn.chatgpt.com/docs>（OpenAI 官方 ChatGPT/Codex 文档 markdown 版，英文）。抓取日期 2026-08-15 (UTC)，原文未改动。

## 文件清单

| 文件 | 内容 |
| :--- | :--- |
| [llms.txt](llms.txt) | 官方文档索引（Codex 部分） |
| [cli.md](cli.md) | Codex CLI 概览与终端工作流 |
| [slash-commands.md](slash-commands.md) | CLI 参数、斜杠命令、子命令参考 |
| [agents-md.md](agents-md.md) | **AGENTS.md 规范**：发现顺序、分层、fallback 文件名 |
| [rules.md](rules.md) | **Rules 规则文件**（实验性）：控制沙箱外命令 |
| [skills.md](skills.md) | **Skills 规范**：SKILL.md、加载位置、插件分发 |
| [subagents.md](subagents.md) | 子代理工作流与自定义 agents |
| [config-basic.md](config-basic.md) | **config.toml 基础**：位置、优先级、常用选项、feature flags |
| [config-reference.md](config-reference.md) | **config.toml / requirements.toml 完整参考** |
| [config-advanced.md](config-advanced.md) | 高级配置：profiles、**hooks**、[agents] 角色、项目根检测 |
| [hooks.md](hooks.md) | **Hooks 完整规范**：事件全集、输入/输出 JSON、matcher、async、trust 流程 |
| [environment-variables.md](environment-variables.md) | 环境变量参考 |
| [customization-overview.md](customization-overview.md) | 定制总览：AGENTS.md / Skills / MCP / Subagents |
| [plugins.md](plugins.md) | 插件构建（skills-only 插件等） |
| [approvals-security.md](approvals-security.md) | 沙箱、审批、网络控制 |

## 配置规范速查

### 配置文件

| 级别 | 位置 |
| :--- | :--- |
| 用户 | `~/.codex/config.toml`（`CODEX_HOME` 可改） |
| 项目 | `.codex/config.toml`（需信任项目后才加载） |
| 依赖锁定 | `requirements.toml` |

### AGENTS.md（记忆文件）

- 发现顺序：全局 `~/.codex/AGENTS.override.md` → `~/.codex/AGENTS.md`（二者取一）→ 从项目根（git root）向 cwd 逐目录：每目录取 `AGENTS.override.md` > `AGENTS.md` > fallback 文件名，最多一个。
- 从根到 cwd 拼接合并，越靠 cwd 越后、越优先；总量上限 `project_doc_max_bytes`（默认 32 KiB）。

### Skills

- `.agents/skills/`（cwd → 上级目录 → repo root 逐级扫描）、`~/.agents/skills/`、`/etc/codex/skills`、系统内置；同名不合并。

### Hooks

- `hooks.json` 文件或 `config.toml` 内联 `[hooks]` 表；常用位置：`~/.codex/hooks.json`、`~/.codex/config.toml`、`<repo>/.codex/hooks.json`、`<repo>/.codex/config.toml`。见 [config-advanced.md](config-advanced.md)。

### 其他

- Rules：`~/.codex/rules/*.rules`（Starlark DSL，实验性）。
- 自定义 agents：`config.toml` 的 `[agents]` 段。
- 沙箱/审批策略：见 [approvals-security.md](approvals-security.md)。
