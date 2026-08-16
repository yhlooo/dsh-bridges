# pi 参考资料

来源：<https://github.com/earendil-works/pi>（badlogic/earendil 的 pi coding agent，即 pi.dev，官方仓库 main 分支；文档位于 `packages/coding-agent/docs/`）。抓取日期 2026-08-16 (UTC)，原文未改动。各文件头部注明各自的原始 raw URL。

> 说明：pi 的配置模型与 Claude Code / Codex 不同——**没有独立的 commands.md / memory.md / hooks.md / mcp.md / agents.md，也没有 `PI.md`**。全仓库 grep 确认：记忆文件是 `AGENTS.md`/`CLAUDE.md`（+`SYSTEM.md`/`APPEND_SYSTEM.md`），命令是斜杠模板 + 扩展命令，hooks 是扩展事件总线，`settings.json` 无 `mcp`/`hooks`/`permissions`/`commands`/`agents` 配置键（源码 `Settings` 接口亦无）。对应能力分别落在 `skills.md`（技能）、`prompt-templates.md`（斜杠模板，相当于命令）、`usage.md`+`quickstart.md`（AGENTS.md 记忆/上下文文件）、`extensions.md`（TypeScript 扩展 + 事件总线，相当于 hooks/tools/subagent）、`security.md`+`settings.md`（信任与工具开关）。MCP 与 sub-agent **无内置实现**，靠扩展/包实现（见 `usage.md` 设计原则一节）。`.agents/skills/` 是共享**技能**目录（遵循 open Agent Skills 标准），不是 sub-agent 定义目录。

## 文件清单

| 文件 | 内容 |
| :--- | :--- |
| [docs-index.json](docs-index.json) | 官方文档站导航索引（`docs.json`，原样，未加头） |
| [index.md](index.md) | 官方文档总目录/概览 |
| [quickstart.md](quickstart.md) | 安装、认证、首次会话、上下文文件快速上手 |
| [usage.md](usage.md) | 交互模式、斜杠命令、**上下文文件（记忆）**、CLI 参考、设计原则 |
| [skills.md](skills.md) | **Skills 规范**：位置、层级、frontmatter 字段、校验、优先级 |
| [settings.md](settings.md) | **settings.json 完整参考**：位置、所有配置键、资源键、项目覆盖合并 |
| [extensions.md](extensions.md) | **扩展规范**：扩展位置、事件总线（hooks）、自定义工具、命令、sub-agent 示例 |
| [prompt-templates.md](prompt-templates.md) | **斜杠模板（命令）规范**：位置、frontmatter、参数替换 |
| [packages.md](packages.md) | **pi 包**：npm/git/本地源、`pi` manifest、约定目录、去重 |
| [security.md](security.md) | 项目信任、无内置沙箱、安全边界 |
| [environment-variables.md](environment-variables.md) | 环境变量（含 `PI_CODING_AGENT_DIR` 配置目录覆盖） |
| [sessions.md](sessions.md) | 会话管理、分支、树导航 |
| [session-format.md](session-format.md) | 会话 JSONL 文件格式与 SessionManager API |
| [sdk.md](sdk.md) | SDK 嵌入：自定义工具、spawn sub-agent 等 |
| [compaction.md](compaction.md) | 上下文压缩与分支摘要 |
| [containerization.md](containerization.md) | 沙箱化运行（Gondolin/Docker/OpenShell） |

## 配置规范速查

### 配置目录层级

| 级别 | 位置 | 说明 |
| :--- | :--- | :--- |
| 全局 | `~/.pi/agent/settings.json` | 所有项目生效（settings.md） |
| 项目 | `.pi/settings.json` | 覆盖全局，嵌套对象合并（settings.md） |
| 配置目录覆盖 | `PI_CODING_AGENT_DIR` | 默认 `~/.pi/agent`（environment-variables.md） |
| 信任决策 | `~/.pi/agent/trust.json` | 按规范目录存决策（settings.md） |
| 认证 | `~/.pi/agent/auth.json` | `/login` API key 存储（quickstart.md） |
| 会话 | `~/.pi/agent/sessions/` | `sessionDir` / `PI_CODING_AGENT_SESSION_DIR` / `--session-dir` 可改（usage.md、settings.md） |

