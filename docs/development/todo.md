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
- [x] **插件贡献的 MCP**（claude 插件、codebuddy 插件、codex
  `plugins.<plugin>.mcp_servers.*`）：依赖插件桥接，先按 P1-插件项补文档，实施排后。
  **已记限制**（2026-08-15/16：guides 三工具 Plugins 限制行已写明，
  实施依赖插件桥接本身，仍排后）。

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
- [x] **codex** `[agents]` 角色、**opencode** `agent` 自定义代理：均已列限制，
  实施时复用同一映射（接缝决策见"先决调研"）。
  **已实现**（2026-08-16，方案 B 委派规格技能）：codex `[agents.<name>]`
  （`description` + `config_file` TOML 正文 + `model` 键 →
  `agentOptions.model`，rank 168）；opencode `agent.<id>`（`subagent`/`all`
  模式，`prompt` 内联或 `{file:}`、`model`，project 149 / user 159；
  `primary` 模式跳过）。逐角色工具过滤/权限闸门/`temperature` 记限制。

## P1 · 高频体验项

- [x] **claude-code 记忆**：`CLAUDE.local.md`（根 + 目录层级，跟随 CLAUDE.md 发现
  规则）；向上层级 CLAUDE.md 发现 + `additionalDirectories` 记忆加载（现有限制表述
  只有含糊的 "nested CLAUDE.md files"，实现或明确化）。
  **已实现**（2026-08-15）：`src/agents/claude-code/memory.ts` 重构为
  导出的 `collectMemorySections`，注入用户级、祖先层级（CLAUDE.md +
  CLAUDE.local.md，根在前）、`additionalDirectories`、`.claude/CLAUDE.md`、
  cwd 的 `CLAUDE.local.md`（核心已加载的重复内容跳过）。
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
- [x] **claude-code / codebuddy-code**：settings `env` 会话级注入（codebuddy 当前
  只作用于 hook 子进程；claude 完全未读）。依赖"先决调研-会话 shell env 接缝"。
  **已实现可行部分**（2026-08-15）：settings `env` 已作用于 ①hook 子进程
  （两工具）②桥接自 spawn 的 MCP 服务器子进程（本次补上）。模型侧 bash
  工具无法注入（无接缝）——记限制 + 核心支持候选。
- [x] **codex**：`approvals_reviewer`（user/auto_review）、`[auto_review].policy`、
  `guardian_policy_config`——随 P0.2 审批体系一起设计。
  **决策**（2026-08-15）：DeepSeek Harness 没有"审查子代理审批流"接缝，
  无法实施 → 记限制（guides 已写明），无实施计划。
- [x] **文档**：插件非 skills 组件补进各工具 Limitations（claude：agents / MCP /
  hooks / output-styles；codebuddy：commands / agents / `.mcp.json` / `.lsp.json` /
  settings / `bin`；codex：插件 MCP）。**已补**（2026-08-15，guides 中英两版）。

## P2 · 低优先级

- [ ] **pi 扩展事件总线**（`.pi/extensions/*.ts`、`~/.pi/agent/extensions/*.ts`）：
  `tool_call` 拦截（`{block, reason?, terminate?}`）、`tool_result` 改写、
  `project_trust` 决策、`before_provider_*` 等事件映射 dsh 接缝的可行性评估
  （2026-08-16，pi 桥接遗留；等价于 opencode 插件 API 的 TypeScript 运行时，
  guides 已记限制，先排后）。
- [ ] **pi 包分发技能**：`package.json` 的 `pi.skills` / 包内 `skills/` 目录
  （2026-08-16，pi 桥接遗留；依赖包安装解析，guides 已记限制）。
- [ ] **pi `SYSTEM.md`**：整体替换系统提示 → 核心支持候选（会话级系统提示
  覆盖接缝）；`APPEND_SYSTEM.md` 追加语义已降级映射为记忆注入
  （2026-08-16，pi 桥接遗留，guides 已记限制）。
