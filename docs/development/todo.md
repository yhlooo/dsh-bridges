# 待办与特性补全计划（todo）

本文件是 dsh-bridges 的**待办清单与特性补全计划**。所有"需要做但不立即做"的工作都
记录在这里；新增桥接或审计中发现的遗留事项也追加到这里。条目按优先级分组，实施时
自上而下取。

> 来源：2026-08-15 的四工具桥接完备性审计（对照 `docs/reference/` 与当日线上源头
> 文档逐字节比对，零文档漂移）。审计结论按"未实现且未记录 / 已列限制未实现 /
> 文档修正"三类归纳如下。

## 使用约定

- 条目一律 `- [ ]` 开头；完成后勾选并在条目后注明 commit 与日期。
- 新增"要做但不立刻做"的事：追加到对应优先级分组，注明来源与理由。
- 每条写明：目标工具、资产/配置键、映射方向或"记限制"结论；含糊不清时优先补充
  调研任务而非直接实现。
- 依赖 dsh 核心支持的条目标注「**需核心支持**」，同时记录降级方案；上游 issue /
  讨论链接贴在条目内。
- 文档改动（guides 中英两版、根 README 两版、reference 副本）与代码实现同步进行，
  遵守 AGENTS.md 的文档约定。

## 先决调研（阻塞映射设计的 dsh 接缝问题）

以下问题先于对应 P0/P1 项决策，产出一份"接缝决策记录"写回本文档：

- [x] **MCP 接缝** → 决策：方案 B（见下"接缝决策记录"§1）。2026-08-15，commit 待补。
- [x] **subagent 定义接缝** → 决策：方案 B（见下"接缝决策记录"§2）。2026-08-15，commit 待补。
- [x] **会话 shell env 接缝** → 决策：部分可行（见下"接缝决策记录"§3）。2026-08-15，commit 待补。
- [x] **共享规则引擎** → 决策：新建 `src/permissions/` 共享模块（见下"接缝决策记录"§4）。2026-08-15，commit 待补。

### 接缝决策记录（2026-08-15，基于 dsh 安装包实测）

1. **MCP**：`@deepseek-ai/dsh-mcp-client` 是可按实例动态加载的 cordis 插件
   （`inject: ['tools']`，`ctx.tools.register` 注册 `mcp__<serverName>__<tool>`
   工具，disposal 自动断开并注销）。cordis 的 `ctx.plugin(plugin, config)`
   支持运行时实例化、随 fiber teardown。→ **方案 B 可行**：各桥接子系统解析
   上游 MCP 配置（`.mcp.json`/`~/.claude.json`/`[mcp_servers]`/opencode `mcp`），
   为每个服务器 `ctx.plugin()` 一个 mcp-client 实例。注意事项：`serverName`
   需按工具前缀保证全局唯一（如 `claude__github`）；插件需把 `tools` 加入
   `inject`；config 文件纳入现有 watcher。方案 A（dsh 核心文件型 MCP
   provider）留作后续上游提案。
2. **subagent 定义**：`ctx.subagents` 只有执行后端 provider 注册，**没有命名
   定义注册表**；但模型侧 `subagent` 工具参数全部内联且丰富：`label`、
   `persona`、`toolFilter: { allow, deny }`、`agentOptions: { provider, model,
   maxTokens }`、`maxDepth`。→ **方案 B（技能载体 + 委派规格）**：
   `.claude/agents` / `.codebuddy/agents` 每个文件注册为技能（frontmatter
   name/description → 技能元数据；正文 = 上游系统提示 + 委派指令块，把
   `tools` → `toolFilter.allow`（经工具名翻译表）、`model` →
   `agentOptions.model`、`maxTurns` → `maxDepth` 写入指令）；其余 frontmatter
   （permissionMode/background/skills/mcpServers/hooks/memory/isolation/color/
   effort）记限制。方案 A（核心命名定义目录）留作上游提案。
