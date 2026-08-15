# Claude Code 参考资料

来源：<https://code.claude.com/docs>（官方文档 markdown 版本，`en` 语言）。抓取日期 2026-08-15 (UTC)，原文未改动。

## 文件清单

| 文件 | 内容 |
| :--- | :--- |
| [llms.txt](llms.txt) | 官方文档完整页面索引（补充资料时先查这里） |
| [features-overview.md](features-overview.md) | CLAUDE.md / Skills / subagents / hooks / MCP / plugins 各自何时用，功能分层关系 |
| [claude-directory.md](claude-directory.md) | `.claude/` 目录与 `~/.claude/` 的完整文件参考 |
| [memory.md](memory.md) | CLAUDE.md 记忆文件（加载顺序、@import、`.claude/rules/`、auto memory、AGENTS.md 互认） |
| [settings.md](settings.md) | settings.json 配置：作用域层级、所有可用设置、权限、hooks 配置 |
| [skills.md](skills.md) | **Skills 规范**：目录位置、frontmatter 全字段、支持文件、调用控制、动态上下文、子代理执行 |
| [commands.md](commands.md) | 内置命令与 bundled skills 完整参考 |
| [hooks.md](hooks.md) | **Hooks 参考**：生命周期、事件全集、matcher、输入/输出 JSON 格式、退出码、HTTP/prompt/agent hooks |
| [hooks-guide.md](hooks-guide.md) | Hooks 实战指南（格式化、通知、阻断、权限审批等场景） |
| [sub-agents.md](sub-agents.md) | 自定义 subagent 规范（`.claude/agents/`、frontmatter、权限） |
| [debug-your-config.md](debug-your-config.md) | 配置排查：`/context`、`/doctor`、`/hooks`、`/mcp` |

## 配置规范速查（一期重点）

### 配置目录

| 级别 | 位置 | 说明 |
| :--- | :--- | :--- |
| 项目级 | `.claude/`（仓库内） | 可提交进 git，团队共享 |
| 用户级 | `~/.claude/` | 本机所有项目生效 |
| 本地级 | `.claude/settings.local.json` | 仅本仓库、本用户，gitignore |

### Skills（含自定义命令）

- 位置：`.claude/skills/<name>/SKILL.md`（目录形式，可带支持文件）；企业 / 个人 / 项目 / 插件四级，见 [skills.md](skills.md#where-skills-live)。
- **自定义命令已并入 skills**：`.claude/commands/<name>.md` 仍可用，与 `SKILL.md` 等价；同名时 skill 优先。
- frontmatter 全部字段（`name` / `description` / `when_to_use` / `argument-hint` / `arguments` / `disable-model-invocation` / `user-invocable` / `allowed-tools` / `disallowed-tools` / `model` / `effort` / `context` / `agent` / `background` / `hooks` / `paths` / `shell` / `metadata` / `license` / `compatibility`）：见 [skills.md](skills.md#frontmatter-reference)。
- 命令名由目录名/文件名决定（`.claude/commands/deploy.md` → `/deploy`）。

### Hooks

- 配置位置：`settings.json` 的 `hooks` 字段；也可来自插件 `hooks/hooks.json`、skill / subagent frontmatter。见 [hooks.md](hooks.md#hook-locations)。
- 事件全集（SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Notification、Stop、SubagentStop、PreCompact、SessionEnd 等）：见 [hooks.md](hooks.md#hook-events)。
- matcher 支持正则；hook 通过 stdin 收 JSON、用退出码（0/2）和 JSON 输出来干预行为。

### Settings 层级（由高到低）

Managed → User (`~/.claude/`) → Project (`.claude/`) → Local (`.claude/settings.local.json`) → CLI 参数。见 [settings.md](settings.md#available-scopes)。

### 其他

- CLAUDE.md：`./CLAUDE.md` 或 `./.claude/CLAUDE.md`，向上逐级加载，子目录按需加载；支持 `@import`（如 `@AGENTS.md` 互认其他 agent 的规范）。见 [memory.md](memory.md)。
- Subagents：`.claude/agents/*.md` / `~/.claude/agents/*.md`，frontmatter 定义 name/description/tools/model 等。见 [sub-agents.md](sub-agents.md)。
- 排查配置是否生效：`/context`（看加载了哪些 memory/skills）、`/hooks`（看 hook 是否注册）、`/doctor`。见 [debug-your-config.md](debug-your-config.md)。
