# Gemini CLI 桥接

[English](gemini-cli.md)

把为 Gemini CLI 配置的资产桥接进 DeepSeek Harness：`.gemini/` 的 skills、
commands 与 subagent 定义、`GEMINI.md` 记忆、`settings.json` 的 hooks 与
`mcpServers`、Policy Engine 规则。安装步骤与各桥接的公共行为见[指南索引](README.zh.md)。

## 配置

桥接在 `bridges` 行下拥有一个配置段，任何后续 patch 层都可以覆盖：

```yaml
- id: bridges
  config:
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
```

## Skills、Commands 与 Subagents

读取 Gemini CLI 的资产位置并注册到 DeepSeek Harness 技能注册表（provider `gemini-cli`），出现在模型可见的技能目录中，可用 `/名称` 触发：

| Gemini CLI 位置 | 注册为 |
| :--- | :--- |
| `~/.gemini/skills/<name>/SKILL.md`（用户）与 `.gemini/skills/<name>/SKILL.md`（工作区） | 技能（目录型，非递归） |
| `~/.gemini/commands/<name>.toml` / `.gemini/commands/<name>.toml`（也支持嵌套 `<group>/<name>.toml`） | 命令（技能；TOML 的 `prompt` 为正文；嵌套：技能名 `group-name`） |
| `~/.gemini/agents/*.md` / `.gemini/agents/*.md` | subagent 定义 → 委派规格技能 |

映射规则：

