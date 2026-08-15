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

- [ ] **MCP 接缝**：dsh 的 MCP 客户端是静态组合行（每服务器一行）、无运行时注册表。
  确认方案 A（dsh 核心增加"文件型 MCP provider"，类似 `dsh-skill-filesystem`，读
  `.mcp.json`/`config.toml` 注册服务器）vs 方案 B（插件内自托管 `dsh-mcp-client`
  实例 + `ToolRuntime.register()` 动态注册 MCP 工具）。权衡：方案 B 纯插件可行但重
  （工具命名冲突、沙箱、teardown），方案 A 需要核心改动。
- [ ] **subagent 定义接缝**：`ctx.subagents` 目前只注册**执行后端 provider**，没有
  "命名 subagent 定义"注册表。确认方案 A（推动核心支持命名定义）vs 方案 B（降级为
  技能：name/description → 技能条目、正文 = 系统提示，工具白名单忽略）。
- [ ] **会话 shell env 接缝**：settings `env` 需应用到会话/工具子进程。dsh 的
  `shell-env` 是 host-plane 服务；调研插件是否可通过 `tools/pre-execute` 等接缝为
  bash 执行注入环境，或需核心支持。
- [ ] **共享规则引擎**：权限规则解析将复用 hooks 的 matcher 与工具名翻译
  （`src/agents/*/hooks/names.ts`），提炼到共享模块（`src/util.ts` 或新目录），
  供 P0-权限组四个工具共用。

## P0 · 迁移阻断项

未实现且指南从未提及；缺失会静默丢失工具、子代理或安全约束，直接破坏"无缝迁移"。

### P0.1 MCP 服务器配置（四工具全缺）

- [ ] **claude-code**：项目 `.mcp.json` + 用户/本地 `~/.claude.json` 的 `mcpServers`；
  settings 键 `enableAllProjectMcpServers` / `enabledMcpjsonServers` /
  `disabledMcpjsonServers`（项目 MCP 审批策略）。
- [ ] **codebuddy-code**：项目 `.mcp.json`（旧 `mcp.json`）、用户
  `~/.codebuddy/.mcp.json`（旧 `~/.codebuddy/mcp.json`、`~/.codebuddy.json`）；
  settings 键 `enableAllProjectMcpServers` / `enabledMcpjsonServers` /
  `disabledMcpjsonServers` / `strictMcpConfig`。
- [ ] **codex**：`[mcp_servers.<id>]` 全套键——`command`/`args`/`env`/`env_vars`/
  `cwd`/`url`/`auth`/`bearer_token_env_var`/`http_headers`/`enabled`/`required`/
  `startup_timeout_sec`/`tool_timeout_sec`/`enabled_tools`/`disabled_tools`/
  `default_tools_approval_mode`/`tools.<tool>.approval_mode`/`scopes`。
- [ ] **opencode**：`opencode.json` 的 `mcp` 段（local / remote / OAuth）。
- [ ] **插件贡献的 MCP**（claude 插件、codebuddy 插件、codex
  `plugins.<plugin>.mcp_servers.*`）：依赖插件桥接，先按 P1-插件项补文档，实施排后。

### P0.2 权限 / 审批规则（安全姿态静默改变）

- [ ] **claude-code**：settings `permissions`——`allow`/`deny`/`ask` 规则
  （`Bash(...)`/`Edit(...)` 参数匹配）、`defaultMode`、`additionalDirectories`、
  `disableBypassPermissionsMode`。映射：规则引擎 → `tools/pre-execute`
  （与 hooks 的 permissionDecision 同接缝），工具名翻译复用现有表。
- [ ] **codebuddy-code**：settings `permissions.allow/ask/deny`（规则语法含
  `WebFetch(domain:)`、`mcp__…`、`Agent(…)`、`Skill(…)`）、`permissions.defaultMode`
  （default/acceptEdits/auto/dontAsk/plan/bypassPermissions）、
  `disableBypassPermissionsMode` / `disableAutoMode` / `subagentPermissionMode`；
  `autoMode`（NL 分类器）无 dsh 等价物，单独评估（可忽略并记限制）。
- [ ] **codex**：`approval_policy`（含 `granular` 细分）→ dsh 审批策略；
  `sandbox_mode` + `[sandbox_workspace_write]`（`writable_roots`/`network_access`/
  `exclude_tmpdir_env_var`/`exclude_slash_tmp`）→ dsh 沙箱模式（两者几乎 1:1）；
  `default_permissions` + `[permissions.<name>]` 档案 → dsh 沙箱/审批预设。
- [ ] **opencode**：`permission` 规则（已有"列为限制"文档，复用同一规则引擎实现）。

### P0.3 自定义 subagent 定义（团队定义整体丢失）

- [ ] **claude-code**：`.claude/agents/*.md` + `~/.claude/agents/*.md`
  （frontmatter：`name`/`description`/`tools`/`disallowedTools`/`model`/
  `permissionMode`/`maxTurns`/`skills`/`mcpServers`/`hooks`/`memory`/`background`/
  `effort`/`isolation`/`color`/`initialPrompt`）；附 `.claude/agent-memory/`、
  `.claude/agent-memory-local/`、`~/.claude/agent-memory/` 持久记忆。
- [ ] **codebuddy-code**：`.codebuddy/agents/*.md` + `~/.codebuddy/agents/*.md`
  （同名 frontmatter 集合）。
- [ ] **codex** `[agents]` 角色、**opencode** `agent` 自定义代理：均已列限制，
  实施时复用同一映射（接缝决策见"先决调研"）。

## P1 · 高频体验项

- [ ] **claude-code 记忆**：`CLAUDE.local.md`（根 + 目录层级，跟随 CLAUDE.md 发现
  规则）；向上层级 CLAUDE.md 发现 + `additionalDirectories` 记忆加载（现有限制表述
  只有含糊的 "nested CLAUDE.md files"，实现或明确化）。
- [ ] **codex**：`developer_instructions`（会话注入，与 AGENTS.md 链同接缝）。
- [ ] **opencode**：`references` / 旧 `reference` 配置——本地 `path` → 注入或注册
  资源根；git `repository` → 网络，沿用"远程 instructions 不抓取"策略记限制。
- [ ] **opencode**：`skills.paths` / `skills.urls` 配置键（paths → 并入技能发现根；
  urls → 网络，同上记限制）。
- [ ] **opencode**：`.opencode/skills` 向上走到 git root 的发现（monorepo 子目录
  下影响大）。
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
- [ ] codex 限制清单笔误：`rules/*.rules` 语言名 "Python DSL" → **Starlark**。
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
