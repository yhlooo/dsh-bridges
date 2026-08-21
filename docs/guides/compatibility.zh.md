# 兼容性细节：与桥接目标平台的差异

[English](compatibility.md)

本文按工具列出 dsh-bridges 与上游平台（Claude Code、CodeBuddy Code、OpenCode、Codex、
Pi、Gemini CLI、Cursor）行为不一致的具体地方。只写「DeepSeek Harness 本身没有对应
能力」导致的差异；插件市场、CLI 界面、企业托管、OAuth 登录这类另一类原因，见各工具
页的「限制」小节，不在这里重复。

每个条目用「**支持 / 部分支持 / 不支持**」标注，并给出具体的字段名、例子和降级后的
行为。示例中的「降级为……」指桥接把上游功能替换成了什么等价（或不完全等价）的行为。

## 通用（影响所有工具）

- **模型选择** 不支持。所有工具配置文件里的 `model`（Claude Code / CodeBuddy Code /
  Codex 的 `model`、Codex 的 `review_model`、`model_provider`、`[model_providers]`、
  OpenCode 的 `model` / `small_model` / 自定义 provider、Gemini CLI / Cursor / Pi 的
  模型配置）都不生效——DeepSeek Harness 用哪个模型由部署层决定，插件改不了。
  - 例外：子代理定义里的 `model` 字段会写进委派指令，尽力传给子代理，但仍可能被部署层覆盖。
- **自定义子代理** 部分支持。DeepSeek Harness 没有「命名子代理注册表」，每个定义被
  降级为「一个技能，正文是系统提示 + 委派说明」。能带过去的只有 `tools`（工具名）、
  `model`、`maxTurns`；其余 frontmatter 字段（各工具见下）整体丢失。

## Claude Code

- **Skill 声明「预授权工具」`allowed-tools` / `disallowed-tools`** 不支持。`SKILL.md`
  里这两个字段整个被忽略，skill 不会因此获得额外授权。桥接只认 `name`、`description`、
  `when_to_use`、`disable-model-invocation`、`user-invocable`、`metadata` 六个字段。
- **Skill 其余 frontmatter** 不支持：`model`、`effort`、`context: fork` / `agent` /
  `background`、`paths`、`shell` 都不生效；正文里的 `$ARGUMENTS` 及
  `${CLAUDE_SKILL_DIR}` 等替换变量保持字面，不做替换。
- **斜杠命令命名空间** 部分支持。`commands/<group>/<name>.md` 对应 `/group:name`，
  因为 DeepSeek Harness 技能名不允许 `:`，桥接转写为 `group-name`（`/opsx:explore` →
  `opsx-explore`）。名字本身不是 kebab-case 的（如 `mySkill`）整目录跳过。
- **子代理 frontmatter** 部分支持。`name`、`description`、`tools`（仅工具名）、
  `disallowedTools`（仅工具名）、`model`、`maxTurns` 被翻译进委派指令。带参数的
  `tools: ["Bash(go:*)"]` 不翻译、原样传下去，可能被 DeepSeek Harness 当成未知工具名
  拒绝。`permissionMode`、`skills`、`mcpServers`、`hooks`、`memory`、`background`、
  `effort`、`isolation`、`color`、`initialPrompt` 及 `.claude/agent-memory*` 目录 不支持。
- **记忆** 部分支持。`~/.claude/CLAUDE.md`、`.claude/CLAUDE.md`、祖先目录的
  `CLAUDE.md` / `CLAUDE.local.md`、`additionalDirectories` 都注入；显式
  `autoMemoryDirectory` 的 `MEMORY.md` 也注入。`.claude/rules/*.md`、CLAUDE.md 里的
  `@import`、默认逐项目哈希目录下的 auto memory 不支持。
- **hook handler 类型** 部分支持。`command`、`http` 支持；`mcp_tool`、`prompt`、
  `agent` 三种 不支持。
