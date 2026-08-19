# E2E 自动化测试设计

本文是 [quality.md](quality.md) 中 L4–L6 三层的具体设计。核心思想：**按"被测对象离真相多远"分三环，主力放在进程内宿主的确定性 e2e，真 LLM 和真上游 CLI 只做哨兵，不做日常门禁。**

## 1. 三层环总览

| 环 | 被测对象 | 模型 | 频率 | 失败含义 |
| :--- | :--- | :--- | :--- | :--- |
| A 进程内宿主 | 真实 cordis composition + dsh 服务 + bridges bundle | mock LLM（剧本式） | 每次 CI | 桥接逻辑/接缝回归 |
| B CLI / 产物级 | `npm pack` 产物 + 真实 dsh CLI 加载链路 | 不需要 | main push | 打包/分发回归 |
| C 上游对标 | 同一 fixture 分别跑真实上游 CLI 与我们的桥 | 不需要（CLI 判定） | weekly + 手动 | 上游格式/语义漂移 |

## 2. 环 A：进程内宿主 e2e（主力）

devDependencies 已备齐全套 `@deepseek-ai/dsh-*`，可以在测试里启动一个**服务全真、模型是假的**的宿主：真实 composition 挂载本 bundle，`ctx.skills` 注册表、agent 事件、tools 管道都是真实现，只有 LLM 由 mock 替代。

### 2.1 驱动方式：脚本化 agent 会话

不接真 LLM，mock LLM 按剧本吐 tool_call 序列（"第一轮调 Bash，第二轮调 Edit，第三轮结束"），驱动真实 agent 循环。这样 hook 触发、消息注入都是**真实链路**，结果完全确定、零成本、零网络。

### 2.2 观察点（断言什么）

- **技能服务**：fixture 项目的技能被发现、rank 段正确、同名遮蔽按层序（不是按 rank 数字）。
- **消息注入**：`source.plugin` id（`<tool>-hooks` 之类）、hook 的 `tool_name` 载荷携带上游工具名（`Bash`、`Edit`……）。
- **hook 真实执行**：子进程真的跑起来、stdin 收到 JSON 载荷、exit 2 真的拦住工具、拒绝原因可见。
- **teardown 可逆性**：会话结束 / 插件热更新后进程表快照差为空、无孤儿进程、watcher 关闭。

### 2.3 场景语料（每个工具一份 fixture，7 类场景）

1. 技能发现与优先级
2. 记忆注入与去重
3. hook 放行
4. hook 阻断（exit 2 / JSON deny）→ 工具被拒且拒绝原因可见
5. hook 超时 fail-open
6. 坏配置 fail-soft（整个 bridge 不能崩）
7. teardown 可逆性

## 3. 环 B：CLI / 产物级 e2e

真实 `npm pack` 产物装进 scratch 项目，用真实 dsh CLI 挂载（`dsh plugin add` / profile bundles 机制），断言加载链路：插件加载成功、patch 生效、桥接资产出现在列表中。**只断言不需要 LLM 的部分**；需要模型的部分留给环 A 的 mock 和环 C。

## 4. 环 C：上游对标哨兵

上游 CLI 的**深层行为**（真实 agent 会话、hook 载荷、权限流）需要凭据，无法无感自动化；已落地的哨兵层（`.github/workflows/conformance.yml`，weekly + 手动，`pnpm probe:upstream`）覆盖自动化可行的部分：

- **安装与可运行性**：CI 安装固定版本（`scripts/upstream-tools.json` 里的 pin）的 claude / codex / OpenCode / codebuddy 四个 CLI，断言 `--version` 与 pin 一致。
- **离线健康探针**：`claude doctor`、`codex doctor`（在 `examples/codex` 上跑），按**稳定输出标记**断言而非退出码（doctor 的退出码受 auth/网络状态影响，不可靠）。
- **版本漂移报警**：`npm view <pkg> version` 与 pin 比对，任何上游发布新版本即让 scheduled job 变红，报告里附评审清单（diff `docs/reference/<tool>/` → 重跑 e2e → bump pin）。
- **保留人工的部分**：双跑同一 fixture（真实 CLI vs 我们的桥）的行为对标仍按需人工执行——上游发布后由漂移报警触发，见报告的 checklist。

## 5. 工程机制（防止 e2e 变成负担）

