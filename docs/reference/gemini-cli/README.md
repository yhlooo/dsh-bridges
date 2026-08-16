# Gemini CLI 参考资料

来源：<https://github.com/google-gemini/gemini-cli>（Google 开源 gemini-cli，`main` 分支 `docs/` 目录 markdown 原文，英文）。抓取日期 2026-08-16 (UTC)，原文未改动。

## 文件清单

| 文件 | 内容 |
| :--- | :--- |
| [skills.md](skills.md) | **Agent Skills 总览**：发现层级、激活生命周期、优先级与别名 |
| [creating-skills.md](creating-skills.md) | **创建 skills**：`SKILL.md` frontmatter（`name`/`description`）、目录结构（scripts/references/assets） |
| [using-agent-skills.md](using-agent-skills.md) | 管理 skills：`/skills` 命令、`gemini skills install/link`、激活 consent |
| [skills-best-practices.md](skills-best-practices.md) | skills 最佳实践：渐进式披露、description 触发词设计 |
| [custom-commands.md](custom-commands.md) | **自定义命令**：`.gemini/commands/*.toml`、`{{args}}`/`!{...}`/`@{...}` 替换 |
| [commands.md](commands.md) | 斜杠命令参考（`/agents` `/memory` `/skills` `/mcp` `/hooks` 等） |
| [gemini-md.md](gemini-md.md) | **GEMINI.md 上下文**：层级发现、`@path` 导入、`context.fileName` |
| [memory.md](memory.md) | **Memory 工具**：持久记忆写入 Markdown 文件并自动加载 |
| [auto-memory.md](auto-memory.md) | Auto Memory（实验）：后台挖掘会话生成记忆/skill 补丁 |
| [memory-management.md](memory-management.md) | 记忆管理教程（项目规则 + 私有记忆） |
| [settings.md](settings.md) | `/settings` 设置参考（settings.json 全部 UI 设置，含默认值） |
| [configuration.md](configuration.md) | **配置完整参考**：配置层级、settings.json 全集、环境变量/`.env`、CLI 参数 |
| [cli-reference.md](cli-reference.md) | CLI 命令与选项速查表 |
| [hooks.md](hooks.md) | **Hooks 总览**：事件表、退出码、matcher、配置 schema、多层合并 |
| [hooks-reference.md](hooks-reference.md) | **Hooks 技术规范**：stdin/stdout JSON schema、各事件输入/输出字段 |
| [writing-hooks.md](writing-hooks.md) | Hooks 编写教程（含示例脚本） |
| [hooks-best-practices.md](hooks-best-practices.md) | Hooks 最佳实践与安全 |
| [policy-engine.md](policy-engine.md) | **Policy Engine（权限）**：TOML 规则语法、tier 优先级、approval modes |
| [sandbox.md](sandbox.md) | 沙箱（进程级/工具级 sandboxing） |
| [trusted-folders.md](trusted-folders.md) | 文件夹信任与可信工作区 |
| [mcp-server.md](mcp-server.md) | **MCP 服务器**：settings.json `mcpServers` 配置、OAuth、工具命名 |
| [mcp-resources.md](mcp-resources.md) | MCP 资源（@resource 引用） |
| [mcp-setup.md](mcp-setup.md) | MCP 快速上手教程 |
| [subagents.md](subagents.md) | **Subagents**：`.gemini/agents/*.md` 定义、frontmatter schema、内置 agents |
| [remote-agents.md](remote-agents.md) | 远程 subagents（A2A 协议） |
| [extensions.md](extensions.md) | Extensions 总览（打包 prompts/MCP/commands/themes/hooks/sub-agents/skills） |
| [extensions-reference.md](extensions-reference.md) | **Extensions 参考**：`gemini-extension.json` 格式、打包内容、冲突解决 |
| [writing-extensions.md](writing-extensions.md) | 编写 extensions |
| [extensions-best-practices.md](extensions-best-practices.md) | Extensions 最佳实践 |
| [releasing-extensions.md](releasing-extensions.md) | 发布 extensions 到 gallery |
| [themes.md](themes.md) | 主题（UI 主题 / 输出样式） |
| [tools.md](tools.md) | 内置工具参考（tool 名称列表，供 hooks/policy matcher 使用） |
| [notifications.md](notifications.md) | 终端通知 |

