# 在本项目中添加 / 适配一个 agent 工具

本指南记录如何在 dsh-bridges 里接入一个新的 agent 工具，让 dsh 读取并注册该工具的项目资产（skills / commands / 记忆 / hooks / permissions / MCP 等）。claude-code 是第一个按此流程完成的实例，codebuddy-code 是第二个（其与 Claude 同名机制相反的语义差异记录在 [pitfalls.md](pitfalls.md) 第 16 条），opencode 是第三个（无 hooks 配置；插件 API 记为限制，pitfalls 第 18–19、22 条），codex 是第四个（TOML 配置 + 多层级 hooks，pitfalls 第 20–21 条），pi 是第五个（宽松 frontmatter + 信任门禁、无 hooks/权限/MCP，pitfalls 第 29–30 条），gemini-cli 是第六个（Policy Engine TOML 权限 + GEMINI.md `@` 导入 + 毫秒级 hook 超时，pitfalls 第 31 条），cursor 是第七个（技能 name 必须等于目录名 + `.cursor/rules` 以仓库根为锚 + matcher 包含匹配，pitfalls 第 31 条），文中以它们的实现为参考答案。

## 前置知识

- 根 `README.md`（快速开始 + 状态总览；两种语言）与 `docs/guides/`（详细用法与限制：`README.md` 英文 / `README.zh.md` 中文）。
- `AGENTS.md` 的 Plugin Conventions 与 Documentation Conventions：布局、命名与文档分工，实现时必须遵守。
- `docs/reference/<tool>/`：目标工具的官方文档（先读各目录 `README.md` 的配置规范速查）。
- `docs/development/dsh-integration-surface.md`：DSH 侧接缝 API 速查，阶段二 / 三对照用。
- `docs/development/pitfalls.md`：踩坑记录，报错先查。

## 总览：五阶段流程

| 阶段 | 做什么 | 产出物 | 仓库位置 |
| :--- | :--- | :--- | :--- |
| 一 · 调研 | 收集官方文档，回答"资产清单问题" | 配置规范速查表 | `docs/reference/<tool>/README.md` |
| 二 · 映射设计 | 把该工具的每类资产映射到 DSH 接缝，记录决策 | 映射表（写在速查表或本指南的阶段记录里） | 文档 |
| 三 · 实现 | 按映射写子系统代码并注册 | `src/agents/<tool>/` + 一行注册 + config 段 | `src/` |
| 四 · 测试 | 单测 + 端到端冒烟 | 测试文件 + fixture 项目 | `src/__tests__/`、headless profile |
| 五 · 验收 | 按清单逐项验证 | 全绿 + 冒烟通过 + 文档更新 | — |

---

## 阶段一 · 调研

### 资料收集规范

- 官方原文放入 `docs/reference/<tool>/`，**原文不改动**，仅按现有惯例在文件头部注明**来源 URL** 和**抓取日期**（参考 `docs/reference/claude-code/*.md` 的头部）。
- 该目录下的 `README.md` 是**自写的索引 + 配置规范速查**：文件清单表 + 一份"资产速查"（目录层级、文件格式、关键字段）。claude-code 的 [README](../reference/claude-code/README.md) 就是范例。
- 更新方式：按文件头部注明的来源 URL 重新下载即可。

### 调研清单（每个工具必须回答）

1. **配置目录**：项目级 / 用户级 / 全局（enterprise）级的位置（如 `.claude/`、`~/.claude/`）；本地覆盖文件（如 `settings.local.json`）；哪些会被 gitignore。
2. **技能（skills）**：存放位置与层级；文件格式（目录 `SKILL.md` / 扁平 `.md`）；frontmatter 字段全集与默认值；命名规则（kebab-case？）；支持文件（scripts/references 等）；优先级与同名冲突规则（个人 vs 项目、skill vs command）；嵌套目录是否生效；是否有保留目录名。
3. **命令（commands / slash commands）**：独立目录还是并入 skills；文件名如何决定命令名；frontmatter 与 skills 的差异。
4. **记忆（memory / rules）**：文件位置与加载顺序（用户 → 项目 → 嵌套）；`@import` / include 语法；按路径生效的规则文件（如 `.claude/rules/`）；去重规则。
5. **hooks**：配置位置（settings 文件、插件、frontmatter）；事件全集与触发时机；matcher 语法；handler 类型（command/http/prompt/agent/...）；输入 JSON schema；输出协议（JSON 字段、退出码语义、哪个事件可 block）；超时与失败策略（fail-open / fail-closed）；多层级配置如何合并、去重、禁用开关。
6. **其他资产**：subagents、MCP 配置、plugins、output styles 等——明确哪些**纳入本期**、哪些记入限制。
7. **限制清单**：明确"本期不桥接什么"，防止范围蔓延。

