# dsh-bridges

一个 [dsh](https://github.com/deepseek-ai/deepseek-harness)（DeepSeek Harness）插件：把已经为其他 coding agent（Claude Code、Codex、opencode、CodeBuddy……）配置好的项目桥接进 dsh，让这些项目在改用 dsh 时配置继续生效。

整个项目**就是一个插件**——单条 bundle 行（`id: bridges`），内部为每个 agent 工具承载一个桥接子系统。安装一次 `dsh-bridges` 即可覆盖所有已支持的工具；每个工具的桥接可以通过配置独立开关。

> 🚧 **建设中。** 一期（当前）：Claude Code。Codex / opencode / CodeBuddy 的桥接计划在后续阶段实现。

## 支持的 agent 工具

| 工具 | 状态 | Skills / commands | Memory | Hooks |
| :--- | :--- | :--- | :--- | :--- |
| Claude Code | ✅ 一期 | `.claude/skills`、`.claude/commands`（含 `~/.claude`） | `.claude/CLAUDE.md`、`~/.claude/CLAUDE.md` | `settings.json` hooks（SessionStart、UserPromptSubmit、Pre/PostToolUse、Stop、SessionEnd） |
| Codex | 🚧 计划中 | — | — | — |
| opencode | 🚧 计划中 | — | — | — |
| CodeBuddy | 🚧 计划中 | — | — | — |

## 安装

插件通过 profile 的插件管理器（pnpm）安装到某个 dsh profile：

```sh
# 从本仓库 checkout 安装：
dsh plugin --profile <name> add .

# 或将来从发布的 tarball / registry 包安装：
dsh plugin --profile <name> add dsh-bridges
```

插件管理器会把该包追加到 profile 的 `dsh.profile.bundles`，其 `cordis.patch.yml` 向组合树注入一行 `bridges`。验证：

```sh
dsh --profile <name> --dump-config   # 应能看到 "dsh-bridges" 这一行
```

然后在带有 agent 资产（`.claude/`、`~/.claude/`）的项目里启动 dsh；资产按会话工作区发现。

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
```

## Claude Code 桥接（一期）

### Skills 与 Commands

读取 Claude Code 的技能位置并注册到 dsh 的技能注册表（provider 名 `claude-code`），使它们出现在模型可见的技能目录中、可通过 `skill` 工具加载、也可用 `/名字` 直接调用：

| Claude Code 位置 | 注册为 |
| :--- | :--- |
| `~/.claude/skills/<name>/SKILL.md`（也支持扁平 `<name>.md`） | 用户级技能 |
| `~/.claude/commands/<name>.md` | 用户级命令（即技能） |
| `.claude/skills/<name>/SKILL.md`（也支持扁平 `<name>.md`） | 项目级技能 |
| `.claude/commands/<name>.md` | 项目级命令（即技能） |

映射规则：

- DSH 技能名取目录名 / 文件名（必须 kebab-case；不合法的名字跳过并告警）。
- `description` + `when_to_use` 合并为技能描述（按 Claude Code 的 1,536 字符目录上限截断；`description` 缺省时回退到正文首段）。
- `disable-model-invocation` → 该技能退出模型目录，但仍可用 `/名字` 调用。
- `user-invocable: false` → 不面向人工调用，仅模型可用。
- `metadata` 原样透传；其余 frontmatter 字段（见限制）暂忽略。
- 优先级与 Claude Code 一致：个人资产覆盖项目资产；同级下技能覆盖同名命令。同名冲突时 DSH 原生技能（`.dsh/skills`、`.agents/skills`、运行时技能）永远胜出。
- 技能目录整体作为资源基目录，`SKILL.md` 里引用的支撑文件（`scripts/`、`references/` 等）按需解析。
- 已存在的技能根目录会被监听；改动无需重启即可在会话内生效。

### CLAUDE.md 记忆

根目录 `CLAUDE.md` 由 DSH 核心自行加载。本桥接在会话开始时额外注入 `~/.claude/CLAUDE.md`（用户级）与 `.claude/CLAUDE.md`（项目级），采用 dsh 工作区指令相同的 system-reminder 框架，预算 32 KiB（超限先丢弃更宽的用户级文件）。

### Hooks

合并读取 `~/.claude/settings.json` → `.claude/settings.json` → `.claude/settings.local.json` 的 `hooks` 字段（分组叠加合并、相同 handler 去重、`disableAllHooks` 取最具体定义它的层级），并在下列 DSH 生命周期执行 handler：

| Claude Code 事件 | DSH 接缝 | 决策映射 |
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

- hooks 以 Claude Code 工具名为键。DSH 的命名不同（`bash`、`edit`、`read`……），因此桥接做了翻译：`bash`→`Bash`、`pwsh`→`PowerShell`、`read`→`Read`、`write`→`Write`、`edit`→`Edit`、`glob`→`Glob`、`grep`→`Grep`、`web`/`web_search`→`WebSearch`、`ask_user_question`→`AskUserQuestion`、`exit_plan_mode`→`ExitPlanMode`、`subagent`→`Agent`、`todo`→`TodoWrite`。matcher、`if` 规则以及 hook 脚本收到的 `tool_name` 字段都是 Claude Code 名字，因此为 Claude Code 写好的 hook 脚本原样可用。
- matcher 语义遵循 Claude Code 规范：精确名集合（`Bash|Edit`）、其余一律视为非锚定正则、`*`/空匹配全部。
- `if` 过滤器支持常见的 `ToolName(glob)` 形态，每个工具对应一个主参数字段（`Bash(rm *)`、`Edit(*.ts)`……），无法解析时放行，与 Claude Code 的 best-effort 约定一致（不复制其更深的 Bash 子命令分析）。
- 超时与 handler 失败一律放行（绝不因此阻断动作），同 Claude Code。

### 一期限制

尚未桥接（按子系统记录）：

- **Skills**：工作区以下的嵌套 `.claude/skills/`（其限定名非 kebab-case）、企业 / managed 技能、插件技能、claude.ai 同步技能；`allowed-tools`/`disallowed-tools`、`model`、`effort`、`context: fork`/`agent`/`background`、`paths`、`shell` 以及正文中的 `$ARGUMENTS` 替换；skill/agent frontmatter 里的 `hooks`。
- **Memory**：`.claude/rules/*.md`、CLAUDE.md 的 `@import`、嵌套 CLAUDE.md。
- **Hooks**：`mcp_tool`、`prompt`、`agent` 三种 handler 类型；`PreCompact`/`PostCompact`、`Notification`、`SubagentStart`/`SubagentStop`、`PermissionRequest`/`PermissionDenied` 及其余异步事件；`CLAUDE_ENV_FILE`；`asyncRewake`；`updatedInput` 改写（dsh 在策略执行前就冻结了工具参数）；`permissionDecision: "defer"`（映射为拒绝）。`PreToolUse` hooks 也会在子代理的工具调用上触发，与 Claude Code 一致。

## 目录结构

```
src/
├── index.ts                 # 插件入口：单 bundle 行、按工具分段配置、子系统注册表
├── util.ts / fs-adapter.ts  # 各桥接子系统共享
└── agents/
    └── claude-code/         # 每个受支持的 agent 工具一个目录
        ├── skills/          # claude-code 技能 provider
        ├── memory.ts        # CLAUDE.md 记忆注入
        └── hooks/           # settings 合并、matcher、执行器、DSH 生命周期接线
```

新增一个 agent 工具 = 增加 `src/agents/<tool>/` 目录 + `registerBridgeSubsystems()` 里加一行注册；单条 bundle 行已经把它涵盖在内。

## 开发

```sh
pnpm install
pnpm build    # 编译 src/ → lib/
pnpm test     # vitest 单元测试
```

端到端冒烟测试（把插件装进 headless profile 并在 fixture 项目里运行）：

```sh
dsh plugin --profile headless add .
cd /tmp/claude-fixture   # 任意带 .claude/ 资产的项目
dsh --profile headless "list the skills available in your catalog"
```

各桥接目标的参考资料在 [`docs/reference/`](docs/reference/)，包括一期所用的 Claude Code skills/commands/hooks 官方规范。贡献者文档——如何新增一个 agent 工具、DSH 集成面、已知踩坑——在 [`docs/development/`](docs/development/)。
