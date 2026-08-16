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
| [mcp.md](mcp.md) | MCP 服务器配置（补齐于 2026-08-15） |
| [iam.md](iam.md) | 身份与访问管理（信任目录、权限）（补齐于 2026-08-15） |
| [models.md](models.md) | 模型配置与 models.json（补齐于 2026-08-15） |
| [env-vars.md](env-vars.md) | 环境变量参考 |
| [cli-reference.md](cli-reference.md) | CLI 命令与参数（含沙箱参数） |
| [best-practices.md](best-practices.md) / [common-workflows.md](common-workflows.md) | 最佳实践与常见工作流 |
| [troubleshooting.md](troubleshooting.md) | 问题排查 |

## 配置规范速查

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

## 桥接映射（dsh-bridges）

这是 `src/agents/codebuddy-code/` 子系统把 CodeBuddy Code 资产映射到 DSH 接缝的决策记录，验收以此表为准。

### Skills / Commands → `ctx.skills` provider（`codebuddy-code`）

| CodeBuddy Code 位置 | 注册为 | rank |
| :--- | :--- | :--- |
| `.codebuddy/skills/<name>/SKILL.md`（含嵌套 `<group>/<name>/SKILL.md`） | 项目级技能（嵌套技能名 `group-name`） | 125 |
| `.codebuddy/commands/<name>.md`（含嵌套 `<group>/<name>.md`） | 项目级命令（即技能；嵌套技能名 `group-name`） | 130 |
| `~/.codebuddy/skills/<name>/SKILL.md`（含嵌套 `<group>/<name>/SKILL.md`） | 用户级技能（嵌套技能名 `group-name`） | 135 |
| `~/.codebuddy/commands/<name>.md`（含嵌套 `<group>/<name>.md`） | 用户级命令（即技能；嵌套技能名 `group-name`） | 140 |

- 优先级遵循 CodeBuddy Code 上游语义：**项目级 > 用户级**（与 Claude Code 相反），同级下技能 > 命令；rank 越小越优先，段在 DSH 运行时技能（250）之下。
- 技能只读目录型 `SKILL.md`；扁平 `<name>.md` 是 Claude Code 扩展，CodeBuddy Code 文档未记载，不读取。
- 嵌套资产（skills 与 commands）递归发现：上游限定名 `group:name` 因 DSH 技能名语法不含 `:`，按 `:` → `-` 转写为 `group-name`（如 `pathto:skill` → `pathto-skill`、`/frontend:build` → `frontend-build`）；限定名非 kebab-case 的目录整棵跳过 + warn（不转写）。扁平 `group-name.md` 与嵌套 `group/name.md` 映射到同一技能名，注册表保留先发现的候选。
- frontmatter：`disable-model-invocation` → `modelInvocable` 取反；`user-invocable` → `userInvocable`；非法布尔值丢弃整个条目 + warn（fail closed）。`when_to_use` 未见于 CodeBuddy Code 文档，但为兼容 Claude 资产而识别（合并进描述）。`allowed-tools`、`context: fork`、`agent`、`model`、skill frontmatter `hooks` 不桥接。
- `skillOverrides`（`on` / `name-only` / `user-invocable-only` / `off`）按 PROJECT_LOCAL > PROJECT > USER 逐文件取最具体的合法值（非法值按文件过滤后回退上一有效层级；全非法视为 `on`）：`name-only` 折叠描述为空串，`user-invocable-only` → `modelInvocable: false`，`off` → 双面关闭。嵌套技能同时接受 kebab-case 名与上游限定名作为键。

### Memory → `agent/session-start` 注入

| CodeBuddy Code 记忆 | 桥接 |
| :--- | :--- |
| `~/.codebuddy/CODEBUDDY.md` | 用户记忆，注入 |
| `~/.codebuddy/rules/**/*.md`（递归） | 仅 `enabled`/`alwaysApply` 非 false 的规则（frontmatter 剥离后注入） |
| `CODEBUDDY.md` / `.codebuddy/CODEBUDDY.md` | 项目记忆，注入（内容相同去重） |
| `CODEBUDDY.local.md` | 本地项目记忆，注入 |
| `.codebuddy/rules/**/*.md`（递归） | 同上，仅始终应用规则 |

