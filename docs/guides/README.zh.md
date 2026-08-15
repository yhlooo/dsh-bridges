# dsh-bridges 使用指南

[English](README.md)

各桥接的详细使用文档：安装与验证、完整配置参考、每个工具的逐项行为（skills/commands、记忆、hooks）与限制。快速上手指南见[根目录 README](../../README.md)。

## 安装

插件通过 profile 的插件管理器（pnpm）安装到某个 DeepSeek Harness profile：

```sh
# 从本仓库 checkout 安装（先编译 src/ → lib/）：
pnpm install && pnpm build
dsh plugin --profile <name> add .

# 或将来从发布的 tarball / registry 包安装：
dsh plugin --profile <name> add dsh-bridges
```

插件管理器会把该包追加到 profile 的 `dsh.profile.bundles`，其 `cordis.patch.yml` 向组合树注入一行 `bridges`。验证：

```sh
dsh --profile <name> --dump-config   # 应能看到 "dsh-bridges" 这一行
```

然后在带有 agent 资产（`.claude/`、`~/.claude/`、`.codebuddy/`、`~/.codebuddy/`）的项目里启动 DeepSeek Harness；资产按会话工作区发现。

每个受支持的 agent 工具各有一个现成示例项目（[`examples/`](../../examples/)）：
把示例目录作为会话工作区打开，即可看到它的 skills、memory 与 hooks 如何被
桥接，各目录 README 说明逐项验证方式。

## 配置

每个工具桥接在 `bridges` 行下各占一个配置段；后续 patch 层（profile 的 `cordis.patch.yml`、`--patch` 覆盖层）可以覆盖任意字段：

```yaml
- id: bridges
  config:
    claudeCode:
      enabled: true               # Claude Code 桥接的总开关
      skills: true                # 发现 .claude / ~/.claude 的 skills 与 commands
      memory: true                # 注入 ~/.claude/CLAUDE.md 与 .claude/CLAUDE.md
      hooks: true                 # 运行 settings.json 里的 Claude Code hooks
      userClaudeDir: '~/.claude'  # 用户级 Claude Code 目录
      watch: true                 # 监听技能根目录，变更即重新发布
      hookTimeoutMs: 600000
      userPromptHookTimeoutMs: 30000
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
    codebuddyCode:
      enabled: true                     # CodeBuddy Code 桥接的总开关
      skills: true                      # 发现 .codebuddy / ~/.codebuddy 的 skills 与 commands
      memory: true                      # 注入 CODEBUDDY.md 记忆与始终应用规则
      hooks: true                       # 运行 settings.json 里的 CodeBuddy Code hooks
      userCodebuddyDir: '~/.codebuddy'  # 用户级 CodeBuddy Code 目录
      watch: true                       # 监听技能根目录与 settings 文件
      hookTimeoutMs: 60000              # 对齐 CodeBuddy Code 的 60 秒 hook 上限
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
    opencode:
      enabled: true                     # opencode 桥接的总开关
      skills: true                      # 发现 .opencode / ~/.config/opencode 的 skills 与 commands（含 JSON 命令）
      memory: true                      # 注入 AGENTS.md 规则（含 CLAUDE.md 回退）与 instructions 文件
      userOpencodeDir: '~/.config/opencode'  # 用户级 opencode 目录
      userClaudeDir: '~/.claude'        # CLAUDE.md 回退所用的用户级 Claude Code 目录
      claudeCompat: true                # 是否启用 opencode 的 Claude Code 兼容回退
      watch: true                       # 监听资产根目录与配置文件
      memoryMaxBytes: 32768
    codex:
      enabled: true                     # Codex 桥接的总开关
      skills: true                      # 发现 .agents/skills（cwd → 仓库根）、~/.agents/skills、/etc/codex/skills
      memory: true                      # 注入 AGENTS.md 指令链
      hooks: true                       # 运行 hooks.json / config.toml 里的 Codex hooks
      userCodexDir: '~/.codex'          # 用户级 Codex 目录（设置 CODEX_HOME 时以它为准）
      userSkillsDir: '~/.agents/skills' # 用户级 skills 目录
      watch: true                       # 监听技能根目录与 settings 文件
      hookTimeoutMs: 600000             # 对齐 Codex 的 600 秒 hook 默认值
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
```

## Claude Code 桥接（一期）

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

根目录 `CLAUDE.md` 由 DeepSeek Harness 核心自行加载。本桥接在会话开始时额外注入 `~/.claude/CLAUDE.md`（用户级）与 `.claude/CLAUDE.md`（项目级），采用 DeepSeek Harness 工作区指令相同的 system-reminder 框架，预算 32 KiB（超限先丢弃更宽的用户级文件，仍超限则截断项目级文件）。