> 范围控制的教训：把范围写进速查表（claude-code 的速查表明确列了 skills/commands/hooks 三类），嵌套技能、插件技能、`$ARGUMENTS` 替换等当时就记为限制，而不是实现中途临时决定。

---

## 阶段二 · 映射设计

核心原则：

1. **翻译层，不改动上游资产**：dsh-bridges 只读上游配置，绝不写入或改写（例外：仅读取所需）。
2. **DSH 原生资产优先**：同名冲突时 dsh 自己的（`.dsh/skills`、`.agents/skills`、运行时技能）永远赢。
3. **无资产零开销**：项目里没有该工具的目录时，除了一两次文件探测外不注入任何东西、不注册任何副作用。
4. **失败策略按协议走**：上游规定 fail-closed 的（如 frontmatter 非法值）就 fail-closed；上游规定 best-effort 的（如 hook `if` 过滤器、hook 运行失败）就 fail-open。不要自行"更安全"。

### 技能 / 命令 → `ctx.skills` provider

- 每个工具注册**一个** provider（名 = 工具名，如 `claude-code`），实现 `list()`（发现 + 摘要）与 `get()`（按需加载正文）。契约见 [dsh-integration-surface.md](dsh-integration-surface.md#skills-注册表)。
- **命名**：DSH 技能名必须是 kebab-case（`isSkillName`），上游允许的非法名（camelCase 等）**跳过 + warn**，不要私自转写。
- **rank 段分配**：每个工具独占一段（claude 105–120、codebuddy 125–140、opencode 145–160、codex 165–175），段内再按**上游语义**细分（claude：个人 < 项目；codebuddy / opencode：项目 < 用户；codex：项目 < 用户 < 系统——上游优先级不同，段内顺序要跟着上游走，别照抄别的工具）。rank 越小越优先；段之间谁优先由你的设计决定并在 `docs/guides/` 写明。运行时技能 rank=250、bundled=600，别碰。
- **invocation policy 映射**：`disable-model-invocation` → `modelInvocable` 取反；`user-invocable` → `userInvocable`；非法布尔值**丢弃整个技能 + warn**（fail closed）。
- **description**：上游的 `description` + 触发条件字段合并，按上游的截断长度截断；缺省时回退正文首段（claude 的行为）。
- **resourceBase**：目录型技能给 `{ kind: 'directory', path }`，支撑文件随正文按需解析。
- **监听**：用 chokidar 监听已存在的技能根目录，变更时调 `control.invalidate()`（目录增删 / `SKILL.md` 增删改 / 扁平 md）；**settings 能改变目录内容时（如 codebuddy 的 `skillOverrides`）settings 文件也要纳入 watcher**，否则改 settings 不会刷新目录；注意 LRU 上限防止项目多了泄漏。
- **get() 语义**：文件消失 → 返回 `undefined`（技能不可加载）；frontmatter 损坏 → warn + `undefined`；调用方 abort → 抛错。

### 记忆 → `agent/session-start` 注入

- 注入点固定为 `agent/session-start`（`payload.source !== 'resume'` 时注入，避免 resume 重复；fresh/clear/compact 都注入）。
- 用户级与项目级各读一份，与 DSH 核心已加载的文件做**内容级去重**（如根 `CLAUDE.md` 与 `.claude/CLAUDE.md` 相同则只保留一份）。
- 框架文案统一 `<system-reminder>` 模式（参考 `src/agents/claude-code/memory.ts`），预算超限时**先丢更宽的用户级、再截断最具体的项目级**，内容中的 `</system-reminder>` 必须转义。
- 通过 `createUserMessage({ content: [text], source: { kind: 'plugin', plugin: '<tool>-memory' } })` 构造，`agent.inject()` 投递。

### hooks → 生命周期映射

- **事件映射**：对照上游事件语义找 DSH 接缝。通用对应关系（claude 实例）：

| 上游典型事件 | DSH 接缝 | 能做什么 |
| :--- | :--- | :--- |
| 会话开始 | `agent/session-start` | 注入上下文（不可阻塞） |
| 用户提交提示词 | `agent/pre-step`（仅含 `source.kind === 'user'` 的 claimed 消息） | 拦截（替换进入消息）、追加上下文 |
| 工具调用前 | `tools/pre-execute` | allow / deny / ask |
| 工具调用后（成功/失败） | `tools/post-execute`（按 `result.isError` 区分） | 替换 content、附加上下文 |
| 回合将结束 | `agent/turn-stopping` | `agent.steer()` 要求继续（需计数封顶） |
| 会话结束 | `agent/disposed` | 仅副作用（预算很短） |

- **子代理排除**：上游只在主会话触发的事件（UserPromptSubmit、Stop、SessionStart、SessionEnd），用 `agent.session.header.delegationDepth !== undefined` 排除子代理；工具类事件上游在子代理里也触发，则不排除。
- **decision 映射**：deny→`{kind:'deny',reason}`；ask→`{kind:'ask',reason?}`；allow→调用 `next()`；block 类决策在 pre-step 用"**替换进入消息**"（`{kind:'enter', messages:[通知]}`）而非 reject——reject 后原因没有任何可见通道；continue 类决策用 `steer`。
- **fail-open**：hook 超时 / 启动失败 / 被取消 → 放行（上游命令类 hook 的语义）；只有上游明确规定 fail-closed 的才拦截。
- **工具名翻译**：上游工具名（`Bash`、`Edit`…）与 DSH（`bash`、`edit`…）不同，matcher、`if` 规则、hook 的 `tool_name` 载荷都用**上游名字**（翻译表见 `src/agents/claude-code/hooks/names.ts`），这样上游写好的 hook 脚本原样可用。
- **多层级配置合并**：settings 按"宽 → 具体"叠加合并，相同 handler 去重（JSON 序列化比较），禁用开关取最具体层定义的值；`if` 过滤器只在工具事件上生效。**同一批 settings 文件被多个子块读取时（如 codebuddy 的 hooks 与 skills 的 `skillOverrides`），把加载器做成子系统级共享实例**（按路径 stamp 缓存），避免两份缓存与两份解析。
- 映射决策**写进 `docs/guides/` 的映射表**（claude / codebuddy / opencode / codex 的指南都有完整表格），这是阶段五验收的依据。

---

## 阶段三 · 实现

### 目录与文件职责

```
src/agents/<tool>/
├── index.ts          # 子系统入口：register<Tool>Bridge(ctx, logger, fs, config)
│                     #   按 config 开关依次注册 skills / memory / hooks
├── skills/
│   ├── parse.ts      # 上游技能文件格式解析（frontmatter、字段映射、布尔解析）
│   └── provider.ts   # SkillProvider 实现：发现、摘要、加载、监听
├── memory.ts         # 记忆注入（agent/session-start 监听）
└── hooks/            # （有 hooks 时）
    ├── types.ts      # 配置与运行期类型
    ├── settings.ts   # 配置发现与合并
    ├── matcher.ts    # matcher / if 语法
    ├── run.ts        # handler 执行（子进程 / HTTP、超时、输出解析）
    └── bridge.ts     # DSH 事件接线与 decision 映射
```

- 当 settings 同时服务 skills 与 hooks（如 codebuddy 的 `skillOverrides` + hooks；codex 的 hooks + `[[skills.config]]` + `project_doc_*` 甚至服务到 memory）时，把加载器提为子系统根级的 `settings.ts` 共享实例（codebuddy / codex 的布局），hooks/ 目录只留 types/matcher/run/bridge；布局以"谁消费"为准，不必死守上图。
- 公共代码放 `src/util.ts` / `src/fs-adapter.ts`，只放**多个工具都会用**的东西；一个工具的细节留在自己的目录里。
- 每个子系统入口签名统一：`(ctx: Context, logger: BridgeLogger, fs: FsAdapter, config: XxxConfig)`，方便在注册表里统一分发。

### 注册三件事

1. **`src/index.ts`**：`registerBridgeSubsystems()` 加一行 `register<Tool>Bridge(ctx, logger, fs, config.<tool>)`；`Config` schema 加一个工具段。
2. **config 段**：`z.object({...})` 嵌套段，字段带 `.default()`；**不要**给嵌套对象加 `.default({})`（schemastery 会自动补全缺失的嵌套对象与字段默认值，详见 [pitfalls](pitfalls.md)）。段内必备 `enabled` 总开关。
3. **不新增 bundle / row / 包**：`cordis.patch.yml` 保持单行不动。

### 生命周期纪律（硬性要求）

- provider：`ctx.skills.registerProvider(create)` 在 apply 同步调用；watcher 的关闭通过 `ctx.effect(() => () => provider.dispose())` 挂到 fiber。
- 事件监听全部用 `ctx.on(...)`（随 fiber 自动清理）；自己 spawn 的子进程（含 async hook）要登记集合、effect teardown 时清理。
- 不持有跨会话的活对象；缓存（settings、watcher 表）要有界。
- 文件读取统一走 `FsAdapter`（有 `ctx.fs` 用服务，没有则 Node 回退），不要裸用 `node:fs`。

### 构建与测试命令

```sh
pnpm install
pnpm build        # tsc → lib/
pnpm typecheck
pnpm test         # vitest（src/**/*.test.ts）
```

---

## 阶段四 · 测试

### 单测模式（`src/__tests__/`）

| 对象 | 模式 | 现有范例 |
| :--- | :--- | :--- |
| 文件格式解析 | 直接喂字符串断言字段映射、非法输入抛错 | `parse.test.ts` |
| provider 发现 | 内存 `Map` 实现 `FsAdapter`（`TreeFs`），断言发现、rank、跳过规则、get 行为 | `provider.test.ts` |
| settings 合并 | 内存 `Map` 实现 `FsAdapter`（`MemoryFs`），断言合并、去重、禁用开关、缓存 | `settings.test.ts` |
| matcher / if | 纯函数直接断言 | `matcher.test.ts` |
| hook 执行 | **真实子进程**：`sh -c` 的 echo/exit 2/超时/exec form/stdin JSON | `run.test.ts` |
| decision 解析 | 构造 `HookOutcome` 数组断言 resolver 输出（deny 优先级、fail-open） | `run.test.ts` |

### 端到端冒烟

1. 准备 fixture 项目（含项目级资产 + 用户级 `~/<tool>` 资产；项目根放 `.git` 作项目标记）。
2. 装进 headless profile：`dsh plugin --profile headless add .`（改代码后重启 dsh 进程生效）。
3. 在 fixture 目录跑 `dsh --profile headless "<prompt>"`，逐项验证：
   - skill 目录出现在模型回复中；
   - `/命令名` 手势注入内容；
   - 记忆被引用；
   - hook：拦截（如 deny 某命令并看到原因）、上下文注入、提示词拦截。
4. 验证"无资产零开销"：在没有任何上游资产的目录跑一次，确认无告警、无注入。

冒烟的两条实操经验（详见 [pitfalls](pitfalls.md) 第 17 条）：

- **用已配置模型路由的 profile**（本仓库的 `headless`）：新建 profile 没有 API 凭据，headless 会静默超时（exit 124、零输出），容易误判为插件问题。
- **"零开销"验证要隔离 HOME**：用户级资产在 `~/.codebuddy` / `~/.claude`，宿主 HOME 里一旦有残留就会让"无资产"项目也发现到用户级资产；用 `HOME=/tmp/cleanhome dsh ...` 排除。

---

## 阶段五 · 验收清单

- [ ] 调研速查表完成并已提交 `docs/reference/<tool>/README.md`。
- [ ] 映射决策有文档记录（`docs/guides/` 的映射表，英文 + 中文两份）。
- [ ] `src/agents/<tool>/` 按规范布局；`registerBridgeSubsystems()` 注册；config 段带 `enabled`。
- [ ] `pnpm typecheck` / `pnpm build` / `pnpm test` 全绿；新增逻辑有单测覆盖。
- [ ] 端到端冒烟四项（catalog、命令、记忆、hook）通过；无资产项目零开销。
- [ ] 限制清单（不桥接什么）写进 `docs/guides/` 的对应小节（两种语言）。
- [ ] 根 README（两种语言）更新：状态 callout、supported-agents 表行、guides/reference 链接。
- [ ] 新踩的坑已补进 [pitfalls.md](pitfalls.md)；DSH 接口的新用法已补进 [dsh-integration-surface.md](dsh-integration-surface.md)。
- [ ] 提交（conventional commits，见 AGENTS.md）。