- [ ] **环 C 上游探针支持非 npm 安装**：pi 与 Cursor CLI 均无 npm 包（官方
  `curl pi.dev/install | bash` / `curl cursor.com/install`，GitHub releases），
  `scripts/upstream-probe.mjs` 目前只支持 `npm i -g <pkg>@<pin>`——需为探针
  脚本增加下载安装模式后再把 pi 与 cursor（二进制名 `agent`）加入
  `scripts/upstream-tools.json`（2026-08-16，pi/cursor 桥接遗留）。
- [ ] **gemini-cli 工作区策略层**：上游 `.gemini/policies/` 因 issue #18186
  禁用，桥接同样不读；上游修复后补上（2026-08-16，gemini 桥接遗留，guides
  已记限制）。
- [x] **gemini-cli 命名空间命令**：`dir:name` 命令（`commands/git/commit.toml`
  → `/git:commit`）——已按 claude-code / codebuddy-code 同款 `:` → `-` 转写为
  `group-name`（2026-08-16，commit 待补）。
- [x] **codebuddy-code 嵌套资产**：嵌套 commands 与嵌套 skills
  （`skills/pathto/skill/SKILL.md` → 技能 `pathto:skill`）——已按 claude-code
  同款 `:` → `-` 转写为 `group-name`（2026-08-16，commit 待补）。
- [ ] **gemini-cli JIT 上下文加载**：工具访问目录时发现的 GEMINI.md 无法
  静态注入——核心支持候选（fs 观察钩子）（2026-08-16，gemini 桥接遗留）。
- [ ] **gemini-cli extensions**：`gemini-extension.json` 打包的
  commands/hooks/skills/agents/MCP/policies/themes（分发机制，同 pi 扩展
  先例，guides 已记限制）（2026-08-16，gemini 桥接遗留）。
- [ ] **cursor 相关性规则**：`.cursor/rules` 中非 `alwaysApply` 的规则依赖
  语义检索，无静态映射——待 dsh 有相关性选择接缝后评估（2026-08-16，
  cursor 桥接遗留，guides 已记限制）。
- [ ] **cursor 无头 hooks 证据**：官方文档未明确 `agent -p` 无头模式是否
  执行 hooks（交互 CLI 确认执行）——桥接按执行处理；上游文档明确后在
  guides 中补注（2026-08-16，cursor 桥接遗留）。
- [ ] **cursor 第三方 Claude hooks 兼容层**：Cursor 自行读取
  `.claude/settings*.json` hooks 并做事件/工具名翻译（Bash→Shell、
  Edit→Write）——目前由 claude-code 桥接以 Claude 语义覆盖原文件；评估是否
  镜像 Cursor 的翻译（2026-08-16，cursor 桥接遗留，guides 已记限制）。

- [x] **claude-code**：Auto memory（`autoMemoryEnabled`/`autoMemoryDirectory`、
  `~/.claude/projects/<project>/memory/`；降级映射 = 注入 MEMORY.md 索引）。
  **部分实现**（2026-08-16）：显式 `autoMemoryDirectory` 的 `MEMORY.md`
  已注入；默认逐项目哈希目录无法推导 → 记限制（guides 已写明）。
- [x] **claude-code**：`outputStyle` + `~/.claude/output-styles/`、
  `.claude/output-styles/`（降级映射 = 会话注入 prompt 片段）。
  **已实现**（2026-08-15）：settings 解析 `outputStyle`（最具体层），
  memory 桥注入样式文件（项目文件优先、用户文件回退）。
- [x] **claude-code**：`.claude/workflows/*.js` + `~/.claude/workflows/*.js`
  （先进限制清单，再评估降级映射）。**已记限制**（2026-08-16，plugins
  限制行中注明；动态 JS 编排无对应接缝，不实施）。
- [x] **codebuddy-code**：`models.json`（`.codebuddy/models.json` +
  `~/.codebuddy/models.json`；dsh 有原生模型配置，降级映射）。
  **已记限制**（2026-08-16：dsh 模型路由为 host-plane，无降级映射价值）。