路径解析：全局 settings 内的相对路径相对 `~/.pi/agent`，项目 settings 内的相对路径相对 `.pi`；支持绝对路径与 `~`（settings.md「Resources」）。

### 优先级规则

- **设置**：项目 `.pi/settings.json` 覆盖全局 `~/.pi/agent/settings.json`；嵌套对象合并，标量替换（settings.md「Project Overrides」）。
- **项目信任**：项目含 `.pi/settings.json`、`.pi/extensions|skills|prompts|themes`、`.pi/SYSTEM.md` 或 `APPEND_SYSTEM.md`、项目 `.agents/skills` 时触发信任；决策顺序为「已保存的最近 trust.json 决策 → 全局 `defaultProjectTrust`(ask/always/never) → `project_trust` 事件 → 内置提示」；`--approve`/`--no-approve` 覆盖单次运行（settings.md、security.md、extensions.md）。
- **Skills 同名冲突**：不同位置同名技能告警并保留**先发现者**（skills.md「Validation」）。发现顺序：全局（`~/.pi/agent/skills/`、`~/.agents/skills/`）→ 项目（`.pi/skills/`、`.agents/skills/`）→ 包 → settings `skills` → CLI `--skill`（skills.md「Locations」）。
- **包去重**：同名包全局与项目都出现时，项目条目胜出；`autoload:false` 时项目条目作为 delta 叠加（packages.md「Scope and Deduplication」）。
- **会话目录**：`--session-dir` > `PI_CODING_AGENT_SESSION_DIR` > `sessionDir`（settings.md）。
- **工具开关**：`--tools` 严格白名单 > `defaultTools`；`--exclude-tools` 在其后过滤；项目 `defaultTools` 数组替换全局数组（settings.md）。

### Skills（skills.md）

- 位置：全局 `~/.pi/agent/skills/`、`~/.agents/skills/`；项目（需信任）`.pi/skills/`、`.agents/skills/`（cwd 及祖先，至 git 根或文件系统根）；包 `skills/` 或 `pi.skills`；settings `skills` 数组；CLI `--skill <path>`。
- 层级：目录含 `SKILL.md` 递归发现；`~/.pi/agent/skills/` 与 `.pi/skills/` 的根级 `.md` 也作为单个技能；`~/.agents/skills/` 与 `.agents/skills/` 的根级 `.md` **被忽略**。
- 文件格式：目录 + `SKILL.md`（frontmatter + 指令），其余自由（scripts/references/assets 等）。
- frontmatter 字段：

  | 字段 | 必填 | 约束 |
  | :--- | :--- | :--- |
  | `name` | 是 | 1–64 字符，小写字母/数字/连字符，无首尾/连续连字符；**不要求与父目录同名**（与 Agent Skills 标准不同） |
  | `description` | 是 | ≤1024 字符；缺省则技能不加载 |
  | `license` | 否 | 许可证名或捆绑文件引用 |
  | `compatibility` | 否 | ≤500 字符 |
  | `metadata` | 否 | 任意键值 |
  | `allowed-tools` | 否 | 空格分隔的预批准工具列表（实验性） |
  | `disable-model-invocation` | 否 | `true` 时隐藏于系统提示，仅 `/skill:name` 可用 |

- 校验：多数违规仅告警仍加载；缺 `description` 不加载；未知字段忽略（skills.md「Validation」）。
- 命令：`/skill:name [args]`（`enableSkillCommands`，默认 `true`）；参数以 `User: <args>` 追加（skills.md「Skill Commands」）。

### 命令 / 斜杠模板（prompt-templates.md、extensions.md）