### Hooks

合并读取 `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` 的 `hooks` 字段（分组叠加合并、相同 handler 去重、`disableAllHooks` 取最具体定义它的层级），并在下列 DeepSeek Harness 生命周期执行 handler：

| Claude Code 事件 | DeepSeek Harness 接缝 | 决策映射 |
| :--- | :--- | :--- |
| `SessionStart` | `agent/session-start` | `additionalContext`（及退出码 0 的纯文本 stdout）在首个提示词前注入 |
| `UserPromptSubmit` | `agent/pre-step` | `decision: "block"` / 退出码 2 / `continue: false` 擦除提示词并展示原因；上下文追加到本步 |
| `PreToolUse` | `tools/pre-execute` | `permissionDecision`：`deny` → 拒绝、`ask` → 走审批、`allow` → 放行、`defer` → 拒绝（不支持）；退出码 2 → 以 stderr 拒绝 |
| `PostToolUse` | `tools/post-execute` | `additionalContext` / `decision: "block"` 的 reason / 退出码 2 的 stderr → 结果旁注入上下文；`updatedToolOutput` 替换渲染内容 |
| `PostToolUseFailure` | `tools/post-execute`（失败结果） | 同 PostToolUse |
| `Stop` | `agent/turn-stopping` | `decision: "block"` / 退出码 2 / `additionalContext` 引导继续，最多连续 8 次（同 Claude Code 上限） |
| `SessionEnd` | `agent/disposed` | 仅副作用（1.5 秒预算） |

支持的 handler 类型：`command`（shell 形态与 `args` exec 形态、`${CLAUDE_PROJECT_DIR}` 替换、每 handler `timeout`、`async: true`、按 Claude Code 协议的退出码与 JSON 输出）与 `http`（POST 同样的 JSON、header 环境变量插值受 `allowedEnvVars`/`httpHookAllowedEnvVars` 约束、`allowedHttpHookUrls` 白名单）。

兼容性细节：

- hooks 以 Claude Code 工具名为键。DeepSeek Harness 的命名不同（`bash`、`edit`、`read`……），因此桥接做了翻译：`bash`→`Bash`、`pwsh`→`PowerShell`、`read`→`Read`、`write`→`Write`、`edit`→`Edit`、`glob`→`Glob`、`grep`→`Grep`、`web`/`web_search`→`WebSearch`、`ask_user_question`→`AskUserQuestion`、`exit_plan_mode`→`ExitPlanMode`、`subagent`→`Agent`、`todo_write`→`TodoWrite`；未映射的 DeepSeek Harness 工具（MCP 服务器、一方扩展）保留原名。matcher、`if` 规则以及 hook 脚本收到的 `tool_name` 字段都是翻译后的名字，因此为 Claude Code 写好的 hook 脚本原样可用。
- matcher 语义遵循 Claude Code 规范：精确名集合（`Bash|Edit`）、其余一律视为非锚定正则、`*`/空匹配全部。
- `if` 过滤器支持常见的 `ToolName(glob)` 形态，对已映射的工具各对应一个主参数字段（`Bash(rm *)`、`Edit(*.ts)`……）；无法解析的规则以及没有映射字段的工具一律放行，与 Claude Code 的 best-effort 约定一致（不复制其更深的 Bash 子命令分析）。
- 超时与 handler 失败一律放行（绝不因此阻断动作），同 Claude Code。
- 子代理：`UserPromptSubmit`、`Stop`、`SessionStart`、`SessionEnd` 仅对主会话生效，与 Claude Code 一致；`PreToolUse`/`PostToolUse` 也会在子代理的工具调用上触发（`SubagentStart`/`SubagentStop` 尚未桥接）。

### 一期限制

尚未桥接（按子系统记录）：

