# Claude Code 桥接

[English](claude-code.md)

把为 Claude Code 配置的资产桥接进 DeepSeek Harness：`.claude/` 的 skills、
commands 与 subagent 定义、`CLAUDE.md` 记忆、`settings.json` 的 hooks 与权限
规则、MCP 服务器。安装步骤与各桥接的公共行为见[指南索引](README.zh.md)。

## 配置

桥接在 `bridges` 行下拥有一个配置段，任何后续 patch 层都可以覆盖：

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: true               # Claude Code 桥接的总开关
      skills: true                # 发现 .claude / ~/.claude 的 skills 与 commands
      agents: true                # 发现 .claude / ~/.claude 的 subagent 定义
      memory: true                # 注入 ~/.claude/CLAUDE.md 与 .claude/CLAUDE.md
      hooks: true                 # 运行 settings.json 里的 Claude Code hooks
      permissions: true           # 执行 settings.json 里的 permissions.allow/ask/deny 规则
      mcp: true                   # 桥接 .mcp.json / ~/.claude.json 的 MCP 服务器
      userClaudeDir: '~/.claude'  # 用户级 Claude Code 目录
      watch: true                 # 监听技能根目录，变更即重新发布
      hookTimeoutMs: 600000
      userPromptHookTimeoutMs: 30000
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Skills 与 Commands

读取 Claude Code 的技能位置并注册到 DeepSeek Harness 的技能注册表（provider 名 `claude-code`），使它们出现在模型可见的技能目录中、可通过 `skill` 工具加载、也可用 `/名字` 直接调用：

| Claude Code 位置 | 注册为 |
| :--- | :--- |
| `~/.claude/skills/<name>/SKILL.md`（也支持扁平 `<name>.md`） | 用户级技能 |
| `~/.claude/commands/<name>.md` | 用户级命令（即技能） |
| `~/.claude/commands/<group>/<name>.md` | 用户级命令（即技能），技能名 `group-name` |
| `.claude/skills/<name>/SKILL.md`（也支持扁平 `<name>.md`） | 项目级技能 |
| `.claude/commands/<name>.md` | 项目级命令（即技能） |
| `.claude/commands/<group>/<name>.md` | 项目级命令（即技能），技能名 `group-name` |

映射规则：