- [x] **各工具 `model` 路由**：claude/codebuddy settings `model`、codex
  `model`/`review_model`/`model_provider`/`[model_providers]`/`model_reasoning_*`/
  `model_auto_compact_token_limit*`、opencode `model`/`small_model`/自定义
  `provider`——dsh 模型路由为 host-plane，默认记 out-of-scope，评估降级映射。
  **已记限制**（2026-08-16：guides 四工具各自写明 out-of-scope，不实施）。
- [x] **codex**：`web_search` / `tools.web_search`（disabled/cached/indexed/live）
  映射 dsh web_search 开关。**已记限制**（2026-08-16：dsh 无逐会话工具
  启停接缝，不实施）。
- [x] **codex**：`[features].*` 中与 dsh 有对应物的项（`multi_agent`/`goals`/
  `memories`/…；仅 `features.hooks` 已实现）。**已记限制**（2026-08-16：
  运行期开关，dsh 有自己的对应机制，不实施）。
- [x] **codex**：`[shell_environment_policy]`（同"先决调研-会话 shell env 接缝"）。
  **已记限制**（2026-08-16：与 settings `env` 同接缝——仅桥接自 spawn 的
  子进程；模型 bash 无法注入）。
- [x] **codex**：`[apps]` connectors（映射 dsh MCP/connector 行）。
  **已记限制**（2026-08-16：连接器需要凭据/托管运行时，无接缝）。
- [x] **codex**：`[memories]`、`[history]`、`tool_output_token_limit`、
  `background_terminal_max_timeout`、`file_opener`。**已记限制**
  （2026-08-16：dsh 拥有自己的转录/记忆/截断层）。
- [x] **codex**：`projects.<path>.trust_level` 具体键（补齐现有"不信任项目门禁"
  缺失——实现该键即可恢复上游的门禁语义）。**已实现**（2026-08-15）：
  settings 加载器合并各层 `projects.<path>.trust_level`，cwd 显式
  `untrusted` 时跳过项目 `.codex/` 层（hooks/MCP/skills 配置等）；
  AGENTS.md 链不受影响（上游始终读取）；未列出路径维持无条件读取。
- [x] **opencode**：`formatter`、`lsp`、`experimental.*`（含已文档化的 `policies`）。
  **已记限制**（2026-08-16：dsh 拥有格式化/诊断/实验层，无文件格式桥接面）。
- [x] **hooks 事件扩展**（可行性评估 + 实现可行子集）：`SubagentStart`/
  `SubagentStop` **已实现**（2026-08-15，claude + codebuddy）：
  `agent/session-start`/`agent/turn-stopping` 按 `delegationDepth` 分流到子代理
  事件，matcher 固定 `generic`（DSH 子代理无上游 agent 类型，`*` matcher 可
  运行）。其余事件（`Setup`/`UserPromptExpansion`/`PostToolBatch`/`StopFailure`/
  `TeammateIdle`/`TaskCreated`/`TaskCompleted`/`Elicitation`/`ElicitationResult`/
  `WorktreeCreate`/`WorktreeRemove`/`ConfigChange`/`InstructionsLoaded`/
  `CwdChanged`/`FileChanged`/`DirectoryAdded`/`MessageDisplay`、`PreCompact`/
  `PostCompact`、`PermissionRequest`/`PermissionDenied` 等）无对应 dsh 接缝，
  记限制。
- [x] **claude hooks**：SessionStart JSON 决策字段（`initialUserMessage`/
  `watchPaths`/`sessionTitle`/`reloadSkills`）、`suppressOutput`/`systemMessage`/
  `terminalSequence`。**已记限制**（2026-08-16：guides Hooks 限制行已枚举；
  `initialUserMessage` 可经注入实现、`reloadSkills` 可经 provider invalidate
  实现——列为后续增强，暂不实施）。
- [x] **claude 技能 frontmatter 补齐**：`name`/`argument-hint`/`arguments`/
  `license`/`compatibility` + 替换变量（`$name`/`${CLAUDE_SKILL_DIR}` 等；属已列
  限制的"参数替换"大项）。**已记限制**（2026-08-16：guides Skills 限制行
  已枚举这些字段与替换变量；DSH 技能正文为静态内容，无调用时替换接缝）。

