# docs/development — 开发文档

本目录存放 dsh-bridges 的自写开发文档。与 [`docs/reference/`](../reference/) 的定位不同：`reference/` 是各 agent 工具**官方原文的资料库**（原文不改动），本目录是面向本项目贡献者的**指南与速查**，随实现经验持续增补。

## 文件清单

| 文件 | 内容 | 什么时候读 |
| :--- | :--- | :--- |
| [adding-an-agent-bridge.md](adding-an-agent-bridge.md) | 主指南：在本项目里接入 / 适配一个 agent 工具的五阶段流程 | 开始一个新工具的适配前通读 |
| [dsh-integration-surface.md](dsh-integration-surface.md) | DSH 侧接缝 API 速查：skills 契约、agent / tools 事件、消息注入、fs 服务、插件打包与加载 | 阶段二映射设计、阶段三实现时对照 |
| [pitfalls.md](pitfalls.md) | 踩坑记录：claude-code 一期、codebuddy-code 二期、opencode 三期、codex 四期真实踩过的坑与正确写法（含同名机制语义相反的对照、共享 settings 加载器、记忆去重等） | 实现中报错先查这里；遇到新坑时补充 |

## 阅读路径

1. 先看 `AGENTS.md` 的 Plugin Conventions 与 Documentation Conventions（布局、命名与文档分工）；用户可见行为看仓库根 `README.md`（快速开始）与 `docs/guides/`（详细用法与限制）。
2. 读 `docs/reference/<tool>/` 的资料：先读该目录 `README.md` 的**配置规范速查**，再按需查原文。
3. 通读 [adding-an-agent-bridge.md](adding-an-agent-bridge.md)，按五阶段推进；实现时对照 [dsh-integration-surface.md](dsh-integration-surface.md)；报错先查 [pitfalls.md](pitfalls.md)。

## 约定

- 本目录文档为自写内容，用中文；引用官方原文时链接到 `docs/reference/` 的对应文件。
- 每次完成一个新工具的适配后，把该工具特有的决策与坑补充进对应文档（并同步 `docs/guides/` 两种语言），保持"最新经验在文档里"。
