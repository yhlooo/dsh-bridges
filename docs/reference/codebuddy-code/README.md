# CodeBuddy Code 参考资料

来源：<https://cnb.cool/codebuddy/codebuddy-code> 官方仓库 `docs` 目录原文（中文），复制自 `main` 分支 commit `3abd1a9`，原文未改动。

## 文件清单

| 文件 | 内容 |
| :--- | :--- |
| [docs-overview.md](docs-overview.md) | 官方文档概述 |
| [codebuddy_code_docs_map.md](codebuddy_code_docs_map.md) | 官方文档全站地图（找页面先看这里） |
| [codebuddy-dir.md](codebuddy-dir.md) | **`.codebuddy/` 与 `~/.codebuddy/` 目录结构** |
| [memory.md](memory.md) | **CODEBUDDY.md 记忆**：查找规则、`.codebuddy/rules/` 模块化规则 |
| [settings.md](settings.md) | settings.json 全部设置 |
| [skills.md](skills.md) | **Skills 技能系统规范** |
| [slash-commands.md](slash-commands.md) | **自定义斜杠命令** |
| [hooks.md](hooks.md) | **Hook 参考**：事件、结构、脚本/插件/基于提示词的 hooks |
| [hooks-guide.md](hooks-guide.md) | Hook 入门指南（含示例） |
| [sub-agents.md](sub-agents.md) | 子代理规范 |
| [permissions.md](permissions.md) | 权限规则语法 |
| [permission-modes.md](permission-modes.md) | 权限模式（Shift+Tab 切换、defaultMode） |
| [plugins.md](plugins.md) / [plugins-reference.md](plugins-reference.md) | 插件系统与参考 |
| [env-vars.md](env-vars.md) | 环境变量参考 |
| [cli-reference.md](cli-reference.md) | CLI 命令与参数（含沙箱参数） |
| [best-practices.md](best-practices.md) / [common-workflows.md](common-workflows.md) | 最佳实践与常见工作流 |
| [troubleshooting.md](troubleshooting.md) | 问题排查 |

## 配置规范速查（一期重点）

### 配置目录

| 级别 | 位置 |
| :--- | :--- |
| 项目级 | `.codebuddy/`（settings.json、CODEBUDDY.md、rules/、skills/、commands/） |
| 用户级 | `~/.codebuddy/`（settings.json、CODEBUDDY.md、rules/、skills/） |

### 记忆与规则

- `CODEBUDDY.md`：项目根或 `.codebuddy/CODEBUDDY.md` 等效；用户级 `~/.codebuddy/CODEBUDDY.md`；支持 import 其他文件。
- 模块化规则：`.codebuddy/rules/*.md`，frontmatter 控制字段（alwaysApply 等）。

### Skills / Commands / Hooks

- Skills：`.codebuddy/skills/`（项目）、`~/.codebuddy/skills/`（用户）。
- 斜杠命令：`.codebuddy/commands/`。
- Hooks：settings.json 配置，支持 command hook、插件 hooks、基于提示词的 hooks。

### 权限

- 模式：Shift+Tab 切换，`permissions.defaultMode` 持久化；规则语法见 permissions.md。

> 注：CodeBuddy Code 与 Claude Code 高度相似（目录结构、CODEBUDDY.md 对 CLAUDE.md、settings/hooks/skills 体系），细节差异以各文件原文为准。