- **vitest workspace 拆分**：`e2e/` 独立 project，日常 `pnpm test` 不含 e2e，`pnpm test:e2e` 显式跑。
- **boot helper**：`bootHarness(config, fixtureCwd)` 统一复用，一个函数搞定启动宿主 + 查询服务句柄。
- **fixture 仓库化**：`e2e/fixtures/<tool>/<scenario>/` 各是完整项目，与 `examples/` 明确分层（examples 面向人，fixtures 面向断言）。
- **确定性纪律**：禁网络、固定环境变量、每 case 独立临时目录、afterEach 强制杀进程树、打开句柄检测。
- **明确不做什么**：CI 不用真 LLM（成本 + 抖动）、断言不重试（只对 CLI 安装类步骤重试）。

## 6. 落地顺序

1. ~~先搭环 A 骨架：boot helper + 3 个场景（技能发现、记忆注入、hook 阻断）进 CI~~ ✅
2. ~~补全 7 类场景矩阵~~ ✅；Windows job 已接入（fixtures 用 `node <脚本>.cjs` 跨平台驱动），teardown 组杀断言在 Windows 跳过（无进程组 kill，见 [pitfalls.md](pitfalls.md) #23）。
3. ~~环 B 打包冒烟挂 main push~~ ✅：`scripts/pack-smoke.mjs`（`pnpm smoke`）——npm pack → 装进 scratch profile → `dsh --dump-config` 断言 `bridges` 行；CI 固定安装 `@deepseek-ai/dsh@0.1.0-rc.7`，本机无 dsh CLI 时自动跳过。
4. ~~环 C 上游对标哨兵~~ ✅（weekly `conformance.yml` + 手动触发；深层行为对标仍需凭据，见 §4）。

## 7. 实施状态

环 A 骨架已落地（`e2e/`），34 个用例全绿并接入 CI（`pnpm typecheck:e2e` + `pnpm test:e2e` + `pnpm test:coverage`）：

- **`e2e/harness.ts`**：`bootHarness()` 启动真实 composition——真实 `skills` 注册表（`@deepseek-ai/dsh-skill`）+ 从 `src/index.ts` 加载的真实 bundle。事件走宿主同一批接缝：`emit` 派发 `agent/session-start`，`waterfall` 派发 `tools/pre-execute` / `tools/post-execute` / `agent/pre-step` 且由调用方提供最内层 `next`（默认策略决策），与宿主运行时语义一致。
- **与设计的一处偏差**：agent 侧用记录式 `E2eAgent` 桩（实现 `session.header.cwd` / `session.id` / `inject()` / `steer()`）而非完整 mock-LLM 驱动循环——dsh 的 agent 循环包不在 devDependencies 里。桩站在真实循环驱动事件的那条接缝上，断言的是"桥会注入什么、会拦下什么"；未来若循环包可引入，替换桩即可，断言不变。
- **fixtures**：`e2e/fixtures/claude-code/` 下按场景分目录（skills / user / memory / memory-dedup / hooks / hooks-live / hooks-timeout / broken-settings / hooks-prompt / hooks-post），测试先复制到临时目录再运行，保证不可变与并行安全。注意 `userClaudeDir` 参数就是 `.claude` 目录本身（provider 直接在其下扫 `skills/`）。fixtures 目录对 prettier/eslint 豁免（`broken-settings` 故意包含非法 JSON）。
- **场景覆盖（7 类矩阵已齐）**：技能发现与同名遮蔽（用户级胜出，按加载出的正文断言而非 rank 数字）、记忆注入与去重坍缩、hook 放行（matcher 未命中）、hook 阻断（真实子进程、stdin 真实载荷、exit 2 → deny；UserPromptSubmit 阻断会擦除原提示词并进入可见的 block notice）、超时 fail-open、坏配置 fail-soft、teardown 杀死存活 hook 子进程（含孙进程——此断言曾暴露并修复了 [pitfalls.md](pitfalls.md) #23 的孤儿进程 bug）。
- **工程机制**：vitest projects 拆分（`unit` / `e2e`），`pnpm test` 只跑单元，`pnpm test:e2e` 显式跑，`pnpm test:coverage` 出合并报告；e2e 串行执行（`fileParallelism: false`）；覆盖率门槛 60/70（行与语句 60、分支与函数 70，当前基线 70/78/79）；环 B `pnpm smoke`、环 C `pnpm probe:upstream`。
- **已知限制**：hook fixtures 通过 `node <脚本>.cjs` 命令跨平台运行，CI 矩阵含 windows-latest；Windows 无进程组 kill，teardown 组杀断言在 win32 跳过（孙进程泄漏是已知平台限制）。