## 配置规范速查

### 配置文件（settings.json 层级）

来源：[configuration.md](configuration.md)（第 10–88 行）。

| 层级 | 位置 | 说明 |
| :--- | :--- | :--- |
| 1. 默认值 | 硬编码 | 最低优先级 |
| 2. 系统默认 | `/etc/gemini-cli/system-defaults.json`（Linux） | `GEMINI_CLI_SYSTEM_DEFAULTS_PATH` 可改 |
| 3. 用户 | `~/.gemini/settings.json` | 全局用户设置 |
| 4. 项目 | `<project>/.gemini/settings.json` | 项目级，覆盖用户 |
| 5. 系统覆盖 | `/etc/gemini-cli/settings.json`（Linux） | 覆盖所有 settings 文件，企业管控用 |
| 6. 环境变量 | 进程环境 / `.env` 文件 | 见「环境变量」 |
| 7. CLI 参数 | 命令行 flag | 最高优先级 |

- `.env` 加载顺序：cwd 的 `.env` → 向上找（到 git root 或 home）→ `~/.env`；`DEBUG`/`DEBUG_MODE` 默认从项目 `.env` 排除，`.gemini/.env` 从不排除（configuration.md 第 2590–2603 行）。
- settings.json / gemini-extension.json 的字符串值支持 `$VAR`、`${VAR}`、`${VAR:-DEFAULT}` 环境变量展开（configuration.md 第 66–74 行）。
- 关键环境变量：`GEMINI_CLI_HOME`（用户级 `.gemini` 根目录）、`GEMINI_API_KEY`、`GEMINI_MODEL`、`GEMINI_CLI_SYSTEM_SETTINGS_PATH`、`GEMINI_SANDBOX`、`GEMINI_SYSTEM_MD`（替换系统提示词）等（configuration.md 第 2605–2766 行）。

### Skills

来源：[skills.md](skills.md)、[creating-skills.md](creating-skills.md)。

- 发现层级（低→高）：内置 → 扩展（extension 打包）→ 用户 `~/.gemini/skills/`（或 `~/.agents/skills/` 别名）→ 工作区 `.gemini/skills/`（或 `.agents/skills/` 别名）。同层内 `.agents/skills/` 别名优先于 `.gemini/skills/`（skills.md 第 38–56 行）。
- 目录结构：`SKILL.md`（必需）+ 可选 `scripts/`、`references/`、`assets/`；激活后整个目录加入允许读取路径（creating-skills.md 第 135–150 行）。
- frontmatter 字段：**仅 `name`（唯一标识，应与目录名一致）与 `description`（触发依据）**；文档未记载模型门控等其它字段（creating-skills.md 第 152–160 行）。
- 激活流程：会话开始时注入 name+description → 模型调用 `activate_skill` 工具 → 用户确认 → 注入 SKILL.md 正文并授权目录访问（skills.md 第 20–36 行）。
- 全局开关：`skills.enabled`（默认 true）、`skills.disabled`（禁用列表）（configuration.md 第 2222–2233 行）。

### Commands

来源：[custom-commands.md](custom-commands.md)。

- 位置：用户 `~/.gemini/commands/*.toml`、项目 `<project>/.gemini/commands/*.toml`；同名时项目命令覆盖用户命令（custom-commands.md 第 11–24 行）。
- 命名：文件名相对 `commands/` 目录路径，子目录用 `:` 分隔（`git/commit.toml` → `/git:commit`）。
- TOML 字段：必需 `prompt`（字符串）、可选 `description`（custom-commands.md 第 42–58 行）。
- 参数替换：`{{args}}`（正文原样注入；在 `!{...}` 内自动 shell 转义）；无 `{{args}}` 时参数以两空行追加到 prompt 末尾（custom-commands.md 第 59–166 行）。
- 动态注入：`!{...}` 执行 shell 命令注入输出（有确认提示）；`@{...}` 注入文件内容/目录列表（多模态支持）（custom-commands.md 第 168–275 行）。