- **Skills**：工作区以下的嵌套 `.claude/skills/`（其限定名非 kebab-case）、企业 / managed 技能、插件技能、claude.ai 同步技能；`allowed-tools`/`disallowed-tools`、`model`、`effort`、`context: fork`/`agent`/`background`、`paths`、`shell` 以及正文中的 `$ARGUMENTS` 替换；skill/agent frontmatter 里的 `hooks`。
- **Memory**：`.claude/rules/*.md`、CLAUDE.md 的 `@import`、嵌套 CLAUDE.md。
- **Hooks**：`mcp_tool`、`prompt`、`agent` 三种 handler 类型；`PreCompact`/`PostCompact`、`Notification`、`SubagentStart`/`SubagentStop`、`PermissionRequest`/`PermissionDenied` 及其余异步事件；`CLAUDE_ENV_FILE`；`asyncRewake`；`updatedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）；`permissionDecision: "defer"`（映射为拒绝）。

## CodeBuddy Code 桥接（二期）

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
| `PreToolUse` | `tools/pre-execute` | `permissionDecision`：`deny` → 拒绝、`ask` → 走审批、`allow` → 放行；退出码 2 → 拒绝（消息 stdout 优先）；`modifiedInput` 忽略 + 告警 |
| `PostToolUse` | `tools/post-execute` | `additionalContext` / 退出码 2 消息 / 废弃的 `decision: "block"` reason → 结果旁注入上下文；`updatedToolOutput` 替换渲染内容 |
| `PostToolUseFailure` | `tools/post-execute`（失败结果） | 同 PostToolUse |
| `Stop` | `agent/turn-stopping` | 退出码 2 / `continue: false` / `additionalContext` 引导继续（重复时带 `stop_hook_active`；桥接侧安全上限连续 8 次） |
| `SessionEnd` | `agent/disposed` | 仅副作用（1.5 秒预算，reason 固定 `other`） |

支持的 handler 类型：`command`（shell 形态与 `args` exec 形态、`${CODEBUDDY_PROJECT_DIR}` 替换、每 handler `timeout`（默认对齐 CodeBuddy Code 的 60 秒）、`async: true`、`once: true`、按 CodeBuddy Code 协议的退出码与 JSON 输出）与 `http`（`method` POST/PUT/PATCH、`headers`；CodeBuddy Code 未记载 URL 白名单，故不设白名单）。

兼容性细节：

- hooks 以 CodeBuddy Code 工具名为键。DeepSeek Harness 的命名不同（`bash`、`edit`、`read`……），因此桥接做了翻译：`bash`→`Bash`、`pwsh`→`PowerShell`、`read`→`Read`、`write`→`Write`、`edit`→`Edit`、`glob`→`Glob`、`grep`→`Grep`、`web`/`web_search`→`WebSearch`、`ask_user_question`→`AskUserQuestion`、`exit_plan_mode`→`ExitPlanMode`、`subagent`→`Task`、`todo_write`→`TodoWrite`；未映射的 DeepSeek Harness 工具（MCP 服务器、一方扩展）保留原名。matcher、`if` 规则以及 hook 脚本收到的 `tool_name` 字段都是翻译后的名字，因此为 CodeBuddy Code 写好的 hook 脚本原样可用。
- matcher 语义遵循 CodeBuddy Code 规范：`*` / 空 / 缺省匹配全部；其余按区分大小写的正则（裸 `Write` 也能命中 `NotebookWrite`，`^Write$` 精确匹配）。
- 阻塞消息遵循 CodeBuddy Code 的退出码 2 优先级：stdout JSON `reason`/`stopReason` > 纯文本 stdout > stderr 兜底（与 Claude Code 的 stderr 优先相反）。
- `if` 过滤器支持常见的 `ToolName(glob)` 形态，对已映射的工具各对应一个主参数字段（`Bash(git *)`、`Edit(*.ts)`……）；无法解析的规则以及没有映射字段的工具一律放行。
- 超时与 handler 失败一律放行（绝不因此阻断动作），同 CodeBuddy Code。
- 子代理：`UserPromptSubmit`、`Stop`、`SessionStart`、`SessionEnd` 仅对主会话生效，与 CodeBuddy Code 一致；`PreToolUse`/`PostToolUse` 也会在子代理的工具调用上触发（`SubagentStart`/`SubagentStop` 尚未桥接）。

### 二期限制

尚未桥接（按子系统记录）：

- **Skills**：扁平 `.md` 技能、嵌套命令（`group:name` 非 kebab-case）、插件技能；`allowed-tools`、`model`、`context: fork`、`agent`、frontmatter `hooks`；正文内联 Shell 命令执行、`$ARGUMENTS` 替换、`@file` 引用。
- **Memory**：条件规则（`alwaysApply: false` + `paths`）、`@import` 展开、向上递归查找、嵌套子树动态加载、Auto Memory。
- **Hooks**：`prompt` / `agent` handler 类型（需要 LLM 判定）；`Notification`、`SubagentStart`/`SubagentStop`、`PreCompact`/`PostCompact`、`PermissionRequest`/`PermissionDenied`、`Elicitation`、`FileChanged`、`Setup` 等事件；frontmatter hooks（及 `allowUntrustedFrontmatterHooks` 闸门）；插件 `hooks/hooks.json`；`transcript_path` 输入字段（桥接没有真实转录文件）；`suppressOutput` / `systemMessage` 仅面向用户的通道（DeepSeek Harness 无此通道）；`modifiedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）。Windows 上 hook 走系统 shell 而非 CodeBuddy Code 强制的 Git Bash。

