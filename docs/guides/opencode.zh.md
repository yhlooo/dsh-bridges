# OpenCode 桥接

[English](opencode.md)

把为 OpenCode 配置的资产桥接进 DeepSeek Harness：`.opencode/` 的 skills 与
commands（含 `command.*` JSON 命令）、`AGENTS.md` 规则与 `instructions` 记忆、
`opencode.json(c)` 的权限规则、MCP 服务器。OpenCode 没有 hooks 配置；其插件
API 不在范围内。安装步骤与各桥接的公共行为见[指南索引](README.zh.md)。

## 配置

桥接在 `bridges` 行下拥有一个配置段，任何后续 patch 层都可以覆盖：

```yaml
- id: bridges
  config:
    opencode:
      enabled: true                     # OpenCode 桥接的总开关
      skills: true                      # 发现 .opencode / ~/.config/opencode 的 skills 与 commands（含 JSON 命令）
      memory: true                      # 注入 AGENTS.md 规则（含 CLAUDE.md 回退）与 instructions 文件
      permissions: true                 # 执行 opencode.json(c) 里的 permission 规则
      mcp: true                          # 桥接 opencode.json(c) 的 mcp 服务器
      userOpencodeDir: '~/.config/opencode'  # 用户级 OpenCode 目录
      userClaudeDir: '~/.claude'        # CLAUDE.md 回退所用的用户级 Claude Code 目录
      claudeCompat: true                # 是否启用 OpenCode 的 Claude Code 兼容回退
      watch: true                       # 监听资产根目录与配置文件
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Skills 与 Commands

读取 OpenCode 的资产位置并注册到 DeepSeek Harness 的技能注册表（provider 名 `opencode`）：

| OpenCode 位置 | 注册为 |
| :--- | :--- |
| `.opencode/skills/<name>/SKILL.md` | 项目级技能 |
| `.opencode/commands/<name>.md` | 项目级命令（即技能） |
| `opencode.json(c)` 里的 `command.<name>` | 项目级命令（覆盖同名命令文件） |
| `~/.config/opencode/skills/<name>/SKILL.md` | 用户级技能 |
| `~/.config/opencode/commands/<name>.md` | 用户级命令（即技能） |
| `~/.config/opencode/opencode.json(c)` 里的 `command.<name>` | 用户级命令（覆盖同名命令文件） |

映射规则：

- DeepSeek Harness 技能名取目录名 / 文件名，且必须是合法的 OpenCode 名（`^[a-z0-9]+(-[a-z0-9]+)*$`，小写字母数字 + 单连字符）；不合法则跳过 + 告警。
- 技能 frontmatter 按 OpenCode 校验：`name`（必须与目录名一致）与 `description`（1–1,024 字符，超出截断）为必填；缺失或 name 不匹配即丢弃 + 告警，与 OpenCode 的排查规则一致。`metadata`（字符串到字符串）透传；`license`/`compatibility` 忽略。
- 命令正文即提示词模板；frontmatter `description`（缺省回退正文首段）作为技能描述。`agent`、`model`、`subtask` 不桥接（DeepSeek Harness 没有按命令路由 agent 的机制）。
- `.opencode/skills` 会**向上**发现：从工作目录走到 git 根（越靠 cwd 越优先，与 OpenCode 的向上查找一致）；`opencode.json(c)` 的 `skills.paths` 增加额外技能根（相对配置文件解析；`skills.urls` 需要网络，跳过并记限制）。
- OpenCode 的 Claude 兼容（`.claude/skills`、`~/.claude/skills`）与 agent 兼容（`.agents/skills`、`~/.agents/skills`）技能根**不重复读取**：`.claude` 资产已由 claude-code 桥接覆盖、`.agents` 资产已由 DeepSeek Harness 自带 filesystem provider 覆盖，重复注册只会产生重复候选。
- 优先级：项目资产覆盖用户资产；技能覆盖同名命令；JSON 配置命令覆盖同级同名命令文件。同名冲突时 DeepSeek Harness 原生技能始终胜出（见[公共行为](README.zh.md#公共行为)）。
- 自定义 `agent.<id>` 定义（`subagent` / `all` 模式）成为委派规格技能：`description` 是技能描述，`prompt`（内联字符串或 `{ file: ... }`）成为系统提示正文，`model` 映射到 `agentOptions.model`。`mode: "primary"` 代理是主助手，不桥接。
- 已存在的资产根目录与 `opencode.json(c)` 文件会被监听；改动无需重启即可生效。

## AGENTS.md / CLAUDE.md 规则与 instructions 记忆

DeepSeek Harness 核心自行加载工作区根 `AGENTS.md` 与 `CLAUDE.md`。本桥接在会话开始时额外注入（system-reminder 框架）：

- `~/.config/opencode/AGENTS.md`（全局规则；缺失时回退 `~/.claude/CLAUDE.md`，与 OpenCode 一致）
- 从工作目录向上到 git 根最近的一个 `AGENTS.md`，缺失时回退最近的 `CLAUDE.md`（每类先匹配先胜）；cwd 层的 `AGENTS.md`/`CLAUDE.md` 是 DeepSeek Harness 已加载的文件，跳过
- `opencode.json(c)` 的 `instructions` 条目：本地文件路径与 `*`/`**` glob（相对配置文件目录解析；远程 URL 跳过，桥接不做网络抓取）
- `opencode.json(c)` 的本地 `references`：`@alias` → 解析后的绝对路径 + 描述，按 OpenCode 在 agent 上下文里公示引用的方式注入；git `repository` 引用需要克隆，跳过 + 告警（同样的不抓取策略）

预算 32 KiB：超限先丢弃全部用户级、再截断最具体的项目级。

## Permissions（权限规则）

读取 `opencode.json(c)` 的 `permission` 字段（全局 + 项目层；每个家族以定义它的最具体层为准）并在 `tools/pre-execute` 接缝执行，语义与 OpenCode 一致：

- 语法：裸字符串（`permission: "allow" | "ask" | "deny"`）或按家族分组的对象——`*`（默认）、`read`、`edit`（覆盖 `edit`/`write`）、`glob`、`grep`、`bash`、`task`、`skill`、`question`、`websearch`、`external_directory`，另有 `lsp`/`doom_loop`（见限制）。每个家族要么是一个动作，要么是有序的 `pattern → action` 规则，**最后一条命中的规则胜出**（与 OpenCode 文档一致：`"*"` 放前面、具体规则放后面）。
- 通配符为 OpenCode 语义（`*` 任意字符、`?` 单字符）；模式开头支持 `~`/`$HOME` 展开；工作区相对模式按相对工作目录的路径匹配。
- 配置了 `permission` 时内置默认生效：多数家族 allow、`external_directory` ask、read 拒绝 `.env` / `.env.*`（`.env.example` 除外）——即上游默认。
- DeepSeek Harness 工具映射：`read`→read、`edit`/`write`→edit、`glob`→glob、`grep`→grep、`bash`→bash、`subagent`→task（仅家族级；子代理类型模式没有对应字段）、`skill`→skill（匹配技能名）、`ask_user_question`→question、`web`/`web_search`→websearch（匹配查询词）。没有 OpenCode 家族的工具（`todo_write`、`pwsh`、`exit_plan_mode`、MCP 工具等）一律交还 DeepSeek Harness 自身的审批策略。
- `external_directory` 在 read/edit/write 的路径落在工作目录之外时触发，默认 ask，与 OpenCode 一致。
- **没有**配置层定义 `permission` 时，桥接完全让位，DeepSeek Harness 自身策略不变；定义了之后，已映射家族中未命中规则的调用按 OpenCode 的宽松默认解析——上游姿态原样带过来（allow 免审批、ask 弹审批、deny 拒绝）；未映射工具一律交还 DeepSeek Harness 审批。

未桥接（记录为限制）：`doom_loop`（重复调用检测无接缝）、`webfetch`（无 URL 抓取工具）、`lsp`（无 LSP 工具）、已废弃的 `tools` 布尔配置、按 agent 的权限覆盖（`agent.<name>.permission`——DeepSeek Harness 会话没有 OpenCode agent 身份）。

## MCP 服务器

把 OpenCode 的 `mcp` 配置（`opencode.json(c)`，项目按名覆盖全局）桥接为 DeepSeek Harness 工具（`mcp__opencode__<server>__<tool>`）。`type: "local"` 条目把 `command`（数组：可执行文件 + 参数，OpenCode 格式）与 `environment` 映射到 stdio 传输；`type: "remote"` 条目把 `url`（+ 可选 `headers`）映射到 streamable-http。`enabled: false` 跳过该服务器；启动失败一律放行。远程服务器的 OAuth 凭据流程没有 DeepSeek Harness 接缝，记录为限制。

## 限制

尚未桥接（按子系统记录）：

- **Skills / Commands**：嵌套命令目录（OpenCode 未记载）、命令模板的 `$ARGUMENTS`/`$1`/`!`command``/`@file` 替换、`agent`/`model`/`subtask` 选项、`agent.<id>` 的 `mode: "primary"` 代理与逐 agent `permission`/`temperature` 覆盖（subagent 模式代理已桥接为委派规格技能）、`skills.urls`（网络）、`references` 的 git 仓库（网络）。
- **Memory**：`OPENCODE_CONFIG` / `OPENCODE_CONFIG_DIR` / `OPENCODE_CONFIG_CONTENT` 覆盖、远程 / 托管配置层、配置文件向上查找（项目 `opencode.json` 仅在 cwd 读取；`.opencode/skills` 的向上发现已桥接）、配置里的 `{env:…}`/`{file:…}` 替换。
- **插件 / 自定义工具**：OpenCode 的 JavaScript 插件系统（事件 hook 需要 OpenCode 运行时）与自定义工具没有文件格式层面的桥接面。
- **运行时 / 模型配置**：`formatter`、`lsp`、`experimental.*`（含已文档化的 `policies`）、自定义 `provider` 定义、`model`/`small_model` 默认——DeepSeek Harness 拥有模型路由、格式化与诊断，这些不在范围内（无文件格式桥接面）。
- **CLI / UI**：`share`/`autoshare`/`username`/`logLevel`/`layout`/`tool_output`/`enterprise`/`server`/`shell`/`watcher`/`snapshot`/`compaction`/`attachment.image`/`autoupdate`/provider 开关/`default_agent`/`subagent_depth`、`.opencode/themes/`、`tui.json`/`OPENCODE_TUI_CONFIG`、`keybinds`、`.opencode/modes/`——装饰性或运行时关注点，无 DeepSeek Harness 对应物。
- **重叠提示**：若同时开启 `claudeCode.memory`，`~/.claude/CLAUDE.md` 回退可能被注入两次（每个桥接各一次）；关闭其一或接受重复块。

