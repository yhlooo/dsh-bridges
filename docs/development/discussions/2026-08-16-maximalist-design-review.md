# 设计讨论记录 2026-08-16：大而全视角的设计评审

## 元信息

| 项 | 值 |
| :--- | :--- |
| 日期 | 2026-08-16 |
| 参与者 | AI 协作智能体（大而全立场评审方）；设计者未参与本轮对话 |
| 状态 | 待回应（本记录为单方评审；"回应"栏内容取自仓库文档中的既有立场，非本轮会话答复） |
| 来源 | 会话内评审：以"大而全使用者"（插件功能越多越好、希望一个插件覆盖所有 agent 工具的所有资产）的视角审查 dsh-bridges |
| 相关文件 | `src/index.ts`、`src/agents/claude-code/hooks/bridge.ts`、`src/agents/*/memory.ts`、`src/agents/pi/memory.ts`、`src/permissions/engine.ts`、`docs/guides/README.zh.md`、`docs/development/todo.md`、`README_CN.md`、`package.json` |

## 背景

本记录与同日归档的 [极简主义视角评审](2026-08-16-minimalist-design-review.md) 互补：极简视角
用"少就是多"挤压默认面，本视角用"越多越好"挤压**上限与保真度**。两个视角在同一天对同一批
结构性问题的两端加压——极简视角问"为什么默认开这么多"，大而全视角问"为什么这么多开出来
的东西不是原样"。

评审方提出五组批评：① 承诺与保真度落差（README 说"无需迁移"，实际是"尽力降级"）；
② 全开默认 × 无跨桥去重产生上游任何工具都没有的并集语义；③ 被 dsh 核心接缝卡死的结构性
天花板与缺失的上游推动管线；④ 广度与深度不对称（恰好各工具最强的扩展面被跳过）；⑤ 依赖
与运维风险。评审方同时承认：本项目的限制清单透明度、todo 分级纪律、测试覆盖在同类桥接
项目中罕见。

## 议题 1：承诺与保真度落差——"无需迁移"还是"尽力降级"

**立场 / 批评（评审方）**：`README_CN.md` 承诺 skills、commands、记忆、hooks"无需任何迁移
即可继续生效"，但实际行为是逐项降级。对大而全用户，最痛的降级不是"缺功能"，而是**语义
反转与静默失效**：

- `defer` 语义反转：Claude Code 的 `permissionDecision: "defer"` 上游语义是"交回内置权限
  系统继续判断"，桥接把它映射为**直接拒绝**。且解析优先级为 deny > defer > ask > allow——
  一个返回 defer 的 pass-through hook 会压过其他 hook 的 allow，把所有工具调用封死。
- 输入改写类 hook 静默无效：`updatedInput`（claude）、`modifiedInput`（codebuddy）、
  `hookSpecificOutput.tool_input`（gemini）、`updated_input`（cursor）全部因"DeepSeek Harness
  在策略执行前冻结工具参数"而失效。输入净化 hook 是上游最常见的护栏用途之一——它看起来在
  保护你，实际没生效。
- 需要 LLM 评估的 handler 类型全部不支持：claude 的 `mcp_tool`/`prompt`/`agent`、codebuddy
  的 `prompt`/`agent`、cursor 的 prompt-type hooks。这是上游近两年增长最快的 hook 类型。
- subagent 是"委托指令"而非执行约束：`.claude/agents/*.md` 等被注册为技能，正文是一段
  "请用这些 inline 参数调 subagent 工具"的提示；`permissionMode`、`hooks`、`memory`、
  `skills`、`mcpServers`、`background`、`effort`、`isolation` 等 frontmatter **全部丢弃**，
  团队配置的子代理权限闸门、专属 memory、专属 MCP 变成依赖模型自觉的文本。
- 记忆 32 KiB 预算下先**整体丢弃用户级文件**再截断最具体内容——精心维护的全局记忆可能
  无声消失。
- 安全姿态相关映射缺失：codex 的 `[sandbox_workspace_write]`（`writable_roots` /
  `network_access`）不生效——上游允许"只写这两个子目录"的项目被 1:1 映射成 `workspace-write`
  整体沙箱，**实际授权面可能比上游更大**；`granular` 审批细分、自定义 `[permissions.<name>]`
  档案的规则表读取不执行；claude/codebuddy 项目 allow 规则的信任分层、codex 未列路径的
  trust 门禁均缺失。