- **无独立 commands 目录**。斜杠模板即命令：位置全局 `~/.pi/agent/prompts/*.md`、项目 `.pi/prompts/*.md`（需信任）、包 `prompts/`、settings `prompts` 数组、CLI `--prompt-template`。
- 文件名即命令名：`review.md` → `/review`。
- frontmatter：`description`（可选，缺省取首行非空）、`argument-hint`（可选，`<必填>` / `[可选]`）。
- 参数替换：`$1` `$2`、`$@`/`$ARGUMENTS`、`${1:-default}`、`${@:N}`、`${@:N:L}`。
- 发现：`prompts/` 内**非递归**；子目录需显式加入 settings/packages。
- 扩展命令：`pi.registerCommand(name, {description, handler, getArgumentCompletions?})`；同名不覆盖，按加载顺序加数字后缀 `/review:1` `/review:2`（extensions.md）。

### 记忆 / 上下文文件（usage.md、quickstart.md、security.md）

- 上下文文件：`AGENTS.md` 或 `CLAUDE.md`（**无 PI.md**）。全局 `~/.pi/agent/AGENTS.md`；然后从 cwd 向祖先逐目录加载 + 当前目录。
- `AGENTS.override.md`：若某目录存在，则替代该目录的 `AGENTS.md`/`CLAUDE.md`（其余目录照常分层）。
- 系统提示文件：`.pi/SYSTEM.md`（项目）/ `~/.pi/agent/SYSTEM.md`（全局）**替换**默认系统提示；`APPEND_SYSTEM.md`（同两处）**追加**。
- 上下文文件**不受项目信任限制**（除非 `--no-context-files`/`-nc` 禁用）；修改后需 `/reload`。

### Hooks / 事件（extensions.md）

- **无配置文件式 hooks**（无 hooks.json）；等价物是 TypeScript 扩展订阅事件总线 `pi.on(event, handler)`。
- 扩展位置：全局 `~/.pi/agent/extensions/*.ts`、`*\/index.ts`；项目 `.pi/extensions/*.ts`、`*\/index.ts`（需信任）；settings `extensions` 数组；包；CLI `-e`。
- 工具相关事件（映射 dsh 的 pre/post-execute hooks）：`tool_execution_start` → `tool_call`（可拦截：返回 `{block, reason, terminate?}`，`event.input` 可变）→ `tool_execution_update` → `tool_result`（可修改结果，处理器按加载顺序链式）→ `tool_execution_end`。
- 会话/注入事件（映射 dsh 的 session-start 注入）：`session_start`、`before_agent_start`（可注入 message、改 systemPrompt）、`context`（每次 LLM 调用前改 messages）。
- 完整事件集：见 extensions.md「Events」一节（`project_trust`、`session_*`、`agent_*`、`turn_*`、`message_*`、`tool_*`、`model_select`、`thinking_level_select`、`input`、`user_bash`、`before_provider_*`、`after_provider_response` 等）。

### 权限 / 工具开关（security.md、settings.md、usage.md、skills.md）

- **无内置权限弹窗 / 规则系统 / 沙箱**（usage.md「Design Principles」、security.md）。权限门靠 `tool_call` 事件自行实现（`permission-gate.ts` 示例）。
- 内置工具：默认 `read` `write` `edit` `bash`（quickstart.md）；额外只读 `grep` `find` `ls`（usage.md）。
- 开关：`defaultTools`（settings）、`--tools`（严格白名单）、`--exclude-tools`、`--no-builtin-tools`、`--no-tools`（usage.md）。
- 技能级预批准：frontmatter `allowed-tools`（实验性，skills.md）。

### 其他资产

- **扩展（extensions）**：`.ts` 模块，注册工具/命令/事件/自定义 UI（extensions.md）。
- **斜杠模板（prompts）**：见上文。
- **主题（themes）**：`themes.md`（本目录未收录，非桥接重点）。
- **pi 包（packages）**：npm/git/本地路径，`package.json` 的 `pi` 键或约定目录 `extensions/` `skills/` `prompts/` `themes/` 分发（packages.md）。
- **MCP**：无内置，靠扩展/包实现（usage.md）。
- **sub-agent**：无内置；示例 `subagent/` 用 `registerTool` + `exec` 派生（extensions.md「Examples Reference」）；SDK 可 spawn sub-agent（sdk.md）。