3. **shell env**：`ctx.shellEnv` 注册表只接受 `DSH_*` 前缀变量；
   `ShellExecRequest.env` 只供**插件自 spawn 的子进程**（hooks 桥已用它注入
   `CLAUDE_PROJECT_DIR`）；模型侧 bash 工具不暴露 env 参数。→ 决策：settings
   `env` 应用于 ① hook 子进程（claude/codex 扩展、codebuddy 已有）② 桥接自
   spawn 的 MCP 服务器子进程；模型 bash 调用无法注入 → 记限制 +
   核心支持候选（P1 项相应标注）。
4. **共享规则引擎**：新建 `src/permissions/`：规则语法解析（claude/codebuddy/
   opencode 三种语法 + codex 的 approval_policy 映射）、工具名翻译复用现有
   `hooks/names.ts` 映射表（提炼为共享），决策在 `tools/pre-execute` 与 hooks
   的 permissionDecision 协同（hooks 优先，与上游一致，实施时对照各工具
   hooks 文档确认）。**已落地**：`src/permissions/`（types/glob/fields/parse/
   engine）+ claude-code 集成（含 `composePreToolDecision` 组合决策），
   2026-08-15。

## P0 · 迁移阻断项

未实现且指南从未提及；缺失会静默丢失工具、子代理或安全约束，直接破坏"无缝迁移"。

### P0.1 MCP 服务器配置（四工具全缺）

- [x] **claude-code**：项目 `.mcp.json` + 用户/本地 `~/.claude.json` 的 `mcpServers`；
  settings 键 `enableAllProjectMcpServers` / `enabledMcpjsonServers` /
  `disabledMcpjsonServers`（项目 MCP 审批策略）。
  **已实现**（2026-08-15，方案 B）：`src/agents/claude-code/mcp.ts` 解析两个
  配置文件（项目同名覆盖用户、`${VAR}` 环境展开、stdio/http/sse →
  stdio/streamable-http），逐服务器 `ctx.plugin` 动态实例化 dsh-mcp-client
  （工具 `mcp__claude__<server>__<tool>`、fiber disposal 断开注销）；按工作区
  对齐 + chokidar 监听重对齐；项目服务器审批语义（未审批跳过 + 告警，
  `disabledMcpjsonServers` 跳过）。`managed-mcp.json`/`local` 作用域/插件
  MCP/`sdk` 条目记限制。示例与中英文档已同步。
- [x] **codebuddy-code**：项目 `.mcp.json`（旧 `mcp.json`）、用户
  `~/.codebuddy/.mcp.json`（旧 `~/.codebuddy/mcp.json`、`~/.codebuddy.json`）；
  settings 键 `enableAllProjectMcpServers` / `enabledMcpjsonServers` /
  `disabledMcpjsonServers` / `strictMcpConfig`。
  **已实现**（2026-08-15）：共享 `src/mcp-bridge.ts` 提炼（McpManager +
  readJsonServerFiles + normalizeClaudeStyleEntry），codebuddy 包装
  （`codebuddy__` 前缀、审批语义同 claude）；`strictMcpConfig` 仅针对
  agent frontmatter MCP，记限制。
- [x] **codex**：`[mcp_servers.<id>]` 全套键——`command`/`args`/`env`/`env_vars`/
  `cwd`/`url`/`auth`/`bearer_token_env_var`/`http_headers`/`enabled`/`required`/
  `startup_timeout_sec`/`tool_timeout_sec`/`enabled_tools`/`disabled_tools`/
  `default_tools_approval_mode`/`tools.<tool>.approval_mode`/`scopes`。
  **已实现**（2026-08-15）：settings 解析 `[mcp_servers.<id>]` 各层表
  （最具体层定义 id）；`src/agents/codex/mcp.ts` 归一（url→streamable-http
  + http_headers + bearer_token_env_var；command→stdio + env + env_vars
  白名单；`enabled=false` 跳过）。`auth`/`scopes`/`enabled_tools` 等与
  `required` 语义记限制（无逐工具过滤与凭据流程接缝）。