**回应（项目文档中的既有立场，非本轮会话答复）**：以上全部写入 guides 各桥接 Limitations 与
`docs/development/todo.md` 的 P0–P3 分级，逐项标"记限制"并给出原因（无 dsh 接缝 / host-plane /
需运行时 / 凭据流程）；`defer` 映射的选择在代码注释中写明是 "the closest safe behavior is
chosen and logged"（fail-safe 取向）。

**再反驳 / 补充（评审方）**：

- 记录 ≠ 解决。对大而全用户，文档里写"不支持"不会让资产生效；而 fail-safe 的降级方向
  （拒绝 / 静默无效）恰好是**功能预期损失最大**的降级——护栏变哑炮比护栏缺位更危险。
- `defer` 至少可以降级为"未决"（退回权限规则评估）而非 deny：桥接已经实现了
  "hooks 未决 → 权限规则 → dsh 策略"的三级组合（`src/permissions/engine.ts` 的 `undefined`
  即"让位"语义），把 defer 挂到"未决"通道是现成路径，而非必须反转语义。
- 承诺用语与行为不一致本身是一个文档问题：`README_CN.md` 的"无需任何迁移即可继续生效"
  与 guides 里数百条限制之间隔着一条河，上游新用户（正是大而全用户）会在迁移后逐项
  发现资产"没生效"。

**事实锚点**：`src/agents/claude-code/hooks/bridge.ts:325`（优先级注释 deny > defer > ask >
allow）、`:344-352`（defer → deny）；`docs/guides/README.zh.md:176`（defer → 拒绝）、`:234`
（`updatedInput` 改写、`defer` 映射为拒绝、`mcp_tool`/`prompt`/`agent` handler 类型）；subagent
frontmatter 丢弃清单见 guides claude/codebuddy Subagents 小节；codex 沙箱映射见 guides codex
Permissions 小节；`src/permissions/engine.ts`（未匹配即 `undefined`，让位 dsh 策略）。

## 议题 2：全开默认 × 无跨桥去重——上游任何工具都没有的并集语义

**立场 / 批评（评审方）**：七个桥接全部 `enabled: true` 默认（`src/index.ts`），各自独立
注入记忆链、各持 32 KiB 预算，且**去重只针对 dsh 自己已加载的根文件，不针对兄弟桥接**。
具体后果：

- 一棵目录树中间的 `AGENTS.md` 会被 **codex（仓库根→cwd 链）、pi（文件系统根→cwd 链）、
  opencode（最近命中）、cursor（仓库根到 cwd 的子树 AGENTS.md）最多四个桥接各注入一遍**，
  且语义互异——codex 用 `AGENTS.override.md` 优先、pi 用另一套候选顺序、opencode 只取最近
  一层。
- `CLAUDE.md` 被 dsh 原生、claude 桥、opencode 的 `claudeCompat` 回退、pi 的候选链多路注入。
- 峰值 7 × 32 KiB ≈ 224 KiB ≈ 5 万+ token 的会话前缀，内容重复、优先级语义互相冲突。
- guides 对叠加行为只有**一条**重叠提示（opencode 一节的 `~/.claude/CLAUDE.md` 双注入），
  其余叠加场景无任何文档提示。
- 技能同名冲突（如 `.claude/skills/foo` 与 `.codebuddy/skills/foo`）由固定 rank 段裁决，
  而非"项目实际在使用哪个工具"。

**回应（项目文档中的既有立场，非本轮会话答复）**：每个桥接忠实复刻其上游工具自身的加载
语义（文档多处标注 "source-verified"）；pi 的 fs-root 链、codex 的 override 候选顺序等都是
上游原样行为；opencode 一节已有重叠提示。

**再反驳 / 补充（评审方）**：

- **忠实 × 并集 = 任何上游都没有的语义**。上游任何一个工具都不会同时读其他工具的配置；
  逐桥忠实执行七套上游语义，叠加出来的行为既不是用户的 Claude Code，也不是他的 Codex。
- 这是**每天都会发生**的 token 成本与指令冲突（多工具仓库正是大而全用户最常见的场景），
  比缺某个功能严重得多——它作用于每一个默认安装、默认配置的会话。
- 冲突无裁决机制：层序只解决技能同名冲突，不解决 CODEBUDDY.md 与 CLAUDE.md 内容矛盾的
  指令冲突；技能冲突的 rank 裁决也与"项目实际用哪个工具"无关。
- 修正成本低于想象：跨桥共享一个"已注入路径 → 内容哈希"注册表即可消除重复注入；即便
  不改代码，把全开默认下的叠加行为与按仓库裁剪配置的推荐写进 guides 也是必要的一步。

