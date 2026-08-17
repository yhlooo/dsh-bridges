# docs/development — 开发文档

本目录存放 dsh-bridges 的自写开发文档。与 [`docs/reference/`](../reference/) 的定位不同：`reference/` 是各 agent 工具**官方原文的资料库**（原文不改动），本目录是面向本项目贡献者的**指南与速查**，随实现经验持续增补。

## 文件清单

| 文件 | 内容 | 什么时候读 |
| :--- | :--- | :--- |
| [adding-an-agent-bridge.md](adding-an-agent-bridge.md) | 主指南：在本项目里接入 / 适配一个 agent 工具的五阶段流程 | 开始一个新工具的适配前通读 |
| [dsh-integration-surface.md](dsh-integration-surface.md) | DSH 侧接缝 API 速查：skills 契约、agent / tools 事件、消息注入、fs 服务、插件打包与加载 | 阶段二映射设计、阶段三实现时对照 |
| [pitfalls.md](pitfalls.md) | 踩坑记录：claude-code、codebuddy-code、OpenCode、codex、Pi、gemini-cli、cursor 各桥接真实踩过的坑与正确写法（含同名机制语义相反的对照、共享 settings 加载器、记忆去重等） | 实现中报错先查这里；遇到新坑时补充 |
| [quality.md](quality.md) | 质量建设规划：正确性判定框架（上游符合性 / dsh 接缝 / 健壮性）、8 层测试分层、关键测试资产、高风险主题、CI 门禁与 P0–P2 路线图 | 规划验证策略、评审测试投入时读 |
| [e2e-testing.md](e2e-testing.md) | E2E 自动化设计：三层环（进程内宿主 + mock LLM / 打包产物 / 上游对标哨兵）、场景语料、工程机制与落地顺序 | 设计或新增 E2E 场景前读 |
| [discussions/](discussions/README.md) | 关键设计议题的讨论记录（论点档案，未定论）：默认姿态、MCP 连接范围、信任假设、记忆注入等，附候选修正方向 | 回溯设计决策的来龙去脉时读；采纳候选方向后移入 todo.md |

## 阅读路径

1. 先看 `AGENTS.md` 的 Plugin Conventions 与 Documentation Conventions（布局、命名与文档分工）；用户可见行为看仓库根 `README.md`（快速开始）与 `docs/guides/`（详细用法与限制）。
2. 读 `docs/reference/<tool>/` 的资料：先读该目录 `README.md` 的**配置规范速查**，再按需查原文。
3. 通读 [adding-an-agent-bridge.md](adding-an-agent-bridge.md)，按五阶段推进；实现时对照 [dsh-integration-surface.md](dsh-integration-surface.md)；报错先查 [pitfalls.md](pitfalls.md)。验证策略与 E2E 场景设计对照 [quality.md](quality.md) 与 [e2e-testing.md](e2e-testing.md)。

## 约定

- 本目录文档为自写内容，用中文；引用官方原文时链接到 `docs/reference/` 的对应文件。
- 每次完成一个新工具的适配后，把该工具特有的决策与坑补充进对应文档（并同步 `docs/guides/` 两种语言），保持"最新经验在文档里"。
- 关键设计议题的未定论讨论记录放在 [`discussions/`](discussions/README.md)；讨论中形成的候选方向在被明确采纳后才移入 `todo.md`。
