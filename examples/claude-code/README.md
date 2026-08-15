# Claude Code 桥接示例项目

以本项目作为 DeepSeek Harness 的会话工作区打开，即可查看 dsh-bridges 的
claude-code 桥接如何将 Claude Code 的资产桥接进来。

> 只含**项目级**资产（`.claude/`）。用户级资产（`~/.claude/`）作用于整台
> 机器，示例有意不提供；如需体验可自行将文件复制到 `~/.claude/`。

## 目录结构

```
.claude/
├── CLAUDE.md                    项目记忆（会话开始注入）
├── settings.json                hooks 配置（见下）
├── skills/
│   ├── changelog-writer/        目录型技能（带支撑脚本 scripts/）
│   │   ├── SKILL.md
│   │   └── scripts/draft-release-notes.sh
│   └── security-review.md       扁平技能（Claude Code 扩展形态）
├── commands/
│   └── explain-code.md          命令（即技能，可 /explain-code 调用）
└── hooks/                       每个 hook 事件一个处理器
    ├── session-start.sh         SessionStart：纯文本 stdout → 首条提示词前注入
    ├── log-prompt.mjs            UserPromptSubmit：将提示词写入 hook-logs/
    ├── log-tool.mjs              PreToolUse（matcher: Bash）：记录每次 Bash 调用
    ├── guard-destructive.js     PreToolUse（if: "Bash(rm *)"）：退出码 2 拒绝 rm -rf
    ├── bash-context.js          PostToolUse（matcher: Bash）：additionalContext 附加到结果旁
    ├── stop-side-effect.sh      Stop：仅副作用（输出被丢弃）
    └── session-end.sh           SessionEnd：仅副作用
```

## 映射关系一览

| Claude Code 资产 | 桥接行为 |
| :--- | :--- |
| `.claude/skills/<name>/SKILL.md`（及扁平 `<name>.md`） | 注册为 DeepSeek Harness 技能（provider `claude-code`），可用 `skill` 工具加载，也可 `/名字` 直接调用 |
| `.claude/commands/<name>.md` | 同上（命令即技能）；同级同名时技能优先 |
| `.claude/CLAUDE.md` | 会话开始以 system-reminder 框架注入 |
| `.claude/settings.json` 的 `hooks` | 映射到 DeepSeek Harness 生命周期（`agent/session-start`、`agent/pre-step`、`tools/pre-execute`、`tools/post-execute`、`agent/turn-stopping`、`agent/disposed`） |

hook 脚本收到的 JSON 里，工具名是 **Claude Code 的名字**（`Bash`、`Edit`……，
桥接做了翻译），matcher 与 `if` 规则按 Claude Code 语义求值，因此为
Claude Code 写好的 hook 原样可用。

## 如何验证

```sh
# 1. 安装插件（repo 根目录，先 pnpm install && pnpm build）
dsh plugin --profile <name> add .

# 2. 在本目录启动 DeepSeek Harness
cd examples/claude-code
dsh --profile <name>
```

- **Skills / Commands**：让模型 `skill changelog-writer` 生成 changelog，
  或直接输入 `/explain-code`、`/security-review`；`changelog-writer` 的
  `scripts/draft-release-notes.sh` 作为资源按需可读。
- **Memory**：会话开始后能看到 `.claude/CLAUDE.md` 的内容被注入
  （system-reminder 块）。
- **Hooks**：会话开始时注入 "Session started …"；每次 Bash 调用后
  `.claude/hook-logs/tools.jsonl` 追加一行、`prompts.jsonl` 记录提示词；
  让模型运行 `rm -rf /tmp/xxx` 会被 guard 以退出码 2 拒绝；
  回合结束 `stops.log` 追加一行。
