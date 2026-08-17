# dsh-bridges 示例项目

每个受支持的 agent 工具对应一个示例项目：以它作为 DeepSeek Harness 的
会话工作区打开（先安装插件），即可查看该工具的资产如何被桥接。

| 工具 | 目录 | 演示内容 |
| :--- | :--- | :--- |
| Claude Code | [`claude-code/`](claude-code/) | `.claude/skills`（目录型 + 扁平）、`.claude/commands`、`.claude/CLAUDE.md` 记忆、`settings.json` hooks（SessionStart / UserPromptSubmit / PreToolUse+`if` / PostToolUse / Stop / SessionEnd，含 `${CLAUDE_PROJECT_DIR}`） |
| CodeBuddy Code | [`codebuddy-code/`](codebuddy-code/) | `.codebuddy/skills`、`.codebuddy/commands`、`CODEBUDDY.md` 与 `.codebuddy/CODEBUDDY.md` 记忆、`.codebuddy/rules`（含被跳过的条件规则）、`settings.json` hooks（含 `${CODEBUDDY_PROJECT_DIR}`） |
| OpenCode | [`opencode/`](opencode/) | `.opencode/skills`、`.opencode/commands`、`opencode.jsonc` 的 JSON 命令与 `instructions`（单文件 + glob）、`AGENTS.md` 记忆 |
| Codex | [`codex/`](codex/) | `.agents/skills`（含被 `config.toml` 禁用的技能）、AGENTS.md 指令链（嵌套目录）、`.codex/hooks.json` 与 `config.toml` hooks |
| Pi | [`pi/`](pi/) | `.pi/skills`（递归发现 + 支持文件）、`.pi/prompts` 模板、AGENTS.md 上下文文件链、项目信任门禁演示 |
| Gemini CLI | [`gemini-cli/`](gemini-cli/) | `.gemini/skills`、`.gemini/commands`、`.gemini/agents`、GEMINI.md 链（含 `@` 导入）、BeforeTool hook 拒绝演示 |
| Cursor | [`cursor/`](cursor/) | `.cursor/skills`、`.cursor/rules`（alwaysApply + 条件规则跳过）、`.cursor/agents`、`.cursor/hooks`（preToolUse 拒绝 + stop 续跑）、子目录 AGENTS.md |

## 通用步骤

```sh
# 在仓库根安装插件（先 pnpm install && pnpm build）
dsh plugin --profile <profile-name> add .    # <profile-name> = web（Web GUI）或 headless（一次性 CLI）

# 启动 Web GUI（会话工作区在界面里选择，与启动目录无关）
dsh --profile web
```

每个示例只含**项目级**资产；用户级资产（`~/.claude/`、
`~/.codebuddy/`、`~/.config/opencode/`、`~/.agents/`、`~/.codex/`）作用于
整台机器，示例有意不包含，各目录 README 会说明如何按需复制。

各目录内的 README 说明了目录结构、桥接映射关系与逐项验证方式。
