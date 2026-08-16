# 设计讨论记录 2026-08-16：极简主义视角的设计评审

## 元信息

| 项 | 值 |
| :--- | :--- |
| 日期 | 2026-08-16 |
| 参与者 | 项目设计者、AI 协作智能体 |
| 状态 | 待决策（各议题仍开放，双方未达成一致） |
| 来源 | 会话内评审：以"极简主义使用者"（少就是多、如无必要不装插件）的视角审查 dsh-bridges |
| 相关文件 | `src/index.ts`、`cordis.patch.yml`、`src/agents/*/mcp.ts`、`src/agents/*/hooks/run.ts`、`src/agents/pi/index.ts`、`docs/guides/README.zh.md` |

## 背景

评审方先给出五点批评：① 一行安装但内置 7 个子系统、83 个配置键、默认全开；
② 默认开启的副作用（home 目录探测、watcher、MCP 子进程、hook 执行、记忆注入、读取含凭据文件）；
③ 规模与承诺落差（约 1.77 万行源码、54 个测试文件、520 KB 产物、6 个运行时依赖、长限制清单）；
④ 实事求是承认的优点（单行安装、teardown 可逆、失败宽容、DSH 原生技能同名胜出、限制清单诚实）；
⑤ 三项建议（默认 opt-in / 用户级集成分开关 / 审计预演命令）。

设计者对其中四点逐一回应，评审方逐条再反驳。以下按议题整理双方论点与事实锚点。

## 议题 1：单包 7 子系统的结构复杂度与用户心智负担

**批评（评审方）**：`cordis.patch.yml` 安装层面只有一行，但这一行背后挂着
claude-code、codebuddy-code、opencode、codex、pi、gemini-cli、cursor 共 7 个子系统，
`src/index.ts` 中全部 `enabled: true` 默认开启，合计 83 个配置键。每个兼容层复制上游
语义（多套权限规则语法、多套 hook 事件翻译表、各自不同的 matcher 语义），复杂度是
结构性重复。

**回应（设计者）**：从用户角度没有问题——用户只需要关注自己用到的子系统，不会增加
心智负担。

**再反驳（评审方）**：

- "只需关注自己用的子系统"只在**默认关闭**时成立。默认全开的世界里，最小用户必须
  知道全部 7 个桥，才知道该去关掉哪 6 个——opt-out 比 opt-in 需要更多全局知识。
- 子系统之间并不独立，用户无法按"我的子系统"孤立推理：
  - `claude-code/mcp.ts` 与 `codebuddy-code/mcp.ts` 都读 `<cwd>/.mcp.json`（各实例化
    一套命名空间），同一配置文件产生两套桥接实例；
  - `opencode.claudeCompat` 与 `claudeCode.memory` 同开时 `~/.claude/CLAUDE.md` 重复注入，
    指南原文："若同时开启……可能被注入两次；关闭其一或接受重复块"——文档自己要求用户
    跨子系统做配置决策；
  - codex 与 opencode 都处理 AGENTS.md 链，dsh 核心还加载根 AGENTS.md/CLAUDE.md，
    用户需理解三层边界才能知道最终注入内容。
- 共享包的升级耦合：任一桥的破坏性变更或上游格式漂移迫使所有用户一起升级，无法按
  工具钉版本；维护注意力摊薄反映在各桥指南的长限制清单上。

**事实锚点**：`src/index.ts`（7 段 `default(true)` 配置）、`cordis.patch.yml`（单行
`id: bridges`）、`docs/guides/README.zh.md` 各桥接"限制"小节。

## 议题 2：MCP 服务器默认常驻连接

**回应（设计者）**：MCP 服务本身就应该常驻连接，这在 Harness Agent 中是惯例。

**再反驳（评审方）**：

- 惯例论证的是**生命周期语义**（连接保持），桥接用它论证的是**授权语义**（连接哪些
  服务器）——两者不同。上游工具里常驻的服务器是用户在该工具中显式配置并同意的；
  桥接把"用户为工具 A 写的配置"静默变成"工具 B 的常驻子进程"，中间没有确认。
- **并集而非单一集合**：dsh 会话默认连接所有启用桥接的 MCP 配置并集，比任何一个
  上游工具单独会连接的多。
- **同一服务器双重 spawn**：`claude-code` 与 `codebuddy-code` 都读 `<cwd>/.mcp.json`，
  同一个 stdio server 会被启动两次（`mcp__claude__*` / `mcp__codebuddy__*`）。
- **常驻的成本**：session-start 对齐全部服务器，慢启动 / 挂起的服务器拖累会话启动
  路径；"失败放行"保证正确性，但不消除延迟与噪声。

**共识**：MCP 常驻本身是上游惯例（评审方不反对常驻）；争议在默认连接范围与授权
时点——评审方主张"常驻的对象应显式"（`mcp` 默认开 × 7 桥把确认成本转移给了所有用户）。

**事实锚点**：`src/agents/claude-code/mcp.ts`（用户级"始终连接"）、
`src/agents/codebuddy-code/mcp.ts:38,50`（同读 `.mcp.json` 用户/项目文件）、
`docs/guides/README.zh.md` MCP 小节。

## 议题 3：信任假设与安全

**回应（设计者）**：应该假设可以信任打开的项目——用户仅在自己信任的项目上开启
DeepSeek Harness，这样就不存在安全问题。

**再反驳（评审方）**：

