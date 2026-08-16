# CodeBuddy Code 桥接示例项目

以本项目作为 DeepSeek Harness 的会话工作区打开，即可查看 dsh-bridges 的
codebuddy-code 桥接如何将 CodeBuddy Code 的资产桥接进来。

> 只含**项目级**资产。用户级资产（`~/.codebuddy/`）作用于整台机器，
> 示例有意不提供；如需体验可自行将文件复制到 `~/.codebuddy/`。

## 目录结构

```
├── CODEBUDDY.md                  项目记忆（根目录，会话开始注入）
└── .codebuddy/
    ├── CODEBUDDY.md              项目记忆（.codebuddy 目录内，同时注入；内容相同只保留一份）
    ├── settings.json             hooks + permissions 配置（见下）
    ├── rules/
    │   ├── conventional-commits.md  alwaysApply: true → 注入（frontmatter 剥离）
    │   └── frontend-only.md         alwaysApply: false → 跳过（演示条件规则不桥接）
    ├── skills/
    │   └── commit-message/SKILL.md  目录型技能
    ├── commands/
    │   └── explain.md               命令（即技能，可 /explain 调用）
    └── hooks/                       hook 处理器（与 claude-code 示例同构）
```

## 映射关系一览

| CodeBuddy Code 资产 | 桥接行为 |
| :--- | :--- |
| `.codebuddy/skills/<name>/SKILL.md` | 注册为 DeepSeek Harness 技能（provider `codebuddy-code`） |
| `.codebuddy/commands/<name>.md` | 同上（命令即技能）；**项目资产覆盖用户资产**（与 Claude Code 相反） |
| `<cwd>/CODEBUDDY.md`、`.codebuddy/CODEBUDDY.md` | 会话开始注入（system-reminder 框架） |
| `.codebuddy/rules/**`（`alwaysApply` 未关闭） | 注入；frontmatter 剥离；`enabled: false` / `alwaysApply: false` 跳过 |
| `.codebuddy/settings.json` 的 `hooks` | 映射到 DeepSeek Harness 生命周期；`${CODEBUDDY_PROJECT_DIR}` 替换、`once`、60 秒默认超时 |
| `.codebuddy/settings.json` 的 `permissions` | allow/ask/deny 规则在 `tools/pre-execute` 执行（示例：`Bash(rm -rf *)` 直接拒绝、`Bash(git push:*)` 触发审批、`Read(./README.md)` 免审批放行） |
| `.codebuddy/agents/<name>.md` | 自定义 subagent 定义注册为技能：正文携带系统提示与委派规格（label / persona / toolFilter / agentOptions.model / maxDepth） |

hook 脚本收到的 JSON 里，工具名是 **CodeBuddy Code 的名字**（`Bash`、
`Edit`……），matcher 按 CodeBuddy Code 语义（`*`/空匹配全部，其余为正则）
求值，因此为 CodeBuddy Code 写好的 hook 原样可用。

## 如何验证

```sh
# 1. 安装插件（repo 根目录，先 pnpm install && pnpm build）
dsh plugin --profile <name> add .

# 2. 在本目录启动 DeepSeek Harness
cd examples/codebuddy-code
dsh --profile <name>
```

- **Skills / Commands**：让模型 `skill commit-message` 起草提交信息，
  或输入 `/explain`。
- **Memory**：会话开始后能看到 `CODEBUDDY.md`、`.codebuddy/CODEBUDDY.md`
  与 `rules/conventional-commits.md` 的内容被注入；`frontend-only.md`
  （条件规则）不会被注入。
- **Hooks**：会话开始注入 "Session started …"；每次 Bash 调用后
  `.codebuddy/hook-logs/tools.jsonl` 追加一行、`prompts.jsonl` 记录提示词；
  让模型运行 `rm -rf /tmp/xxx` 会被 guard 以退出码 2 拒绝（stdout JSON
  reason 优先展示）；回合结束 `stops.log` 追加一行。