- 技能名取 frontmatter 的 `name`（缺省回退目录名）；DeepSeek Harness 要求 kebab-case。命令名来自文件路径：嵌套文件在上游是路径分隔符换成 `:` 的命名空间命令（`commands/git/commit.toml` → `/git:commit`），映射为 kebab-case 技能名 `git-commit`——DeepSeek Harness 技能名不允许含 `:`。限定名非 kebab-case 的目录整棵跳过。
- 技能的 `description` 必填（fail closed）；命令的 `description` 可选（缺省取 prompt 首段）。
- 优先级遵循 Gemini 的发现层级（内置 < 扩展 < 用户 < 工作区）：**工作区资产覆盖用户资产**，同级技能优先于同名命令。同名冲突时 DeepSeek Harness 原生技能始终胜出（见[公共行为](README.zh.md#公共行为)）。`.agents/skills` 别名位置有意不重读（DeepSeek Harness 自带 filesystem provider 已覆盖 `.agents` 资产）。
- `skills.disabled` 名单与 `skills.enabled` 总开关来自 settings.json。
- Subagents 复用委派规格模式：`name` / `description` / `tools`（Gemini 工具名翻译为 DeepSeek Harness 名；`*` 与 `mcp_*` 通配丢弃——缺省 `tools` 本就表示全部）/ `model`（→ `agentOptions.model`）/ `max_turns`（→ `maxDepth`）。`kind: remote`（A2A）跳过；`mcpServers`、`temperature`、`timeout_mins` 记限制。
- 已存在的技能根目录与 settings 文件被监听，改动无需重启即生效。

## GEMINI.md 记忆

会话开始时注入 Gemini 上下文文件链（同样的 system-reminder 框架）：

- `~/.gemini/GEMINI.md`（全局）
- 工作区 `GEMINI.md` 及每个父目录的同名文件，直到记忆边界（首个含 `context.memoryBoundaryMarkers` 条目的目录——默认 `[" .git"]`），根在前
- `context.fileName` 自定义文件名（字符串或数组，默认 `GEMINI.md`）；`context.discoveryMaxDirs` 限制向上层数（默认 200）

`@./relative/path.md` 与 `@/absolute/path.md` 导入内联展开（规范路径去重、防循环、缺失导入保留原文行）。Gemini 的 JIT 加载（工具访问目录时才发现的上下文文件）无对应 DeepSeek Harness 接缝，记限制。预算 32 KiB：先丢更宽的全局文件，再截断最具体的段。

## Hooks

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

## Permissions（Policy Engine）

把 `~/.gemini/policies/*.toml` 的**用户层**策略规则桥接到 `tools/pre-execute` 权限接缝（工作区层上游已禁用，issue #18186，故同样不读；管理员层与内置默认策略位于 Gemini 安装内、不在范围内——由 DeepSeek Harness 自身的审批策略补位）：

- `[[rule]]` 条目：`toolName`（`*` / `mcp_*` 等通配，字符串或数组）、`subagent`、`mcpName`、`argsPattern`（JSON 对象子集 + 深比较）、`commandPrefix` / `commandRegex`（仅 run_shell_command）、`decision`（`allow` / `deny` / `ask_user`）、`priority`（0–999）、`denyMessage`。
- 求值遵循 Gemini：`final = 4（用户层）+ priority/1000`；按优先级从高到低、**首个完全命中者定夺**。工具名先翻译；subagent 委派按代理名匹配规则（`toolName` 或 `subagent` 字段与委派 label 比较）。
- `ask_user` 映射到 DeepSeek Harness 审批通道（`ask`），与其他桥接一致；`deny` 用 `denyMessage` 作为原因。
- hooks 与规则组合：BeforeTool hook `deny` 直接拒绝；hook `allow` 不能覆盖命中的 deny 规则；hook 无决策时规则定夺。
- 已记限制：`modes` 门控规则不生效（DeepSeek Harness 无上游审批模式状态）、`interactive: true` 规则不生效（无头会话）、`toolAnnotations` 永远无法命中（无注解接缝）、`allowRedirection` 不处理。

## MCP 服务器

把 Gemini settings.json 的 `mcpServers` 桥接为 DeepSeek Harness 工具（`mcp__gemini__<server>__<tool>`）。每条目的传输按 `httpUrl`（streamable-http）> `url`（SSE，降级 streamable-http 并告警）> `command`（stdio，含 `args` / `env` / `cwd`）；`${VAR}` / `${VAR:-DEFAULT}` 引用从进程环境展开，相对 `cwd` 按声明 settings 文件所在目录解析。`mcp.allowed` 过滤连接集合、`mcp.excluded` 一律跳过；启动失败放行。未桥接（记限制）：`includeTools` / `excludeTools`（无逐工具过滤接缝）、`trust` 门禁（读取但不执行——DeepSeek Harness 工具审批栈把关）、OAuth（`targetAudience` / `targetServiceAccount`）、管理员层管控。

## 限制

尚未桥接（按子系统记录）：

- **Skills**：嵌套技能目录、内置与扩展技能（位于 Gemini 安装内）、`/skills` 启停手势属运行时状态；`scripts`/`references`/`assets` 支持文件经 resource base 正常工作。
- **Commands**：`dir:name` 命名空间命令（非 kebab-case）、`!{...}` shell 执行与 `@{...}` 文件注入标记（正文原样透传、不执行）、`{{args}}` 替换由 DeepSeek Harness 自身的 `/名称 <参数>` 追加行为承担。
- **Memory**：JIT 上下文加载、Memory 工具的逐项目私有记忆目录与 auto-memory（实验性）、`.env` 加载。
- **Hooks**：`BeforeModel` / `AfterModel` / `BeforeToolSelection` / `PreCompress` / `Notification`；AfterAgent 的 `prompt` / `prompt_response` 为空（DeepSeek Harness 在 turn-stopping 不暴露最终回复文本）；`tool_input` 改写、`tailToolCallRequest`、`continue: false`（无停摆接缝）、`transcript_path`（无转录文件）、`suppressOutput`。
- **Permissions**：工作区/管理员/内置层、`modes` / `interactive` / `toolAnnotations` / `allowRedirection` 语义（见上）。
- **Subagents**：`kind: remote`（A2A）、内联 `mcpServers`、`temperature`、`timeout_mins`、`@name` 强制委派（改为技能指示模型委派）。
- **MCP**：见上文 MCP 小节。
- **其他**：extensions（打包的 commands/hooks/skills/agents/MCP/policies/themes）、themes、output 格式、sandbox 与 trusted-folders、browser agent、notifications、settings `env` 对模型侧 shell 的注入（仅桥接自 spawn 的子进程）——DeepSeek Harness 拥有这些层；模型路由（`model`、`GEMINI_MODEL`）为 host-plane，不在范围内。
