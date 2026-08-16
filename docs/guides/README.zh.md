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