- [x] **opencode**：`opencode.json` 的 `mcp` 段（local / remote / OAuth）。
  **已实现**（2026-08-15）：settings 解析 `mcp` 对象（项目按名覆盖全局）；
  `src/agents/opencode/mcp.ts` 归一（`type:local` 的 command 数组 +
  environment → stdio；`type:remote` 的 url + headers → streamable-http；
  `enabled=false` 跳过）。远程 OAuth 凭据流程记限制。
- [ ] **插件贡献的 MCP**（claude 插件、codebuddy 插件、codex
  `plugins.<plugin>.mcp_servers.*`）：依赖插件桥接，先按 P1-插件项补文档，实施排后。

### P0.2 权限 / 审批规则（安全姿态静默改变）

- [x] **claude-code**：settings `permissions`——`allow`/`deny`/`ask` 规则
  （`Bash(...)`/`Edit(...)` 参数匹配）、`defaultMode`、`additionalDirectories`、
  `disableBypassPermissionsMode`。映射：规则引擎 → `tools/pre-execute`
  （与 hooks 的 permissionDecision 同接缝），工具名翻译复用现有表。
  **已实现**（2026-08-15）：`src/permissions/`（types/glob/fields/parse/engine）
  + `src/agents/claude-code/permissions.ts`；hooks 桥内 `composePreToolDecision`
  组合（deny 规则恒胜、ask 规则压过 hook allow，与上游 hooks 契约一致）；
  `defaultMode`/`disableBypassPermissionsMode` 读取不执行、项目 allow 规则无
  信任门禁（均记限制）；示例与中英文档已同步。
- [x] **codebuddy-code**：settings `permissions.allow/ask/deny`（规则语法含
  `WebFetch(domain:)`、`mcp__…`、`Agent(…)`、`Skill(…)`）、`permissions.defaultMode`
  （default/acceptEdits/auto/dontAsk/plan/bypassPermissions）、
  `disableBypassPermissionsMode` / `disableAutoMode` / `subagentPermissionMode`；
  `autoMode`（NL 分类器）无 dsh 等价物，单独评估（可忽略并记限制）。
  **已实现**（2026-08-15）：共享引擎增加 `codebuddy` 方言（Bash 精确/`:*`
  前缀/glob + 复合命令拆分与 allow 全命中语义 + 重定向精确匹配、文件规则
  大小写不敏感 + 裸文件名任意深度、MCP 名称归一与 `mcp__*` 仅 deny/ask、
  `Skill(name)` 精确匹配；`Agent(name)` 无对应字段记限制）；共享
  `composePreToolDecision` 提炼到 `src/permissions/compose.ts`（claude 桥改为
  复用）；`defaultMode`/bypass/autoMode 开关读取不执行、内置受保护路径不
  复制、项目 allow 无信任分层（均记限制）。示例与中英文档已同步。
- [x] **codex**：`approval_policy`（含 `granular` 细分）→ dsh 审批策略；
  `sandbox_mode` + `[sandbox_workspace_write]`（`writable_roots`/`network_access`/
  `exclude_tmpdir_env_var`/`exclude_slash_tmp`）→ dsh 沙箱模式（两者几乎 1:1）；
  `default_permissions` + `[permissions.<name>]` 档案 → dsh 沙箱/审批预设。
  **已实现**（2026-08-15）：`src/agents/codex/permissions.ts` 在
  `agent/session-start` 经 `setSandboxMode`/`setApprovalPolicy` 写入会话覆盖
  （`sandbox_mode` 1:1；`never` → `never`，其余 → `ask`；内置
  `default_permissions` 档案优先于 `sandbox_mode`）；`on-failure` 废弃别名 →
  `on-request`。granular 逐项开关、`[sandbox_workspace_write]` 可写根/网络、
  自定义权限档案读取不执行（均记限制，dsh 无逐会话可写根接缝）。示例与
  中英文档已同步；新增依赖 `dsh-sandbox-policy`/`dsh-user-approval`
  （dependencies）+ `dsh-sandbox`（devDependencies，仅类型）。
