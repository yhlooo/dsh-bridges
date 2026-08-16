# Codex 桥接示例项目

以本项目作为 DeepSeek Harness 的会话工作区打开，即可查看 dsh-bridges 的
codex 桥接如何将 Codex 的资产桥接进来。

> 只含**项目级**资产。用户级资产（`~/.agents/skills`、`~/.codex/`）作用于
> 整台机器，示例有意不提供；如需体验可自行将文件复制到对应位置。

## 目录结构

```
├── AGENTS.md                      工作区根指令（指令链的一环，见下）
├── packages/api/AGENTS.md         嵌套指令：cwd 在 packages/api 时追加注入
├── .agents/skills/
│   ├── json-validator/SKILL.md    项目级技能（frontmatter 必填 name+description）
│   └── legacy-helper/SKILL.md     被 .codex/config.toml 禁用 → 桥接跳过
└── .codex/
    ├── config.toml                [[skills.config]] 禁用技能；project_doc_max_bytes 等
    ├── hooks.json                 hooks 配置（description + hooks 包装）
    └── hooks/                     每个 hook 事件一个处理器（node 脚本，cwd 即会话目录）
        ├── session-start.js       SessionStart：纯文本 stdout → 首条提示词前注入
        ├── log-prompt.mjs          UserPromptSubmit：将提示词写入 hook-logs/
        ├── log-tool.mjs            PreToolUse（matcher: ^Bash$）：记录每次 Bash 调用
        ├── guard-destructive.js   PreToolUse：退出码 2 拒绝 rm -rf（reason 优先）
        ├── bash-context.js        PostToolUse：additionalContext 附加到结果旁
        └── stop-side-effect.mjs   Stop：仅副作用（输出被丢弃）
```

## 映射关系一览

| Codex 资产 | 桥接行为 |
| :--- | :--- |
| `.agents/skills/<name>/SKILL.md`（cwd → 仓库根每层） | 注册为 DeepSeek Harness 技能（provider `codex`）；越靠近 cwd 越优先 |
| `.codex/config.toml` 的 `[[skills.config]]`（`enabled = false`） | 相应技能跳过发现 |
| `AGENTS.md` / `AGENTS.override.md` 链（仓库根 → cwd） | 会话开始注入（system-reminder 框架）；**仓库根**的普通 `AGENTS.md` 跳过（核心已加载） |
| `.codex/hooks.json`、`config.toml` 内联 `[hooks]` | 映射到 DeepSeek Harness 生命周期；`timeout` 以秒计、默认 600；`async: true` 后台运行 |
| `.codex/config.toml` 的 `sandbox_mode` / `approval_policy` / `default_permissions` | 会话开始写入 DeepSeek Harness 会话的沙箱模式 / 审批策略覆盖（示例：`workspace-write` 沙箱 + `on-request` → 审批 `ask`） |
| `.codex/config.toml` 的 `[mcp_servers.<id>]` | 动态实例化 dsh MCP 客户端，工具注册为 `mcp__codex__<server>__<tool>`（示例：filesystem 服务器） |

hook 脚本收到的 JSON 里，工具名是 **Codex 的名字**（`Bash`、
`apply_patch`、`spawn_agent`……，桥接做了翻译），matcher 按 Codex 语义
（`*`/空匹配全部，其余为 JavaScript 正则）求值，因此为 Codex 写好的
hook 原样可用。

## 如何验证

```sh
# 1. 安装插件（repo 根目录，先 pnpm install && pnpm build）
dsh plugin --profile <name> add .    # <name> = web（Web GUI）或 headless（一次性 CLI）

# 2. 在本目录启动 DeepSeek Harness Web GUI
cd examples/codex
dsh --profile web
```

- **Skills**：让模型 `skill json-validator` 校验某个 JSON 文件；
  `legacy-helper` 已被 `config.toml` 禁用，不会出现在技能目录里。
- **Memory（指令链）**：会话开始注入 `AGENTS.md`；`cd packages/api` 再开
  会话时，`packages/api/AGENTS.md` 追加注入、优先级更高。注意：示例目录
  没有自己的 `.git`，仓库根会向上解析到外层 checkout——此时本目录的
  `AGENTS.md` 处于指令链中间，桥接会注入，而 DeepSeek Harness 核心也会
  加载它，因此会出现重复块；把本目录复制进你自己的 git 仓库后，它成为
  仓库根，桥接跳过根级 `AGENTS.md`、只注入一次。
- **Hooks**：会话开始注入 "Session started …"；每次 Bash 调用后
  `.codex/hook-logs/tools.jsonl` 追加一行、`prompts.jsonl` 记录提示词；
  让模型运行 `rm -rf /tmp/xxx` 会被 guard 以退出码 2 拒绝；
  回合结束 `stops.log` 追加一行。