- 该假设恰是上游工具**用机制支撑**、而桥接**把机制去掉**的假设：
  - Claude Code 的 allow 规则需工作区信任才生效，指南原文："桥接没有信任状态、一律生效"；
  - Codex 有 `trust_level` 门禁，指南原文：未列出的路径"仍无条件读取"；
  - **pi 桥已实现信任门禁**（`pi/index.ts` 注释 "trust-gated for the project"、
    README 表"项目级受信任门禁"）——同一代码库里门禁可实现且已实现，其余桥没有，
    说明"假设可信"不是统一设计原则。
- **信任不是静态属性**：今天可信的仓库，明天一次依赖升级、被污染的 PR 或被盗的
  维护者账号就能带进恶意 hook；上游信任提示在配置变化时重新建立同意，桥接在每次
  会话静默执行。
- **"项目可信"覆盖不了用户级配置**：`~/.claude.json`、`~/.gemini/policies`、
  `~/.codebuddy`、`~/.cursor` 不在打开的项目里，却作用于该 profile 的所有会话。
  hooks 由插件直接 `node:child_process` spawn，在模型面向的沙箱之外；
  CodeBuddy 的 http hook **无 URL 白名单**（指南原文："CodeBuddy Code 未记载 URL
  白名单，故不设白名单"），而 PreToolUse hook 在每次工具调用前收到工具输入的完整
  JSON。等价表述："信任你 home 目录下所有 agent 工具的配置文件，且永久可信"。
- **安全不止恶意，还包括行为完整性**：`codex/permissions.ts` 把 `approval_policy:
  "never"` 映射为自动放行、`sandbox_mode` 经 `setSandboxMode` 在会话开始生效——
  项目里的 `config.toml` 可以静默放宽 dsh 沙箱模式、关掉审批。上游把这些放在信任
  提示后面，桥接放在会话启动时自动执行。

**事实锚点**：`src/agents/pi/index.ts`（信任门禁）、`src/agents/codex/permissions.ts`
（`approval_policy`/`sandbox_mode` 映射）、`src/agents/*/hooks/run.ts`
（`node:child_process` spawn）、`docs/guides/README.zh.md` Permissions/Hooks 小节。

## 议题 4：记忆注入与"符合用户习惯"

**回应（设计者）**：记忆本来就该注入——用户用 Claude Code 本来就会注入 CLAUDE.md，
使用 DeepSeek Harness + 本插件没有更糟，只是更符合用户原本的使用习惯。

**再反驳（评审方）**：

- "没有更糟"只在**注入集合 = 用户原工具的记忆**时成立。默认是 7 工具的并集：
  一个 Claude 用户会额外拿到 CODEBUDDY.md、GEMINI.md、`.cursor/rules/*.mdc`、
  pi 的 APPEND_SYSTEM.md——这些不是他的习惯，是他从未选择过的行为。习惯的授权来源
  是"用户选了工具 A 并配置了它"，桥接把授权来源替换成"插件默认"。
- **定量**：每桥 32 KiB 预算，7 桥理论峰值约 224 KiB ≈ 5.5 万 token，整会话常驻
  前缀；Claude Code 的记忆预算是单工具且有界的，桥接是乘法。
- **定性**：记忆注入不是中性的——桥用 system-reminder 框架注入（与工作区指令同级
  的信号强度）；CODEBUDDY.md 与 CLAUDE.md 内容矛盾时无裁决机制（层序只解决技能同名
  冲突，不解决记忆内容矛盾）。
- 若目标是"符合用户习惯"，正确默认是注入用户**实际迁移来源**的那个工具，而非全量。

**共识**：单工具场景下记忆注入确属用户习惯（评审方认可增量价值：用户级 + 祖先链是
dsh 核心没有加载的部分）；争议在默认并集与跨桥内容冲突。

**事实锚点**：`docs/guides/README.zh.md` 各桥 Memory 小节（32 KiB 预算、system-reminder
框架、opencode 重叠注入提示）、`src/index.ts`（`memoryMaxBytes: 32768` × 7）。

## 双方有共识的部分

- 单行安装、teardown 可逆、失败宽容（hook 超时/失败放行、MCP 启动失败跳过）、DSH
  原生技能同名胜出（层序保证）、限制清单写得诚实——这些是优点。
- MCP 常驻本身是上游惯例，争议在默认范围与授权时点。
- 单工具场景的记忆注入符合用户习惯，争议在并集。
- "少就是多"在讨论中从审美收敛为工程事实：每多一个默认开启的桥，就多一份会话延迟、
  token 成本、进程数与不可审计的行为面，而用户没有做过任何选择。

## 候选修正方向（未采纳，供后续决策）

以下为讨论中提出的候选方向，**均未拍板**；采纳后移入 `docs/development/todo.md`
并在条目注明来源本文档：

1. **默认 opt-in**：新 profile 默认 7 桥全关，或安装时选择要迁移的工具；
   至少提供 `minimal` preset（skills + memory，不开 hooks/permissions/mcp/watch）。
2. **用户级（home 目录）集成分工具开关**：其影响覆盖整个 profile 的所有会话，
   与项目级资产性质不同，值得单独门禁。
3. **审计 / 预演命令**（如 `dsh bridges --probe`）：输出"在当前 cwd 会注入什么、
   spawn 什么、跑哪些 hook"，替代当前只有 `--dump-config` 的可见性。
4. **MCP 范围与去重**：默认连接范围显式化；跨桥同一 `.mcp.json` 的服务器实例去重。
5. **信任门禁**：把 pi 桥已有的门禁模式推广到其余六桥，或在 README 明示
   "信任所有 home 级配置文件 + 项目配置可放宽沙箱/审批"的边界。
