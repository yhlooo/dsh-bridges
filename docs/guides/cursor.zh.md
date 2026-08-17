# Cursor 桥接

[English](cursor.md)

把为 Cursor 配置的资产桥接进 DeepSeek Harness：`.cursor/` 的 skills 与
subagent 定义、始终应用规则记忆、`hooks.json` 的 hooks、CLI 权限规则、MCP
服务器。安装步骤与各桥接的公共行为见[指南索引](README.zh.md)。

## 配置

桥接在 `bridges` 行下拥有一个配置段，任何后续 patch 层都可以覆盖：

```yaml
- id: bridges
  config:
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

## Skills 与 Subagents

读取 Cursor 的技能位置并注册到 DeepSeek Harness 技能注册表（provider `cursor`），出现在模型可见的技能目录中，可用 `/名称` 触发：

| Cursor 位置 | 注册为 |
| :--- | :--- |
| `~/.cursor/skills/**/SKILL.md`（用户）与 `.cursor/skills/**/SKILL.md`（项目） | 技能（递归发现；技能身份 = 含 `SKILL.md` 的文件夹） |
| `~/.cursor/agents/*.md` / `.cursor/agents/*.md` | subagent 定义 → 委派规格技能 |

映射规则：

- 技能名取 frontmatter 的 `name`（缺省回退文件夹名）；`description` 必填（fail closed）。DeepSeek Harness 要求 kebab-case。
- `disable-model-invocation: true` → 技能离开模型目录但仍可 `/名称` 触发；`user-invocable: false` → 仅模型可调用、对人类隐藏；`metadata` 透传。`paths` / 旧 `globs` 路径作用域与嵌套目录自动作用域记限制。
- 优先级：**项目资产覆盖用户资产**（Cursor 对 subagents 明示项目 > 用户）；同级技能优先于同名 agent。同名冲突时 DeepSeek Harness 原生技能始终胜出（见[公共行为](README.zh.md#公共行为)）。兼容根（`.agents/skills`、`.claude/skills`、`.codex/skills`）有意不重读——filesystem provider 与其他桥接已覆盖。
- Subagents 复用委派规格模式（`name` / `description` / `model` → `agentOptions.model`）；`readonly` 与 `is_background` 记限制。

## Rules 记忆

会话开始时注入 Cursor 的持久指令（同样的 system-reminder 框架）：

- `.cursor/rules/**/*.mdc` 中所有 `alwaysApply: true` 的文件（rules 目录以仓库根为锚）
- 仓库根（不含）到工作目录（含）之间的子目录 `AGENTS.md`

相关性规则（无 `alwaysApply`）、globs 条件规则、`.cursor/rules` 下的 `.md` 文件（上游因无 frontmatter 忽略）、用户规则（Cursor 设置而非文件）、根 `CLAUDE.md`（已由 claude-code 桥接注入）记限制。预算 32 KiB，超出时带标记截断。

## Hooks

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

- hooks 以 Cursor 工具名为键，桥接做翻译：`bash`/`pwsh`→`Shell`、`read`→`Read`、`write`→`Write`、`edit`→`Edit`、`glob`→`Glob`、`grep`→`Grep`、`web`→`WebFetch`、`web_search`→`WebSearch`、`ask_user_question`→`AskUserQuestion`、`exit_plan_mode`→`ExitPlanMode`、`subagent`→`Task`、`todo_write`→`TodoWrite`；MCP 工具保留原名。matcher 与 `tool_name` 载荷用翻译后的名字。
- matcher 语义：非锚定正则作用于事件对应字段（工具名用 `Shell|Read|Write`、命令文本用 `curl|wget` 包含匹配）；`*` / 空匹配全部；不可解析的模式永不匹配。
- 退出码遵循 Cursor：`0` 使用 JSON 输出、`2` 阻断（≡ `permission: "deny"`）、其余放行——除非 handler 设了 `failClosed: true`（崩溃/超时/非法 JSON 转为阻断）。超时按 handler 配置（秒，默认 30）。
- 相对命令路径按 hook 来源目录解析：项目 hooks 从项目根运行，用户 hooks 从 `~/.cursor`（用户配置目录）运行。handler 级 `matcher` 把该 handler 限定到其匹配的字段值。
- 未桥接：prompt 型 hooks（需要 LLM）、`preCompact`、`afterAgentThought`、`workspaceOpen`、Tab hooks（IDE 专属）。

## Permissions

在 `tools/pre-execute` 接缝执行 `~/.cursor/cli-config.json` → `.cursor/cli.json` 的 CLI 权限令牌（`permissions.allow` / `permissions.deny`；最具体层整体替换该列表——Cursor 官方文档未说明全局与项目列表的合并方式，此处替换是桥接记录在案的解读）：

- `Shell(commandBase)` — 对命令首词做 glob，另有 `command:args`（args 部分对命令行其余部分做 glob）
- `Read(pathOrGlob)` / `Write(pathOrGlob)` — 对文件路径做 `**` / `*` / `?` glob；一类令牌绝不匹配另一类工具
- `WebFetch(domainOrPattern)` — 精确主机名或 `*.domain` 子域名后缀
- `Mcp(server:tool)` — 对运行时 `mcp__cursor__<server>__<tool>` 名逐段 glob（桥接命名空间被剥除，规则按 Cursor 的 `mcp__<server>__<tool>` 写法即可命中）

**deny 优先于 allow**；没有 ask 层级，未命中的调用落到 DeepSeek Harness 自身的审批策略。hook 决策先组合（hook deny 直接拒绝；hook allow 不能覆盖命中的 deny 规则）。已记限制：`approvalMode` 读取但不执行（DeepSeek Harness 拥有其审批模式）；`permissions.json`（`mcpAllowlist` / `terminalAllowlist` / `autoRun`）调的是 Cursor 自身的提示流，读取但不执行。

## MCP 服务器

把 `.cursor/mcp.json` 与 `~/.cursor/mcp.json` 的 `mcpServers` 桥接为 DeepSeek Harness 工具（`mcp__cursor__<server>__<tool>`；项目按名覆盖用户）。stdio 条目（`command` / `args` / `env` / `envFile`）以 Cursor 的配置变量插值启动（`${env:VAR}`、`${userHome}`、`${workspaceFolder}`、`${workspaceFolderBasename}`、`${pathSeparator}`、`${/}`）；远程 `url` 条目经 streamable-http 连接并插值 headers。`auth` OAuth 流程记限制。

## 限制

尚未桥接（按子系统记录）：

- **Skills**：`paths` / 旧 `globs` 路径作用域、嵌套目录自动作用域、插件提供的技能。
- **Memory**：相关性与 globs 条件规则、用户规则（Cursor 设置）、根 `CLAUDE.md`（claude-code 桥接已覆盖）、`.cursorrules`（旧版）。
- **Hooks**：prompt 型 hooks、`preCompact`、`afterAgentThought`、`workspaceOpen`、Tab hooks、企业/团队 hook 层、`updated_input` / `updated_mcp_tool_output` 改写、`sessionStart` 的 `env`（逐会话环境无接缝）。
- **Permissions**：`approvalMode`、`permissions.json` 语义、sandbox.json（网络策略/额外路径无逐会话接缝）。
- **MCP**：`auth` 凭据流程。
- **其他**：`~/.cursor/settings.json`（IDE 设置；仅 `enabled_plugins` 到达 CLI）、themes——DeepSeek Harness 拥有这些层；模型路由为 host-plane，不在范围内。Cursor 的第三方 Claude Code hooks 兼容层（Cursor 自行读取 `.claude/settings*.json` hooks 并翻译事件/工具名）不重读——claude-code 桥接以 Claude 语义覆盖原始文件。`.cursorignore` / `.cursorindexingignore`（DeepSeek Harness 拥有自己的忽略层）、`worktrees.json`（工作树 setup 脚本）、ACP 服务端模式（`agent acp`）同样不在范围内。