- **hook 事件面** 部分支持。`SessionStart`、`UserPromptSubmit`、`PreToolUse`、
  `PostToolUse`、`PostToolUseFailure`、`Stop`、`SubagentStart`、`SubagentStop`、
  `SessionEnd` 触发；`PreCompact`/`PostCompact`、`Notification`、`PermissionRequest`/
  `PermissionDenied`、`Setup`、`UserPromptExpansion`、`PostToolBatch`、`StopFailure`
  等其余事件 不支持。
- **`updatedInput`（PreToolUse 改写工具入参）** 不支持。DeepSeek Harness 在策略执行
  前就冻结了工具参数，改写被忽略并告警，工具按原始参数执行。
- **`permissionDecision: "defer"`** 部分支持。上游语义是「暂停、稍后恢复」，DeepSeek
  Harness 没有恢复能力，桥接降级为「走审批」。
- **SessionStart 决策字段** 不支持：`initialUserMessage`、`watchPaths`、`sessionTitle`、
  `reloadSkills`；`suppressOutput`、`systemMessage`、`terminalSequence` 也 不支持。
- **权限规则** 部分支持。`allow`/`ask`/`deny` 规则按 deny → ask → allow 顺序生效；
  `Bash(npm run *)` 按命令前缀匹配；`Read`/`Edit`/`Write` 按路径 glob 匹配；
  `WebFetch(domain:…)` 按域名匹配。`defaultMode`、`disableBypassPermissionsMode` 读取
  但不生效。
- **settings `env`** 部分支持。只作用于 hook 子进程和桥接自己启动的 MCP 服务器子进程；
  模型执行的 bash 命令不注入这些变量。
- **MCP** 部分支持。stdio / http 传输支持；SSE 服务器降级为 streamable-http 连接；
  进程内 `type: "sdk"` 条目、`managed-mcp.json`、插件捆绑的 MCP 不支持。

## CodeBuddy Code

（skills / 子代理 / 记忆 / hooks 的结构与 Claude Code 相同，下列只写差异。）

- **Skill `allowed-tools` / 其余 frontmatter** 不支持，同 Claude Code。
- **权限规则 `Agent(name)`** 部分支持。裸 `Agent` 能匹配；`Agent(某个名字)` 的名字
  部分无法匹配——DeepSeek Harness 的子代理没有可对上的名字字段。
- **权限规则 `mcp__*`** 部分支持。只在 deny / ask 规则里生效；写成 allow 的
  `mcp__*` 不生效（上游也如此）。
- **权限规则 `Skill(name)`** 支持，精确匹配（不含通配符）。
- **`defaultMode`（acceptEdits / auto / dontAsk / plan / bypassPermissions）** 不支持，
  读取但不生效；`disableBypassPermissionsMode`、`disableAutoMode`、
  `subagentPermissionMode` 同。
- **hook handler 类型 `prompt` / `agent`** 不支持（需要另起一个 LLM 子代理，DeepSeek
  Harness 没有对应能力）。
- **`modifiedInput`（改写工具入参）** 不支持，同 Claude Code 的 `updatedInput`。
- **MCP `strictMcpConfig`** 部分支持，只对 agent frontmatter 里的 MCP 声明生效。

## OpenCode

- **Skill frontmatter** 部分支持。`name`、`description`、`metadata` 生效；`license`、
  `compatibility` 忽略。命令文件的 frontmatter `agent`、`model` 忽略。
- **权限 `permission` 规则** 部分支持。家族规则按「最后一条命中生效」评估，
  `~`/`$HOME` 展开、工作区外路径的 `external_directory` 守卫、内置 `.env` 读取保护
  都复现。`doom_loop`（重复检测）、`webfetch`（URL 抓取工具）、`lsp` 不支持——DeepSeek
  Harness 没有对应工具或能力。
- **指令 `instructions` / `references`** 部分支持。本地文件路径注入；远程 URL 与 git
  `repository` 引用不支持（不抓取，跳过并告警）。
- **技能路径 `skills.paths` / `skills.urls`** 部分支持。`paths` 并入技能发现根；`urls`
  不支持（网络）。
