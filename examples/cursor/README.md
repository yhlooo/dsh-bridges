# Cursor 桥接示例项目

以本项目作为 DeepSeek Harness 的会话工作区打开，即可查看 dsh-bridges 的
Cursor 桥接如何将 Cursor 的项目资产桥接进来。

> 只含**项目级**资产。用户级资产（`~/.cursor/skills`、`~/.cursor/agents`、
> `~/.cursor/hooks.json`、`~/.cursor/mcp.json`、`~/.cursor/cli-config.json`）
> 作用于整台机器，示例有意不提供；如需体验可自行将文件复制到对应位置。

## 目录结构

```
├── AGENTS.md                      工作区根指令（dsh 核心加载，桥接不重复注入）
├── docs/AGENTS.md                 子目录指令（cwd 在 docs/ 时由桥接注入）
└── .cursor/
    ├── skills/release-checklist/  项目级技能（SKILL.md）
    ├── rules/
    │   ├── typescript-style.mdc   alwaysApply: true → 会话开始注入
    │   └── react-patterns.mdc     globs 条件规则 → 跳过（静态无法求值）
    ├── agents/code-reviewer.md    subagent 定义 → 委派规格技能
    └── hooks/
        ├── hooks.json             preToolUse + stop 配置
        ├── block-rm.mjs           拒绝 rm -rf（permission: deny）
        └── followup.mjs           stop 续跑一次（loop_limit: 2）
```

## 映射关系一览

| Cursor 资产 | 桥接行为 |
| :--- | :--- |
| `.cursor/skills/**/SKILL.md`（递归发现） | 注册为 DeepSeek Harness 技能（provider `cursor`，rank 225/230）；`disable-model-invocation`/`user-invocable` 直接映射 |
| `.cursor/agents/*.md` | 委派规格技能（rank 226/231）；`model` → `agentOptions.model`；`readonly`/`is_background` 记限制 |
| `.cursor/rules/*.mdc`（`alwaysApply: true`） | 会话开始注入（system-reminder 框架）；条件规则与 `.md` 文件跳过 |
| 子目录 `AGENTS.md` | 会话开始注入；仓库根的 `AGENTS.md` 跳过（核心已加载） |
| `hooks.json`（项目 > 用户） | 映射到 DeepSeek Harness 生命周期（sessionStart / beforeSubmitPrompt / preToolUse / postToolUse(+Failure) / stop / afterAgentResponse / subagentStart/Stop / beforeShellExecution 等）；exit 2 或 `permission: "deny"` 阻断；`failClosed` 反转失败默认 |
| `cli.json` / `cli-config.json` 的 `permissions.allow/deny`（`Shell()`/`Read()`/`Write()`/`WebFetch()`/`Mcp()`） | `tools/pre-execute` 权限决策（deny 优先于 allow；本示例不含权限配置） |
| `.cursor/mcp.json` 的 `mcpServers` | 动态实例化 dsh MCP 客户端（`${env:}`/`${workspaceFolder}` 插值；本示例不含服务器） |

## 验证方式

1. 按仓库根 README 安装插件：`dsh plugin --profile <name> add .`。
2. 然后：

```sh
cd examples/cursor
dsh --profile <name> "list the skills available in your catalog"
# → release-checklist、code-reviewer 出现在技能目录中
dsh --profile <name> "rm -rf the node_modules directory"
# → preToolUse hook 拒绝该命令并展示原因
dsh --profile <name> "summarize the project conventions"
# → typescript-style.mdc 规则被注入会话
```