- [x] **opencode**：`permission` 规则（已有"列为限制"文档，复用同一规则引擎实现）。
  **已实现**（2026-08-15）：opencode 语义独立于 claude/codebuddy 的
  `Tool(specifier)` 语法（家族分组 + 有序 pattern→action、**末条命中**、
  `~`/`$HOME` 展开、工作区相对路径、`external_directory` 守卫、内置
  `.env` 读取保护与宽松默认），实现于 `src/agents/opencode/permissions.ts`
  （共享 glob 复用）；无配置层定义 `permission` 时完全让位。`doom_loop`/
  `webfetch`/`lsp`/废弃 `tools` 布尔/按 agent 覆盖记限制。示例与中英文档
  已同步。

### P0.3 自定义 subagent 定义（团队定义整体丢失）

- [x] **claude-code**：`.claude/agents/*.md` + `~/.claude/agents/*.md`
  （frontmatter：`name`/`description`/`tools`/`disallowedTools`/`model`/
  `permissionMode`/`maxTurns`/`skills`/`mcpServers`/`hooks`/`memory`/`background`/
  `effort`/`isolation`/`color`/`initialPrompt`）；附 `.claude/agent-memory/`、
  `.claude/agent-memory-local/`、`~/.claude/agent-memory/` 持久记忆。
  **已实现**（2026-08-15，方案 B 技能载体 + 委派规格）：共享
  `src/agent-definitions.ts`（frontmatter 解析 fail-closed、工具名反向翻译、
  委派规格正文：label/persona/toolFilter.allow+deny/agentOptions.model/
  maxDepth）；claude provider 新增 user-agents(107)/project-agents(117) 根、
  `agents` 配置开关。`permissionMode`/`skills`/`mcpServers`/`hooks`/`memory`/
  `background`/`effort`/`isolation`/`color`/`initialPrompt` 与
  `agent-memory*` 目录记限制；方案 A（核心命名注册表）列上游提案。
- [x] **codebuddy-code**：`.codebuddy/agents/*.md` + `~/.codebuddy/agents/*.md`
  （同名 frontmatter 集合）。**已实现**（2026-08-15，同 claude；rank
  project-agents(132) < user-agents(137)，项目覆盖用户）。
- [ ] **codex** `[agents]` 角色、**opencode** `agent` 自定义代理：均已列限制，
  实施时复用同一映射（接缝决策见"先决调研"）。

## P1 · 高频体验项

- [ ] **claude-code 记忆**：`CLAUDE.local.md`（根 + 目录层级，跟随 CLAUDE.md 发现
  规则）；向上层级 CLAUDE.md 发现 + `additionalDirectories` 记忆加载（现有限制表述
  只有含糊的 "nested CLAUDE.md files"，实现或明确化）。
- [x] **codex**：`developer_instructions`（会话注入，与 AGENTS.md 链同接缝）。
  **已实现**（2026-08-15）：settings 解析（最具体层生效），memory 桥在
  AGENTS.md 链之前注入（与上游顺序一致）。
- [x] **opencode**：`references` / 旧 `reference` 配置——本地 `path` → 注入或注册
  资源根；git `repository` → 网络，沿用"远程 instructions 不抓取"策略记限制。
  **已实现**（2026-08-15）：`src/agents/opencode/references.ts` 会话开始
  注入本地引用（`@alias` → 路径 + 描述）；git 仓库引用跳过 + 告警。
- [x] **opencode**：`skills.paths` / `skills.urls` 配置键（paths → 并入技能发现根；
  urls → 网络，同上记限制）。**已实现**（2026-08-15）：settings 解析
  `skills.paths`（相对配置文件解析），provider 以 rank 146 根注册。
- [x] **opencode**：`.opencode/skills` 向上走到 git root 的发现（monorepo 子目录
  下影响大）。**已实现**（2026-08-15）：provider 从 cwd 走到 git 根，
  每层 `.opencode/skills` 以同 rank 注册，越靠 cwd 候选越靠前。
