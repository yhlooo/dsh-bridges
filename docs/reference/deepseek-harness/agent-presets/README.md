# DSH agent presets 参考资料

来源：本地安装的 `@deepseek-ai/dsh` 包（v0.1.0-rc.6）内 `config/agent-presets/` 目录，2026-08-15 复制，原文未改动。

## agent-presets 是什么

DSH 安装包自带多套 agent preset（`code`、`cordis`、`minimal`、`standard`）。每套 preset 由两个文件组成：

- `preset.yml` — 展示元数据（名称、描述、排序）
- `agent.cordis.yml` — AGENT-PLANE 组合：以 cordis 插件行（id + 包名 + config）声明该 agent 挂载的工具、skills、goal、plan-mode、compaction、subagent 等能力

本目录当前收录 `standard` preset 的完整文件：

- [standard.preset.yml](standard.preset.yml)
- [standard.agent.cordis.yml](standard.agent.cordis.yml)

以及 `cordis` preset 自带的两个 skill 示例（DSH 自身的 skill 格式，含 frontmatter `name`/`description` 与正文）：

- [cordis-plugin-development/SKILL.md](cordis/skills/cordis-plugin-development/SKILL.md)
- [editing-cordis-compositions/SKILL.md](cordis/skills/editing-cordis-compositions/SKILL.md)

## 与 dsh-bridges 的关系

dsh-bridges 需要把 Claude Code 项目的 skills / commands / hooks 翻译成 DSH 侧的等价物。DSH 侧已知相关设施（从 `standard.agent.cordis.yml` 可见）：

- `@deepseek-ai/dsh-skill-filesystem` + `@deepseek-ai/dsh-tool-skill`：skill 注册表分层与发现（本地根目录发现 skills），即 DSH 的 skills 机制入口
- `@deepseek-ai/dsh-tool-subagent` 存在 `claude-code` / `codex` provider（当前 disabled），说明 DSH 已有面向 Claude Code 的预留接缝
- `@deepseek-ai/dsh-agent-instructions`：注入 agent 指令（类比 CLAUDE.md）

以上仅为现状观察；具体桥接方案待与项目负责人确认后另行设计。