## opencode 桥接（三期）

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
- opencode 的 Claude 兼容（`.claude/skills`、`~/.claude/skills`）与 agent 兼容（`.agents/skills`、`~/.agents/skills`）技能根**不重复读取**：`.claude` 资产已由 claude-code 桥接覆盖、`.agents` 资产已由 DeepSeek Harness 自带 filesystem provider 覆盖，重复注册只会产生重复候选。
- 优先级：项目资产覆盖用户资产；技能覆盖同名命令；JSON 配置命令覆盖同级同名命令文件。同名冲突时 DeepSeek Harness 原生技能永远胜出。
- 已存在的资产根目录与 `opencode.json(c)` 文件会被监听；改动无需重启即可生效。

### AGENTS.md / CLAUDE.md 规则与 instructions 记忆

DeepSeek Harness 核心自行加载工作区根 `AGENTS.md` 与 `CLAUDE.md`。本桥接在会话开始时额外注入（system-reminder 框架）：

- `~/.config/opencode/AGENTS.md`（全局规则；缺失时回退 `~/.claude/CLAUDE.md`，与 opencode 一致）
- 从工作目录向上到 git 根最近的一个 `AGENTS.md`，缺失时回退最近的 `CLAUDE.md`（每类先匹配先胜）；cwd 层的 `AGENTS.md`/`CLAUDE.md` 是 DeepSeek Harness 已加载的文件，跳过
- `opencode.json(c)` 的 `instructions` 条目：本地文件路径与 `*`/`**` glob（相对配置文件目录解析；远程 URL 跳过，桥接不做网络抓取）

预算 32 KiB：超限先丢弃全部用户级、再截断最具体的项目级。

### 三期限制

尚未桥接（按子系统记录）：

- **Skills / Commands**：嵌套命令目录（opencode 未记载）、命令模板的 `$ARGUMENTS`/`$1`/`!`command``/`@file` 替换、`agent`/`model`/`subtask` 选项、自定义 agents、按权限过滤技能（`permission.skill` 的 `deny`/`ask` 模式）。
- **Memory**：`OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` / `OPENCODE_CONFIG_CONTENT` 覆盖、远程 / 托管配置层、配置文件向上查找（项目 `opencode.json` 仅在 cwd 读取）、配置里的 `{env:…}`/`{file:…}` 替换。
- **插件 / 权限 / MCP**：opencode 的 JavaScript 插件系统（事件 hook 需要 opencode 运行时）、权限规则、MCP 配置、自定义工具——这些没有文件格式层面的桥接面。
- **重叠提示**：若同时开启 `claudeCode.memory`，`~/.claude/CLAUDE.md` 回退可能被注入两次（每个桥接各一次）；关闭其一或接受重复块。

## Codex 桥接（四期）

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
- 仓库根用 `project_root_markers`（默认 `['.git']`）判定；找不到标记时只检查当前目录，与 Codex 一致。技能根目录与 settings 文件会被监听。

### AGENTS.md 指令链记忆

DeepSeek Harness 核心自行加载工作区根 `AGENTS.md`。本桥接在会话开始时额外注入 Codex 的指令链（system-reminder 框架）：

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

### 四期限制

尚未桥接（按子系统记录）：

- **Skills**：`agents/openai.yaml` 元数据（`allow_implicit_invocation`、工具依赖）、插件分发的技能、curated 插件目录。
- **Memory**：`model_instructions_file`、Codex 的 8,000 字符初始列表预算（DeepSeek Harness 有自己的目录预算）。
- **Hooks**：`PermissionRequest`（DeepSeek Harness 没有"即将请求审批"的接缝）、`PreCompact`/`PostCompact`（无压缩前接缝；`compact` 会话来源会触发 SessionStart hooks 代替）、Codex 的 hook trust 审核流程（`/hooks`——桥接与其他桥接一致、无 trust 闸门运行）、后台 hook 输出在下个安全点投递、`systemMessage`/`suppressOutput` 仅用户通道、`additionalContextLimit` 溢出落盘（桥接按字符截断替代）、插件捆绑与托管 `requirements.toml` hooks、`transcript_path`（桥接没有真实转录文件）、`updatedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）。
- **Rules / 配置**：`rules/*.rules`（实验性 Python DSL）、`notify`、`[agents]` 子代理角色、`requirements.toml`、profile 文件（`--profile`）、未信任项目门禁（项目 `.codex/` 层无条件读取——桥接没有 trust 状态）。