## P3 · 文档即完成（明确 out-of-scope，不实现）

以下资产在 guides 中明确写"不桥接 + 原因"（无 dsh 对应物 / CLI-UI 专属 / 认证与
迁移无关），不进代码：

- [x] **claude-code**：`managed-settings.json` / `managed-settings.d` /
  `managed-mcp.json` / 企业托管策略、`statusLine`/`statusline.json`、
  `plansDirectory`、`keybindings.json`、`themes/`、`.worktreeinclude`、
  `.claude.json` UI 开关（`autoConnectIde` 等）。**已记 out-of-scope**
  （2026-08-16：guides claude Settings 限制行）。
- [x] **codebuddy-code**：`trustAll`/`trustedDirectories`（CLI 信任概念）、
  `apiKeyHelper`（自家后端认证）。**已记 out-of-scope**（2026-08-16：
  guides codebuddy Settings/模型路由限制行）。
- [x] **opencode**：`share`/`autoshare`/`username`/`logLevel`/`layout`/
  `tool_output`/`enterprise`/`server`/`shell`/`watcher`/`snapshot`/`compaction`/
  `attachment.image`/`autoupdate`/`disabled_providers`/`enabled_providers`/
  `default_agent`/`subagent_depth`；`.opencode/themes/`、`tui.json`/
  `OPENCODE_TUI_CONFIG`、`keybinds`、`.opencode/modes/`。
  **已记 out-of-scope**（2026-08-16：guides opencode CLI/UI 限制行）。
- [x] **codex**：`[otel]`、`[desktop]`/`[tui]`、auth/notice/logging 键
  （`chatgpt_base_url`/`forced_login_method`/`check_for_update_on_startup`/
  `[feedback]`/`[analytics]`/`[notice]`/`log_dir`/`sqlite_home`…）、schema-only 键
  （`audio`/`orchestrator`/`realtime`/`experimental_realtime_*`/`ghost_snapshot`/
  `include_*_instructions`/`apps_mcp_product_sku`…）。**已记 out-of-scope**
  （2026-08-16：guides codex 其余配置限制行）。

## 文档修正（不实现也要补）

- [x] 四工具 guides（`docs/guides/README.md` + `README.zh.md`）Limitations 补全本次
  审计的全部"未提及"项（即上表 P0–P3 的资产清单在各自 Limitations 中可见）。
  **已补**（2026-08-16）。
- [x] reference 副本补全：codebuddy-code 的 `mcp.md` / `iam.md` / `models.md`；
  codex 的 `config-sample.md`。**已补**（2026-08-16，带来源头）。
- [x] codex reference README 与各文件头部：文档源 URL 更新（
  `developers.openai.com/codex` 为当前主源，`learn.chatgpt.com` 保留）。
  **已更新**（2026-08-16：README 来源行注明迁移，两源内容一致）。
- [x] codex 限制清单笔误：`rules/*.rules` 语言名 "Python DSL" → **Starlark**。（2026-08-15 已修：guides 中英两版 + reference README）
- [x] claude-code hooks 限制逐事件枚举（17 个），替换含糊的 "remaining async
  events"；codebuddy-code 同。**已枚举**（2026-08-16，guides 中英两版）。
- [x] 根 README 两版的 supported-agents 表随 P0–P2 实现结果同步更新。
  **已同步**（2026-08-15/16：Permissions 与 MCP 列随实现填充）。

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

## 2026-08-16 全面审察遗留（中低危待办）

来源：2026-08-16 对全仓（7 个桥接 + 共享模块 + 文档 + CI/发布）的一次全面审察。
高危与发布阻断已当场修复（见下"本次已修复"）；以下为中低危待办，按优先级排列，
实施时自上而下取。

### 本次已修复（2026-08-16）