- **MCP** 部分支持。`type: local`（command）与 `type: remote`（url + headers）支持；
  remote 的 OAuth 登录流程不支持。
- **自定义 agent** 部分支持。`subagent` / `all` 模式桥接为委派技能；`primary` 模式
  不支持。逐角色工具过滤不支持。

## Codex

- **Skill frontmatter** 部分支持。`name`（必须等于目录名）、`description` 生效；
  `license`、`compatibility`、`metadata` 忽略。`[[skills.config]]` 的 `enabled = false`
  禁用生效。
- **审批策略 `approval_policy`** 部分支持。`never` → 自动放行；`untrusted` /
  `on-request` / `on-failure` → 走审批；`granular` 的逐项开关 不支持（只告警）。
- **沙箱 `sandbox_mode`** 支持（read-only / workspace-write / danger-full-access
  三态一一对应）。
- **`[sandbox_workspace_write]`** 不支持。`writable_roots`、`network_access`、
  `exclude_tmpdir_env_var`、`exclude_slash_tmp` 读取但不生效——DeepSeek Harness 只有
  三种整体沙箱模式，没有逐会话「可写目录 / 网络开关」。
- **`default_permissions`** 部分支持。只认内置档案 `:read-only` / `:workspace` /
  `:danger-full-access`；自定义 `[permissions.<name>]` 档案不支持。
- **审查子代理 `approvals_reviewer` / `[auto_review].policy` / `guardian_policy_config`**
  不支持。DeepSeek Harness 没有「审查子代理审批流」。
- **hook** 部分支持。`command` 类型支持；`agent` 类型不支持；`updatedInput` 改写
  不支持（同 Claude Code）；`permissionDecision: "ask"` 不支持（Codex 上游本身也不支持
  ask）。
- **MCP** 部分支持。`command` / `url` 支持；`auth`（oauth / chatgpt）不支持；
  `enabled_tools`、`disabled_tools`、`scopes`、`required` 读取但不生效。
- **自定义角色 `[agents.<name>]`** 部分支持。`description` + `config_file`（正文作为
  系统提示）桥接为委派技能；逐角色工具过滤、权限闸门、`temperature` 不支持。
- **`[shell_environment_policy]`** 部分支持，同 Claude Code 的 settings `env`（只作用于
  桥接自己启动的子进程）。
- **运行期开关 `web_search` / `tools.web_search` / `[features].*`** 不支持。
- **项目信任 `projects.<path>.trust_level`** 部分支持。显式 `untrusted` 会跳过项目
  `.codex/` 层；未列出的路径无条件读取（上游默认需信任才读项目层）。

## Pi

- **Skill frontmatter** 部分支持（宽松）。`name`（可不同于目录名）、`description`、
  `metadata`、`disable-model-invocation` 生效。
- **prompt 模板替换** 部分支持。`.pi/prompts/*.md` 的正文 `$1` / `$@` / `$ARGUMENTS`
  保持字面，不做替换；`argument-hint` 忽略。
- **系统提示 `SYSTEM.md`** 不支持（整体替换系统提示，DeepSeek Harness 没有会话级
  系统提示覆盖能力）。
- **系统提示 `APPEND_SYSTEM.md`** 部分支持，降级为「注入一段记忆」，而不是追加到
  系统提示。
- **`enableSkillCommands`** 读取但不生效（DeepSeek Harness 的 `/名字` 总是可用）。
- **项目信任** 支持：`defaultProjectTrust`（ask / never / always）与 `trust.json` 决策
  生效；`project_trust` 扩展事件不支持。
- **包分发技能（`package.json` 的 `pi.skills` / 包内 `skills/`）** 不支持。
- **扩展（`.pi/extensions/*.ts`）** 不支持。DeepSeek Harness 没有运行任意 TypeScript
  扩展的运行时。

## Gemini CLI

- **Skill / agent frontmatter** 部分支持。`name`、`description` 生效；`kind: remote`
  （A2A 远程 agent）不支持（跳过）。
- **agent `tools` 通配符** 部分支持。带通配符的工具条目没有对应的 DeepSeek Harness
  工具过滤写法，丢弃并告警。
