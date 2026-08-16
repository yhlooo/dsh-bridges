# 质量建设规划

本文给出 dsh-bridges 的验证策略总纲：怎么判断"正确"、测什么、在哪测、以什么顺序投入。E2E 的具体设计见 [e2e-testing.md](e2e-testing.md)，新增桥接的流程见 [adding-an-agent-bridge.md](adding-an-agent-bridge.md)。

## 0. 正确性的判定框架

本项目的正确性不是"代码没 bug"，而是三个维度的**符合性**，所有质量措施都围绕它们：

| 维度 | 含义 | 错了的后果 |
| :--- | :--- | :--- |
| **上游行为符合性** | 桥接后的发现、解析、hook 语义与 claude-code / codebuddy-code / opencode / codex 原版一致 | 用户项目在 dsh 里行为漂移，且很难察觉（"为什么我的 hook 没拦住"） |
| **dsh 接缝契约符合性** | skill provider 契约、rank 段、层序、事件监听、消息注入、fiber 可逆 teardown | 挂载后静默失效、同名冲突、热更新后残留副作用 |
| **对抗性输入健壮性** | 项目文件是任意用户内容（损坏的 TOML/YAML、符号链接、嵌套仓库），hook 本质是执行 shell 命令 | 崩溃、挂起、孤儿进程、输出泄漏 |

## 1. 现状盘点

**已具备（保持）**：按子系统组织的单元测试（parse/matcher/provider/run/settings/memory 各桥接一份，共 221 例）、内存 `TreeFs` 夹具、真实 shell 进程的 hook 执行测试（超时 fail-open、exit 2 阻断、JSON/纯文本分流）、CI 四连（typecheck/build/test/pack dry-run）。

**缺口**：无 lint/format、无覆盖率门槛、无 Windows CI（代码里有 `win32` 分支却从未在 Windows 上跑过）、无真实 dsh 集成测试、无真实上游 CLI 兼容性测试、无打包产物消费冒烟、`examples/` 未作为测试夹具使用。

## 2. 测试分层（在现有基础上补全为 8 层）

| 层 | 内容 | 状态 | 关键点 |
| :--- | :--- | :--- | :--- |
| L0 静态 | typecheck、lint/format、依赖审计 | 已接入（依赖审计待补） | ESLint + Prettier 已入 CI（`pnpm lint` / `pnpm format:check`） |
| L1 纯函数单元 | parse/matcher/decision 逻辑 | 已有 | 补错误路径与边界：空 frontmatter、非法 regex、重复 name |
| L2 文件系统级 | 技能发现、settings 加载、记忆合并 | 已有雏形 | 用真实磁盘 fixture（见 §3）替代手写 Map |
| L3 真实进程 | hook 命令执行契约 | 已有雏形 | 补：信号/进程组回收断言、stdin JSON 载荷断言、环境变量、输出上限、Windows 分支 |
| L4 真实 dsh 集成 | composition + bridges bundle + 假模型 | 已建（12 例，7 类场景齐） | 见 [e2e-testing.md](e2e-testing.md) 环 A |
| L5 真实上游 CLI 兼容性 | 与真实 claude/codebuddy/opencode/codex 输出对齐 | 哨兵已建 | 见 [e2e-testing.md](e2e-testing.md) 环 C（固定版本 + weekly 漂移报警 + doctor 探针；深层行为对标保留人工） |
| L6 打包冒烟 | `npm pack` 产物安装进干净项目并真实加载 | 已建 | 见 [e2e-testing.md](e2e-testing.md) 环 B（`pnpm smoke`，真实 dsh CLI + scratch profile） |
| L7 手动 E2E | 发布前逐项过一遍 docs/guides 功能表 | 已有习惯 | 固化为发布清单 |

L1–L3 是"对不对"的主力防线；L4–L6 守住单元测试覆盖不到的三个地方——真实 dsh 接缝、真实上游工具输出、打包后产物。

## 3. 关键测试资产

1. **统一 fixture 库**：每个工具一套完整真实项目布局（多根目录、向上扫描、settings 全格式、skills、memory、hooks），测试直接跑在真实磁盘 fixture 上。与 `examples/` 合流或明确分层，防止两套样例漂移。
2. **契约快照（golden 表）**：把散落代码里的语义表变成单一事实来源——rank 段（claude 105–120、codebuddy 125–140、opencode 145–160、codex 165–175）、hook 事件-决策矩阵、hook 名称映射（`todo_write`→`TodoWrite` 那类教训）——用常量表驱动代码，测试断言表本身，文档表格交叉引用，一处改动三处可见。
3. **对抗性输入语料**：BOM/CRLF、损坏 TOML/YAML/JSONC、符号链接、嵌套 git 仓库、超大文件、无效 UTF-8——统一放在一个 fixture 集里，所有解析器共享。

## 4. 高风险主题专项（按投入优先级）

1. **hook 执行安全与资源**（最高风险：任意代码执行 + 超时 + 进程组）：fail-open 语义、取消/超时后进程树确实消失、输出截断、async 分支丢弃语义。
2. **发现与优先级语义**：根标记检测、向上扫描边界、符号链接、同名技能遮蔽。注意 [AGENTS.md](../../AGENTS.md) 的教训——**用层序验证遮蔽，不用 rank 数字论证**（同层内桥接段的数字其实高于运行时技能 250，保住优先级的是层序）。
3. **配置解析 fail-soft**：任何坏配置都不能让整个 bridge 失效。
4. **记忆合并/去重**：多来源合并顺序与去重键。
5. **文档-行为一致性**：把"文档描述必须与代码一致"从约定升级为机制（golden 表交叉校验 + PR checklist 项）。

## 5. CI 门禁与指标

- 保留原有四连；已接入：lint（`pnpm lint`）、format 检查（`pnpm format:check`）、依赖审计（`pnpm audit`）、L4 集成 job（`typecheck:e2e` + `test:e2e`）、覆盖率门槛（`pnpm test:coverage`，合并 unit+e2e 报告，行与语句 60 / 分支与函数 70，当前基线 63/76/72——低于 §4 的 80/90 目标值，随用例补齐逐步上调）、**双平台矩阵（ubuntu + windows）**、L6 打包冒烟（`pnpm smoke`，固定版本 `@deepseek-ai/dsh@0.1.0-rc.6`）、L5 上游漂移哨兵（weekly `conformance.yml`）。
- L5 依赖外部 CLI，做成**固定版本 + weekly scheduled 漂移检测**：上游工具升级或输出格式变化时，CI 在发布前报警，而不是用户先踩到。
- 指标红线：单元测试 <30s（当前约 2s）、集成 <10min、测试不得残留子进程/句柄（open-handle 检测）。

## 6. 分阶段路线图

- **P0 地基** ✅（剩余：fixture 库化——e2e 侧已建、单元测试侧待迁移，依赖审计）。
- **P1 集成** ✅：L4 真实 dsh 集成测试、L6 打包冒烟均已落地。验收：任何 bundle 加载/注册回归都能被本地测试抓住。
- **P2 对外符合性** ✅（哨兵层）：固定版本安装 + 版本漂移报警 + doctor 探针已落地；golden 契约表与"真实会话双跑"行为对标待人工补强。验收：上游升级导致的语义变化在 CI 可见。
- **持续机制**：bug 修复三件套（回归测试 → 修复 → 补 [pitfalls.md](pitfalls.md)）；新增桥接按 [adding-an-agent-bridge.md](adding-an-agent-bridge.md) 五阶段走，每阶段同步交付对应层级测试。