- [x] **发布版本过时**：npm 上 0.1.0 只含 4 个桥接（早于 PR #2/#3 合入）；`package.json`
  version → 0.2.0（暂不发布，全部问题解决后再按发布流程 tag/publish）。
- [x] **cursor/gemini-cli hook 输出未转义 `</system-reminder>`**（注入逃逸）：
  两个 hooks/bridge 的三处消息构造补 `escapeReminderClose`，e2e 新增
  hooks-escape fixture 覆盖。commit a6b027e。
- [x] **opencode 权限桥对未映射 DSH 工具强制 allow**（`?? 'allow'` 覆盖 Harness
  审批）：改为无 opencode 家族的工具一律返回 undefined 交还审批；guides 中英同步。
  commit fd9f6d3。
- [x] **cursor `Mcp(server:tool)` 匹配失效**：运行时名 `mcp__cursor__<server>__<tool>`
  被误解析；`splitMcp` 剥除 `cursor__` 命名空间，测试改用真实运行时名。
- [x] **gemini-cli 策略 `mcpName`/`mcp_*` 无法命中**：`mcp__gemini__<server>__<tool>`
  归一为 Gemini FQN `mcp_<server>_<tool>` 后匹配；`mcpServerName` 拒绝空 server 段。
  与 cursor 项同批修复，commit 5efafef。
- [x] **配置驱动路径遍历**：claude `outputStyle` 校验为纯文件名；codex
  `[agents].config_file` 限定在声明目录内（越界跳过+告警）；gemini
  `context.fileName` 拒绝路径型名称。commit f3c163b。
  （`additionalDirectories`/`autoMemoryDirectory` 读固定文件名，剩余信任门禁
  风险见下方中危待办）

### 中危（待办）

- [ ] **MCP 变更检测比较对象写错**：`src/mcp-bridge.ts` reconcile 用
  `JSON.stringify(next)`（含 name 包裹）对比 `running.config`（无包裹）恒不等 →
  每次 session-start/watcher 事件重启该工作区全部 MCP 服务器；应为 `next.config`
  （2026-08-16 审察）。
- [ ] **cursor handler 级 `matcher` 被丢弃**：`src/agents/cursor/settings.ts`
  normalizeHooks 把 handler 包成 `{matcher: undefined, hooks:[...]}`，上游
  hooks.md 明确 `matcher` 是 handler 级字段 → 带 matcher 的 guard hook 对全部
  命令运行（2026-08-16 审察）。
- [ ] **async hook 子进程 stdin 不写入、管道不排空**：claude/codebuddy/codex
  `hooks/run.ts` async 分支只 spawn（stdio 三个 pipe）→ 输出超管道缓冲（约 64KB）
  死锁；且上游 async hook 会收到 stdin JSON，桥接完全不发（2026-08-16 审察）。
- [ ] **超时/取消 hook 的部分 stdout 仍被解析为决策**：`run.ts` 置
  timedOut/cancelled 但 bridge 只检查 ran/detached；上游语义为超时即丢弃输出
  （2026-08-16 审察）。
- [ ] **claude `permissionDecision: "defer"` 被映射为 deny**：上游优先级
  deny > defer > ask > allow，defer 意为"稍后恢复"；建议降级为 ask/放行 + 告警
  （2026-08-16 审察）。
- [ ] **`capString` 输出超出 maxChars 约 1.4 倍**：`src/util.ts` `tail =
  value.length - head`；应为 `tail = value.length - (maxChars - head -
  marker.length)` 并取整（2026-08-16 审察）。
- [ ] **cursor 用户级 hook 相对命令路径解析到项目目录**：`cursor/hooks/run.ts`
  统一 cwd = session cwd；上游用户 hook 从 `~/.cursor/` 运行（2026-08-16 审察）。
- [ ] **opencode/gemini-cli stdio MCP `cwd` 硬编码 `process.cwd()`**（cursor 已
  正确实现）（2026-08-16 审察）。
- [ ] **opencode 内置 `.env` 拒绝在 `*` 通配符对象形式下被替换**：
  `opencode/permissions.ts` evaluateFamily 规则选择逻辑；`{"*":{"*":"allow"}}`
  时读 `.env` 被放行（2026-08-16 审察）。