**事实锚点**：`src/index.ts`（7 段 `enabled`/各 `memoryMaxBytes: 32768` 均默认开）；各桥
`memory.ts` 的去重逻辑均为局部 `seenPaths`，仅跳过"dsh 已加载的根文件"（如
`src/agents/pi/memory.ts:123-130`；grep `injectedPaths|alreadyInjected` 零命中——不存在跨桥
去重注册表）；`docs/guides/README.zh.md:397`（唯一的重叠提示，位于 opencode 一节）；AGENTS.md
技能 rank 段约定（claude 105–120、codebuddy 125–140……）。

## 议题 3：结构性天花板与缺失的上游推动管线

**立场 / 批评（评审方）**：大量"想要的功能"是 dsh 核心不开口就永远做不了的：命名 subagent
注册表、`PreCompact`/`Notification`/`PermissionRequest`/`BeforeModel` 等 hook 事件、
`transcript_path`、工具参数改写、逐会话可写根 / env、`systemMessage`/`suppressOutput` 用户
通知通道、会话级系统提示替换（pi `SYSTEM.md`、codex `model_instructions_file`）、模型路由。
`todo.md` 把这些标为"核心支持候选"，且约定"上游 issue / 讨论链接贴在条目内"——但 grep
`github.com` / `issues/` 在 todo.md 中**零命中**：没有任何一条限制带着上游 issue 链接。这些
缺口目前只是内部备忘，不是对核心的正式提案；插件侧没有可见的机制去推动决定它上限的那一方。

**回应（项目文档中的既有立场，非本轮会话答复）**：todo 对每项"需核心支持"都记录了降级
方案（如 subagent 的方案 B 技能载体、shell env 的"仅桥接自 spawn 子进程"）；P3 明确列出
out-of-scope 资产并写明原因。

**再反驳 / 补充（评审方）**：

- 备忘 ≠ 提案。没有链接就无法跟踪核心侧进展、无法评估"哪个限制哪一版能消除"，也就无法
  给用户一个功能增长的可预期性——对大而全用户，**上限的可预期性比当前缺口清单本身更
  重要**。
- 建议把"核心支持候选"逐条转成带链接的上游 issue（todo 条目贴链接、状态可追踪），这会让
  本目录的讨论记录与 todo 的"决策 → 行动"闭环真正闭合。

**事实锚点**：`docs/development/todo.md:17-18`（约定"上游 issue / 讨论链接贴在条目内"）、
`:57`（shell env 接缝）、`:204`、`:222`、`:237`、`:359`（各"核心支持候选"条目，均无链接）；
对 todo.md 执行 `grep "github.com|issues/"` 返回 0 条。

## 议题 4：广度与深度的不对称——恰好各工具最强的扩展面被跳过

**立场 / 批评（评审方）**：

- 工具间覆盖不均：claude/codebuddy 有 skills、commands、agents、memory、hooks、permissions、
  mcp 六七个子系统，pi 只有 skills + memory 两项（pi 本身没有 hooks/permissions/MCP，这部分
  是诚实的）。
- 但存在一个模式：**每个工具最强大的扩展机制恰好都不在桥接范围内**——opencode 的 JS 插件
  系统 + 自定义工具、pi 的 TypeScript 扩展事件总线、claude 的 `.claude/workflows/*.js` 与
  plugins marketplace、gemini 的 extensions、codex 的 `rules/*.rules`（Starlark）与 `[apps]`
  connectors。桥接到的实际是各工具共性的最小公分母。
- 单工具内部也是薄切片：codex 审计列出的 out-of-scope 键有数十个（`[features].*`、
  `[memories]`、`web_search`、`[otel]`……）；claude 的 `env`（模型侧 bash 无法注入）、
  `rules/*.md`、`@import`、默认哈希目录 auto memory、`managed-*` 企业层都未做。
- 工具清单停在 7 个 CLI；Roo Code、Cline、Qwen Code、Aider、Windsurf 等文件配置生态更大的
  工具未覆盖。新增一个桥的边际成本很高（五阶段流程 + 逐字节审计），todo 里还有 pi/cursor
  上游探针、gemini 策略层等 P2 项挂着。

**回应（项目文档中的既有立场，非本轮会话答复）**：无 dsh 对应物 / 需要上游运行时 / 凭据
流程 / host-plane 的项一律记限制或 out-of-scope；范围选择是刻意的（CLI、文件型配置、可静态
映射的资产）。

**再反驳 / 补充（评审方）**：不否定范围选择——它让本项目在既有范围内做到了罕见的高质量。
但需要指出：**选择留下的恰是价值最高的部分**（插件/扩展系统是各工具"大而全"用户资产库的
核心），因此这个项目对"越大越好"的用户来说存在一个硬边界：它能迁移的是各工具的共性层，
不是它们的旗舰扩展面。这个边界应在上游 README 的承诺语境里讲清楚，而不是只存在于 guides
的限制行里。