- DeepSeek Harness 技能名取目录名 / 文件名（必须 kebab-case；不合法的名字跳过并告警）。
- 嵌套命令文件递归发现：上游斜杠命令 `/group:name`（如 `commands/opsx/explore.md` 对应 `/opsx:explore`）映射为 kebab-case 技能名 `group-name`（`opsx-explore`），因为 DeepSeek Harness 技能名不允许含 `:`。扁平的 `group-name.md` 与嵌套的 `group/name.md` 会落到同一个技能名上——注册表保留先发现的候选。命令目录一律按命令组处理，即使内含 `SKILL.md` 也不会被当作技能目录。
- `description` + `when_to_use` 合并为技能描述（按 Claude Code 的 1,536 字符目录上限截断；`description` 缺省时回退到正文首段）。
- `disable-model-invocation` → 该技能退出模型目录，但仍可用 `/名字` 调用。
- `user-invocable: false` → 不面向人工调用，仅模型可用。
- `metadata` 原样透传；其余 frontmatter 字段（见限制）暂忽略。
- 优先级与 Claude Code 一致：个人资产覆盖项目资产；同级下技能覆盖同名命令。同名冲突时 DeepSeek Harness 原生技能始终胜出（见[公共行为](README.zh.md#公共行为)）。
- 技能目录整体作为资源基目录，`SKILL.md` 里引用的支撑文件（`scripts/`、`references/` 等）按需解析。
- 已存在的技能根目录会被监听；改动无需重启即可在会话内生效。

## CLAUDE.md 记忆

DeepSeek Harness 核心自行加载项目根到工作目录每层目录的 `AGENTS.md`、`CLAUDE.md` 及其 `.local` 变体。本桥接在会话开始时以相同的 system-reminder 框架额外注入，按宽到具体的顺序：

- `~/.claude/CLAUDE.md`（用户级）
- DeepSeek Harness 项目根以上的每个祖先目录的 `CLAUDE.md` 与 `CLAUDE.local.md`（文件系统根在前，同目录内 `CLAUDE.local.md` 排在 `CLAUDE.md` 之后——Claude Code 的层级顺序）
- `permissions.additionalDirectories` 下的 `CLAUDE.md` / `CLAUDE.local.md`
- `.claude/CLAUDE.md`（项目级）
- `outputStyle` 文件（`.claude/output-styles/<name>.md`，缺失时回退 `~/.claude/output-styles/<name>.md`——降级映射，把样式的提示片段作为上下文注入）

预算 32 KiB：超限先丢弃更宽的用户级文件，再截断最具体的部分。DeepSeek Harness 核心已读取的文件跳过，避免重复块：项目根到 cwd 链上每层目录的 `CLAUDE.md` 与 `CLAUDE.local.md`（含 cwd 层的 `CLAUDE.local.md`），以及与根 `CLAUDE.md` 内容一致的层级文件。

## Hooks

合并读取 `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` 的 `hooks` 字段（分组叠加合并、相同 handler 去重、`disableAllHooks` 取最具体定义它的层级），并在下列 DeepSeek Harness 生命周期执行 handler：

| Claude Code 事件 | DeepSeek Harness 接缝 | 决策映射 |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext`（及退出码 0 的纯文本 stdout）在首个提示词前注入 |
| `UserPromptSubmit` | `agent/pre-step` | `decision: "block"` / 退出码 2 / `continue: false` 擦除提示词并展示原因；上下文追加到本步 |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision`：`deny` → 拒绝、`ask` → 走审批、`allow` → 放行并跳过后续权限检查（但 deny/ask 权限规则仍会评估，见 Permissions 小节）、`defer` → 走审批（上游语义为「暂停稍后恢复」，DeepSeek Harness 无恢复接缝，桥接以提示审批替代直接拒绝）；退出码 2 → 以 stderr 拒绝；`additionalContext` 注入 |
| `PostToolUse` | `tools/post-execute` | `additionalContext` / `decision: "block"` 的 reason / 退出码 2 的 stderr → 结果旁注入上下文；`updatedToolOutput` 替换渲染内容 |
| `PostToolUseFailure` | `tools/post-execute`（失败结果） | 同 PostToolUse |
| `Stop` | `agent/turn-stopping` | `decision: "block"` / 退出码 2 / `additionalContext` 引导继续，最多连续 8 次（同 Claude Code 上限） |
| `SubagentStart` | `agent/session-start`（子代理会话） | `additionalContext`（及退出码 0 的纯文本 stdout）注入子代理；matcher 收到 `generic`（DeepSeek Harness 子代理没有上游 agent 类型，`*` matcher 可运行、特定 matcher 无法命中） |
| `SubagentStop` | `agent/turn-stopping`（子代理会话） | `decision: "block"` / 退出码 2 / `additionalContext` 引导继续，最多连续 8 次（同 Claude Code 上限） |
| `SessionEnd` | `agent/disposed` | 仅副作用（1.5 秒预算） |

支持的 handler 类型：`command`（shell 形态与 `args` exec 形态、`${CLAUDE_PROJECT_DIR}` 替换、每 handler `timeout`、`async: true`、按 Claude Code 协议的退出码与 JSON 输出）与 `http`（POST 同样的 JSON、header 环境变量插值受 `allowedEnvVars`/`httpHookAllowedEnvVars` 约束、`allowedHttpHookUrls` 白名单）。

兼容性细节：

- hooks 以 Claude Code 工具名为键。DeepSeek Harness 的命名不同（`bash`、`edit`、`read`……），因此桥接做了翻译：`bash`→`Bash`、`pwsh`→`PowerShell`、`read`→`Read`、`write`→`Write`、`edit`→`Edit`、`glob`→`Glob`、`grep`→`Grep`、`web`/`web_search`→`WebSearch`、`ask_user_question`→`AskUserQuestion`、`exit_plan_mode`→`ExitPlanMode`、`subagent`→`Agent`、`todo_write`→`TodoWrite`；未映射的 DeepSeek Harness 工具（MCP 服务器、一方扩展）保留原名。matcher、`if` 规则以及 hook 脚本收到的 `tool_name` 字段都是翻译后的名字，因此为 Claude Code 写好的 hook 脚本原样可用。
- matcher 语义遵循 Claude Code 规范：精确名集合（`Bash|Edit`）、其余一律视为非锚定正则、`*`/空匹配全部。
- `if` 过滤器支持常见的 `ToolName(glob)` 形态，对已映射的工具各对应一个主参数字段（`Bash(rm *)`、`Edit(*.ts)`……）；无法解析的规则以及没有映射字段的工具一律放行，与 Claude Code 的 best-effort 约定一致（不复制其更深的 Bash 子命令分析）。
- 超时与 handler 失败一律放行（绝不因此阻断动作），同 Claude Code。
- 子代理：`UserPromptSubmit`、`Stop`、`SessionStart`、`SessionEnd` 仅对主会话生效，`SubagentStart`/`SubagentStop` 仅对子代理会话生效——与 Claude Code 的作用域一致。`PreToolUse`/`PostToolUse` 也会在子代理的工具调用上触发。

## Permissions（权限规则）

合并读取同一批 settings 文件的 `permissions.allow/ask/deny` 规则（跨层级叠加合并、去重），并在 `tools/pre-execute` 接缝执行，语义与 Claude Code 一致：

- 规则语法为 `Tool` 或 `Tool(specifier)`；工具名支持 glob（`*`、`mcp__*`）。评估顺序 **deny → ask → allow**，首个命中决定结果，与规则特异性无关。
- `Bash(...)` 按命令前缀匹配（如 `Bash(npm run *)` 匹配 `npm run build`；前缀匹配可被 `sudo`、管道等绕过，与上游文档明示的限制一致）。
- `Read`/`Edit`/`Write` 按路径 glob 匹配：`//path` 为绝对路径、`/path` 相对项目根、`~` 相对主目录、`./` 相对项目根；`permissions.additionalDirectories` 中的目录也参与 `./` 相对解析。参数路径与规则路径都先归一化为绝对路径再比较。
- `WebFetch(domain:example.com)` / `domain:*.example.com` 按 URL 主机名匹配（子域后缀）；不带 `domain:` 前缀时按完整 URL glob 匹配。
- 与 hooks 的协同遵循上游契约：`PreToolUse` hook 先运行；hook `deny` 直接拒绝；**deny/ask 规则始终评估——hook 的 `allow` 不能覆盖命中的 deny 规则，命中的 ask 规则仍会触发审批**；hook 未表态时按规则决定（deny → 拒绝、ask → 审批、allow → 放行），无规则命中则交回 DeepSeek Harness 自身的审批策略。
- 规则应用到主会话与子代理的工具调用（同 Claude Code，权限设置被子代理继承）。
- 未命中任何规则的调用保持原行为（走 DeepSeek Harness 审批栈）；`hooks: false` 时权限规则独立生效（`permissions` 与 `hooks` 开关互相独立）。

未桥接（记录为限制）：`permissions.defaultMode` 与 `permissions.disableBypassPermissionsMode` 会被读取但不生效——DeepSeek Harness 拥有自己的审批模式，插件没有切换它的接缝；项目 `.claude/settings.json` 的 allow 规则在 Claude Code 中需要工作区信任才生效，桥接没有信任状态、一律生效（deny/ask 规则上游本就不受信任门禁影响）；`permissions.additionalDirectories` 与显式 `autoMemoryDirectory` 同样在无信任门禁下读取（两者仅读取固定文件名）。

## MCP 服务器

把 Claude Code 的 MCP 服务器桥接为 DeepSeek Harness 工具。读取 `~/.claude.json` 的 `mcpServers`（用户作用域，始终连接）与 `<cwd>/.mcp.json`（项目作用域）——同名时项目覆盖用户，与 Claude Code 一致。每个服务器动态实例化一个 `@deepseek-ai/dsh-mcp-client` 插件，其工具注册为 `mcp__claude__<server>__<tool>`；实例按工作区管理，会话开始对齐，配置文件变更时重新对齐。

- stdio 条目（`command` / `args` / `env` / `cwd`）映射 stdio 传输；带 `url` 的 `type: "http"` / `"sse"` 条目映射 streamable-http 传输（SSE 降级 + 告警）。`env` 里的 `${VAR}` 从进程环境展开。
- 项目 `.mcp.json` 服务器在上游需要审批（`enableAllProjectMcpServers` / `enabledMcpjsonServers`）；未审批的项目服务器跳过 + 告警（而不是静默连接），`disabledMcpjsonServers` 一律跳过——与 Claude Code 的"审批后才连接"行为一致。
- 启动失败一律放行（告警 + 跳过该服务器）。服务器名加命名空间（`claude__<name>`，净化到 `[A-Za-z0-9_-]`、上限 32 字符）。

## Subagents（自定义子代理）

读取 `.claude/agents/*.md` 与 `~/.claude/agents/*.md`（个人覆盖项目，与 Claude 技能一致），把每个自定义 subagent 定义注册为以 frontmatter `name` 命名的技能（`description` 必填、kebab-case 校验、`plugin:name` 限定名跳过——与上游一致）。技能正文 = 上游系统提示原文 + 委派规格，告诉模型内联传递哪些 `subagent` 工具参数：

- frontmatter `name` → 技能名与委派 `label`
- 系统提示正文 → `persona`
- `tools` → `toolFilter.allow`、`disallowedTools` → `toolFilter.deny`（上游工具名翻译为 DeepSeek Harness 名；无法翻译的条目丢弃 + 告警）
- `model`（`inherit` 除外）→ `agentOptions.model`
- `maxTurns` → `maxDepth`（近似映射）

DeepSeek Harness 没有命名 subagent 注册表——技能指示模型按上述参数内联委派。未桥接（记录为限制）：`permissionMode`、`skills`、`mcpServers`、`hooks`、`memory`（及 `.claude/agent-memory*`、`~/.claude/agent-memory`）、`background`、`effort`、`isolation`、`color`、`initialPrompt`；核心侧"命名 subagent 注册表"列为后续增强候选。

## 限制

尚未桥接（按子系统记录）：

- **Skills**：工作区以下的嵌套 `.claude/skills/`（其限定名非 kebab-case）、企业 / managed 技能、插件技能、claude.ai 同步技能；`allowed-tools`/`disallowed-tools`、`model`、`effort`、`context: fork`/`agent`/`background`、`paths`、`shell` 以及正文中的 `$ARGUMENTS` 替换；仅展示用途的 frontmatter `name`/`argument-hint`/`arguments`/`license`/`compatibility` 与正文 `$name`/`${CLAUDE_SKILL_DIR}`/`${CLAUDE_SESSION_ID}` 替换；skill/agent frontmatter 里的 `hooks`。
- **Memory**：`.claude/rules/*.md`、CLAUDE.md 的 `@import`、子目录级 `CLAUDE.md` 的懒加载（工作目录以上的层级与 `CLAUDE.local.md` 已桥接）、默认逐项目哈希目录下的 auto memory（显式 `autoMemoryDirectory` 已支持——其 `MEMORY.md` 会被注入）。
- **Hooks**：`mcp_tool`、`prompt`、`agent` 三种 handler 类型；其余事件（`PreCompact`/`PostCompact`、`Notification`、`PermissionRequest`/`PermissionDenied`、`Setup`、`UserPromptExpansion`、`PostToolBatch`、`StopFailure`、`TeammateIdle`、`TaskCreated`/`TaskCompleted`、`Elicitation`/`ElicitationResult`、`WorktreeCreate`/`WorktreeRemove`、`ConfigChange`、`InstructionsLoaded`、`CwdChanged`、`FileChanged`、`DirectoryAdded`、`MessageDisplay`）；SessionStart 决策字段 `initialUserMessage`/`watchPaths`/`sessionTitle`/`reloadSkills`；`suppressOutput`/`systemMessage`/`terminalSequence` 仅用户通道；`CLAUDE_ENV_FILE`；`asyncRewake`；`updatedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）；`permissionDecision: "defer"`（映射为走审批——无恢复接缝）。
- **MCP**：`managed-mcp.json` 与服务端托管的企业服务器、`~/.claude.json` 内的逐项目 `local` 作用域服务器、插件捆绑的 MCP 服务器、进程内 `type: "sdk"` 条目；SSE 服务器以 streamable-http 传输连接。
- **Settings**：`model`（DeepSeek Harness 拥有模型路由）、`statusLine`/`statusline.json` 与 `plansDirectory`（CLI-UI / 临时状态）、托管/企业策略文件（`managed-settings.json`、`managed-mcp.json`）、`.worktreeinclude`/`keybindings.json`/`themes/`（无 DeepSeek Harness 对应物）。
- **Plugins**：仅插件 *skills* 已桥接；插件捆绑的 agents、MCP 服务器、hooks（`hooks/hooks.json`）、output styles、commands、workflows 未桥接（插件装在 `~/.claude/plugins/`，需要 marketplace 运行时）。