- [ ] **gemini `modes`/`interactive` 门控 deny 被丢弃**（fail-open；已记限制，
  建议核对上游方向并显式化）（2026-08-16 审察）。
- [ ] **cursor `cli.json`/`cli-config.json` 权限列表整体替换而非合并**：需核实
  Cursor 上游合并语义后再定（2026-08-16 审察）。
- [ ] **claude `additionalDirectories`/`autoMemoryDirectory` 无项目信任门禁**：
  上游项目级设置需工作区信任；桥接无条件读取（固定文件名，风险低于任意文件，
  但应评估信任门禁）（2026-08-16 审察）。
- [ ] **`if` 规则解析失败 fail-open**（claude/codebuddy matcher）：与上游
  best-effort 契约一致且已文档化，但与 AGENTS.md「fail closed」约定存在张力——
  在 guides 显式记录该例外或改为 fail-closed（2026-08-16 审察）。

### 低危（待办）

- [ ] `translateAgentToolList` 注释（未知条目丢弃）与实现（原样透传）矛盾：
  `src/agent-definitions.ts`（2026-08-16 审察）。
- [ ] MCP 启动失败的 fiber 不重试；淘汰 workspace 不回收 watcher；
  `ensureWatched` 不 await ready：`src/mcp-bridge.ts`（2026-08-16 审察）。
- [ ] `sanitizeServerName` 32 字符截断可能碰撞：`src/mcp-bridge.ts`
  （2026-08-16 审察）。
- [ ] 设置加载器缓存按 cwd 无界增长（claude/codebuddy/codex settings）
  （2026-08-16 审察）。
- [ ] codebuddy 为 MCP 单独新建 loader（双缓存）：`src/agents/codebuddy-code/index.ts`
  （2026-08-16 审察）。
- [ ] `memoryMaxBytes` 按 UTF-16 码元而非字节计数（各 memory 模块）
  （2026-08-16 审察）。
- [ ] `escapeReminderClose` 只转义闭合标签（开标签可伪造外观）；`expandHome`
  不支持 `~user` 且未记录：`src/util.ts`（2026-08-16 审察）。
- [ ] opencode `expandGlob` 的 `**` 只展开一层；项目层 JSON/JSONC 命令后者覆盖
  前者（用户层是累积）：`src/agents/opencode/`（2026-08-16 审察）。
- [ ] pi `resolveTrust` 目录键未规范化（fail-closed，过度保守）：
  `src/agents/pi/settings.ts`（2026-08-16 审察）。
- [ ] Windows 下 `relativeLabel` 反斜杠拼接失效（codex/opencode/cursor/
  gemini/pi，展示问题）（2026-08-16 审察）。
- [ ] 符号链接可穿出技能根：`src/fs-adapter.ts` NodeFsAdapter 用 stat 跟随
  symlink（2026-08-16 审察）。
- [ ] `void provider?.dispose()` 未 await（各桥 index.ts）（2026-08-16 审察）。
- [ ] cursor `userDir()` 未实现注释声称的 `XDG_CONFIG_HOME` 覆盖：
  `src/agents/cursor/settings.ts`（2026-08-16 审察）。
- [ ] gemini `expandEnvReferences` 不支持 `${VAR:-default}` 与注释不符；opencode
  MCP 未对 command/args 做 env 展开（2026-08-16 审察）。
- [ ] 事件 handler `void` 派发 + `loader.load` 在 try 外，存在理论未处理拒绝风险
  （claude/codebuddy/codex hooks/bridge.ts）（2026-08-16 审察）。
- [ ] opencode `web`(WebFetch) 映射到 websearch 族且按 query 取值（映射不准）：
  `src/agents/opencode/permissions.ts`（2026-08-16 审察）。
- [ ] CI 依赖的 GH Actions（checkout/setup-node/pnpm/action-setup@v4）出现
  Node 20 运行时弃用注解，跟进上游升级（2026-08-16 审察）。
