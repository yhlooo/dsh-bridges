# Codex 桥接

[English](codex.md)

把为 Codex 配置的资产桥接进 DeepSeek Harness：`.agents/` skills、`AGENTS.md`
指令链、`hooks.json` / `config.toml` 的 hooks、审批 / 沙箱策略、
`[mcp_servers]` 条目。安装步骤与各桥接的公共行为见[指南索引](README.zh.md)。

## 配置

桥接在 `bridges` 行下拥有一个配置段，任何后续 patch 层都可以覆盖：

```yaml
- id: bridges
  config:
    codex:
      enabled: true                      # Codex 桥接的总开关
      skills: true                       # 发现 .agents/skills（cwd → 仓库根）、~/.agents/skills、/etc/codex/skills
      memory: true                       # 注入 AGENTS.md 指令链
      hooks: true                        # 运行 hooks.json / config.toml 里的 Codex hooks
      permissions: true                  # 会话开始时应用 approval_policy / sandbox_mode / default_permissions
      mcp: true                          # 桥接 config.toml 的 [mcp_servers] 条目
      userCodexDir: '~/.codex'           # 用户级 Codex 目录（设置 CODEX_HOME 时以它为准）
      userSkillsDir: '~/.agents/skills'  # 用户级 skills 目录
      watch: true                        # 监听技能根目录与 settings 文件
      hookTimeoutMs: 600000              # 对齐 Codex 的 600 秒 hook 默认值
      maxHookOutputChars: 10000
      memoryMaxBytes: 32768
      mcpToolCallTimeoutMs: 120000
```

## Skills

读取 Codex 的技能位置并注册到 DeepSeek Harness 的技能注册表（provider 名 `codex`）：

| Codex 位置 | 注册为 |
| :--- | :--- |
| `$CWD/.agents/skills/<name>/SKILL.md`，以及向上到仓库根的每一层父目录 | 项目级技能（越靠 cwd 越优先） |
| `~/.agents/skills/<name>/SKILL.md` | 用户级技能 |
| `/etc/codex/skills/<name>/SKILL.md` | 系统级技能 |

映射规则：

