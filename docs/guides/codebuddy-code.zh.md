# CodeBuddy Code 桥接

[English](codebuddy-code.md)

把为 CodeBuddy Code 配置的资产桥接进 DeepSeek Harness：`.codebuddy/` 的
skills、commands 与 subagent 定义、`CODEBUDDY.md` 记忆与始终应用规则、
`settings.json` 的 hooks 与权限规则、MCP 服务器。安装步骤与各桥接的公共行为
见[指南索引](README.zh.md)。

## 配置

桥接在 `bridges` 行下拥有一个配置段，任何后续 patch 层都可以覆盖：

```yaml
- id: bridges
  config:
    codebuddyCode:
      enabled: true                      # CodeBuddy Code 桥接的总开关
      skills: true                       # 发现 .codebuddy / ~/.codebuddy 的 skills 与 commands
      agents: true                       # 发现 .codebuddy / ~/.codebuddy 的 subagent 定义
      mcp: true                          # 桥接 .mcp.json / ~/.codebuddy/.mcp.json 的 MCP 服务器
      memory: true                       # 注入 CODEBUDDY.md 记忆与始终应用规则
      hooks: true                        # 运行 settings.json 里的 CodeBuddy Code hooks
      permissions: true                  # 执行 settings.json 里的 permissions.allow/ask/deny 规则
      userCodebuddyDir: '~/.codebuddy'   # 用户级 CodeBuddy Code 目录
      watch: true                        # 监听技能根目录与 settings 文件
      hookTimeoutMs: 60000               # 对齐 CodeBuddy Code 的 60 秒 hook 上限
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Skills 与 Commands

读取 CodeBuddy Code 的技能位置并注册到 DeepSeek Harness 的技能注册表（provider 名 `codebuddy-code`），使它们出现在模型可见的技能目录中、可通过 `skill` 工具加载、也可用 `/名字` 直接调用：

| CodeBuddy Code 位置 | 注册为 |
| :--- | :--- |
| `.codebuddy/skills/<name>/SKILL.md`（也支持嵌套 `<group>/<name>/SKILL.md`） | 项目级技能（嵌套：技能名 `group-name`） |
| `.codebuddy/commands/<name>.md`（也支持嵌套 `<group>/<name>.md`） | 项目级命令（即技能；嵌套：技能名 `group-name`） |
| `~/.codebuddy/skills/<name>/SKILL.md`（也支持嵌套 `<group>/<name>/SKILL.md`） | 用户级技能（嵌套：技能名 `group-name`） |
| `~/.codebuddy/commands/<name>.md`（也支持嵌套 `<group>/<name>.md`） | 用户级命令（即技能；嵌套：技能名 `group-name`） |

映射规则：

- DeepSeek Harness 技能名取目录名 / 文件名（必须 kebab-case；不合法的名字跳过并告警）。
- 嵌套资产递归发现：上游限定名 `group:name`（`skills/pathto/skill/SKILL.md` → 技能 `pathto:skill`，`commands/frontend/build.md` → 命令 `/frontend:build`）映射为 kebab-case 技能名 `group-name`（`pathto-skill`、`frontend-build`），因为 DeepSeek Harness 技能名不允许含 `:`。限定名非 kebab-case 的目录整棵跳过。扁平的 `group-name.md` 与嵌套的 `group/name.md` 会落到同一个技能名上——注册表保留先发现的候选。
- 只读目录型技能（目录内 `SKILL.md`）；扁平 `<name>.md` 技能是 Claude Code 扩展，CodeBuddy Code 文档未记载，不读取。
- 优先级与 CodeBuddy Code 一致：**项目资产覆盖用户资产**（与 Claude Code 相反，因此 rank 段独立分配）；同级下技能覆盖同名命令。同名冲突时 DeepSeek Harness 原生技能始终胜出（见[公共行为](README.zh.md#公共行为)）。
- `description` + `when_to_use` 合并为技能描述（1,536 字符上限截断；`description` 缺省时回退到正文首段）。`when_to_use` 未见于 CodeBuddy Code 文档，为兼容 Claude 资产而识别。
- `disable-model-invocation` → 该技能退出模型目录，但仍可用 `/名字` 调用。`user-invocable: false` → 不面向人工调用，仅模型可用。`metadata` 原样透传。
- 叠加应用 `skillOverrides` 设置：`name-only` 折叠描述、`user-invocable-only` 对模型隐藏（仍可人工调用）、`off` 双面关闭。最具体的合法值生效（local > project > user），非法值按文件过滤后回退上一有效层级，与 CodeBuddy Code 一致。嵌套技能同时接受 kebab-case 名（`pathto-skill`）与上游限定名（`pathto:skill`）作为键。
- 技能目录整体作为资源基目录，`SKILL.md` 里引用的支撑文件（`scripts/`、`references/` 等）按需解析。
- 已存在的技能根目录与 settings 文件会被监听；改动无需重启即可在会话内生效。

## CODEBUDDY.md 记忆

DeepSeek Harness 核心自行加载 `AGENTS.md` 与根目录 `CLAUDE.md`，但不读 CodeBuddy Code 的记忆文件。本桥接在会话开始时注入（采用 DeepSeek Harness 工作区指令相同的 system-reminder 框架）：

- `~/.codebuddy/CODEBUDDY.md`（用户记忆）与 `~/.codebuddy/rules/**`（用户规则，递归，仅始终应用规则）
- `<cwd>/CODEBUDDY.md` 与 `<cwd>/.codebuddy/CODEBUDDY.md`（项目记忆；内容相同只保留一份）
- `<cwd>/CODEBUDDY.local.md`（本地项目记忆）
- `<cwd>/.codebuddy/rules/**`（项目规则，递归，仅始终应用规则）

预算 32 KiB：超限先丢弃全部用户级、再截断最具体的项目级。规则文件的 frontmatter 会被剥离；`enabled: false` 与 `alwaysApply: false` 的规则跳过。

## Hooks

合并读取 `~/.codebuddy/settings.json` → `.codebuddy/settings.json` → `.codebuddy/settings.local.json` 的 `hooks` 字段（分组叠加合并、相同 handler 去重、`disableAllHooks` 取最具体定义它的层级），并在下列 DeepSeek Harness 生命周期执行 handler：

| CodeBuddy Code 事件 | DeepSeek Harness 接缝 | 决策映射 |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext`（及退出码 0 的纯文本 stdout）在首个提示词前注入；matcher 收到 `startup`/`resume`/`clear`/`compact` |
| `UserPromptSubmit` | `agent/pre-step` | 退出码 2 / `continue: false` 擦除提示词并展示原因；上下文追加到本步 |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision`：`deny` → 拒绝、`ask` → 走审批、`allow` → 放行并跳过后续权限检查（但 deny/ask 权限规则仍会评估，见 Permissions 小节）；退出码 2 → 拒绝（消息 stdout 优先）；`modifiedInput` 忽略 + 告警；`additionalContext` 注入 |
| `PostToolUse` | `tools/post-execute` | `additionalContext` / 退出码 2 消息 / 废弃的 `decision: "block"` reason → 结果旁注入上下文；`updatedToolOutput` 替换渲染内容 |
| `PostToolUseFailure` | `tools/post-execute`（失败结果） | 同 PostToolUse |
| `Stop` | `agent/turn-stopping` | 退出码 2 / `continue: false` / `additionalContext` 引导继续（重复时带 `stop_hook_active`；桥接侧安全上限连续 8 次） |
| `SubagentStart` | `agent/session-start`（子代理会话） | `additionalContext`（及退出码 0 的纯文本 stdout）注入子代理；matcher 收到 `generic`（DeepSeek Harness 子代理没有上游 agent 类型，`*` matcher 可运行、特定 matcher 无法命中） |
| `SubagentStop` | `agent/turn-stopping`（子代理会话） | 退出码 2 / `continue: false` / `additionalContext` 引导继续（重复时带 `stop_hook_active`；桥接侧安全上限连续 8 次） |
| `SessionEnd` | `agent/disposed` | 仅副作用（1.5 秒预算，reason 固定 `other`） |

支持的 handler 类型：`command`（shell 形态与 `args` exec 形态、`${CODEBUDDY_PROJECT_DIR}` 替换、每 handler `timeout`（默认对齐 CodeBuddy Code 的 60 秒）、`async: true`、`once: true`、按 CodeBuddy Code 协议的退出码与 JSON 输出）与 `http`（`method` POST/PUT/PATCH、`headers`；CodeBuddy Code 未记载 URL 白名单，故不设白名单）。

兼容性细节：

- hooks 以 CodeBuddy Code 工具名为键。DeepSeek Harness 的命名不同（`bash`、`edit`、`read`……），因此桥接做了翻译：`bash`→`Bash`、`pwsh`→`PowerShell`、`read`→`Read`、`write`→`Write`、`edit`→`Edit`、`glob`→`Glob`、`grep`→`Grep`、`web`/`web_search`→`WebSearch`、`ask_user_question`→`AskUserQuestion`、`exit_plan_mode`→`ExitPlanMode`、`subagent`→`Task`、`todo_write`→`TodoWrite`；未映射的 DeepSeek Harness 工具（MCP 服务器、一方扩展）保留原名。matcher、`if` 规则以及 hook 脚本收到的 `tool_name` 字段都是翻译后的名字，因此为 CodeBuddy Code 写好的 hook 脚本原样可用。
- matcher 语义遵循 CodeBuddy Code 规范：`*` / 空 / 缺省匹配全部；其余按区分大小写的正则（裸 `Write` 也能命中 `NotebookWrite`，`^Write$` 精确匹配）。
- 阻塞消息遵循 CodeBuddy Code 的退出码 2 优先级：stdout JSON `reason`/`stopReason` > 纯文本 stdout > stderr 兜底（与 Claude Code 的 stderr 优先相反）。
- `if` 过滤器支持常见的 `ToolName(glob)` 形态，对已映射的工具各对应一个主参数字段（`Bash(git *)`、`Edit(*.ts)`……）；无法解析的规则以及没有映射字段的工具一律放行。
- 超时与 handler 失败一律放行（绝不因此阻断动作），同 CodeBuddy Code。
- 子代理：`UserPromptSubmit`、`Stop`、`SessionStart`、`SessionEnd` 仅对主会话生效，`SubagentStart`/`SubagentStop` 仅对子代理会话生效——与 CodeBuddy Code 的作用域一致。`PreToolUse`/`PostToolUse` 也会在子代理的工具调用上触发。

## Permissions（权限规则）

合并读取同一批 settings 文件的 `permissions.allow/ask/deny` 规则（跨层级叠加合并、去重），并在 `tools/pre-execute` 接缝执行，语义与 CodeBuddy Code 一致（deny → ask → allow，首个命中决定结果）：

- **Bash**：`Bash(cmd)` 精确匹配；`Bash(git:*)` 词前缀匹配；`Bash(npm run *)` 按 bash glob 匹配（`*` 可跨 `/`）。复合命令按顶层 `&&`/`||`/`;`/`|` 拆分（引号内不拆）：deny/ask 任一子命令命中即触发，allow 要求**所有**子命令命中，含重定向的命令在 allow 下要求精确匹配——即上游的"防夹带"规则。
- **Read / Edit / Write**：不区分大小写的路径 glob，路径解析同上游（`//` 绝对、`/` 项目根、`~` 主目录、`path`/`./` 当前目录）；不带路径分隔符的 specifier 匹配任意深度的文件名。`permissions.additionalDirectories` 也参与 `./` 相对解析。
- **WebFetch**：`domain:example.com` 匹配主机名及其子域；不带 `domain:` 前缀时按完整 URL glob 匹配。
- **MCP**：`mcp__server` 匹配 `mcp__server__*`；`mcp__server__tool` 精确匹配单个工具；大小写与 `-`/`.` 归一为 `_`。裸 `*` 规则不覆盖 MCP 工具，`mcp__*` 仅在 deny/ask 生效——与上游文档一致。
- **Skill**：`Skill(name)` 精确匹配 `skill` 工具的 `name` 参数（不支持通配符）。**Agent**：裸 `Agent` 匹配子代理工具；`Agent(name)` 无法匹配（DeepSeek Harness 子代理没有上游 agent 类型字段）。
- 与 hooks 的协同遵循上游契约：`PreToolUse` hook 先运行；deny 规则恒胜（hook 的 `allow` 不能覆盖命中的 deny 规则，命中的 ask 规则仍会触发审批）；hook 未表态时按规则决定；无规则命中则交回 DeepSeek Harness 自身的审批策略。`hooks: false` 时权限规则独立生效（开关互相独立）。

未桥接（记录为限制）：`permissions.defaultMode`、`disableBypassPermissionsMode`、`disableAutoMode`、`subagentPermissionMode` 读取但不生效——DeepSeek Harness 拥有自己的审批模式；`autoMode` 自然语言分类器无对应物；CodeBuddy Code 内置的受保护路径 / 灾难命令保护不复制（由 DeepSeek Harness 自己的沙箱与审批承担）；项目 allow 规则无 CodeBuddy Code 的信任分层门禁（桥接没有信任状态）。

## MCP 服务器

把 CodeBuddy Code 的 MCP 服务器桥接为 DeepSeek Harness 工具。读取 `~/.codebuddy/.mcp.json`（以及废弃的 `~/.codebuddy/mcp.json`、遗留的 `~/.codebuddy.json`）与 `<cwd>/.mcp.json`（及废弃的 `<cwd>/mcp.json`）——同名时项目覆盖用户。每个服务器动态实例化一个 `@deepseek-ai/dsh-mcp-client` 插件，工具注册为 `mcp__codebuddy__<server>__<tool>`；会话开始与配置文件变更时对齐。stdio 条目（`command`/`args`/`env`/`cwd`）映射 stdio 传输；带 `url` 的 `type: "http"`/`"sse"` 条目映射 streamable-http（`${VAR}` 环境引用展开）。项目服务器遵循审批设置（`enableAllProjectMcpServers` / `enabledMcpjsonServers` / `disabledMcpjsonServers`）——未审批的跳过 + 告警；启动失败一律放行。`strictMcpConfig`（针对 agent frontmatter MCP 的闸门）在此无对应物，记录为限制。

## Subagents（自定义子代理）

读取 `.codebuddy/agents/*.md` 与 `~/.codebuddy/agents/*.md`（项目覆盖用户，与 CodeBuddy 技能一致），把每个自定义 subagent 定义注册为以 frontmatter `name` 命名的技能（`description` 必填、kebab-case 校验）。技能正文 = 上游系统提示原文 + 委派规格：`name` → 技能名与 `label`、正文 → `persona`、`tools` → `toolFilter.allow`、`disallowedTools` → `toolFilter.deny`（工具名翻译；无法翻译的条目丢弃 + 告警）、`model`（`inherit`/`default` 除外）→ `agentOptions.model`、`maxTurns` → `maxDepth`（近似映射）。

未桥接（记录为限制）：`permissionMode`、`skills`、`mcpServers`、`hooks`、`memory`（及 `agent-memory` 目录）、`background`、`effort`、`initialPrompt`；DeepSeek Harness 没有命名 subagent 注册表，技能指示模型内联委派。

## 限制

尚未桥接（按子系统记录）：

- **Skills**：扁平 `.md` 技能、插件技能；`allowed-tools`、`model`、`context: fork`、`agent`、frontmatter `hooks`；正文内联 Shell 命令执行、`$ARGUMENTS` 替换、`@file` 引用。
- **Memory**：条件规则（`alwaysApply: false` + `paths`）、`@import` 展开、向上递归查找、嵌套子树动态加载、Auto Memory。
- **Hooks**：`prompt` / `agent` handler 类型（需要 LLM 判定）；`Notification`、`PreCompact`/`PostCompact`、`PermissionRequest`/`PermissionDenied`、`Elicitation`、`FileChanged`、`Setup`、`StopFailure`、`TeammateIdle`、`InstructionsLoaded`、`ConfigChange`、`CwdChanged`、`WorktreeCreate`/`WorktreeRemove`、`TaskCreated`/`TaskCompleted`、`ElicitationResult` 等事件；frontmatter hooks（及 `allowUntrustedFrontmatterHooks` 闸门）；插件 `hooks/hooks.json`；`transcript_path` 输入字段（桥接没有真实转录文件）；`suppressOutput` / `systemMessage` 仅面向用户的通道（DeepSeek Harness 无此通道）；`modifiedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）。Windows 上 hook 走系统 shell 而非 CodeBuddy Code 强制的 Git Bash。
- **Plugins**：仅插件 *skills* 与插件 *hooks* 已列入限制；插件捆绑的 commands、agents、`.mcp.json` MCP 服务器、`.lsp.json` LSP 服务器、settings 覆盖与 `bin/` 助手也未桥接（插件需要 marketplace 运行时）。
- **Settings / 模型路由**：`models.json`（`.codebuddy/models.json` / `~/.codebuddy/models.json`）、`model`、`agent`、`subagents`/`variantModels`、`trustAll`/`trustedDirectories`——DeepSeek Harness 拥有模型路由与目录信任，不在范围内。

