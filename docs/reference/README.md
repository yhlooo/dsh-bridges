# docs/reference — 参考资料库

本目录存放完成 dsh-bridges 项目所需的资料，供开发时查阅，不属于面向使用者的正式文档。

## 结构

```
docs/reference/
├── README.md                  # 本索引
├── claude-code/               # Claude Code 官方文档
│   ├── README.md              # 资料说明 + 配置规范速查
│   ├── llms.txt               # 官方文档完整页面索引
│   ├── skills.md / commands.md / hooks.md / hooks-guide.md
│   ├── memory.md / settings.md / claude-directory.md
│   └── sub-agents.md / features-overview.md / debug-your-config.md
├── codebuddy-code/            # CodeBuddy Code 官方仓库 docs/ 原文（中文）
│   ├── README.md              # 资料说明 + 配置规范速查
│   ├── docs-overview.md / codebuddy_code_docs_map.md
│   ├── skills.md / slash-commands.md / hooks.md / hooks-guide.md
│   ├── memory.md / codebuddy-dir.md / settings.md
│   ├── sub-agents.md / permissions.md / permission-modes.md
│   └── plugins*.md / env-vars.md / cli-reference.md / troubleshooting.md 等
├── codex/                     # OpenAI Codex 官方文档
│   ├── README.md              # 资料说明 + 配置规范速查
│   ├── llms.txt               # 官方文档索引（Codex 部分）
│   ├── skills.md / slash-commands.md / rules.md / subagents.md
│   ├── config-basic.md / config-reference.md / config-advanced.md
│   ├── agents-md.md / environment-variables.md / approvals-security.md
│   └── plugins.md / customization-overview.md / cli.md
├── opencode/                  # opencode 官方文档
│   ├── README.md              # 资料说明 + 配置规范速查
│   ├── skills.md / commands.md / rules.md / config.md / agents-config.md
│   ├── permissions.md / plugins.md / custom-tools.md / tools.md
│   └── references.md / mcp-servers.md
└── deepseek-harness/          # DeepSeek Harness 侧资料（来自本地安装的 @deepseek-ai/dsh 包）
    ├── README.md / README.zh.md
    └── agent-presets/         # agent preset 结构与 skills 示例
```

## 约定

- 下载的官方原文保持原样不改动，仅在文件头部注明**来源 URL**和**抓取/复制日期**。
- 更新方式：按文件头部注明的来源 URL 重新下载即可。
- 每个工具目录下的 README.md 是自写的索引与配置规范速查，其余为原文。
- 本资料库服务于所有桥接目标：让 DeepSeek Harness 兼容已经配置好 Claude
  Code、CodeBuddy Code、opencode、Codex 的项目；每个工具目录下，README.md 里
  的**配置规范速查**标明了该桥接实现所依据的重点规范。
