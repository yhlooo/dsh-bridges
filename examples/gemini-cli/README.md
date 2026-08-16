# Gemini CLI 桥接示例项目

以本项目作为 DeepSeek Harness 的会话工作区打开，即可查看 dsh-bridges 的
Gemini CLI 桥接如何将 Gemini 的资产桥接进来。

> 只含**项目级**资产。用户级资产（`~/.gemini/skills`、`~/.gemini/commands`、
> `~/.gemini/agents`、`~/.gemini/policies`、`~/.gemini/GEMINI.md`）作用于
> 整台机器，示例有意不提供；如需体验可自行将文件复制到对应位置。

## 目录结构

```
├── GEMINI.md                      工作区上下文文件（含 @./docs/conventions.md 导入）
├── docs/conventions.md            被 GEMINI.md 导入的片段
└── .gemini/
    ├── skills/
    │   ├── security-reviewer/     项目级技能（SKILL.md + references/ 支持文件）
    │   └── deploy-check/          项目级技能
    ├── commands/review.toml       斜杠命令 → /review 技能
    ├── agents/code-reviewer.md    subagent 定义 → 委派规格技能
    ├── hooks/block-rm.mjs         BeforeTool hook（node 脚本）
    └── settings.json              hooks 配置（matcher: run_shell_command）
```

## 映射关系一览

| Gemini CLI 资产 | 桥接行为 |
| :--- | :--- |
| `.gemini/skills/<name>/SKILL.md`（工作区 > 用户） | 注册为 DeepSeek Harness 技能（provider `gemini-cli`，rank 205/210） |
| `.gemini/commands/<name>.toml` | 注册为技能（rank 207/212）；嵌套 `dir:name` 命名空间命令被跳过（非 kebab-case） |
| `.gemini/agents/*.md` | 委派规格技能（rank 206/211）；`tools` 经工具名翻译、`max_turns` → `maxDepth`；`kind: remote` 跳过 |
| `GEMINI.md`（全局 → 工作区及父目录到 `.git` 边界）+ `@./path` 导入 | 会话开始注入（system-reminder 框架），导入内联展开 |
| `settings.json` 的 `hooks` | 映射到 DeepSeek Harness 生命周期（SessionStart / BeforeAgent / AfterAgent / BeforeTool / AfterTool / SessionEnd）；matcher 工具事件用正则；exit 2 或 `decision: "deny"` 阻断 |
| `~/.gemini/policies/*.toml` 的 `[[rule]]` | `tools/pre-execute` 权限决策（deny > ask_user > allow，最高优先级先匹配；本示例不含策略文件） |
| `settings.json` 的 `mcpServers` | 动态实例化 dsh MCP 客户端（`mcp__gemini__<server>__<tool>`；本示例不含服务器） |

## 验证方式

1. 按仓库根 README 安装插件：`dsh plugin --profile <name> add .`。
2. 然后：

```sh
cd examples/gemini-cli
dsh --profile <name> "list the skills available in your catalog"
# → security-reviewer、deploy-check、review、code-reviewer 出现在技能目录中
dsh --profile <name> "rm -rf the node_modules directory"
# → BeforeTool hook 拒绝该命令并展示原因
dsh --profile <name> "summarize the conventions in this repo"
# → GEMINI.md 与 docs/conventions.md 的导入内容被注入会话
```
