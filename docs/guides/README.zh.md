# dsh-bridges 使用指南

[English](README.md)

各桥接的详细使用文档：安装与验证、完整配置参考、每个工具的逐项行为（skills/commands、记忆、hooks）与限制。快速上手指南见[根目录 README](../../README.md)。

## 安装

插件通过 profile 的插件管理器（pnpm）安装到某个 DeepSeek Harness profile；`<profile-name>` 取 `web`（Web GUI）或 `headless`（一次性 CLI 运行），每个 profile 独立安装插件：

```sh
# 从本仓库 checkout 安装（先编译 src/ → lib/）：
pnpm install && pnpm build
dsh plugin --profile <profile-name> add .

# 或将来从发布的 tarball / registry 包安装：
dsh plugin --profile <profile-name> add dsh-bridges
```

插件管理器会把该包追加到 profile 的 `dsh.profile.bundles`，其 `cordis.patch.yml` 向组合树注入一行 `bridges`。验证：

```sh
dsh --profile <profile-name> --dump-config   # 应能看到 "dsh-bridges" 这一行
```

然后在带有 agent 资产（`.claude/`、`.codebuddy/`、`.opencode/`、`.agents/skills/`、`.codex/`，以及它们 `~/` 下的用户级对应目录，如 `~/.claude/`）的项目里启动 DeepSeek Harness；资产按会话工作区发现。

每个受支持的 agent 工具在 [`examples/`](../../examples/) 下各有一个完整示例
项目：以示例目录作为会话工作区打开，即可观察其 skills、memory 与 hooks 的
桥接效果，各目录 README 说明逐项验证方式。

## 配置

每个工具桥接在 `bridges` 行下各占一个配置段；后续 patch 层（profile 的 `cordis.patch.yml`、`--patch` 覆盖层）可以覆盖任意字段：

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
      mcp: true                    # 桥接 .mcp.json / ~/.claude.json 的 MCP 服务器
      userClaudeDir: '~/.claude'  # 用户级 Claude Code 目录
      watch: true                 # 监听技能根目录，变更即重新发布
      hookTimeoutMs: 600000
      userPromptHookTimeoutMs: 30000
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    codebuddyCode:
      enabled: true                     # CodeBuddy Code 桥接的总开关
      skills: true                      # 发现 .codebuddy / ~/.codebuddy 的 skills 与 commands
      agents: true                       # 发现 .codebuddy / ~/.codebuddy 的 subagent 定义
      mcp: true                          # 桥接 .mcp.json / ~/.codebuddy/.mcp.json 的 MCP 服务器
      memory: true                      # 注入 CODEBUDDY.md 记忆与始终应用规则
      hooks: true                       # 运行 settings.json 里的 CodeBuddy Code hooks
      permissions: true                 # 执行 settings.json 里的 permissions.allow/ask/deny 规则
      userCodebuddyDir: '~/.codebuddy'  # 用户级 CodeBuddy Code 目录
      watch: true                       # 监听技能根目录与 settings 文件
      hookTimeoutMs: 60000              # 对齐 CodeBuddy Code 的 60 秒 hook 上限
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    opencode:
      enabled: true                     # opencode 桥接的总开关
      skills: true                      # 发现 .opencode / ~/.config/opencode 的 skills 与 commands（含 JSON 命令）
      memory: true                      # 注入 AGENTS.md 规则（含 CLAUDE.md 回退）与 instructions 文件
      permissions: true                 # 执行 opencode.json(c) 里的 permission 规则
      mcp: true                          # 桥接 opencode.json(c) 的 mcp 服务器
      userOpencodeDir: '~/.config/opencode'  # 用户级 opencode 目录
      userClaudeDir: '~/.claude'        # CLAUDE.md 回退所用的用户级 Claude Code 目录
      claudeCompat: true                # 是否启用 opencode 的 Claude Code 兼容回退
      watch: true                       # 监听资产根目录与配置文件
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    codex:
      enabled: true                     # Codex 桥接的总开关
      skills: true                      # 发现 .agents/skills（cwd → 仓库根）、~/.agents/skills、/etc/codex/skills
      memory: true                      # 注入 AGENTS.md 指令链
      hooks: true                       # 运行 hooks.json / config.toml 里的 Codex hooks
      permissions: true                 # 会话开始时应用 approval_policy / sandbox_mode / default_permissions
      mcp: true                          # 桥接 config.toml 的 [mcp_servers] 条目
      userCodexDir: '~/.codex'          # 用户级 Codex 目录（设置 CODEX_HOME 时以它为准）
      userSkillsDir: '~/.agents/skills' # 用户级 skills 目录
      watch: true                       # 监听技能根目录与 settings 文件
      hookTimeoutMs: 600000             # 对齐 Codex 的 600 秒 hook 默认值
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    pi:
      enabled: true                     # pi 桥接的总开关
      skills: true                      # 发现 .pi / ~/.pi/agent 的 skills 与 prompt 模板
      memory: true                      # 注入 AGENTS.md / CLAUDE.md 链与 APPEND_SYSTEM.md
      userPiDir: '~/.pi/agent'          # 用户级 pi 配置目录（设置 PI_CODING_AGENT_DIR 时以它为准）
      watch: true                       # 监听技能根目录、settings 文件与 trust.json
      memoryMaxBytes: 32768
    geminiCli:
      enabled: true                     # Gemini CLI 桥接的总开关
      skills: true                      # 发现 .gemini / ~/.gemini 的 skills 与 commands
      agents: true                      # 发现 .gemini / ~/.gemini 的 subagent 定义
      memory: true                      # 注入 GEMINI.md 链（含 @导入）
      hooks: true                       # 运行 settings.json 里的 Gemini hooks
      permissions: true                 # 执行 ~/.gemini/policies/*.toml 规则
      mcp: true                         # 桥接 settings.json 的 mcpServers
      userGeminiDir: '~/.gemini'        # 用户级 Gemini 目录（设置 GEMINI_CLI_HOME 时以它为准）
      watch: true                       # 监听技能根目录与 settings 文件
      hookTimeoutMs: 60000              # 对齐 Gemini 的 60 秒 hook 默认值（毫秒）
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
    cursor:
      enabled: true                     # Cursor 桥接的总开关
      skills: true                      # 发现 .cursor / ~/.cursor 的 skills
      agents: true                      # 发现 .cursor / ~/.cursor 的 subagent 定义
      memory: true                      # 注入 .cursor/rules 的 alwaysApply 规则与子目录 AGENTS.md
      hooks: true                       # 运行 hooks.json 里的 Cursor hooks
      permissions: true                 # 执行 cli.json / cli-config.json 的权限规则
      mcp: true                         # 桥接 .cursor/mcp.json / ~/.cursor/mcp.json 服务器
      userCursorDir: '~/.cursor'        # 用户级 Cursor 目录（设置 CURSOR_CONFIG_DIR 时以它为准）
      watch: true                       # 监听技能根目录与配置文件
      hookTimeoutMs: 30000              # 对齐 Cursor 的 30 秒 hook 默认值（毫秒）
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Claude Code 桥接

### Skills 与 Commands

读取 Claude Code 的技能位置并注册到 DeepSeek Harness 的技能注册表（provider 名 `claude-code`），使它们出现在模型可见的技能目录中、可通过 `skill` 工具加载、也可用 `/名字` 直接调用：

| Claude Code 位置 | 注册为 |
| :--- | :--- |
| `~/.claude/skills/<name>/SKILL.md`（也支持扁平 `<name>.md`） | 用户级技能 |
| `~/.claude/commands/<name>.md` | 用户级命令（即技能） |
| `.claude/skills/<name>/SKILL.md`（也支持扁平 `<name>.md`） | 项目级技能 |
| `.claude/commands/<name>.md` | 项目级命令（即技能） |

映射规则：

- DeepSeek Harness 技能名取目录名 / 文件名（必须 kebab-case；不合法的名字跳过并告警）。
- `description` + `when_to_use` 合并为技能描述（按 Claude Code 的 1,536 字符目录上限截断；`description` 缺省时回退到正文首段）。
- `disable-model-invocation` → 该技能退出模型目录，但仍可用 `/名字` 调用。
- `user-invocable: false` → 不面向人工调用，仅模型可用。
- `metadata` 原样透传；其余 frontmatter 字段（见限制）暂忽略。
- 优先级与 Claude Code 一致：个人资产覆盖项目资产；同级下技能覆盖同名命令。同名冲突时 DeepSeek Harness 原生技能（`.dsh/skills`、`.agents/skills`、运行时技能）永远胜出——桥接注册在全局技能层，会被更近的 preset 层遮蔽。
- 技能目录整体作为资源基目录，`SKILL.md` 里引用的支撑文件（`scripts/`、`references/` 等）按需解析。
- 已存在的技能根目录会被监听；改动无需重启即可在会话内生效。

### CLAUDE.md 记忆

根目录 `CLAUDE.md` 由 DeepSeek Harness 核心自行加载。本桥接在会话开始时以相同的 system-reminder 框架额外注入，按宽到具体的顺序：