### 记忆（GEMINI.md）

来源：[gemini-md.md](gemini-md.md)、[memory-management.md](memory-management.md)。

- 加载顺序（拼接合并）：全局 `~/.gemini/GEMINI.md` → 工作区及其父目录中的 `GEMINI.md` → JIT（工具访问某文件/目录时扫描该目录及祖先直到可信根）（gemini-md.md 第 14–40 行）。
- 导入语法：`@./path/file.md`（相对/绝对路径），非 `@import`；详见 `memport`（gemini-md.md 第 74–95 行）。
- 自定义文件名：`context.fileName`（string 或数组，如 `["AGENTS.md","CONTEXT.md","GEMINI.md"]`）（gemini-md.md 第 97–111 行）。
- 边界与发现：`context.memoryBoundaryMarkers`（默认 `[".git"]`，向上遍历到此停止）、`context.discoveryMaxDirs`（默认 200）（configuration.md 第 1640–1662 行）。
- 持久记忆：Memory 工具直接编辑 Markdown 记忆文件（项目共享 → 仓库 GEMINI.md；项目私有 → 私有记忆目录；跨项目偏好 → `~/.gemini/GEMINI.md`）（memory.md 第 9–14 行）。

### Hooks

来源：[hooks.md](hooks.md)、[hooks-reference.md](hooks-reference.md)。

- 配置位置：`settings.json` 的 `hooks` 对象；合并顺序（高→低）：项目 `.gemini/settings.json` → 用户 `~/.gemini/settings.json` → 系统 `/etc/gemini-cli/settings.json` → 扩展（hooks.md 第 95–125 行）。
- 事件全集：`BeforeAgent`、`AfterAgent`、`BeforeModel`、`AfterModel`、`BeforeToolSelection`、`BeforeTool`、`AfterTool`、`SessionStart`、`SessionEnd`、`PreCompress`、`Notification`（hooks.md 第 37–53 行）。
- 定义字段：hook 组 `matcher`（工具事件用正则、生命周期用精确串、`"*"`/`""` 通配）、`sequential`、`hooks[]`；单条 hook `type`（仅 `"command"`）、`command`、`name`、`timeout`（默认 60000ms）、`description`（hooks-reference.md 第 24–46 行）。
- I/O 协议：stdin 收 JSON（公共字段 `session_id`/`transcript_path`/`cwd`/`hook_event_name`/`timestamp`，各事件另有专属字段）；stdout 只允许最终 JSON，非 JSON 输出视为失败；stderr 用于日志（hooks.md 第 59–73 行）。
- 退出码：`0` 成功（含 `{"decision":"deny"}` 的有意阻断）；`2` 系统阻断（stderr 作为拒绝原因，turn 继续）；其它非致命警告（hooks-reference.md 第 11–21 行）。
- 输出字段：`decision`（`allow`/`deny`=`block`）、`reason`、`continue`（false 终止整个 agent loop）、`systemMessage`、`suppressOutput`、`hookSpecificOutput.*`（各事件专属，如 `additionalContext`、`tool_input` 覆盖、`llm_request` 覆盖、`toolConfig` 过滤等）。
- 总开关：`hooksConfig.enabled`（默认 true）、`hooksConfig.disabled`、`hooksConfig.notifications`（configuration.md 第 2235–2253 行）。

### 权限（Policy Engine）

来源：[policy-engine.md](policy-engine.md)。