- [ ] **claude-code / codebuddy-code**：settings `env` 会话级注入（codebuddy 当前
  只作用于 hook 子进程；claude 完全未读）。依赖"先决调研-会话 shell env 接缝"。
- [ ] **codex**：`approvals_reviewer`（user/auto_review）、`[auto_review].policy`、
  `guardian_policy_config`——随 P0.2 审批体系一起设计。
- [ ] **文档**：插件非 skills 组件补进各工具 Limitations（claude：agents / MCP /
  hooks / output-styles；codebuddy：commands / agents / `.mcp.json` / `.lsp.json` /
  settings / `bin`；codex：插件 MCP）。

## P2 · 低优先级

- [ ] **claude-code**：Auto memory（`autoMemoryEnabled`/`autoMemoryDirectory`、
  `~/.claude/projects/<project>/memory/`；降级映射 = 注入 MEMORY.md 索引）。
- [ ] **claude-code**：`outputStyle` + `~/.claude/output-styles/`、
  `.claude/output-styles/`（降级映射 = 会话注入 prompt 片段）。
- [ ] **claude-code**：`.claude/workflows/*.js` + `~/.claude/workflows/*.js`
  （先进限制清单，再评估降级映射）。
- [ ] **codebuddy-code**：`models.json`（`.codebuddy/models.json` +
  `~/.codebuddy/models.json`；dsh 有原生模型配置，降级映射）。
- [ ] **各工具 `model` 路由**：claude/codebuddy settings `model`、codex
  `model`/`review_model`/`model_provider`/`[model_providers]`/`model_reasoning_*`/
  `model_auto_compact_token_limit*`、opencode `model`/`small_model`/自定义
  `provider`——dsh 模型路由为 host-plane，默认记 out-of-scope，评估降级映射。
- [ ] **codex**：`web_search` / `tools.web_search`（disabled/cached/indexed/live）
  映射 dsh web_search 开关。
- [ ] **codex**：`[features].*` 中与 dsh 有对应物的项（`multi_agent`/`goals`/
  `memories`/…；仅 `features.hooks` 已实现）。
- [ ] **codex**：`[shell_environment_policy]`（同"先决调研-会话 shell env 接缝"）。
- [ ] **codex**：`[apps]` connectors（映射 dsh MCP/connector 行）。
- [ ] **codex**：`[memories]`、`[history]`、`tool_output_token_limit`、
  `background_terminal_max_timeout`、`file_opener`。
- [ ] **codex**：`projects.<path>.trust_level` 具体键（补齐现有"不信任项目门禁"
  缺失——实现该键即可恢复上游的门禁语义）。
- [ ] **opencode**：`formatter`、`lsp`、`experimental.*`（含已文档化的 `policies`）。
- [ ] **hooks 事件扩展**（可行性评估 + 实现可行子集）：claude 17 个未桥事件
  （`Setup`/`UserPromptExpansion`/`PostToolBatch`/`StopFailure`/`TeammateIdle`/
  `TaskCreated`/`TaskCompleted`/`Elicitation`/`ElicitationResult`/
  `WorktreeCreate`/`WorktreeRemove`/`ConfigChange`/`InstructionsLoaded`/
  `CwdChanged`/`FileChanged`/`DirectoryAdded`/`MessageDisplay`）；codebuddy 对应
  事件（`StopFailure`/`TeammateIdle`/`InstructionsLoaded`/`ConfigChange`/
  `CwdChanged`/`WorktreeCreate`/`WorktreeRemove`/`TaskCreated`/`TaskCompleted`/
  `ElicitationResult`）。`SubagentStart`/`SubagentStop`、`PreCompact`/`PostCompact`、
  `PermissionRequest`/`PermissionDenied` 需先调研 dsh 对应事件（子代理、compaction、
  审批）再定。