- `~/.claude/CLAUDE.md`（用户级）
- 工作目录以上每个祖先目录的 `CLAUDE.md` 与 `CLAUDE.local.md`（文件系统根在前，同目录内 `CLAUDE.local.md` 排在 `CLAUDE.md` 之后——Claude Code 的层级顺序）
- `permissions.additionalDirectories` 下的 `CLAUDE.md` / `CLAUDE.local.md`
- `.claude/CLAUDE.md`（项目级）
- `outputStyle` 文件（`.claude/output-styles/<name>.md`，缺失时回退 `~/.claude/output-styles/<name>.md`——降级映射，把样式的提示片段作为上下文注入）
- cwd 层的 `CLAUDE.local.md`（个人私有、gitignore）

预算 32 KiB：超限先丢弃更宽的用户级文件，再截断最具体的部分。与核心已加载的根 `CLAUDE.md` 内容一致的文件跳过，避免重复块。

### Hooks

合并读取 `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` 的 `hooks` 字段（分组叠加合并、相同 handler 去重、`disableAllHooks` 取最具体定义它的层级），并在下列 DeepSeek Harness 生命周期执行 handler：

| Claude Code 事件 | DeepSeek Harness 接缝 | 决策映射 |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext`（及退出码 0 的纯文本 stdout）在首个提示词前注入 |
| `UserPromptSubmit` | `agent/pre-step` | `decision: "block"` / 退出码 2 / `continue: false` 擦除提示词并展示原因；上下文追加到本步 |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision`：`deny` → 拒绝、`ask` → 走审批、`allow` → 放行并跳过后续权限检查（但 deny/ask 权限规则仍会评估，见 Permissions 小节）、`defer` → 拒绝（不支持）；退出码 2 → 以 stderr 拒绝；`additionalContext` 注入 |
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

### Permissions（权限规则）

合并读取同一批 settings 文件的 `permissions.allow/ask/deny` 规则（跨层级叠加合并、去重），并在 `tools/pre-execute` 接缝执行，语义与 Claude Code 一致：

- 规则语法为 `Tool` 或 `Tool(specifier)`；工具名支持 glob（`*`、`mcp__*`）。评估顺序 **deny → ask → allow**，首个命中决定结果，与规则特异性无关。
- `Bash(...)` 按命令前缀匹配（如 `Bash(npm run *)` 匹配 `npm run build`；前缀匹配可被 `sudo`、管道等绕过，与上游文档明示的限制一致）。
- `Read`/`Edit`/`Write` 按路径 glob 匹配：`//path` 为绝对路径、`/path` 相对项目根、`~` 相对主目录、`./` 相对项目根；`permissions.additionalDirectories` 中的目录也参与 `./` 相对解析。参数路径与规则路径都先归一化为绝对路径再比较。
- `WebFetch(domain:example.com)` / `domain:*.example.com` 按 URL 主机名匹配（子域后缀）；不带 `domain:` 前缀时按完整 URL glob 匹配。
- 与 hooks 的协同遵循上游契约：`PreToolUse` hook 先运行；hook `deny` 直接拒绝；**deny/ask 规则始终评估——hook 的 `allow` 不能覆盖命中的 deny 规则，命中的 ask 规则仍会触发审批**；hook 未表态时按规则决定（deny → 拒绝、ask → 审批、allow → 放行），无规则命中则交回 DeepSeek Harness 自身的审批策略。
- 规则应用到主会话与子代理的工具调用（同 Claude Code，权限设置被子代理继承）。
- 未命中任何规则的调用保持原行为（走 DeepSeek Harness 审批栈）；`hooks: false` 时权限规则独立生效（`permissions` 与 `hooks` 开关互相独立）。

未桥接（记录为限制）：`permissions.defaultMode` 与 `permissions.disableBypassPermissionsMode` 会被读取但不生效——DeepSeek Harness 拥有自己的审批模式，插件没有切换它的接缝；项目 `.claude/settings.json` 的 allow 规则在 Claude Code 中需要工作区信任才生效，桥接没有信任状态、一律生效（deny/ask 规则上游本就不受信任门禁影响）。

### Subagents（自定义子代理）

读取 `.claude/agents/*.md` 与 `~/.claude/agents/*.md`（个人覆盖项目，与 Claude 技能一致），把每个自定义 subagent 定义注册为以 frontmatter `name` 命名的技能（`description` 必填、kebab-case 校验、`plugin:name` 限定名跳过——与上游一致）。技能正文 = 上游系统提示原文 + 委派规格，告诉模型内联传递哪些 `subagent` 工具参数：

- frontmatter `name` → 技能名与委派 `label`
- 系统提示正文 → `persona`
- `tools` → `toolFilter.allow`、`disallowedTools` → `toolFilter.deny`（上游工具名翻译为 DeepSeek Harness 名；无法翻译的条目丢弃 + 告警）
- `model`（`inherit` 除外）→ `agentOptions.model`
- `maxTurns` → `maxDepth`（近似映射）

DeepSeek Harness 没有命名 subagent 注册表——技能指示模型按上述参数内联委派。未桥接（记录为限制）：`permissionMode`、`skills`、`mcpServers`、`hooks`、`memory`（及 `.claude/agent-memory*`、`~/.claude/agent-memory`）、`background`、`effort`、`isolation`、`color`、`initialPrompt`；核心侧"命名 subagent 注册表"列为后续增强候选。

### MCP 服务器

把 Claude Code 的 MCP 服务器桥接为 DeepSeek Harness 工具。读取 `~/.claude.json` 的 `mcpServers`（用户作用域，始终连接）与 `<cwd>/.mcp.json`（项目作用域）——同名时项目覆盖用户，与 Claude Code 一致。每个服务器动态实例化一个 `@deepseek-ai/dsh-mcp-client` 插件，其工具注册为 `mcp__<server>__<tool>`；实例按工作区管理，会话开始对齐，配置文件变更时重新对齐。

- stdio 条目（`command` / `args` / `env` / `cwd`）映射 stdio 传输；带 `url` 的 `type: "http"` / `"sse"` 条目映射 streamable-http 传输（SSE 降级 + 告警）。`env` 里的 `${VAR}` 从进程环境展开。
- 项目 `.mcp.json` 服务器在上游需要审批（`enableAllProjectMcpServers` / `enabledMcpjsonServers`）；未审批的项目服务器跳过 + 告警（而不是静默连接），`disabledMcpjsonServers` 一律跳过——与 Claude Code 的"审批后才连接"行为一致。
- 启动失败一律放行（告警 + 跳过该服务器）。服务器名加命名空间（`claude__<name>`，净化到 `[A-Za-z0-9_-]`、上限 32 字符）。

### 限制

尚未桥接（按子系统记录）：