- 条件规则（`alwaysApply: false` + `paths`）依赖文件操作触发，不桥接（直接跳过）；`@import` 展开、向上递归查找、嵌套子树动态加载不桥接。
- 预算 32 KiB：超限先丢弃全部用户级、再截断项目级；注入框架为 `<system-reminder>`（`</system-reminder>` 转义）。

### Hooks → DSH 生命周期

| CodeBuddy Code 事件 | DSH 接缝 | 决策映射 |
| :--- | :--- | :--- |
| `SessionStart`（matcher: startup/resume/clear/compact） | `agent/session-start` | `additionalContext` 与退出码 0 纯文本 stdout 注入 |
| `UserPromptSubmit` | `agent/pre-step` | 退出码 2 / `continue: false` 擦除提示词并展示原因；上下文追加到本步 |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision`: `deny` → 拒绝、`ask` → 审批、`allow` → 放行；退出码 2 → 拒绝（消息 stdout 优先）；`modifiedInput` 忽略 + warn（dsh 冻结参数） |
| `PostToolUse` / `PostToolUseFailure` | `tools/post-execute` | `additionalContext`、退出码 2 消息、废弃的 `decision: "block"` reason → 上下文；`updatedToolOutput` 替换渲染内容 |
| `Stop` | `agent/turn-stopping` | 退出码 2 / `continue: false` / `additionalContext` 引导继续（`stop_hook_active` 标记；桥接侧安全上限连续 8 次，CodeBuddy Code 未记载上限） |
| `SessionEnd` | `agent/disposed` | 仅副作用（1.5 秒预算；reason 固定 `other`） |

- settings 来源与合并：`~/.codebuddy/settings.json`（user）→ `.codebuddy/settings.json`（project）→ `.codebuddy/settings.local.json`（local）；分组叠加合并、相同 handler 按 JSON 去重、`disableAllHooks` 取最具体定义层、`env` 合并。
- matcher 语义：`*` / 空 / 缺省匹配全部；其余按区分大小写的正则（`Write` 可命中 `NotebookWrite`，`^Write$` 精确）；非法正则 fail closed。`if` 字段用权限规则语法 `ToolName(glob)`，无法解析时 fail open。
- 退出码协议：0 = 成功（`SessionStart`/`UserPromptSubmit` 的 stdout 进上下文）；2 = 阻塞（消息优先级：stdout JSON `reason`/`stopReason` > 纯文本 stdout > stderr）；其他非零 = 非阻塞错误。
- handler 类型：`command`（shell / `args` exec 形态、`${CODEBUDDY_PROJECT_DIR}` 替换、`timeout`、`async`、`once`）与 `http`（`method` POST/PUT/PATCH、`headers`；CodeBuddy Code 无 URL 白名单设置，不设白名单）。`prompt` / `agent` 需要小模型 / 子代理判定，不桥接（配置归一化时丢弃）。
- 工具名翻译：`bash`→`Bash`、`pwsh`→`PowerShell`、`read`→`Read`、`write`→`Write`、`edit`→`Edit`、`glob`→`Glob`、`grep`→`Grep`、`web`/`web_search`→`WebSearch`、`ask_user_question`→`AskUserQuestion`、`exit_plan_mode`→`ExitPlanMode`、`subagent`→`Task`、`todo_write`→`TodoWrite`。
- 未桥接事件：`Notification`、`SubagentStart`/`SubagentStop`、`PreCompact`/`PostCompact`、`PermissionRequest`/`PermissionDenied`、`Elicitation`、`FileChanged`、`Setup` 等。子代理排除主会话事件（UserPromptSubmit/Stop/SessionStart/SessionEnd）。

### 不桥接（限制清单）

- Skills：扁平 `.md` 技能、插件技能；`allowed-tools`、`model`、`context: fork`、`agent`、frontmatter `hooks`；正文 `!`command`` 内联执行、`$ARGUMENTS` 替换、`@file` 引用。
- Memory：条件规则（`alwaysApply: false` + `paths`）、`@import`、向上递归查找、嵌套子树动态加载、Auto Memory。
- Hooks：`prompt` / `agent` handler 类型、frontmatter hooks（含 `allowUntrustedFrontmatterHooks` 闸门）、插件 `hooks/hooks.json`、`transcript_path` 字段（桥接无法提供真实转录文件）、`suppressOutput` / `systemMessage`（DSH 无仅面向用户的通道）。