**事实锚点**：guides 各桥接 Limitations 小节（opencode "JavaScript 插件系统与自定义工具无
文件格式桥接"、pi "扩展事件总线等价于 opencode 插件 API……未桥接"、claude "workflows……不
实施"、gemini "extensions"、codex "rules/*.rules（Starlark）、[apps] connectors"）；
`docs/development/todo.md` P2/P3 分组的未勾选项。

## 议题 5：依赖与运维风险

**立场 / 批评（评审方）**：

- 依赖精确钉在 `0.1.0-rc.6`（`@deepseek-ai/dsh-mcp-client`、`dsh-sandbox-policy`、
  `dsh-user-approval`），peer 为 `^0.1.0-rc.6`；插件深度使用 dsh 的**内部接缝**
  （`tools/pre-execute`、`agent/session-start`、`setSandboxMode` 会话覆盖、`ctx.plugin`
  动态实例化 MCP）。rc 阶段 API 漂移是常态；多个插件钉不同 rc 版本时的共享注册表冲突
  风险真实存在。
- Windows 上 codebuddy hooks 走系统 shell 而非上游强制 Git Bash（行为差异已记限制）。
- pi 桥每次会话**从文件系统根目录**往下走六个候选文件名的链——`/home/user` 之类位置放了
  一个 `AGENTS.md` 就会被注入进不相干的会话；这忠实于上游 pi，但叠加到 dsh 会话里是
  "意外祖先文件进上下文"的体验。

**回应（项目文档中的既有立场，非本轮会话答复）**：pi 链为 "source-verified" 的上游原样
行为；Windows shell 差异已在 guides 限制行写明；依赖跟随 dsh rc 版本由发布节奏控制。

**再反驳 / 补充（评审方）**：忠实于上游 pi 的语义放进 dsh 会话仍是意外行为——建议至少在
guides 写明"pi 桥会从文件系统根向上游走并注入祖先 AGENTS.md"，并考虑给 fs-root 链加可配置
边界；rc 钉版策略建议形成书面的升级矩阵（dsh 版本 → 本插件版本 → 接缝清单变更），避免
每次升级靠回归测试兜底而无法预判。

**事实锚点**：`package.json:67-79`（dependencies 精确钉 `0.1.0-rc.6`、peer `^0.1.0-rc.6`、
版本 `0.2.0`）；`src/agents/pi/memory.ts:163-170`（`directoriesFromRoot` 从文件系统根向 cwd
走、每目录六个候选文件名）；guides codebuddy Hooks 限制行（Windows 系统 shell）。

## 双方共识 / 优点（评审方认可）

- 限制清单逐子系统枚举、todo 按 P0–P3 分级、审计逐字节对照上游、单测 + e2e 覆盖七个桥——
  透明度远超同类桥接项目；本记录能成立恰恰因为缺口全部写在了文档里。
- 单工具、单仓库场景下 claude-code / codebuddy-code 桥的完成度已经相当高；teardown 可逆、
  失败放行（hook 超时/失败不阻断、MCP 启动失败跳过）等工程纪律是优点。

## 候选修正方向（未采纳，供后续决策）

以下为讨论中提出的候选方向，**均未拍板**；采纳后移入 `docs/development/todo.md` 并在条目
注明来源本文档：

1. **跨桥记忆去重与叠加语义**：共享"已注入路径 → 内容哈希"注册表，同文件同内容只注入
   一次；或至少在 guides 文档化全开默认下多工具仓库的叠加行为，并给出按仓库裁剪桥接的
   推荐配置。
2. **`defer` 降级为"未决"**：把 claude hooks 的 `defer` 挂到"hooks 未决 → 权限规则 → dsh
   策略"的现成三级通道，而非映射为拒绝；输入改写（`updatedInput` 等）接缝整理为上游核心
   提案。
3. **"核心支持候选"转正式上游 issue**：todo 每条"需核心支持"的条目贴带链接的 issue，
   状态可追踪；讨论记录与 todo 的"决策 → 行动"闭环闭合。
4. **多工具仓库侦测 / 推荐**：会话开始时检测项目实际配置了哪些工具，建议只开对应桥
   （或提供 `auto` 模式），把全开并集从默认行为变为显式选择。
5. **依赖升级矩阵**：书面化 dsh 版本 → 插件版本 → 接缝清单变更的对应关系，降低 rc 阶段
   升级的不可预判性。