- 位置：TOML 文件，用户 `~/.gemini/policies/*.toml`（工作区 `.gemini/policies/` 目前**不可用**，见 issue #18186）；管理员系统目录按 OS 区分；`policyPaths`/`adminPolicyPaths` 可补充路径（policy-engine.md 第 20–41、223–285 行）。
- 规则语法（`[[rule]]`）：`toolName`（支持 `*`、`mcp_*` 通配，可数组）、`subagent`、`mcpName`、`toolAnnotations`、`argsPattern`、`commandPrefix`/`commandRegex`（`run_shell_command` 专用）、`decision`（`allow`/`deny`/`ask_user`）、`priority`（0–999）、`denyMessage`、`modes`、`interactive`、`allowRedirection`（policy-engine.md 第 287–357 行）。
- 优先级：`final_priority = tier_base + toml_priority/1000`；tier 基值 Default=1、Extension=2、Workspace=3（禁用）、User=4、Admin=5，数值大者胜（policy-engine.md 第 128–169 行）。
- 批准模式：`default`、`autoEdit`、`plan`（只读）、`yolo`（全部自动批准）；`general.defaultApprovalMode` 默认 `"default"`（settings.md 第 33 行；policy-engine.md 第 171–204 行）。

### MCP

来源：[mcp-server.md](mcp-server.md)、[configuration.md](configuration.md) 第 2427–2478 行。

- 配置位置：`settings.json` 的 `mcpServers.<name>`（无 `.mcp.json` 文件约定）；全局 `mcp.allowed`/`mcp.excluded` 控制发现开关。
- 服务器条目：至少 `command`/`url`(SSE)/`httpUrl`(streamable HTTP) 之一（优先级 `httpUrl` > `url` > `command`）；可选 `args`、`env`、`cwd`、`headers`、`timeout`（默认 600000ms）、`trust`、`includeTools`/`excludeTools`、`targetAudience`/`targetServiceAccount`（OAuth）。
- 工具命名：`mcp_<serverAlias>_<toolName>`；别名避免下划线（policy 解析器按首个下划线切分）（mcp-server.md 第 594–618 行）。

### Subagents

来源：[subagents.md](subagents.md)。

- 定义文件：项目 `.gemini/agents/*.md`、用户 `~/.gemini/agents/*.md`；Markdown + YAML frontmatter，正文为 System Prompt（subagents.md 第 321–334 行）。
- frontmatter 字段：`name`（必需，slug）、`description`（必需）、`kind`（`local`/`remote`）、`tools`（数组，支持 `*`/`mcp_*` 通配，缺省继承父会话）、`mcpServers`（内联 MCP）、`model`（默认 inherit）、`temperature`（默认 1）、`max_turns`（默认 30）、`timeout_mins`（默认 10）（subagents.md 第 363–375 行）。
- 内置 agents：`codebase_investigator`、`cli_help`、`generalist`、`browser_agent`（默认禁用）；`settings.json` 的 `agents.overrides` 可覆盖（subagents.md 第 55–109 行）。
- 委派：主 agent 自动委派或 `@agentname` 前缀强制；子 agent 之间不可递归调用（subagents.md 第 27–54、387–397 行）。

### 其他

- **Extensions**：`~/.gemini/extensions/<name>/gemini-extension.json` 打包 commands、hooks（`hooks/hooks.json`）、skills（`skills/`）、sub-agents（`agents/`）、MCP、policies（`policies/`）、themes、context；扩展 command 与用户/项目冲突时被前缀扩展名（`/gcp.deploy`）（extensions-reference.md）。
- **Themes / 输出样式**：`ui.theme`（JSON 路径或内置名）、`/theme` 命令选择；扩展可在 manifest 提供 themes（themes.md、extensions-reference.md 第 304–347 行）。
- **Output**：`output.format`（`text`/`json`）、CLI `--output-format`（另支持 `stream-json`）（settings.md 第 48–52 行、cli-reference.md）。
- **env 注入**：settings.json 值 `$VAR` 展开、MCP `env` 块、`.env` 加载、环境变量脱敏（`security.allowedEnvironmentVariables`/`blockedEnvironmentVariables`）（configuration.md）。