- [ ] **claude hooks**：SessionStart JSON 决策字段（`initialUserMessage`/
  `watchPaths`/`sessionTitle`/`reloadSkills`）、`suppressOutput`/`systemMessage`/
  `terminalSequence`。
- [ ] **claude 技能 frontmatter 补齐**：`name`/`argument-hint`/`arguments`/
  `license`/`compatibility` + 替换变量（`$name`/`${CLAUDE_SKILL_DIR}` 等；属已列
  限制的"参数替换"大项）。

## P3 · 文档即完成（明确 out-of-scope，不实现）

以下资产在 guides 中明确写"不桥接 + 原因"（无 dsh 对应物 / CLI-UI 专属 / 认证与
迁移无关），不进代码：

- [ ] **claude-code**：`managed-settings.json` / `managed-settings.d` /
  `managed-mcp.json` / 企业托管策略、`statusLine`/`statusline.json`、
  `plansDirectory`、`keybindings.json`、`themes/`、`.worktreeinclude`、
  `.claude.json` UI 开关（`autoConnectIde` 等）。
- [ ] **codebuddy-code**：`trustAll`/`trustedDirectories`（CLI 信任概念）、
  `apiKeyHelper`（自家后端认证）。
- [ ] **opencode**：`share`/`autoshare`/`username`/`logLevel`/`layout`/
  `tool_output`/`enterprise`/`server`/`shell`/`watcher`/`snapshot`/`compaction`/
  `attachment.image`/`autoupdate`/`disabled_providers`/`enabled_providers`/
  `default_agent`/`subagent_depth`；`.opencode/themes/`、`tui.json`/
  `OPENCODE_TUI_CONFIG`、`keybinds`、`.opencode/modes/`。
- [ ] **codex**：`[otel]`、`[desktop]`/`[tui]`、auth/notice/logging 键
  （`chatgpt_base_url`/`forced_login_method`/`check_for_update_on_startup`/
  `[feedback]`/`[analytics]`/`[notice]`/`log_dir`/`sqlite_home`…）、schema-only 键
  （`audio`/`orchestrator`/`realtime`/`experimental_realtime_*`/`ghost_snapshot`/
  `include_*_instructions`/`apps_mcp_product_sku`…）。

## 文档修正（不实现也要补）

- [ ] 四工具 guides（`docs/guides/README.md` + `README.zh.md`）Limitations 补全本次
  审计的全部"未提及"项（即上表 P0–P3 的资产清单在各自 Limitations 中可见）。
- [ ] reference 副本补全：codebuddy-code 的 `mcp.md` / `iam.md` / `models.md`；
  codex 的 `config-sample.md`。
- [ ] codex reference README 与各文件头部：文档源 URL 更新（
  `developers.openai.com/codex` 为当前主源，`learn.chatgpt.com` 保留）。
- [x] codex 限制清单笔误：`rules/*.rules` 语言名 "Python DSL" → **Starlark**。（2026-08-15 已修：guides 中英两版 + reference README）
- [ ] claude-code hooks 限制逐事件枚举（17 个），替换含糊的 "remaining async
  events"；codebuddy-code 同。
- [ ] 根 README 两版的 supported-agents 表随 P0–P2 实现结果同步更新。

## 建议实施顺序

1. 先决调研四项 → 决策记录写回本文档（先于任何 P0 实现）。
2. **P0.2 权限/审批规则**（依赖最少：`tools/pre-execute` 接缝现成、纯插件可实现、
   安全价值最高）→ 顺带完成共享规则引擎。
3. **P0.3 subagent**（若降级为技能则纯插件可实现；若需核心支持则登记上游 issue
   并行推进，先落地降级映射）。
4. **P0.1 MCP**（依赖接缝决策；插件自托管方案可与权限并行推进）。
5. P1 → P2 按序；每项同步完成对应文档修正，走"新增桥接五阶段"流程
   （调研 → 映射设计 → 实现 → 测试 → 验收），中英文档同步更新。

## 已完成

（暂无。条目完成后勾选、注明 commit，移入本表。）