- **命令命名空间** 部分支持。`commands/git/commit.toml` 对应 `/git:commit`，转写为
  `git-commit`。
- **记忆** 部分支持。`GEMINI.md` 及 `@import` 本地展开生效；JIT 上下文加载（工具触碰
  目录时发现 GEMINI.md）不支持，只注入启动时发现的那批。
- **hook 事件面** 部分支持。`BeforeAgent`、`AfterAgent`、`BeforeToolUse`、
  `AfterToolUse`、`SessionStart`、`SessionEnd` 触发；`BeforeModel`、`AfterModel`
  不支持。
- **`tool_input` 改写** 不支持（工具参数冻结，同 Claude Code）。
- **`continue: false`** 部分支持。`BeforeAgent` 的 `continue: false` 降级为「擦除提示
  词并展示原因」；`AfterAgent` 的 `continue: false`（中止循环）没有中止能力，告警或
  忽略。
- **`tailToolCallRequest`** 不支持。
- **`transcript_path`** 部分支持，传空串（DeepSeek Harness 没有可指向的转录文件）。
- **策略规则** 部分支持。`toolName`、`subagent`、`mcpName`、`argsPattern`、
  `commandPrefix`、`commandRegex`、`decision`（allow / deny / ask_user）生效；
  `modes` 门控规则 inactive（DeepSeek Harness 没有上游审批模式状态）、`interactive: true`
  规则 inactive、`toolAnnotations` 永不命中、`allowRedirection` 不生效。只桥接 user 层
  （`~/.gemini/policies/`）；workspace / admin / 内置层不支持。
- **MCP** 部分支持。`httpUrl`（streamable-http）、`command`（stdio）支持；`url`（SSE）
  降级为 streamable-http；`mcp.excluded` 生效。

## Cursor

- **Skill frontmatter** 部分支持。`name`（必须等于目录名）、`description`、
  `disable-model-invocation`、`user-invocable`、`metadata` 生效；`paths` / 旧 `globs`
  路径作用域不支持。
- **子代理 frontmatter** 部分支持。`name`、`description`、`model` 生效；`readonly`、
  `is_background` 不支持。
- **规则（`.cursor/rules/*.mdc`）** 部分支持。`alwaysApply: true` 的规则注入；
  `alwaysApply: false` 或带 `globs` 的规则不支持（上游按语义相关性动态选择，DeepSeek
  Harness 没有这个能力）。
- **hook 事件面** 部分支持。`preToolUse`、`postToolUse`、`userPromptSubmit`、
  `sessionStart`、`sessionEnd`、`stop`、`subagentStart`、`subagentStop` 触发；
  `preCompact`、`afterAgentThought`、`workspaceOpen` 不支持。
- **`updated_input`（改写工具入参）** 不支持，同 Claude Code。
- **`updated_mcp_tool_output`（改写 MCP 工具输出）** 不支持。
- **`subagentStart` 的 `permission: "deny"`** 不支持，忽略（session-start 阶段没有
  拒绝子代理创建的通道）。
- **第三方 Claude hooks 兼容层** 不支持。Cursor 会自己读取 `.claude/settings*.json`
  并翻译事件/工具名（Bash→Shell、Edit→Write）；桥接不镜像这层，而是由 Claude Code 桥
  按 Claude 语义覆盖原文件。
- **权限（`cli.json`）** 部分支持。规则列表生效；全局与项目列表的合并方式是「最具体
  层整体替换」，这是桥接的解读，上游文档未记载合并方式。
- **MCP** 部分支持。`type: "http"` / `"sse"` 降级为 streamable-http。

## 相关链接

- 各工具页的完整限制：[Claude Code](claude-code.zh.md) ·
  [CodeBuddy Code](codebuddy-code.zh.md) · [OpenCode](opencode.zh.md) ·
  [Codex](codex.zh.md) · [Pi](pi.zh.md) · [Gemini CLI](gemini-cli.zh.md) ·
  [Cursor](cursor.zh.md)
