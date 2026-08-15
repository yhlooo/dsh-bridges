> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/permission-modes.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 权限模式

> 控制 CodeBuddy 在编辑文件、运行命令、访问网络或调用其他高风险工具前，应该自动继续、询问用户，还是直接拒绝。权限模式决定的是**会话节奏**，不是整套权限系统的全部逻辑。

## 先理解：权限模式只是权限系统中的一层

每次工具调用，CodeBuddy 不会只看当前 mode，还会先后经过：

1. hooks / 交互型工具的特殊处理
2. `deny` 规则
3. 可信 `allow` 规则
4. 命令安全检查（仅交互式）
5. `ask` 规则
6. `bypassPermissions` 短路
7. 不可信 `allow` 规则
8. 当前权限模式自己的基线策略
9. 非交互兜底与 `auto` / `dontAsk` 的最终收口

所以：

- `deny` 永远比 mode 更强
- `allow` / `ask` 规则会改变 mode 的实际效果
- `auto` 只接管“最后仍然会 ask 的动作”
- `dontAsk` 不是“更宽松”，而是“不弹框，直接拒绝未预批准动作”
- `bypassPermissions` 也不是绝对无条件放行：前面的 `deny` / `ask` 规则与交互态危险命令检查仍可能拦住它

权限规则的完整求值顺序见 [权限规则](permissions.md)。

## 可用模式

CodeBuddy Code 提供以下权限模式。其中多数模式可在 CLI 中直接切换或指定；部分模式用于 IDE 集成与子代理场景。

### 用户可手动切换的模式

