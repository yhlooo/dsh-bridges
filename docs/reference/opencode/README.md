# opencode 参考资料

来源：<https://opencode.ai/docs>（官方文档 markdown 版本，英文）。抓取日期 2026-08-15 (UTC)，原文未改动。

## 文件清单

| 文件 | 内容 |
| :--- | :--- |
| [agents-config.md](agents-config.md) | 代理类型：primary agents 与 subagents，内置模式（build/plan/general 等） |
| [commands.md](commands.md) | **自定义斜杠命令**：命令文件位置、frontmatter、参数、模板 |
| [rules.md](rules.md) | **规则/记忆**：AGENTS.md 体系、类型、优先级、Claude Code 兼容 |
| [config.md](config.md) | **opencode.json 配置**：格式、位置、优先级、schema（TUI/Server） |
| [skills.md](skills.md) | **Skills 规范**：SKILL.md 位置、发现规则、frontmatter、权限 |
| [plugins.md](plugins.md) | 插件系统：安装、目录结构、事件 |
| [permissions.md](permissions.md) | 权限配置：自动模式、细粒度规则、通配符 |
| [custom-tools.md](custom-tools.md) | 自定义工具：目录结构、参数、上下文 |
| [tools.md](tools.md) | 内置工具与配置 |
| [references.md](references.md) | @file/@url 引用用法与配置 |
| [mcp-servers.md](mcp-servers.md) | MCP 服务器配置（本地/远程/OAuth） |

## 配置规范速查

### 配置文件

| 级别 | 位置 |
| :--- | :--- |
| 全局 | `~/.config/opencode/opencode.json` |
| 项目 | 项目根 `opencode.json` / `opencode.jsonc`（优先级最高） |
| 托管 | 系统托管配置目录（MDM/plist 映射到 opencode.json 字段） |

### Rules / 记忆（Claude Code 兼容是重点）

- 原生：项目 `AGENTS.md`、全局 `~/.config/opencode/AGENTS.md`。
- **Claude Code 兼容回退**：项目 `CLAUDE.md`（无 AGENTS.md 时）、`~/.claude/CLAUDE.md`（无全局 AGENTS.md 时）、`~/.claude/skills/`；可用环境变量关闭兼容。

### Skills

- `SKILL.md` 文件夹形式，位置：项目 `.opencode/skills/<name>/SKILL.md`、全局 `~/.config/opencode/skills/`、**Claude 兼容 `.claude/skills/` 与 `~/.claude/skills/`**、agent 兼容 `.agents/skills/` 与 `~/.agents/skills/`。

### Commands

- 项目 `.opencode/commands/<name>.md`、全局 `~/.config/opencode/commands/`；markdown frontmatter（`description`/`agent`/`model`）或 JSON 形式。

### 其他

- 权限在 `opencode.json` 中配置（permissions 字段）。
- 插件、自定义工具、MCP 服务器见对应文件。
