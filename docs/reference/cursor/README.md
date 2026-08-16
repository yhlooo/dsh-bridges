# Cursor 参考资料

来源：<https://cursor.com/llms.txt>（官方文档索引，markdown 版，英文；逐页加 `.md` 即可下载原文）。抓取日期 2026-08-16 (UTC)，原文未改动。另从 `https://cursor.com/docs/reference/*` 补齐了 llms.txt 未列出、但被正文链接的 reference 页面（plugins、permissions、sandbox、ignore-file、third-party-hooks）。

## 文件清单

| 文件 | 内容 |
| :--- | :--- |
| [llms.txt](llms.txt) | 官方文档完整索引（docs + help + CLI） |
| [cli-overview.md](cli-overview.md) | CLI 概览：交互/非交互模式、Agent/Plan/Ask、`agent` 命令 |
| [cli-installation.md](cli-installation.md) | CLI 安装（`curl cursor.com/install`，二进制名为 `agent`） |
| [cli-using.md](cli-using.md) | CLI 使用：模式、**rules/AGENTS.md/CLAUDE.md**、**MCP**、worktree、命令审批 |
| [cli-shell-mode.md](cli-shell-mode.md) | CLI Shell Mode（`/shell`，30 秒超时） |
| [cli-headless.md](cli-headless.md) | **无头模式 `agent -p`**：脚本/CI、`--force`/`--yolo`、输出格式 |
| [cli-github-actions.md](cli-github-actions.md) | GitHub Actions/CI 集成与权限限制示例 |
| [cli-acp.md](cli-acp.md) | **ACP（Agent Client Protocol）**：`agent acp` 作为 stdio JSON-RPC 服务器 |
| [cli-reference-slash-commands.md](cli-reference-slash-commands.md) | CLI 内置斜杠命令全集（`/model`、`/mcp`、`/sandbox` 等） |
| [cli-reference-parameters.md](cli-reference-parameters.md) | CLI 全局选项/子命令/`mcp`、`sandbox`、`worker` 子命令 |
| [cli-reference-authentication.md](cli-reference-authentication.md) | CLI 认证：`agent login` / `CURSOR_API_KEY` |
| [cli-reference-permissions.md](cli-reference-permissions.md) | **CLI 权限 token**：`Shell()`/`Read()`/`Write()`/`WebFetch()`/`Mcp()`，`cli-config.json` |
| [cli-reference-configuration.md](cli-reference-configuration.md) | `cli-config.json` / `.cursor/cli.json` schema 与环境变量 |
| [cli-reference-output-format.md](cli-reference-output-format.md) | 无头输出格式：`text`/`json`/`stream-json` |
| [cli-reference-terminal-setup.md](cli-reference-terminal-setup.md) | 终端键位配置 |
| [cli-changelog.md](cli-changelog.md) | **CLI 变更日志（关键证据源）**：CLI 读取 skills/rules/commands/hooks/subagents/MCP 的历次确认 |
| [rules.md](rules.md) | **Rules 规范**：`.cursor/rules/*.mdc`、四类规则、frontmatter、AGENTS.md |
| [rules-help.md](rules-help.md) | Rules FAQ：`.cursorrules` 弃用迁移、CLAUDE.md、同名规则按路径区分 |
| [skills.md](skills.md) | **Skills 规范**：SKILL.md、加载目录、frontmatter、嵌套/作用域 |
| [skills-help.md](skills-help.md) | Skills FAQ：目录、`paths` 作用域、rules vs skills、`/migrate-to-skills` |
| [subagents.md](subagents.md) | **Subagents 规范**：`.cursor/agents/*.md`、frontmatter、内置/自定义 |
| [commands（见 plugins-reference）](plugins-reference.md) | **Commands 格式**：`commands/` 目录、扩展名、frontmatter（在插件参考内） |
| [hooks.md](hooks.md) | **Hooks 完整规范**：`hooks.json`、事件全集、matcher、输入/输出 JSON、云 agent 支持 |
| [third-party-hooks.md](third-party-hooks.md) | **Claude Code hooks 兼容**：`.claude/settings.json` 读取、事件/工具名映射 |
| [mcp.md](mcp.md) | **MCP 规范**：`.cursor/mcp.json`、stdio/SSE/HTTP、OAuth、插值 |
| [mcp-help.md](mcp-help.md) | MCP FAQ：项目/全局合并与优先级 |
| [mcp-install-links.md](mcp-install-links.md) | MCP 安装 deeplink 格式 |
| [permissions-reference.md](permissions-reference.md) | **permissions.json 参考**：mcpAllowlist/terminalAllowlist/autoRun、优先级 |
| [sandbox-reference.md](sandbox-reference.md) | sandbox.json 参考（网络/路径/临时目录） |
| [agent-security.md](agent-security.md) | Agent 安全默认值：`.cursorignore`、审批、workspace trust |
| [agent-security-run-modes.md](agent-security-run-modes.md) | **Run Modes**：Auto-review / Allowlist / Run Everything、permissions.json 与 sandbox.json |
| [customize-cursor.md](customize-cursor.md) | Customize 页总览：Plugins/Rules/Skills/Subagents/Hooks/**Commands** 组件定义 |
| [plugins.md](plugins.md) | 插件分发：Agent Plugins vs Cursor Plugins、team marketplace |
| [plugins-reference.md](plugins-reference.md) | **Cursor 插件参考**：manifest、组件目录发现、commands/hooks/agents 格式 |
| [agent-overview.md](agent-overview.md) | Cursor Agent 概览与工具列表 |
| [ignore-file-reference.md](ignore-file-reference.md) | `.cursorignore` / `.cursorindexingignore` 语法与默认忽略 |
| [ignore-files.md](ignore-files.md) | Ignore 文件 FAQ |
| [context.md](context.md) | `@` 引用与上下文 |
| [themes.md](themes.md) | IDE 主题/外观（纯 IDE，无桥接资产） |
| [cli-help.md](cli-help.md) | CLI 常见问答 |

## 配置规范速查

> 说明：Cursor 有两套并行产物——**IDE（编辑器/Agent 窗口）** 与 **CLI（`agent` 二进制）**。二者共享大部分 `.cursor/` 项目资产，但读取范围与优先级并不完全一致。下表逐条标注"IDE / CLI（交互）/ CLI 无头 `-p`"三者是否读取，来源标注对应文件名（详见各原文）。

### 资产速查表

| 资产 | 目录/文件 | 格式与 frontmatter/关键键 | 优先级规则 | IDE | CLI 交互 | CLI 无头 `-p` |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Rules**（项目） | `.cursor/rules/*.mdc`（`.md` 被忽略） | frontmatter：`description`、`alwaysApply`、`globs` | Team → Project → User（rules.md） | ✅ | ✅（cli-using） | ✅（cli-using/changelog） |
| **Rules**（AGENTS.md） | 项目根 + 任意子目录 | 纯 markdown，无 frontmatter；嵌套子目录叠加 | 更具体目录优先 | ✅ | ✅（cli-using） | ✅ |
| **Rules**（CLAUDE.md） | 项目根 | 纯 markdown；**总是应用** | 同 AGENTS.md | ✅（rules-help） | ✅（cli-using） | ✅ |
| **Rules**（`.cursorrules`） | 项目根 | 旧版单文件，**已弃用** | — | ⚠️ 遗留 | 未说明 | 未说明 |
| **User Rules** | Cursor 设置（非文件） | 自由文本 | Team → Project → User | ✅ | 未说明（非文件） | 未说明 |
| **Skills** | `.cursor/skills/`、`.agents/skills/`（项目）；`~/.cursor/skills/`、`~/.agents/skills/`（用户）；兼容 `.claude/skills/`、`.codex/skills/` | 每技能一个目录 + `SKILL.md`；frontmatter：`name`(必)、`description`(必)、`paths`、`disable-model-invocation`、`metadata`、旧 `globs`、`user-invocable`；可含 `scripts/` `references/` `assets/` | 嵌套目录自动作用域到该目录；同名优先级未明确 | ✅ | ✅（changelog 355） | ✅（changelog 276） |
| **Subagents** | `.cursor/agents/*.md`（项目）；`~/.cursor/agents/`（用户）；兼容 `.claude/agents/`、`.codex/agents/` | frontmatter：`name`、`description`、`model`、`readonly`、`is_background` | 项目 > 用户；`.cursor/` > `.claude/` > `.codex/`（subagents.md） | ✅ | ✅（subagents.md 8/changelog 309） | ✅（changelog 309） |
| **Commands** | 插件内 `commands/*.{md,mdc,markdown,txt}`；**独立项目级目录未在本文档确认** | frontmatter：`name`、`description` | 未说明 | ✅ | ✅（changelog 355 `/commands`） | 未说明（changelog 149 称"file-backed custom-command"） |
| **Hooks** | `.cursor/hooks.json`（项目）、`~/.cursor/hooks.json`（用户）、企业/团队托管 | `version`、`hooks.<event>[]`，每项：`command`、`type`、`timeout`、`loop_limit`、`failClosed`、`matcher` | Enterprise → Team → Project → User（hooks.md） | ✅ | ✅（changelog 302/346） | ⚠️ 无明确证据 |
| **MCP** | `.cursor/mcp.json`（项目）、`~/.cursor/mcp.json`（用户） | `mcpServers`；stdio：`command`/`args`/`env`/`envFile`；远程：`url`/`headers`/`auth`；插值 `${env:}`、`${workspaceFolder}` 等 | 项目覆盖用户（mcp-help）；CLI 去重（changelog 82） | ✅ | ✅（cli-using 33） | ✅（cli-using 33） |
| **Permissions**（IDE+CLI 共享） | `~/.cursor/permissions.json`、`.cursor/permissions.json` | `mcpAllowlist[]`、`terminalAllowlist[]`、`autoRun{allow_instructions,block_instructions}`；JSONC | team admin > permissions.json(user∪repo) > IDE 设置 | ✅ | ✅（changelog 313） | ✅（changelog 313） |
| **Permissions**（CLI 专用） | `~/.cursor/cli-config.json`、`.cursor/cli.json`（仅项目级可配权限） | `permissions.allow/deny[]`：`Shell()`/`Read()`/`Write()`/`WebFetch()`/`Mcp()`；`approvalMode` | deny > allow（cli-reference-permissions） | ❌ | ✅ | ✅ |
| **Sandbox** | `~/.cursor/sandbox.json`、`.cursor/sandbox.json` | 网络策略、额外读写路径、临时目录、共享缓存 | 项目 > 用户（run-modes 108） | ✅ | ✅（changelog 336） | ✅（changelog 336） |
| **Ignore** | `.cursorignore`、`.cursorindexingignore` | `.gitignore` 语法 | 叠加 .gitignore + 默认列表 | ✅ | 未单独说明 | 未单独说明 |
| **插件** | `~/.cursor/plugins/local`、`.cursor-plugin/plugin.json`、`plugin.json` | 组件目录：`rules/`、`skills/`、`agents/`、`commands/`、`hooks/`、`mcp.json` | 团队 marketplace 安装模式（Default Off/On/Required） | ✅ | ✅（changelog 311 `--plugin-dir`） | ✅（changelog 34 插件 hooks） |
| **CLI 配置** | `~/.cursor/cli-config.json`（`CURSOR_CONFIG_DIR`/`XDG_CONFIG_HOME` 可改） | `version`、`editor.vimMode`、`permissions`、`approvalMode`、`sandbox`、`autoAcceptWebSearch` 等 | —（仅 CLI） | ❌ | ✅ | ✅ |
| **themes / settings.json** | IDE 主题/`~/.cursor/settings.json`（VS Code 风格） | — | — | ✅ | 仅 `enabled_plugins`（changelog 248） | 仅 `enabled_plugins` |

### 关键结论：IDE 专属 vs CLI/无头

- **IDE 专属、CLI 不读**：Tab hooks（`beforeTabFileRead`/`afterTabFileEdit`，hooks.md 89 明言"Tab completions are an IDE feature"）、`sessionEnd`（hooks.md 88 称与 IDE 会话边界绑定，云 agent 不适用）、团队托管 hooks 的 dashboard 分发 UI、themes。
- **CLI 明确读取**（交互 + 无头 `-p` 均有证据）：rules（`.cursor/rules`、`AGENTS.md`、`CLAUDE.md`）、skills（`.cursor/skills` 等，`/skill-name` 在 `-p` 可用）、subagents、MCP（`.cursor/mcp.json`）、permissions.json、sandbox.json、插件（`--plugin-dir`）。
- **CLI 交互确认、无头 `-p` 无明确证据**：hooks 在 CLI 会触发（changelog 302/346），但**无头 `-p` 模式是否执行 hooks，文档未找到明确说明**（`workspaceOpen` 例外，hooks.md 1405 明言"Runs in the Cursor desktop app and CLI"）。
- **二进制名**：CLI 二进制是 `agent`（`curl cursor.com/install` 安装，cli-installation）。`cursor` 是桌面应用；无头模式是 `agent -p`（print mode），不存在 `cursor agent` 子命令（`agent agent "…"` 才是进入 agent 模式的写法，cli-reference-parameters）。