| 模式 | 不询问就能跑什么 | 适用场景 |
| :--- | :--- | :--- |
| `default` | 信任目录内的 Read 工具 | 默认；适合敏感工作 / 上手期 |
| [`acceptEdits`](#acceptedits自动批准文件编辑) | 信任目录内的 Read + Edit 系列工具 | 边写边走 `git diff` 复核 |
| [`auto`](#auto分类器自动判定) | 原本会 ask 的动作，交给分类器判定 allow / deny | 想减少打断，但保留安全边界 |
| [`dontAsk`](#dontask不弹框直接拒绝未预批准动作) | 仅已预批准动作继续执行；其余不询问直接拒绝 | 非交互自动化 / 固定白名单代理 |
| [`plan`](#plan探索后再改) | 委托给“进入 plan 前”的那个模式（默认 = `default`）；额外允许写入会话计划文件 | 落手改动前先摸清代码再决定 |
| [`bypassPermissions`](#bypasspermissions尽量跳过审批) | 跳过绝大多数审批 | 沙箱容器 / VM / 离线 dev container 才用 |
| [`delegate`](#delegate多代理协调模式) | 仅协调类工具（如 Agent / TaskCreate / SendMessage / 团队管理），实现类工具被屏蔽 | 主代理只做拆派、把执行交给子代理 |

### 程序化 / 集成模式（不在 Shift+Tab 循环里）

| 模式 | 何时出现 |
| :--- | :--- |
| `fullAccess` | IDE 客户端通过协议传入；语义上接近 `bypassPermissions` 的全局放行 |
| `work` | IDE 客户端传入。Read 直接放行（不查信任目录），Edit 一律询问，Bash 仅安全命令直接放行，其他询问 |
| `ignore` | 仅在子代理（subagent / teammate）场景生效，表示“用主会话的模式，不要被子代理自己的 frontmatter 覆盖”；主会话用不到 |

> 说明：从实现上看，`auto`、`dontAsk`、`plan`、`bypassPermissions` 都可以通过 CLI 或 settings 指定；`delegate` 主要通过会话内 `Shift+Tab` 切换。

## 如何切换权限模式

### 会话中切换：`Shift+Tab`

CLI 中按 `Shift+Tab` 在以下模式之间循环：

```text
default → bypassPermissions → acceptEdits → auto（可用时）→ plan → delegate → default → ...
```

说明：

- `auto` 只有当前环境可用时才会出现在循环里
- `dontAsk` **不在**键盘循环中，只能通过 CLI、settings、SDK / IDE 控制信号进入
- Windows 上 `Shift+Tab` 和 `Alt+M` 均可触发（`Alt+M` 为兼容别名）
- 可通过 `~/.codebuddy/keybindings.json` 自定义快捷键

### 状态栏提示

切换后，输入区下方会显示当前 mode：

| 模式 | 文案 | 说明 |
| :--- | :--- | :--- |
| `default` | 不显示 | 默认模式不额外占位 |
| `bypassPermissions` | `⏵⏵ bypass permissions on (shift+tab to cycle)` | 可循环切回其他模式 |
| `acceptEdits` | `⏵⏵ accept edits on (shift+tab to cycle)` | 可循环切回其他模式 |
| `auto` | `⏵⏵ auto mode on (shift+tab to cycle)` | 仅在可用时出现 |
| `dontAsk` | `⏵⏵ don't ask on` | 不在循环链里，所以无 cycle hint |
| `plan` | `⏸ plan mode on (shift+tab to cycle)` | 表示当前在计划模式 |
| `plan` + 前置模式 | `⏸ plan + accept edits (shift+tab to cycle)` 等 | 显示 plan 前继承的基线模式 |
| `delegate` | `⇢ delegate mode on (shift+tab to cycle)` | 主代理只做协调 |

### 启动时指定：`--permission-mode`

```bash
codebuddy --permission-mode default
codebuddy --permission-mode acceptEdits
codebuddy --permission-mode auto
codebuddy --permission-mode dontAsk
codebuddy --permission-mode plan
codebuddy --permission-mode bypassPermissions
```

`--permission-mode` 官方支持这 6 个字面量。其他模式（`delegate` / `work` / `fullAccess` / `ignore`）不能作为标准 CLI 启动参数。

非交互模式下同样可用：

```bash
codebuddy -p --permission-mode dontAsk "只允许白名单动作，其余直接失败"
codebuddy -p --permission-mode auto "先尝试自动修复 lint 错误"
```

额外快捷方式：

- `-y` / `--dangerously-skip-permissions`：等价于 `--permission-mode bypassPermissions`

### 持久化默认值：`permissions.defaultMode`

在 `~/.codebuddy/settings.json` 或项目 settings 中配置：

```json
{
  "permissions": {
    "defaultMode": "acceptEdits"
  }
}
```

优先级顺序：

1. 会话当前值
2. CLI `--permission-mode`
3. `permissions.defaultMode`
4. `default`

`defaultMode: "auto"` 还有额外限制：

- 只有 **user settings** 与 **CLI 注入的 settings** 可以授予 `auto`
- `.codebuddy/settings.json` 与 `.codebuddy/settings.local.json` 中的 `defaultMode: "auto"` 都会被忽略并回退到 `default`
- 如果 `auto` 被禁用或当前不可用，也会回退到 `default`

### `plan` 会记住进入前的模式

进入 `plan` 时，CodeBuddy 会记录“进入 plan 前的权限模式”；退出后恢复。也就是说：

- 你从 `acceptEdits` 切进 `plan`，plan 期间普通 Read / Bash / 非计划文件 Edit 仍按 `acceptEdits` 的基线处理
- 只有当前 session 的**计划文件**写入是 plan 模式额外放行的特例
- 退出 `plan` 时会回到先前模式，而不是强制掉回 `default`

## 各模式详解

### default（默认）

最保守、最稳定的模式。

| 工具类型 | 行为 |
| :--- | :--- |
| Read | 路径在信任目录内（cwd + `permissions.additionalDirectories` + 用户加的 `addDir`）→ 放行；否则询问 |
| Edit | 询问 |
| Bash | 询问 |
| 其他 | 询问 |

适合：

- 初次进入陌生仓库
- 改动涉及敏感目录、生产脚本、外部服务
- 你希望每个高风险动作都可见

### acceptEdits（自动批准文件编辑）

自动放行 Edit 类工具，但不放行 Bash。

| 工具类型 | 行为 |
| :--- | :--- |
| Read | 信任目录内放行；信任目录外询问 |
| Edit | 自动放行 |
| Bash | 询问 |
| 其他 | 询问 |

这里的 Edit 类主要包括：

- `Edit`
- `Write`
- `MultiEdit`
- `NotebookEdit`

注意：

- `acceptEdits` 只影响 Edit 类工具，不影响 Bash —— Bash 永远走单独的安全分级
- “信任目录”以工作区根 + 用户配置的 `permissions.additionalDirectories` + 启动时 `--add-dir` 为准
- 读写[受保护文件](#受保护的关键文件)仍照原模式询问，不走自动放行
- 如果某个操作先被 `deny` / `ask` 规则命中，规则仍然优先

适合：

- 你愿意让 CodeBuddy 连续改文件，但不想让它自行跑命令
- 你习惯通过 `git diff` 统一复核改动

### auto（分类器自动判定）

`auto` 不是“全自动放行”，而是把**本来会 ask 的动作**交给分类器做二次判断。

#### `auto` 何时会接管？

只有满足下面条件时，分类器才会运行：

1. 这次工具调用没有被 `deny` 规则拒绝
2. 也没有被 `allow` 规则提前放行
3. 没有命中显式 `ask` 规则
4. 常规权限链最终仍得到一个 `ask`
5. 当前 mode 是 `auto`

所以 `auto` 只接管“最后仍然悬而未决的 ask”，不会替代整套权限系统。

#### 哪些情况不会进入分类器？

以下情况**不会**走 `auto` 分类器：

- 已命中 `allow` / `deny` 规则的工具调用
- 显式 `ask` 规则命中的工具调用
- `AskUserQuestion`
- `ExitPlanMode`

也就是说，`ask` 规则在 `auto` 下依然是“强制人工审批”。

#### 分类器可能给出什么结果？

分类器只有两种结论：`allow`（放行）或 `deny`（拒绝），没有“部分批准”这类中间态。

#### 分类器无法判定时会怎样？

- **分类器出错 / 不可用**：为安全起见**直接拒绝**该动作（fail-closed），并提示模型可改用其他自然工具达成、或停下来向用户说明；连续多次失败会自动退出 `auto`、回退到 `default`。
- **对话太长、超出分类器可处理范围**：交互式会话回退为普通审批弹窗；`-p` / `stream-json` 等 headless 模式直接中止当前 run。
- **被拒次数过多**（短时间内反复被分类器拒绝）：`auto` 会暂停——交互式回退为普通弹窗，headless 中止 run，避免反复空转。

这些都是自动行为，无需配置。

#### `auto` 下的 allow 规则注意点

为了避免 allow 规则把分类器整个绕过，`auto` 模式下 CodeBuddy 会**临时忽略“过宽 / 危险”的 allow 规则**（只在本次判断时从内存过滤，不改写你的 settings）。被忽略的主要有：

- 全通配的 shell 规则：`Bash`、`Bash(*)`、`PowerShell`、`PowerShell(*)`
- 危险命令 / cmdlet 前缀：如 `Bash(sudo *)`、`Bash(eval *)`、`PowerShell(iex *)`
- 任意 `Agent` / `Task` 规则：如 `Agent(*)` —— 防止借子代理绕过分类器

窄而具体的安全规则仍然有效，例如 `Bash(npm test)`、`Bash(git status)`、`PowerShell(Get-Content foo.txt)`、`Read`、`Edit(src/foo.ts)`。

如果你确实需要让某类动作在 `auto` 下免审，正确做法是配置 `autoMode` 规则（见下），而不是写宽 allow 规则。

#### `auto` 配置与自检命令

`auto` 分类器的受信边界与放行 / 拦截规则由顶层 `autoMode` settings 控制（`environment` / `allow` / `soft_deny` / `hard_deny`），详见 [Settings 配置](settings.md#auto-mode-配置)。

3 个本地命令帮你查看与校验配置：

```bash
codebuddy auto-mode defaults   # 查看内置默认规则
codebuddy auto-mode config     # 查看当前实际生效的规则（$defaults 展开后）
codebuddy auto-mode critique   # 让模型检查你的自定义规则是否含糊、冗余或易误伤
```

适合：

- 你想减少日常确认弹窗
- 但又不想直接进入 `bypassPermissions`
- 并且愿意为组织内部 repo / 域名 / bucket 明确配置受信边界

### dontAsk（不弹框，直接拒绝未预批准动作）

`dontAsk` 的核心语义是：**任何本来要弹审批的动作，都不要弹，直接拒绝。**

它不是 `bypassPermissions` 的别名，恰好相反，它更严格。

| 工具类型 | 基线行为 |
| :--- | :--- |
| Read | 仅信任目录内只读操作继续执行；信任目录外读取拒绝 |
| Edit | 拒绝，除非已被 `allow` 规则预批准 |
| Bash | 拒绝，除非已被 `allow` 规则预批准 |
| 其他 | 拒绝，除非已被 `allow` 规则预批准 |

重要细节：

- `dontAsk` 只改写最终的 `ask` 结果；已经 allow / deny 的动作不受影响
- 显式 `ask` 规则在 `dontAsk` 下不会弹窗，而是直接转成 deny
- `AskUserQuestion`、`ExitPlanMode` 在 `dontAsk` 下也**被拒绝**（不弹框 / 不进入计划审批）——`dontAsk` 的本意就是“绝不打断用户”，所以连这类交互工具也不例外
- 被拒时模型会收到提示：可改用其他自然工具达成目标，若该能力确实必需则停下来向用户说明
- 把 `allowedTools` / `permissions.allow` 与 `dontAsk` 配合使用，可以做出“固定白名单代理”

适合：

- CI / 批处理 / 后台代理
- 明确希望“能做就做，不能做就立即失败”
- 需要稳定、可预测的工具面，而不是运行中临时审批

### plan（探索后再改）

`plan` 模式的目标是：先探查、先写计划、再征求确认，而不是立即落地修改源码。

CodeBuddy 的 `plan` 不是一个独立的“完全只读模式”，而是**委托给进入 plan 前的模式**：

- Read：委托给前置模式
- Bash：委托给前置模式
- Edit：如果目标是当前 session 的计划文件，则直接放行；否则委托给前置模式

这意味着：

- 从 `default` 进入 `plan`，普通 Edit / Bash 仍然会 ask
- 从 `acceptEdits` 进入 `plan`，非计划文件 Edit 仍按 `acceptEdits` 的基线自动放行
- `plan` 真正额外放行的只有“当前 session 的计划文件写入”

进入 / 退出方式：

- 进入：`Shift+Tab` 或 `EnterPlanMode`
- 退出：再次 `Shift+Tab` 或 `ExitPlanMode`

启动时直接进 plan：

```bash
codebuddy --permission-mode plan
```

### bypassPermissions（尽量跳过审批）

`bypassPermissions` 会跳过大部分正常审批流程，适合隔离容器 / VM / dev container、没有外网的 sandbox、或你完全清楚后果的脚本化场景。

但它**不是“前面所有规则都失效”**。更准确地说：

- 未被前置规则拦住的工具，会在 bypass 阶段直接放行
- 但在它之前，`deny` / `ask` 规则仍先评估
- 交互式会话里，危险 Bash 命令仍可能要求显式确认
- 如果 `permissions.disableBypassPermissionsMode: "disable"`，该模式会退化回 `default` 基线

也就是说，下面这些说法是不准确的：

- “只要开了 bypass，`ask` 规则就失效”
- “只要开了 bypass，危险命令也一定无条件通过”

启动方式：

```bash
codebuddy --permission-mode bypassPermissions
# 等价
codebuddy -y
codebuddy --dangerously-skip-permissions
```

#### 关闭通道（管理员）

关闭该模式：

```json
{
  "permissions": {
    "disableBypassPermissionsMode": "disable"
  }
}
```

适合：

- 隔离容器 / 沙箱 / dev container
- 没有外网、没有共享状态的环境
- 你明确接受全自动执行的后果

### delegate（多代理协调模式）

主代理在 `delegate` 模式下只负责协调，不直接执行实现类工具。

行为：

- 主代理只保留协调类工具（如 `Agent`、`TaskCreate`、`SendMessage`）
- 执行类工具（如 `Read`、`Write`、`Edit`、`Bash`）不会暴露给主代理
- 真正的读写、执行工作交给子代理完成

适合：

- 主代理专注拆任务、分派、收敛结果
- 你在做 Team / Swarm 风格的协作执行

### work（IDE 集成）

`work` 仅由 IDE 侧协议传入，CLI 用户一般不会直接用到。

| 工具类型 | 行为 |
| :--- | :--- |
| Read | 直接放行，不检查信任目录 |
| Edit | 询问 |
| Bash | 安全命令直接放行；其余询问 |
| 其他 | 放行 |

### fullAccess（IDE 集成）

仅由 IDE 客户端通过协议设置；语义上接近 `bypassPermissions`。

### ignore（子代理专用）

`ignore` 只用于子代理配置，表示：

- 不要采用子代理自己 frontmatter 里的 mode
- 沿用父会话当前模式

主会话不会出现这个值。

## 受保护的关键文件

下列路径的写入操作即使在 `acceptEdits` / `bypassPermissions` 也会保留特殊处理：

- 仓库自身：`.git`、`.gitconfig`、`.gitmodules`
- shell 配置：`.bashrc` / `.bash_profile` / `.zshrc` / `.zprofile` / `.envrc` 等
- 包管理：`.npmrc` / `.yarnrc` / `.pnpmfile.cjs` / `bunfig.toml` 等
- IDE / 工具：`.vscode` / `.idea` / `.husky` / `.devcontainer` / `.cargo` / `.yarn` / `.mvn`
- CodeBuddy 自身：`.codebuddy`（除 `.codebuddy/worktrees`）
- MCP / 配置：`.mcp.json` / `.codebuddy.json`

## 子代理如何继承权限模式

默认情况下，子代理（[Agent](sub-agents.md) 工具调用、[Agent Teams](agent-teams.md) 队员）会继承主会话的权限模式，但实际优先级比“简单继承”更细。

要在团队 / 项目层强制覆盖默认子代理模式：

```json
{
  "permissions": {
    "subagentPermissionMode": "bypassPermissions"
  }
}
```

### 子代理 permission mode 优先级

当主会话**不是** `auto` / `dontAsk` 时，子代理 mode 按下列顺序解析：

1. Agent 工具调用时显式传入的 `mode`
2. 子代理 frontmatter / product config 中 agent 自带的 `permissionMode`（写 `ignore` 时沿用父会话模式）
3. CLI `--subagent-permission-mode`
4. 环境变量 `CODEBUDDY_SUBAGENT_PERMISSION_MODE`
5. settings `permissions.subagentPermissionMode`
6. 代码内继承映射
7. 否则直接继承主会话当前模式

目前唯一的特殊继承映射是：

- 主会话 `delegate` → 子代理默认改为 `default`

原因很简单：主代理受限于“只能协调”，但子代理必须能真正工作。

### `auto` / `dontAsk` 的父会话上限

如果主会话当前是 `auto` 或 `dontAsk`，会先触发一层**权限上限（ceiling）**：

- 子代理会被直接钳到和父会话相同的 mode
- 这时就算 Agent 工具显式传入更宽松的 `mode`，也不会生效
- 目的是避免子代理绕开父会话的安全边界

这条上限同样会影响后台子代理 / team member 的 interruption 层“自动直批”短路；父会话是 `auto` / `dontAsk` 时，这些短路会被禁用，必须回到正常权限检查流程。

## 非交互 / 自动化场景怎么选

如果你在 `-p`、`stream-json`、后台代理这类**不能弹审批框**的环境里工作，推荐这样理解各模式：

| 模式 | 非交互下的典型结果 |
| :--- | :--- |
| `default` / `acceptEdits` / `plan` | 任何最终仍需 ask 的动作都会被拒绝 |
| `auto` | 原本会 ask 的动作走 classifier；classifier 不可用时 fail-closed；transcript 过长会中止 run |
| `dontAsk` | 未预批准动作直接拒绝，不会等待人工确认 |
| `bypassPermissions` | 大多数动作直接继续执行 |

因此：

- 想做“固定白名单自动化” → `dontAsk` + `allow` 规则
- 想做“尽可能自动，但保留分类器安全边界” → `auto`
- 想做“绝大多数都别拦” → `bypassPermissions`

## 与权限规则配合使用

一个常见误区是：把 mode 当成唯一权限来源。

实际上更推荐的理解是：

- **mode 定义基线**
- **`allow` / `ask` / `deny` 定义例外**

常规规则叠加示例：

```json
{
  "permissions": {
    "defaultMode": "default",
    "allow": ["Bash(npm test)", "Read(/etc/hosts)"],
    "ask": ["WebFetch"],
    "deny": ["Bash(rm -rf *)", "Edit(.git/**)"]
  }
}
```

固定白名单自动化示例：

```json
{
  "permissions": {
    "defaultMode": "dontAsk",
    "allow": [
      "Read",
      "Grep",
      "Glob",
      "Bash(npm test:*)"
    ],
    "deny": [
      "Bash(git push:*)"
    ]
  }
}
```

第二套配置的效果是：

- `Read` / `Grep` / `Glob` 自动通过
- `npm test ...` 自动通过
- `git push ...` 永远拒绝
- 其他未列出的动作在 `dontAsk` 下直接拒绝

这正是最常见的“只给代理一小组明确能力”的做法。

## 相关资源

- [权限规则](permissions.md)：allow / ask / deny 的匹配语法与完整求值顺序
- [Settings 配置](settings.md)：`defaultMode`、`disableAutoMode`、`autoMode`、`subagentPermissionMode` 等字段
- [CLI 参考](cli-reference.md)：`--permission-mode`、`--subagent-permission-mode`、`codebuddy auto-mode` 等命令
- [Agent Teams：多代理协作](agent-teams.md)：`delegate` 模式下的协作方式
- [子代理（Sub-agents）](sub-agents.md)：子代理的工具与权限模式继承
- [Hooks 钩子系统](hooks-guide.md)：用 `PreToolUse` / `PermissionRequest` / `PermissionDenied` 扩展权限判定
- [非交互模式](headless.md)：`-p` 流程下怎样设计权限策略
- [Bash 沙箱化](bash-sandboxing.md)：在命令层额外加文件系统 / 网络隔离
- [安全](security.md)：整体安全模型与最佳实践
- [IAM 身份与访问](iam.md)：组织级身份认证与权限控制