- DeepSeek Harness 技能名取目录名（必须 kebab-case）。frontmatter 按 agent skills 标准要求 `name`（与目录一致）与 `description`（1,024 字符截断）；不合法的技能丢弃 + 告警。
- 优先级：项目技能（越靠 cwd 越优先）覆盖用户技能，用户覆盖系统。同名冲突时 DeepSeek Harness 原生技能始终胜出（见[公共行为](README.zh.md#公共行为)）。
- `config.toml` 里 `[[skills.config]]`（`path` + `enabled = false`）禁用的技能被跳过；相对路径相对配置文件所在 `.codex/` 目录解析。
- 自定义 `[agents.<name>]` 角色同样成为委派规格技能：角色的 `description` 是技能描述，角色的 `config_file` TOML 内容成为正文，其中的 `model` 键映射到 `agentOptions.model`。
- 仓库根用 `project_root_markers`（默认 `['.git']`）判定；找不到标记时只检查当前目录，与 Codex 一致。技能根目录与 settings 文件会被监听。

## AGENTS.md 指令链记忆

DeepSeek Harness 核心自行加载工作区根 `AGENTS.md`。本桥接在会话开始时额外注入 Codex 的指令链（system-reminder 框架）：

- 最具体配置层的 `developer_instructions`（最先注入，与 Codex 一致）
- `$CODEX_HOME/AGENTS.override.md`（存在时），否则 `$CODEX_HOME/AGENTS.md`（先非空先胜；`CODEX_HOME` 会被遵守）
- 从仓库根向下到工作目录，每目录一个文件：`AGENTS.override.md` > `AGENTS.md` > `project_doc_fallback_filenames`；越靠工作目录越靠后、越优先
- 根目录的普通 `AGENTS.md` 跳过（DeepSeek Harness 已加载）；空文件跳过；项目累计达到 `project_doc_max_bytes`（默认 32 KiB）即停止追加

注入块预算 32 KiB：超限先丢弃全部用户级、再截断最具体的项目级。

## Hooks

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

## Permissions（审批 / 沙箱策略）

合并读取各配置层的 `approval_policy`、`sandbox_mode`、`default_permissions`，并在 `agent/session-start` 应用到每个会话（主会话与子代理会话一致）：

- **`sandbox_mode`**：`read-only` / `workspace-write` / `danger-full-access` 与 DeepSeek Harness 沙箱模式 1:1 映射，经会话的 `sandbox/mode` 覆盖生效。
- **`approval_policy`**：`never` → DeepSeek Harness 审批策略 `never`（自动放行）；`untrusted` / `on-request` / 废弃的 `on-failure` / `granular` → `ask`（这些模式下 Codex 都会弹审批；DeepSeek Harness 的 `ask` 交由已组合的审批应答者）。`granular` 表的逐项开关（`sandbox_approval`/`rules`/`mcp_elicitations`/`request_permissions`/`skill_approval`）仅记录告警、不生效。
- **`default_permissions`**：仅当命名内置档案时生效——`:read-only`、`:workspace`、`:danger-full-access`——且优先于 `sandbox_mode`（档案是 Codex 当前推荐机制）。自定义 `[permissions.<name>]` 档案读取但不应用。
- **只有显式配置的值才生效**：Codex 自身的默认值（read-only 沙箱、`untrusted` 审批）不会覆盖 DeepSeek Harness 部署的策略。

未桥接（记录为限制）：`[sandbox_workspace_write]` 的 `writable_roots` / `network_access` / `exclude_tmpdir_env_var` / `exclude_slash_tmp`（DeepSeek Harness 会话没有逐会话可写根覆盖）、自定义权限档案的文件系统/网络规则表、`approvals_reviewer` / `[auto_review]` guardian 策略（DeepSeek Harness 没有审查子代理审批流）、granular 逐项审批开关。

## MCP 服务器

把 Codex 的 `[mcp_servers.<id>]` 表（来自每个生效配置层；每个 id 以最具体层为准）桥接为 DeepSeek Harness 工具（`mcp__codex__<server>__<tool>`）。`url` 条目映射 streamable-http 传输（`http_headers` + `bearer_token_env_var` 提供的 Bearer 令牌）；`command` 条目映射 stdio（`args`、`env`、从进程环境白名单取值的 `env_vars`、`cwd`）。`enabled = false` 跳过该服务器；启动失败一律放行（告警）。未桥接（记录为限制）：`auth`（oauth/chatgpt 凭据流程）、`scopes`、`enabled_tools`/`disabled_tools` 与逐工具审批模式、`required` 语义（required 服务器启动失败仍仅告警）、Codex 的项目信任门禁（项目 `[mcp_servers]` 无条件连接，由 DeepSeek Harness 工具审批栈把关）。

## 限制

尚未桥接（按子系统记录）：

- **Skills**：`agents/openai.yaml` 元数据（`allow_implicit_invocation`、工具依赖）、插件分发的技能、符号链接的技能目录（桥接经文件系统读取，但不解析符号链接身份）、curated 插件目录。
- **Memory**：`model_instructions_file`（替换内置指令——不在范围内）、Codex 的 8,000 字符初始列表预算（DeepSeek Harness 有自己的目录预算）。
- **Hooks**：`PermissionRequest`（DeepSeek Harness 没有"即将请求审批"的接缝）、`PreCompact`/`PostCompact`（无压缩前接缝；`compact` 会话来源会触发 SessionStart hooks 代替）、Codex 的 hook trust 审核流程（`/hooks`——桥接与其他桥接一致、无 trust 闸门运行）、后台 hook 输出在下个安全点投递、`systemMessage`/`suppressOutput` 仅用户通道、`additionalContextLimit` 溢出落盘（桥接按字符截断替代）、插件捆绑与托管 `requirements.toml` hooks、`transcript_path`（桥接没有真实转录文件）、`updatedInput` 改写（DeepSeek Harness 在策略执行前就冻结了工具参数）。
- **Rules / 配置**：`rules/*.rules`（实验性 Starlark DSL）、`notify`、`[agents.<name>]` 角色在 `description`/`config_file` 之外的选项（逐角色工具过滤、配置文件之外的 `model`、角色的权限闸门）、`requirements.toml`、profile 文件（`--profile`）、插件捆绑的 MCP 服务器（`plugins.<plugin>.mcp_servers`）、未信任项目门禁——仅支持显式 `projects["<path>"].trust_level = "untrusted"` 条目（现在会跳过项目 `.codex/` 层；桥接没有交互式信任流程，未列出的路径仍无条件读取）。
- **其余配置**：`web_search`/`tools.web_search` 模式、`[features].*` 运行时开关（仅 `features.hooks` 被读取）、`[shell_environment_policy]`（仅作用于桥接自 spawn 的子进程——与 settings `env` 同一接缝）、`[apps]` 连接器、`[memories]`、`[history]`、`tool_output_token_limit`、`file_opener`、`[otel]`、`[desktop]`/`[tui]`、认证/通知/日志键——DeepSeek Harness 拥有这些层；模型/供应商选择（`model`、`review_model`、`model_provider`、`[model_providers]`、`model_reasoning_*`、`model_auto_compact_token_limit*`）为 host-plane，不在范围内。