- **Skills**：工作区以下的嵌套 `.claude/skills/`（其限定名非 kebab-case）、企业 / managed 技能、插件技能、claude.ai 同步技能；`allowed-tools`/`disallowed-tools`、`model`、`effort`、`context: fork`/`agent`/`background`、`paths`、`shell` 以及正文中的 `$ARGUMENTS` 替换；仅展示用途的 frontmatter `name`/`argument-hint`/`arguments`/`license`/`compatibility` 与正文 `$name`/`${CLAUDE_SKILL_DIR}`/`${CLAUDE_SESSION_ID}` 替换；skill/agent frontmatter 里的 `hooks`。
- **Memory**：`.claude/rules/*.md`、CLAUDE.md 的 `@import`、子目录级 `CLAUDE.md` 的懒加载（工作目录以上的层级与 `CLAUDE.local.md` 已桥接）、默认逐项目哈希目录下的 auto memory（显式 `autoMemoryDirectory` 已支持——其 `MEMORY.md` 会被注入）。
- **Hooks**：`mcp_tool`、`prompt`、`agent` 三种 handler 类型；其余事件（`PreCompact`/`PostCompact`、`Notification`、`PermissionRequest`/`PermissionDenied`、`Setup`、`UserPromptExpansion`、`PostToolBatch`、`StopFailure`、`TeammateIdle`、`TaskCreated`/`TaskCompleted`、`Elicitation`/`ElicitationResult`、`WorktreeCreate`/`WorktreeRemove`、`ConfigChange`、`InstructionsLoaded`、`CwdChanged`、`FileChanged`、`DirectoryAdded`、`MessageDisplay`）；SessionStart 决策字段 `initialUserMessage`/`watchPaths`/`sessionTitle`/`reloadSkills`；`suppressOutput`/`systemMessage`/`terminalSequence` 仅用户通道；`CLAUDE_ENV_FILE`；`asyncRewake`；`updatedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）；`permissionDecision: "defer"`（映射为拒绝）。
- **MCP**：`managed-mcp.json` 与服务端托管的企业服务器、`~/.claude.json` 内的逐项目 `local` 作用域服务器、插件捆绑的 MCP 服务器、进程内 `type: "sdk"` 条目；SSE 服务器以 streamable-http 传输连接。
- **Settings**：`model`（DeepSeek Harness 拥有模型路由）、`statusLine`/`statusline.json` 与 `plansDirectory`（CLI-UI / 临时状态）、托管/企业策略文件（`managed-settings.json`、`managed-mcp.json`）、`.worktreeinclude`/`keybindings.json`/`themes/`（无 DeepSeek Harness 对应物）。
- **Plugins**：仅插件 *skills* 已桥接；插件捆绑的 agents、MCP 服务器、hooks（`hooks/hooks.json`）、output styles、commands、workflows 未桥接（插件装在 `~/.claude/plugins/`，需要 marketplace 运行时）。

## CodeBuddy Code 桥接

### Skills 与 Commands

读取 CodeBuddy Code 的技能位置并注册到 DeepSeek Harness 的技能注册表（provider 名 `codebuddy-code`），使它们出现在模型可见的技能目录中、可通过 `skill` 工具加载、也可用 `/名字` 直接调用：

| CodeBuddy Code 位置 | 注册为 |
| :--- | :--- |
| `.codebuddy/skills/<name>/SKILL.md` | 项目级技能 |
| `.codebuddy/commands/<name>.md` | 项目级命令（即技能） |
| `~/.codebuddy/skills/<name>/SKILL.md` | 用户级技能 |
| `~/.codebuddy/commands/<name>.md` | 用户级命令（即技能） |

映射规则：

- DeepSeek Harness 技能名取目录名 / 文件名（必须 kebab-case；不合法的名字跳过并告警）。嵌套命令的限定名是 `group:name`（含 `:` 非 kebab-case），同样跳过 + 告警，不做转写。
- 只读目录型技能（目录内 `SKILL.md`）；扁平 `<name>.md` 技能是 Claude Code 扩展，CodeBuddy Code 文档未记载，不读取。
- 优先级与 CodeBuddy Code 一致：**项目资产覆盖用户资产**（与 Claude Code 相反，因此 rank 段独立分配）；同级下技能覆盖同名命令。同名冲突时 DeepSeek Harness 原生技能（`.dsh/skills`、`.agents/skills`、运行时技能）永远胜出——桥接注册在全局技能层，会被更近的 preset 层遮蔽。
- `description` + `when_to_use` 合并为技能描述（1,536 字符上限截断；`description` 缺省时回退到正文首段）。`when_to_use` 未见于 CodeBuddy Code 文档，为兼容 Claude 资产而识别。
- `disable-model-invocation` → 该技能退出模型目录，但仍可用 `/名字` 调用。`user-invocable: false` → 不面向人工调用，仅模型可用。`metadata` 原样透传。
- 叠加应用 `skillOverrides` 设置：`name-only` 折叠描述、`user-invocable-only` 对模型隐藏（仍可人工调用）、`off` 双面关闭。最具体的合法值生效（local > project > user），非法值按文件过滤后回退上一有效层级，与 CodeBuddy Code 一致。
- 技能目录整体作为资源基目录，`SKILL.md` 里引用的支撑文件（`scripts/`、`references/` 等）按需解析。
- 已存在的技能根目录与 settings 文件会被监听；改动无需重启即可在会话内生效。

### CODEBUDDY.md 记忆

DeepSeek Harness 核心自行加载 `AGENTS.md` 与根目录 `CLAUDE.md`，但不读 CodeBuddy Code 的记忆文件。本桥接在会话开始时注入（采用 DeepSeek Harness 工作区指令相同的 system-reminder 框架）：

- `~/.codebuddy/CODEBUDDY.md`（用户记忆）与 `~/.codebuddy/rules/**`（用户规则，递归，仅始终应用规则）
- `<cwd>/CODEBUDDY.md` 与 `<cwd>/.codebuddy/CODEBUDDY.md`（项目记忆；内容相同只保留一份）
- `<cwd>/CODEBUDDY.local.md`（本地项目记忆）
- `<cwd>/.codebuddy/rules/**`（项目规则，递归，仅始终应用规则）

预算 32 KiB：超限先丢弃全部用户级、再截断最具体的项目级。规则文件的 frontmatter 会被剥离；`enabled: false` 与 `alwaysApply: false` 的规则跳过。

### Hooks

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

### Permissions（权限规则）

合并读取同一批 settings 文件的 `permissions.allow/ask/deny` 规则（跨层级叠加合并、去重），并在 `tools/pre-execute` 接缝执行，语义与 CodeBuddy Code 一致（deny → ask → allow，首个命中决定结果）：

- **Bash**：`Bash(cmd)` 精确匹配；`Bash(git:*)` 词前缀匹配；`Bash(npm run *)` 按 bash glob 匹配（`*` 可跨 `/`）。复合命令按顶层 `&&`/`||`/`;`/`|` 拆分（引号内不拆）：deny/ask 任一子命令命中即触发，allow 要求**所有**子命令命中，含重定向的命令在 allow 下要求精确匹配——即上游的"防夹带"规则。
- **Read / Edit / Write**：不区分大小写的路径 glob，路径解析同上游（`//` 绝对、`/` 项目根、`~` 主目录、`path`/`./` 当前目录）；不带路径分隔符的 specifier 匹配任意深度的文件名。`permissions.additionalDirectories` 也参与 `./` 相对解析。
- **WebFetch**：`domain:example.com` 匹配主机名及其子域；不带 `domain:` 前缀时按完整 URL glob 匹配。
- **MCP**：`mcp__server` 匹配 `mcp__server__*`；`mcp__server__tool` 精确匹配单个工具；大小写与 `-`/`.` 归一为 `_`。裸 `*` 规则不覆盖 MCP 工具，`mcp__*` 仅在 deny/ask 生效——与上游文档一致。
- **Skill**：`Skill(name)` 精确匹配 `skill` 工具的 `name` 参数（不支持通配符）。**Agent**：裸 `Agent` 匹配子代理工具；`Agent(name)` 无法匹配（DeepSeek Harness 子代理没有上游 agent 类型字段）。
- 与 hooks 的协同遵循上游契约：`PreToolUse` hook 先运行；deny 规则恒胜（hook 的 `allow` 不能覆盖命中的 deny 规则，命中的 ask 规则仍会触发审批）；hook 未表态时按规则决定；无规则命中则交回 DeepSeek Harness 自身的审批策略。`hooks: false` 时权限规则独立生效（开关互相独立）。

未桥接（记录为限制）：`permissions.defaultMode`、`disableBypassPermissionsMode`、`disableAutoMode`、`subagentPermissionMode` 读取但不生效——DeepSeek Harness 拥有自己的审批模式；`autoMode` 自然语言分类器无对应物；CodeBuddy Code 内置的受保护路径 / 灾难命令保护不复制（由 DeepSeek Harness 自己的沙箱与审批承担）；项目 allow 规则无 CodeBuddy Code 的信任分层门禁（桥接没有信任状态）。

### MCP 服务器

把 CodeBuddy Code 的 MCP 服务器桥接为 DeepSeek Harness 工具。读取 `~/.codebuddy/.mcp.json`（以及废弃的 `~/.codebuddy/mcp.json`、遗留的 `~/.codebuddy.json`）与 `<cwd>/.mcp.json`（及废弃的 `<cwd>/mcp.json`）——同名时项目覆盖用户。每个服务器动态实例化一个 `@deepseek-ai/dsh-mcp-client` 插件，工具注册为 `mcp__codebuddy__<server>__<tool>`；会话开始与配置文件变更时对齐。stdio 条目（`command`/`args`/`env`/`cwd`）映射 stdio 传输；带 `url` 的 `type: "http"`/`"sse"` 条目映射 streamable-http（`${VAR}` 环境引用展开）。项目服务器遵循审批设置（`enableAllProjectMcpServers` / `enabledMcpjsonServers` / `disabledMcpjsonServers`）——未审批的跳过 + 告警；启动失败一律放行。`strictMcpConfig`（针对 agent frontmatter MCP 的闸门）在此无对应物，记录为限制。

### Subagents（自定义子代理）

读取 `.codebuddy/agents/*.md` 与 `~/.codebuddy/agents/*.md`（项目覆盖用户，与 CodeBuddy 技能一致），把每个自定义 subagent 定义注册为以 frontmatter `name` 命名的技能（`description` 必填、kebab-case 校验）。技能正文 = 上游系统提示原文 + 委派规格：`name` → 技能名与 `label`、正文 → `persona`、`tools` → `toolFilter.allow`、`disallowedTools` → `toolFilter.deny`（工具名翻译；无法翻译的条目丢弃 + 告警）、`model`（`inherit`/`default` 除外）→ `agentOptions.model`、`maxTurns` → `maxDepth`（近似映射）。

未桥接（记录为限制）：`permissionMode`、`skills`、`mcpServers`、`hooks`、`memory`（及 `agent-memory` 目录）、`background`、`effort`、`initialPrompt`；DeepSeek Harness 没有命名 subagent 注册表，技能指示模型内联委派。

### 限制

尚未桥接（按子系统记录）：

- **Skills**：扁平 `.md` 技能、嵌套命令（`group:name` 非 kebab-case）、插件技能；`allowed-tools`、`model`、`context: fork`、`agent`、frontmatter `hooks`；正文内联 Shell 命令执行、`$ARGUMENTS` 替换、`@file` 引用。
- **Memory**：条件规则（`alwaysApply: false` + `paths`）、`@import` 展开、向上递归查找、嵌套子树动态加载、Auto Memory。
- **Hooks**：`prompt` / `agent` handler 类型（需要 LLM 判定）；`Notification`、`PreCompact`/`PostCompact`、`PermissionRequest`/`PermissionDenied`、`Elicitation`、`FileChanged`、`Setup`、`StopFailure`、`TeammateIdle`、`InstructionsLoaded`、`ConfigChange`、`CwdChanged`、`WorktreeCreate`/`WorktreeRemove`、`TaskCreated`/`TaskCompleted`、`ElicitationResult` 等事件；frontmatter hooks（及 `allowUntrustedFrontmatterHooks` 闸门）；插件 `hooks/hooks.json`；`transcript_path` 输入字段（桥接没有真实转录文件）；`suppressOutput` / `systemMessage` 仅面向用户的通道（DeepSeek Harness 无此通道）；`modifiedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）。Windows 上 hook 走系统 shell 而非 CodeBuddy Code 强制的 Git Bash。
- **Plugins**：仅插件 *skills* 与插件 *hooks* 已列入限制；插件捆绑的 commands、agents、`.mcp.json` MCP 服务器、`.lsp.json` LSP 服务器、settings 覆盖与 `bin/` 助手也未桥接（插件需要 marketplace 运行时）。
- **Settings / 模型路由**：`models.json`（`.codebuddy/models.json` / `~/.codebuddy/models.json`）、`model`、`agent`、`subagents`/`variantModels`、`trustAll`/`trustedDirectories`——DeepSeek Harness 拥有模型路由与目录信任，不在范围内。

## opencode 桥接

### Skills 与 Commands

读取 opencode 的资产位置并注册到 DeepSeek Harness 的技能注册表（provider 名 `opencode`）：

| opencode 位置 | 注册为 |
| :--- | :--- |
| `.opencode/skills/<name>/SKILL.md` | 项目级技能 |
| `.opencode/commands/<name>.md` | 项目级命令（即技能） |
| `opencode.json(c)` 里的 `command.<name>` | 项目级命令（覆盖同名命令文件） |
| `~/.config/opencode/skills/<name>/SKILL.md` | 用户级技能 |
| `~/.config/opencode/commands/<name>.md` | 用户级命令（即技能） |
| `~/.config/opencode/opencode.json(c)` 里的 `command.<name>` | 用户级命令（覆盖同名命令文件） |

映射规则：

- DeepSeek Harness 技能名取目录名 / 文件名，且必须是合法的 opencode 名（`^[a-z0-9]+(-[a-z0-9]+)*$`，小写字母数字 + 单连字符）；不合法则跳过 + 告警。
- 技能 frontmatter 按 opencode 校验：`name`（必须与目录名一致）与 `description`（1–1,024 字符，超出截断）为必填；缺失或 name 不匹配即丢弃 + 告警，与 opencode 的排查规则一致。`metadata`（字符串到字符串）透传；`license`/`compatibility` 忽略。
- 命令正文即提示词模板；frontmatter `description`（缺省回退正文首段）作为技能描述。`agent`、`model`、`subtask` 不桥接（DeepSeek Harness 没有按命令路由 agent 的机制）。
- `.opencode/skills` 会**向上**发现：从工作目录走到 git 根（越靠 cwd 越优先，与 opencode 的向上查找一致）；`opencode.json(c)` 的 `skills.paths` 增加额外技能根（相对配置文件解析；`skills.urls` 需要网络，跳过并记限制）。
- opencode 的 Claude 兼容（`.claude/skills`、`~/.claude/skills`）与 agent 兼容（`.agents/skills`、`~/.agents/skills`）技能根**不重复读取**：`.claude` 资产已由 claude-code 桥接覆盖、`.agents` 资产已由 DeepSeek Harness 自带 filesystem provider 覆盖，重复注册只会产生重复候选。
- 优先级：项目资产覆盖用户资产；技能覆盖同名命令；JSON 配置命令覆盖同级同名命令文件。同名冲突时 DeepSeek Harness 原生技能永远胜出。
- 自定义 `agent.<id>` 定义（`subagent` / `all` 模式）成为委派规格技能：`description` 是技能描述，`prompt`（内联字符串或 `{ file: ... }`）成为系统提示正文，`model` 映射到 `agentOptions.model`。`mode: "primary"` 代理是主助手，不桥接。
- 已存在的资产根目录与 `opencode.json(c)` 文件会被监听；改动无需重启即可生效。

### AGENTS.md / CLAUDE.md 规则与 instructions 记忆

DeepSeek Harness 核心自行加载工作区根 `AGENTS.md` 与 `CLAUDE.md`。本桥接在会话开始时额外注入（system-reminder 框架）：

- `~/.config/opencode/AGENTS.md`（全局规则；缺失时回退 `~/.claude/CLAUDE.md`，与 opencode 一致）
- 从工作目录向上到 git 根最近的一个 `AGENTS.md`，缺失时回退最近的 `CLAUDE.md`（每类先匹配先胜）；cwd 层的 `AGENTS.md`/`CLAUDE.md` 是 DeepSeek Harness 已加载的文件，跳过
- `opencode.json(c)` 的 `instructions` 条目：本地文件路径与 `*`/`**` glob（相对配置文件目录解析；远程 URL 跳过，桥接不做网络抓取）
- `opencode.json(c)` 的本地 `references`：`@alias` → 解析后的绝对路径 + 描述，按 opencode 在 agent 上下文里公示引用的方式注入；git `repository` 引用需要克隆，跳过 + 告警（同样的不抓取策略）

预算 32 KiB：超限先丢弃全部用户级、再截断最具体的项目级。

### Permissions（权限规则）

读取 `opencode.json(c)` 的 `permission` 字段（全局 + 项目层；每个家族以定义它的最具体层为准）并在 `tools/pre-execute` 接缝执行，语义与 opencode 一致：

- 语法：裸字符串（`permission: "allow" | "ask" | "deny"`）或按家族分组的对象——`*`（默认）、`read`、`edit`（覆盖 `edit`/`write`）、`glob`、`grep`、`bash`、`task`、`skill`、`question`、`websearch`、`external_directory`，另有 `lsp`/`doom_loop`（见限制）。每个家族要么是一个动作，要么是有序的 `pattern → action` 规则，**最后一条命中的规则胜出**（与 opencode 文档一致：`"*"` 放前面、具体规则放后面）。
- 通配符为 opencode 语义（`*` 任意字符、`?` 单字符）；模式开头支持 `~`/`$HOME` 展开；工作区相对模式按相对工作目录的路径匹配。
- 配置了 `permission` 时内置默认生效：多数家族 allow、`external_directory` ask、read 拒绝 `.env` / `.env.*`（`.env.example` 除外）——即上游默认。
- DeepSeek Harness 工具映射：`read`→read、`edit`/`write`→edit、`glob`→glob、`grep`→grep、`bash`→bash、`subagent`→task（仅家族级；子代理类型模式没有对应字段）、`skill`→skill（匹配技能名）、`ask_user_question`→question、`web`/`web_search`→websearch（匹配查询词）。未映射的工具经 `*` / 默认值解析。
- `external_directory` 在 read/edit/write 的路径落在工作目录之外时触发，默认 ask，与 opencode 一致。
- **没有**配置层定义 `permission` 时，桥接完全让位，DeepSeek Harness 自身策略不变；定义了之后，未命中的调用按 opencode 的宽松默认解析——上游姿态原样带过来（allow 免审批、ask 弹审批、deny 拒绝）。

未桥接（记录为限制）：`doom_loop`（重复调用检测无接缝）、`webfetch`（无 URL 抓取工具）、`lsp`（无 LSP 工具）、已废弃的 `tools` 布尔配置、按 agent 的权限覆盖（`agent.<name>.permission`——DeepSeek Harness 会话没有 opencode agent 身份）。

### MCP 服务器

把 opencode 的 `mcp` 配置（`opencode.json(c)`，项目按名覆盖全局）桥接为 DeepSeek Harness 工具（`mcp__opencode__<server>__<tool>`）。`type: "local"` 条目把 `command`（数组：可执行文件 + 参数，opencode 格式）与 `environment` 映射到 stdio 传输；`type: "remote"` 条目把 `url`（+ 可选 `headers`）映射到 streamable-http。`enabled: false` 跳过该服务器；启动失败一律放行。远程服务器的 OAuth 凭据流程没有 DeepSeek Harness 接缝，记录为限制。

### 限制

尚未桥接（按子系统记录）：

- **Skills / Commands**：嵌套命令目录（opencode 未记载）、命令模板的 `$ARGUMENTS`/`$1`/`!`command``/`@file` 替换、`agent`/`model`/`subtask` 选项、`agent.<id>` 的 `mode: "primary"` 代理与逐 agent `permission`/`temperature` 覆盖（subagent 模式代理已桥接为委派规格技能）、`skills.urls`（网络）、`references` 的 git 仓库（网络）。
- **Memory**：`OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` / `OPENCODE_CONFIG_CONTENT` 覆盖、远程 / 托管配置层、配置文件向上查找（项目 `opencode.json` 仅在 cwd 读取；`.opencode/skills` 的向上发现已桥接）、配置里的 `{env:…}`/`{file:…}` 替换。
- **插件 / 自定义工具**：opencode 的 JavaScript 插件系统（事件 hook 需要 opencode 运行时）与自定义工具没有文件格式层面的桥接面。
- **运行时 / 模型配置**：`formatter`、`lsp`、`experimental.*`（含已文档化的 `policies`）、自定义 `provider` 定义、`model`/`small_model` 默认——DeepSeek Harness 拥有模型路由、格式化与诊断，这些不在范围内（无文件格式桥接面）。
- **CLI / UI**：`share`/`autoshare`/`username`/`logLevel`/`layout`/`tool_output`/`enterprise`/`server`/`shell`/`watcher`/`snapshot`/`compaction`/`attachment.image`/`autoupdate`/provider 开关/`default_agent`/`subagent_depth`、`.opencode/themes/`、`tui.json`/`OPENCODE_TUI_CONFIG`、`keybinds`、`.opencode/modes/`——装饰性或运行时关注点，无 DeepSeek Harness 对应物。
- **重叠提示**：若同时开启 `claudeCode.memory`，`~/.claude/CLAUDE.md` 回退可能被注入两次（每个桥接各一次）；关闭其一或接受重复块。

## Codex 桥接

### Skills

读取 Codex 的技能位置并注册到 DeepSeek Harness 的技能注册表（provider 名 `codex`）：

| Codex 位置 | 注册为 |
| :--- | :--- |
| `$CWD/.agents/skills/<name>/SKILL.md`，以及向上到仓库根的每一层父目录 | 项目级技能（越靠 cwd 越优先） |
| `~/.agents/skills/<name>/SKILL.md` | 用户级技能 |
| `/etc/codex/skills/<name>/SKILL.md` | 系统级技能 |

映射规则：

- DeepSeek Harness 技能名取目录名（必须 kebab-case）。frontmatter 按 agent skills 标准要求 `name`（与目录一致）与 `description`（1,024 字符截断）；不合法的技能丢弃 + 告警。
- 优先级：项目技能（越靠 cwd 越优先）覆盖用户技能，用户覆盖系统。同名冲突时 DeepSeek Harness 原生技能永远胜出。
- `config.toml` 里 `[[skills.config]]`（`path` + `enabled = false`）禁用的技能被跳过；相对路径相对配置文件所在 `.codex/` 目录解析。
- 自定义 `[agents.<name>]` 角色同样成为委派规格技能：角色的 `description` 是技能描述，角色的 `config_file` TOML 内容成为正文，其中的 `model` 键映射到 `agentOptions.model`。
- 仓库根用 `project_root_markers`（默认 `['.git']`）判定；找不到标记时只检查当前目录，与 Codex 一致。技能根目录与 settings 文件会被监听。

### AGENTS.md 指令链记忆

DeepSeek Harness 核心自行加载工作区根 `AGENTS.md`。本桥接在会话开始时额外注入 Codex 的指令链（system-reminder 框架）：

- 最具体配置层的 `developer_instructions`（最先注入，与 Codex 一致）
- `$CODEX_HOME/AGENTS.override.md`（存在时），否则 `$CODEX_HOME/AGENTS.md`（先非空先胜；`CODEX_HOME` 会被遵守）
- 从仓库根向下到工作目录，每目录一个文件：`AGENTS.override.md` > `AGENTS.md` > `project_doc_fallback_filenames`；越靠工作目录越靠后、越优先
- 根目录的普通 `AGENTS.md` 跳过（DeepSeek Harness 已加载）；空文件跳过；项目累计达到 `project_doc_max_bytes`（默认 32 KiB）即停止追加

注入块预算 32 KiB：超限先丢弃全部用户级、再截断最具体的项目级。

### Hooks

从 `hooks.json` 与 `config.toml` 内联 `[hooks]` 表读取 hooks，覆盖每一层激活配置——`/etc/codex/`、`~/.codex/`、以及从仓库根到工作目录之间的每个 `.codex/` 目录（hooks 叠加合并、相同 handler 去重、最具体层的 `[features].hooks = false` 整体禁用），并在下列 DeepSeek Harness 生命周期执行 handler：

| Codex 事件 | DeepSeek Harness 接缝 | 决策映射 |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext` 与退出码 0 的纯文本 stdout 注入；matcher 收到 `startup`/`resume`/`clear`/`compact` |
| `SubagentStart` | `agent/session-start`（子代理） | 上下文注入子代理；matcher 收到 agent 类型 |
| `UserPromptSubmit` | `agent/pre-step` | `decision: "block"` / 退出码 2 / `continue: false` 擦除提示词并展示原因；上下文追加到本步 |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision: "deny"` / 废弃的 `decision: "block"` / 退出码 2 → 拒绝；`permissionDecision: "ask"` 忽略（Codex 自身即不支持）；`additionalContext` 注入；`updatedInput` 忽略 + 告警 |
| `PostToolUse` | `tools/post-execute` | `decision: "block"` / 退出码 2 / `continue: false` 用 hook 反馈替换工具结果（同 Codex）；`additionalContext` 追加在结果旁 |
| `Stop` | `agent/turn-stopping` | `decision: "block"` / 退出码 2 以 hook reason 为提示词引导继续（重复时带 `stop_hook_active`）；`continue: false` 优先、停止；桥接侧安全上限连续 8 次 |
| `SubagentStop` | `agent/turn-stopping`（子代理） | 同 Stop，引导子代理继续 |
| `SessionEnd` | `agent/disposed` | 仅副作用（1 秒预算，reason 固定 `other`；仅主线程） |

支持的 handler：仅 `type: "command"`（Codex 对 `prompt`/`agent` 需要 LLM 判定、自身即跳过），经 shell 运行、JSON 输入走 stdin、`timeout` 以秒计（默认 600；SessionEnd 1 秒）、`async: true`（后台运行，桥接丢弃其输出）、Windows 用 `commandWindows`；退出码与 JSON 输出按 Codex 协议。

兼容性细节：

- hooks 以 Codex 工具名为键，桥接做翻译：`bash`/`pwsh`→`Bash`、`edit`/`write`→`apply_patch`、`subagent`→`spawn_agent`、`todo_write`→`update_plan`；未映射的 DeepSeek Harness 工具保留原名。matcher 别名同样生效：`Edit`/`Write` 命中 `apply_patch`，`Agent` 命中 `spawn_agent`。
- matcher 语义遵循 Codex 规范：`*` / 空 / 缺省匹配全部；其余按 JavaScript 正则（不可解析的 matcher 直接不运行）。Codex hooks 没有 `if` 过滤器。
- 超时与 handler 失败一律放行，同 Codex。
- 子代理：`SessionStart`/`SessionEnd`/`UserPromptSubmit`/`Stop` 仅主会话，`SubagentStart`/`SubagentStop` 仅子代理，`PreToolUse`/`PostToolUse` 两者皆触发——与 Codex 的事件作用域一致。

### Permissions（审批 / 沙箱策略）

合并读取各配置层的 `approval_policy`、`sandbox_mode`、`default_permissions`，并在 `agent/session-start` 应用到每个会话（主会话与子代理会话一致）：

- **`sandbox_mode`**：`read-only` / `workspace-write` / `danger-full-access` 与 DeepSeek Harness 沙箱模式 1:1 映射，经会话的 `sandbox/mode` 覆盖生效。
- **`approval_policy`**：`never` → DeepSeek Harness 审批策略 `never`（自动放行）；`untrusted` / `on-request` / 废弃的 `on-failure` / `granular` → `ask`（这些模式下 Codex 都会弹审批；DeepSeek Harness 的 `ask` 交由已组合的审批应答者）。`granular` 表的逐项开关（`sandbox_approval`/`rules`/`mcp_elicitations`/`request_permissions`/`skill_approval`）仅记录告警、不生效。
- **`default_permissions`**：仅当命名内置档案时生效——`:read-only`、`:workspace`、`:danger-full-access`——且优先于 `sandbox_mode`（档案是 Codex 当前推荐机制）。自定义 `[permissions.<name>]` 档案读取但不应用。
- **只有显式配置的值才生效**：Codex 自身的默认值（read-only 沙箱、`untrusted` 审批）不会覆盖 DeepSeek Harness 部署的策略。

未桥接（记录为限制）：`[sandbox_workspace_write]` 的 `writable_roots` / `network_access` / `exclude_tmpdir_env_var` / `exclude_slash_tmp`（DeepSeek Harness 会话没有逐会话可写根覆盖）、自定义权限档案的文件系统/网络规则表、`approvals_reviewer` / `[auto_review]` guardian 策略（DeepSeek Harness 没有审查子代理审批流）、granular 逐项审批开关。

### MCP 服务器

把 Codex 的 `[mcp_servers.<id>]` 表（来自每个生效配置层；每个 id 以最具体层为准）桥接为 DeepSeek Harness 工具（`mcp__codex__<server>__<tool>`）。`url` 条目映射 streamable-http 传输（`http_headers` + `bearer_token_env_var` 提供的 Bearer 令牌）；`command` 条目映射 stdio（`args`、`env`、从进程环境白名单取值的 `env_vars`、`cwd`）。`enabled = false` 跳过该服务器；启动失败一律放行（告警）。未桥接（记录为限制）：`auth`（oauth/chatgpt 凭据流程）、`scopes`、`enabled_tools`/`disabled_tools` 与逐工具审批模式、`required` 语义（required 服务器启动失败仍仅告警）、Codex 的项目信任门禁（项目 `[mcp_servers]` 无条件连接，由 DeepSeek Harness 工具审批栈把关）。

### 限制

尚未桥接（按子系统记录）：

- **Skills**：`agents/openai.yaml` 元数据（`allow_implicit_invocation`、工具依赖）、插件分发的技能、符号链接的技能目录（桥接经文件系统读取，但不解析符号链接身份）、curated 插件目录。
- **Memory**：`model_instructions_file`（替换内置指令——不在范围内）、Codex 的 8,000 字符初始列表预算（DeepSeek Harness 有自己的目录预算）。
- **Hooks**：`PermissionRequest`（DeepSeek Harness 没有"即将请求审批"的接缝）、`PreCompact`/`PostCompact`（无压缩前接缝；`compact` 会话来源会触发 SessionStart hooks 代替）、Codex 的 hook trust 审核流程（`/hooks`——桥接与其他桥接一致、无 trust 闸门运行）、后台 hook 输出在下个安全点投递、`systemMessage`/`suppressOutput` 仅用户通道、`additionalContextLimit` 溢出落盘（桥接按字符截断替代）、插件捆绑与托管 `requirements.toml` hooks、`transcript_path`（桥接没有真实转录文件）、`updatedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）。
- **Rules / 配置**：`rules/*.rules`（实验性 Starlark DSL）、`notify`、`[agents.<name>]` 角色在 `description`/`config_file` 之外的选项（逐角色工具过滤、配置文件之外的 `model`、角色的权限闸门）、`requirements.toml`、profile 文件（`--profile`）、插件捆绑的 MCP 服务器（`plugins.<plugin>.mcp_servers`）、未信任项目门禁——仅支持显式 `projects["<path>"].trust_level = "untrusted"` 条目（现在会跳过项目 `.codex/` 层；桥接没有交互式信任流程，未列出的路径仍无条件读取）。
- **其余配置**：`web_search`/`tools.web_search` 模式、`[features].*` 运行时开关（仅 `features.hooks` 被读取）、`[shell_environment_policy]`（仅作用于桥接自 spawn 的子进程——与 settings `env` 同一接缝）、`[apps]` 连接器、`[memories]`、`[history]`、`tool_output_token_limit`、`file_opener`、`[otel]`、`[desktop]`/`[tui]`、认证/通知/日志键——DeepSeek Harness 拥有这些层；模型/供应商选择（`model`、`review_model`、`model_provider`、`[model_providers]`、`model_reasoning_*`、`model_auto_compact_token_limit*`）为 host-plane，不在范围内。

## pi 桥接

pi（earendil-works 的 Rust 编码代理）没有 hooks 配置、没有权限规则系统、也没有 MCP 配置——它的 TypeScript 扩展事件总线才是这三者的等价物，而扩展不在本期范围（同 opencode 插件 API 的先例）。因此本桥接只覆盖两块：skills / prompt 模板与上下文文件记忆。

### Skills 与 prompt 模板

读取 pi 的资产位置并注册到 DeepSeek Harness 技能注册表（provider `pi`），出现在模型可见的技能目录中，可用 `/名称` 触发：

| pi 位置 | 注册为 |
| :--- | :--- |
| `$PI_DIR/skills/<name>/SKILL.md`（递归发现；`$PI_DIR` = `PI_CODING_AGENT_DIR` 或 `~/.pi/agent`） | 用户级技能 |
| `$PI_DIR/skills/<name>.md`（根级扁平文件） | 用户级技能 |
| `.pi/skills/<name>/SKILL.md` 与扁平 `.md`（项目级，受信任门禁） | 项目级技能 |
| `$PI_DIR/prompts/<name>.md` / `.pi/prompts/<name>.md`（非递归，项目级受信任门禁） | 技能（斜杠模板；`/名称` 手势触发） |
| settings 的 `skills` / `prompts` 数组（文件或目录路径） | 按声明层归入用户/项目段 |

映射规则：

- 技能名取 frontmatter 的 `name`（pi 允许与目录名不同；缺省时回退到目录/文件名——pi 源码行为）。DeepSeek Harness 要求 kebab-case，不合规的名字跳过 + 告警（不转写）。
- `description` 必填（pi 不加载没有它的技能；桥接跳过 + 告警），按 pi 的 1,024 字符上限截断。
- `disable-model-invocation: true` → 技能离开模型目录但仍可 `/名称` 触发（上游是 `/skill:name`）；非法值告警并视为 false（pi 宽松语义）。
- `metadata` 透传；`allowed-tools`（实验性）、`license`、`compatibility` 与未知字段忽略（记限制）。
- 优先级遵循 pi 源码加载顺序：全局位置先于项目位置、同名冲突保留先发现者，因此**个人资产覆盖项目资产**；同级技能优先于同名 prompt 模板。DeepSeek Harness 原生技能（`.dsh/skills`、`.agents/skills`、运行时技能）在同名冲突时依然胜出——桥接注册在全局技能层，较近的 preset 层遮蔽它。
- pi 也读取的 `.agents/skills` 位置**有意不重读**：DeepSeek Harness 自带的 filesystem provider 已覆盖 `.agents` 资产，重读会产生重复候选。
- 项目 `.pi/skills`、`.pi/prompts` 与项目 `.pi/settings.json` 仅在项目受信任时加载。桥接按 pi 的非交互语义解析信任：`$PI_DIR/trust.json` 中对当前目录（或最近父目录）的已保存决策优先，否则回退到全局 `defaultProjectTrust`（默认 `ask` 与 `never` 跳过项目资源，`always` 信任——非交互会话没有提示，`ask` 视为不信任）。`project_trust` 扩展事件不桥接。
- 已存在的技能根目录、settings 文件与 `trust.json` 被监听，改动无需重启即生效。

### 上下文文件记忆

DeepSeek Harness 自身已加载仓库根的 `AGENTS.md`。桥接在会话开始时额外注入（同样的 system-reminder 框架）：

- `$PI_DIR/AGENTS.md`（全局，不受项目信任限制）
- 从文件系统根向下走到工作目录的每层一个文件——每目录取第一个非空的 `AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`（pi 源码确认的候选顺序；`AGENTS.override.md` 整体替代该目录的 `AGENTS.md`/`CLAUDE.md`）；按规范路径去重
- `$PI_DIR/APPEND_SYSTEM.md`，然后是受信任项目的 `.pi/APPEND_SYSTEM.md`（pi 把两者追加到系统提示）

仓库根的普通 `AGENTS.md` 与 DeepSeek Harness 已加载的文件一致时跳过，避免重复。预算 32 KiB：先丢更宽的全局文件，再截断最具体的段。

### 限制

尚未桥接（按子系统记录）：

- **扩展**：`~/.pi/agent/extensions/*.ts` / `.pi/extensions/*.ts` 与扩展事件（`tool_call` 拦截、`tool_result` 改写、`project_trust`……）——等价于 opencode 插件 API 的 TypeScript 运行时，无对应 DeepSeek Harness 接缝。
- **记忆**：`.pi/SYSTEM.md` / `$PI_DIR/SYSTEM.md`（整体替换系统提示——DeepSeek Harness 拥有系统提示）；`--no-context-files`、`--prompt-template` 等 CLI 开关是单次运行参数，无持久配置。
- **Skills**：`allowed-tools`（实验性的预批准工具列表）、`license` / `compatibility` 展示字段、`enableSkillCommands`（DeepSeek Harness 的 `/名称` 手势始终可用；该设置仅读取用于文档对齐）、包（`package.json` 的 `pi.skills` / 包内 `skills/` 目录）、CLI `--skill` 路径、`.agents/skills` 根（改由 DeepSeek Harness 原生 provider 覆盖）。
- **权限 / MCP / subagents**：pi 无内置（信任门禁与工具白名单即其全部安全面；MCP 与 subagent 靠扩展实现，扩展不在范围内）。
- **信任**：交互式信任提示与 `project_trust` 扩展事件不可用，因此 `ask` 在 DeepSeek Harness 会话中解析为不信任（与 pi 自身的非交互行为一致）。

## Gemini CLI 桥接

### Skills、Commands 与 Subagents

读取 Gemini CLI 的资产位置并注册到 DeepSeek Harness 技能注册表（provider `gemini-cli`），出现在模型可见的技能目录中，可用 `/名称` 触发：

| Gemini CLI 位置 | 注册为 |
| :--- | :--- |
| `~/.gemini/skills/<name>/SKILL.md`（用户）与 `.gemini/skills/<name>/SKILL.md`（工作区） | 技能（目录型，非递归） |
| `~/.gemini/commands/<name>.toml` / `.gemini/commands/<name>.toml` | 命令（技能；TOML 的 `prompt` 为正文） |
| `~/.gemini/agents/*.md` / `.gemini/agents/*.md` | subagent 定义 → 委派规格技能 |

映射规则：

- 技能名取 frontmatter 的 `name`（缺省回退目录名）；DeepSeek Harness 要求 kebab-case。命令名来自文件名——嵌套路径产生 `dir:name` 命名空间命令，非 kebab-case，跳过 + 告警（不转写）。
- 技能的 `description` 必填（fail closed）；命令的 `description` 可选（缺省取 prompt 首段）。
- 优先级遵循 Gemini 的发现层级（内置 < 扩展 < 用户 < 工作区）：**工作区资产覆盖用户资产**，同级技能优先于同名命令。DeepSeek Harness 原生技能（`.dsh/skills`、`.agents/skills`、运行时技能）在同名冲突时依然胜出——桥接注册在全局技能层，较近的 preset 层遮蔽它。`.agents/skills` 别名位置有意不重读（DeepSeek Harness 自带 filesystem provider 已覆盖 `.agents` 资产）。
- `skills.disabled` 名单与 `skills.enabled` 总开关来自 settings.json。
- Subagents 复用委派规格模式：`name` / `description` / `tools`（Gemini 工具名翻译为 DeepSeek Harness 名；`*` 与 `mcp_*` 通配丢弃——缺省 `tools` 本就表示全部）/ `model`（→ `agentOptions.model`）/ `max_turns`（→ `maxDepth`）。`kind: remote`（A2A）跳过；`mcpServers`、`temperature`、`timeout_mins` 记限制。
- 已存在的技能根目录与 settings 文件被监听，改动无需重启即生效。

### GEMINI.md 记忆

会话开始时注入 Gemini 上下文文件链（同样的 system-reminder 框架）：

- `~/.gemini/GEMINI.md`（全局）
- 工作区 `GEMINI.md` 及每个父目录的同名文件，直到记忆边界（首个含 `context.memoryBoundaryMarkers` 条目的目录——默认 `[" .git"]`），根在前
- `context.fileName` 自定义文件名（字符串或数组，默认 `GEMINI.md`）；`context.discoveryMaxDirs` 限制向上层数（默认 200）

`@./relative/path.md` 与 `@/absolute/path.md` 导入内联展开（规范路径去重、防循环、缺失导入保留原文行）。Gemini 的 JIT 加载（工具访问目录时才发现的上下文文件）无对应 DeepSeek Harness 接缝，记限制。预算 32 KiB：先丢更宽的全局文件，再截断最具体的段。

### Hooks

合并读取 `<cwd>/.gemini/settings.json` → `~/.gemini/settings.json` → `/etc/gemini-cli/settings.json` 的 `hooks` 字段（组按层叠加合并、相同 handler 去重），并在 DeepSeek Harness 生命周期运行命令 hooks（会话级事件仅主会话；工具事件子代理也触发）：

| Gemini 事件 | DeepSeek Harness 接缝 | 决策映射 |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext`（及非 JSON stdout）在首个提示词前注入 |
| `SessionEnd` | `agent/disposed` | 仅副作用（1.5 秒预算） |
| `BeforeAgent` | `agent/pre-step` | `decision: "deny"` / exit 2 擦除提示词并展示原因；`continue: false` 同样处理（DeepSeek Harness 无"保留消息但阻断"）；`additionalContext` 追加 |
| `AfterAgent` | `agent/turn-stopping` | `decision: "deny"` / exit 2 要求续跑（封顶 8 次）；`additionalContext` 注入；`continue: false` 无停摆接缝（告警） |
| `BeforeTool` | `tools/pre-execute` | `decision: "deny"` / exit 2 → 拒绝并附原因；`additionalContext` 注入；`hookSpecificOutput.tool_input` 改写与 `continue: false` 不支持（DeepSeek Harness 冻结工具参数） |
| `AfterTool` | `tools/post-execute` | `decision: "deny"` / exit 2 用原因替换渲染结果；`additionalContext` 追加；`tailToolCallRequest` 不支持 |

兼容性细节：

- hooks 以 Gemini 工具名为键，桥接做翻译：`bash`/`pwsh`→`run_shell_command`、`read`→`read_file`、`write`→`write_file`、`edit`→`replace`、`glob`→`list_directory`、`grep`→`search_file_content`、`web`→`web_fetch`、`web_search`→`google_web_search`、`ask_user_question`→`ask_user`、`exit_plan_mode`→`exit_plan_mode`、`todo_write`→`write_todos`、`skill`→`activate_skill`；未映射的 DeepSeek Harness 工具（MCP 服务器等）保留原名。matcher 与 hook 脚本收到的 `tool_name` 载荷都用翻译后的名字。
- matcher 语义遵循 Gemini 规范：工具事件（`BeforeTool`、`AfterTool`）用**正则**，生命周期事件用**精确串**，`*` / 空匹配全部；不可解析的正则永不匹配（fail open）。
- I/O 遵循 Gemini 的"金科玉律"：stdin 收 JSON；stdout 只允许最终 JSON 对象——任何其他输出视为 hook 失败、整段当作 `systemMessage`（动作放行）；exit 0 携带 `{"decision":"deny"}` 阻断并附 `reason`；exit 2 阻断、stderr 为原因；其他退出码为非致命警告。超时（每 handler `timeout`，单位**毫秒**，默认 60,000）与 handler 失败一律放行。
- `suppressOutput`（仅遥测）与组的 `sequential`（桥接一律顺序执行）无可见效果。
- 未桥接（无接缝）：`BeforeModel`、`AfterModel`、`BeforeToolSelection`、`PreCompress`、`Notification`。

### Permissions（Policy Engine）

把 `~/.gemini/policies/*.toml` 的**用户层**策略规则桥接到 `tools/pre-execute` 权限接缝（工作区层上游已禁用，issue #18186，故同样不读；管理员层与内置默认策略位于 Gemini 安装内、不在范围内——由 DeepSeek Harness 自身的审批策略补位）：

- `[[rule]]` 条目：`toolName`（`*` / `mcp_*` 等通配，字符串或数组）、`subagent`、`mcpName`、`argsPattern`（JSON 对象子集 + 深比较）、`commandPrefix` / `commandRegex`（仅 run_shell_command）、`decision`（`allow` / `deny` / `ask_user`）、`priority`（0–999）、`denyMessage`。
- 求值遵循 Gemini：`final = 4（用户层）+ priority/1000`；按优先级从高到低、**首个完全命中者定夺**。工具名先翻译；subagent 委派按代理名匹配规则（`toolName` 或 `subagent` 字段与委派 label 比较）。
- `ask_user` 映射到 DeepSeek Harness 审批通道（`ask`），与其他桥接一致；`deny` 用 `denyMessage` 作为原因。
- hooks 与规则组合：BeforeTool hook `deny` 直接拒绝；hook `allow` 不能覆盖命中的 deny 规则；hook 无决策时规则定夺。
- 已记限制：`modes` 门控规则不生效（DeepSeek Harness 无上游审批模式状态）、`interactive: true` 规则不生效（无头会话）、`toolAnnotations` 永远无法命中（无注解接缝）、`allowRedirection` 不处理。

### MCP 服务器

把 Gemini settings.json 的 `mcpServers` 桥接为 DeepSeek Harness 工具（`mcp__gemini__<server>__<tool>`）。每条目的传输按 `httpUrl`（streamable-http）> `url`（SSE，降级 streamable-http 并告警）> `command`（stdio，含 `args` / `env` / `cwd`）；`${VAR}` / `${VAR:-DEFAULT}` 引用从进程环境展开，相对 `cwd` 按声明 settings 文件所在目录解析。`mcp.allowed` 过滤连接集合、`mcp.excluded` 一律跳过；启动失败放行。未桥接（记限制）：`includeTools` / `excludeTools`（无逐工具过滤接缝）、`trust` 门禁（读取但不执行——DeepSeek Harness 工具审批栈把关）、OAuth（`targetAudience` / `targetServiceAccount`）、管理员层管控。

### 限制

尚未桥接（按子系统记录）：

- **Skills**：嵌套技能目录、内置与扩展技能（位于 Gemini 安装内）、`/skills` 启停手势属运行时状态；`scripts`/`references`/`assets` 支持文件经 resource base 正常工作。
- **Commands**：`dir:name` 命名空间命令（非 kebab-case）、`!{...}` shell 执行与 `@{...}` 文件注入标记（正文原样透传、不执行）、`{{args}}` 替换由 DeepSeek Harness 自身的 `/名称 <参数>` 追加行为承担。
- **Memory**：JIT 上下文加载、Memory 工具的逐项目私有记忆目录与 auto-memory（实验性）、`.env` 加载。
- **Hooks**：`BeforeModel` / `AfterModel` / `BeforeToolSelection` / `PreCompress` / `Notification`；AfterAgent 的 `prompt` / `prompt_response` 为空（DeepSeek Harness 在 turn-stopping 不暴露最终回复文本）；`tool_input` 改写、`tailToolCallRequest`、`continue: false`（无停摆接缝）、`transcript_path`（无转录文件）、`suppressOutput`。
- **Permissions**：工作区/管理员/内置层、`modes` / `interactive` / `toolAnnotations` / `allowRedirection` 语义（见上）。
- **Subagents**：`kind: remote`（A2A）、内联 `mcpServers`、`temperature`、`timeout_mins`、`@name` 强制委派（改为技能指示模型委派）。
- **MCP**：见上文 MCP 小节。
- **其他**：extensions（打包的 commands/hooks/skills/agents/MCP/policies/themes）、themes、output 格式、sandbox 与 trusted-folders、browser agent、notifications、settings `env` 对模型侧 shell 的注入（仅桥接自 spawn 的子进程）——DeepSeek Harness 拥有这些层；模型路由（`model`、`GEMINI_MODEL`）为 host-plane，不在范围内。

## Cursor 桥接

Cursor 的资产分布在 IDE 与 CLI（`agent` 二进制）之间。本桥接覆盖 CLI 文档确认可读的资产：skills、subagents、rules、hooks、CLI 权限与 MCP。

### Skills 与 Subagents

读取 Cursor 的技能位置并注册到 DeepSeek Harness 技能注册表（provider `cursor`），出现在模型可见的技能目录中，可用 `/名称` 触发：

| Cursor 位置 | 注册为 |
| :--- | :--- |
| `~/.cursor/skills/**/SKILL.md`（用户）与 `.cursor/skills/**/SKILL.md`（项目） | 技能（递归发现；技能身份 = 含 `SKILL.md` 的文件夹） |
| `~/.cursor/agents/*.md` / `.cursor/agents/*.md` | subagent 定义 → 委派规格技能 |

映射规则：

- 技能名取 frontmatter 的 `name`（缺省回退文件夹名）；`description` 必填（fail closed）。DeepSeek Harness 要求 kebab-case。
- `disable-model-invocation: true` → 技能离开模型目录但仍可 `/名称` 触发；`user-invocable: false` → 仅模型可调用、对人类隐藏；`metadata` 透传。`paths` / 旧 `globs` 路径作用域与嵌套目录自动作用域记限制。
- 优先级：**项目资产覆盖用户资产**（Cursor 对 subagents 明示项目 > 用户）；同级技能优先于同名 agent。DeepSeek Harness 原生技能在同名冲突时依然胜出（桥接注册在全局技能层，较近的 preset 层遮蔽它）。兼容根（`.agents/skills`、`.claude/skills`、`.codex/skills`）有意不重读——filesystem provider 与其他桥接已覆盖。
- Subagents 复用委派规格模式（`name` / `description` / `model` → `agentOptions.model`）；`readonly` 与 `is_background` 记限制。

### Rules 记忆

会话开始时注入 Cursor 的持久指令（同样的 system-reminder 框架）：

- `.cursor/rules/**/*.mdc` 中所有 `alwaysApply: true` 的文件（rules 目录以仓库根为锚）
- 仓库根（不含）到工作目录（含）之间的子目录 `AGENTS.md`

相关性规则（无 `alwaysApply`）、globs 条件规则、`.cursor/rules` 下的 `.md` 文件（上游因无 frontmatter 忽略）、用户规则（Cursor 设置而非文件）、根 `CLAUDE.md`（已由 claude-code 桥接注入）记限制。预算 32 KiB，超出时带标记截断。

### Hooks

合并读取 `.cursor/hooks.json`（项目）与 `~/.cursor/hooks.json`（用户；相同 handler 去重；企业/团队层不在范围内），并在 DeepSeek Harness 生命周期运行命令 hooks（会话事件仅主会话、子代理事件仅子代理、工具事件两者皆触发）：

| Cursor 事件 | DeepSeek Harness 接缝 | 决策映射 |
| :--- | :--- | :--- |
| `sessionStart` | `agent/session-start` | 发射后不管；`additional_context` 注入 |
| `sessionEnd` | `agent/disposed` | 仅副作用（1.5 秒预算） |
| `beforeSubmitPrompt` | `agent/pre-step` | `continue: false` 阻断提示词并展示 `user_message` |
| `preToolUse` | `tools/pre-execute` | `permission: "deny"` / exit 2 → 拒绝（`agent_message`）；`updated_input` 改写不支持（DeepSeek Harness 冻结工具参数） |
| `postToolUse` / `postToolUseFailure` | `tools/post-execute` | `additional_context` 追加（错误时传 `failure_type`） |
| `stop` | `agent/turn-stopping` | `followup_message` 要求续跑（每脚本 `loop_limit`，默认 5） |
| `afterAgentResponse` | `agent/turn-stopping` | `additional_context` 注入（回复文本不暴露） |
| `subagentStart` | `agent/session-start`（子代理） | `additional_context`；`permission: "deny"` 无拒绝接缝（告警） |
| `subagentStop` | `agent/turn-stopping`（子代理） | `followup_message` 要求续跑（每脚本 `loop_limit`） |
| `beforeShellExecution` / `afterShellExecution` | `bash`/`pwsh` 的 pre/post-execute | matcher 作用于**命令文本** |
| `beforeReadFile` / `afterFileEdit` | `read` 的 pre-execute / `edit`/`write` 的 post-execute | matcher 作用于**文件路径** |
| `beforeMCPExecution` / `afterMCPExecution` | MCP 工具的 pre/post-execute | matcher 作用于工具名 |

兼容性细节：

- hooks 以 Cursor 工具名为键，桥接做翻译：`bash`/`pwsh`→`Shell`、`read`→`Read`、`write`→`Write`、`edit`→`Edit`、`glob`→`Glob`、`grep`→`Grep`、`web`→`WebFetch`、`web_search`→`WebSearch`、`subagent`→`Task`、`todo_write`→`TodoWrite`；MCP 工具保留原名。matcher 与 `tool_name` 载荷用翻译后的名字。
- matcher 语义：非锚定正则作用于事件对应字段（工具名用 `Shell|Read|Write`、命令文本用 `curl|wget` 包含匹配）；`*` / 空匹配全部；不可解析的模式永不匹配。
- 退出码遵循 Cursor：`0` 使用 JSON 输出、`2` 阻断（≡ `permission: "deny"`）、其余放行——除非 handler 设了 `failClosed: true`（崩溃/超时/非法 JSON 转为阻断）。超时按 handler 配置（秒，默认 30）。
- 未桥接：prompt 型 hooks（需要 LLM）、`preCompact`、`afterAgentThought`、`workspaceOpen`、Tab hooks（IDE 专属）。

### Permissions

在 `tools/pre-execute` 接缝执行 `~/.cursor/cli-config.json` → `.cursor/cli.json` 的 CLI 权限令牌（`permissions.allow` / `permissions.deny`；每份列表取最具体层）：

- `Shell(commandBase)` — 对命令首词做 glob，另有 `command:args`（args 部分对命令行其余部分做 glob）
- `Read(pathOrGlob)` / `Write(pathOrGlob)` — 对文件路径做 `**` / `*` / `?` glob；一类令牌绝不匹配另一类工具
- `WebFetch(domainOrPattern)` — 精确主机名或 `*.domain` 子域名后缀
- `Mcp(server:tool)` — 对 `mcp__<server>__<tool>` 名逐段 glob

**deny 优先于 allow**；没有 ask 层级，未命中的调用落到 DeepSeek Harness 自身的审批策略。hook 决策先组合（hook deny 直接拒绝；hook allow 不能覆盖命中的 deny 规则）。已记限制：`approvalMode` 读取但不执行（DeepSeek Harness 拥有其审批模式）；`permissions.json`（`mcpAllowlist` / `terminalAllowlist` / `autoRun`）调的是 Cursor 自身的提示流，读取但不执行。

### MCP 服务器

把 `.cursor/mcp.json` 与 `~/.cursor/mcp.json` 的 `mcpServers` 桥接为 DeepSeek Harness 工具（`mcp__cursor__<server>__<tool>`；项目按名覆盖用户）。stdio 条目（`command` / `args` / `env` / `envFile`）以 Cursor 的配置变量插值启动（`${env:VAR}`、`${userHome}`、`${workspaceFolder}`、`${workspaceFolderBasename}`、`${pathSeparator}`、`${/}`）；远程 `url` 条目经 streamable-http 连接并插值 headers。`auth` OAuth 流程记限制。

### 限制

尚未桥接（按子系统记录）：

- **Skills**：`paths` / 旧 `globs` 路径作用域、嵌套目录自动作用域、插件提供的技能。
- **Memory**：相关性与 globs 条件规则、用户规则（Cursor 设置）、根 `CLAUDE.md`（claude-code 桥接已覆盖）、`.cursorrules`（旧版）。
- **Hooks**：prompt 型 hooks、`preCompact`、`afterAgentThought`、`workspaceOpen`、Tab hooks、企业/团队 hook 层、`updated_input` / `updated_mcp_tool_output` 改写、`sessionStart` 的 `env`（逐会话环境无接缝）。
- **Permissions**：`approvalMode`、`permissions.json` 语义、sandbox.json（网络策略/额外路径无逐会话接缝）。
- **MCP**：`auth` 凭据流程。
- **其他**：`~/.cursor/settings.json`（IDE 设置；仅 `enabled_plugins` 到达 CLI）、themes——DeepSeek Harness 拥有这些层；模型路由为 host-plane，不在范围内。Cursor 的第三方 Claude Code hooks 兼容层（Cursor 自行读取 `.claude/settings*.json` hooks 并翻译事件/工具名）不重读——claude-code 桥接以 Claude 语义覆盖原始文件。`.cursorignore` / `.cursorindexingignore`（DeepSeek Harness 拥有自己的忽略层）、`worktrees.json`（工作树 setup 脚本）、ACP 服务端模式（`agent acp`）同样不在范围内。
