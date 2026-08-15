> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/permissions.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 权限规则

> 用细粒度的 allow / ask / deny 规则、权限模式与多层 settings 精准约束 CodeBuddy Code 能做什么。规则可以提交到版本库与团队共享，也可以由开发者本地覆盖。

## 权限系统概览

CodeBuddy Code 的权限不是“只看当前 mode”，而是一条分层求值链。每次工具调用，大致按下面顺序判定：

| 阶段 | 检查项 | 命中后行为 |
| :--- | :--- | :--- |
| 0 | **Hooks / 交互型工具特例** | `PreToolUse` 可直接 allow / deny / ask；`AskUserQuestion` 这类工具本身就要求交互 |
| 1 | **Deny 规则** | 立刻拒绝，最高优先级 |
| 2 | **可信 Allow 规则**（user / CLI / session / policy / 已信任项目规则 / `--allowedTools`） | 立刻放行，且**可越过交互态危险命令检查** |
| 3 | **命令安全检查**（仅交互式） | 高危 Bash 命令强制进入 ask |
| 4 | **Ask 规则** | 强制 ask |
| 5 | **Bypass 模式短路** | `bypassPermissions` 在这里放行大多数动作；若已被禁用则退化 |
| 6 | **不可信 Allow 规则**（未信任项目规则、command / sandbox 来源） | 可放行，但**不能**越过上一步危险命令检查 |
| 7 | **权限模式基线策略** | 由当前 [权限模式](permission-modes.md) 决定默认是 allow 还是 ask |
| 8 | **非交互兜底** | 无法弹审批框时，把 unresolved `ask` 转成 `deny` |
| 9 | **`dontAsk` / `auto` 最终收口** | `dontAsk` 把 ask 改写为 deny；`auto` 只接管 ask 并交给分类器 |

> **要点 1**：`deny` 永远优先。
>
> **要点 2**：CodeBuddy 把 `allow` 分成“可信 allow”和“不可信 allow”两层。项目目录在你显式信任前，仓库内 `.codebuddy/settings.json` / `.codebuddy/settings.local.json` 的 allow 规则**不能越过危险命令检查**，目的是防止恶意仓库把自己的 settings 提交进来后悄悄放宽本地安全边界。
>
> **要点 3**：`auto` 不是整条链的替代品，它只处理“最后仍然会 ask 的动作”；显式 `ask` 规则不会进入 classifier。

读类工具（Read / Grep / Glob 等）默认在信任目录内不弹审批；Edit、Bash 与大多数副作用工具会走完整判定链。

### 权限模式和规则谁优先？

可以把权限系统理解成两层：

- **规则层**：`deny` / `ask` / `allow`
- **模式层**：`default` / `acceptEdits` / `auto` / `dontAsk` / ...

在 CodeBuddy 里，通常是**规则层先于模式层**。几个最重要的例子：

- `deny` 会先于任何 mode 生效
- 显式 `ask` 规则会先于 `auto` 生效，因此仍然需要人工确认
- `dontAsk` 不会绕过规则；它只是把最后得到的 `ask` 改写成 `deny`
- `bypassPermissions` 也不会抹掉前置规则；`deny` / `ask` 仍可能拦住它
- 交互式会话里的危险 Bash 命令，即使在 `bypassPermissions` 下，也可能因为安全检查而进入 ask

## 规则的三种行为

`permissions` 对象下三个数组对应三种行为：

```json
{
  "permissions": {
    "allow": ["Bash(npm test)", "Read(/tmp/data/**)"],
    "ask":   ["WebFetch"],
    "deny":  ["Bash(rm -rf *)", "Edit(.git/**)"]
  }
}
```

- **`allow`**：CodeBuddy 可使用且无需弹审批
- **`ask`**：每次使用都弹审批
- **`deny`**：绝不能使用

## 在哪里管理规则

### `/permissions` 命令

会话里输入 `/permissions` 打开权限管理面板，可以查看当前所有 allow / ask / deny 规则、它们来自哪一层 settings，并临时增删（写到 user / project 或 project-local 任一作用域）。

弹窗里勾选 **"Yes, don't ask again"** 时，CodeBuddy 会把当前命令对应的最稳前缀写入对应作用域 settings 的 `allow` 数组。

### CLI 启动参数

| 参数 | 作用 |
| :--- | :--- |
| `--allowedTools <tools...>` | 进程级临时 allow 规则。空格或逗号分隔。例：`--allowedTools "Bash(git:*) Edit"` |
| `--disallowedTools <tools...>` | 进程级临时 deny 规则。同上 |
| `--add-dir <path>` | 把额外目录加入信任目录范围（影响 Read 是否需要弹询问） |
| `-y` / `--dangerously-skip-permissions` | 等价于 `--permission-mode bypassPermissions` |

### 配置文件

详见 [Settings 配置](settings.md)。CodeBuddy 按这 4 个作用域合并：

| 作用域 | 路径 |
| :----- | :--- |
| user | `~/.codebuddy/settings.json` |
| project | `<repo>/.codebuddy/settings.json`（提交进 git） |
| project-local | `<repo>/.codebuddy/settings.local.json`（不进 git，本地覆盖） |
| cliArg / flagSettings / session / policySettings | 进程态，不落盘 |

## 规则语法

规则形态：`Tool` 或 `Tool(specifier)`。

### 整体匹配某个工具

去掉括号匹配工具的所有调用：

| 规则 | 含义 |
| :--- | :--- |
| `Bash` | 所有 Bash 命令 |
| `WebFetch` | 所有 web 抓取 |
| `Read` | 所有文件读 |
| `Edit` | 所有文件编辑 |

`*` 也可以单独作为规则，相当于全匹配通配（但不覆盖 MCP 工具，见 [MCP 工具](#mcp-工具)）。

### 加 specifier 做细粒度

在括号里写参数：

| 规则 | 匹配 |
| :--- | :--- |
| `Bash(npm run build)` | 精确匹配 `npm run build` |
| `Bash(npm:*)` 或 `Bash(npm *)` | `npm` 开头的所有命令 |
| `Read(./.env)` | 当前目录的 `.env` |
| `Edit(/src/**/*.ts)` | 项目根下 `src/**/*.ts` |
| `Read(~/.zshrc)` | 用户目录的 `.zshrc` |
| `Read(//tmp/scratch.txt)` | 文件系统绝对路径 `/tmp/scratch.txt` |
| `WebFetch(domain:example.com)` | 抓取 example.com |
| `mcp__puppeteer__navigate` | MCP 工具 puppeteer 服务的 navigate |
| `Agent(Explore)` | 子代理 Explore |

## 工具特定规则

### Bash

Bash 规则支持三种语法：

| 语法 | 含义 | 示例 |
| :--- | :--- | :--- |
| 精确匹配 | pattern 完全等于命令 | `Bash(npm run build)` 仅匹配 `npm run build` |
| `:*` 前缀 | pattern 末尾 `:*` → 匹配命令第一个词 / 多词前缀 | `Bash(git:*)` 匹配 `git status` / `git push origin main` |
| 通配符 | pattern 含 `*` 时按 bash glob 模式匹配（**`*` 可跨 `/`**） | `Bash(npm run *)` 匹配 `npm run build`；`Bash(ls *)` 匹配 `ls -al /tmp/x` |

> 通配符模式刻意让 `*` 能跨越 `/` —— 否则 `ls *` 无法匹配 `ls -al /xxx`，这是用户最常踩的坑。

#### 复合命令

CodeBuddy 会解析 shell 操作符 `&&` / `||` / `;` / `|`，对每个子命令独立判定：

- **deny / ask 规则**：任一子命令命中即触发
- **allow 规则**：要求**所有子命令都命中**才放行 —— 一个命中、一个不命中的复合命令仍会询问，避免攻击者把危险命令藏在被允许的命令旁边

举例：

```text
allow: ["Bash(git:*)"]

git status         → 允许
git status && rm * → 询问（rm * 不在 allow 内,需所有子命令都命中)
git status; rm *   → 询问（同上)
```

#### 重定向

包含 `>` / `<` / `>>` / `<<` / `&>` 的命令在 allow 规则下要求**精确匹配**，通配符规则不生效。

### Read / Edit / Write

文件类规则按 glob 匹配，并做了三层路径归一：

| pattern | 解释 | 示例 |
| :------ | :--- | :--- |
| `//path` | 文件系统绝对路径 | `Read(//etc/hosts)` |
| `~/path` | 用户目录起 | `Read(~/.zshrc)` |
| `/path` | 项目根起 | `Edit(/src/**/*.ts)` |
| `path` 或 `./path` | 当前工作目录起 | `Read(.env)` |

匹配开关：允许点开头、不区分大小写、裸文件名可匹配任意深度。

注意：

- `Edit(.git/**)` 之类的 deny 规则会阻挡所有走 Edit / Write / NotebookEdit 的尝试；但**不阻挡**通过 Bash 跑 `python -c 'open(".git/config", "w")...'` 这类间接路径 —— 操作系统级保护需要靠 [Bash 沙箱](bash-sandboxing.md)
- Read 规则同样会被部分 Bash 文件读命令（`cat`、`head`、`tail` 等）拦截解析

### WebFetch

```text
WebFetch                       # 任何 URL
WebFetch(domain:example.com)   # 仅 example.com 及子域
```

支持 `domain:` 前缀做主机名匹配（含子域）。

### MCP 工具

MCP 工具命名格式：`mcp__<server>__<tool>`，用双下划线 `__` 分段（名字里的单下划线只是普通字符）。四种写法：

| 规则 | 匹配 |
| :--- | :--- |
| `mcp__puppeteer` | 前缀为 `mcp__puppeteer__` 的全部工具 |
| `mcp__puppeteer__*` | 同上，两者等价 |
| `mcp__puppeteer__navigate` | 仅 navigate 一个工具 |
| `mcp__*` | 全部 MCP 工具，仅 `deny` / `ask` 生效 |

注意：

- 规则不区分大小写；连字符、点号等符号按下划线处理，`mcp__web-search` 与 `mcp__web_search` 等价
- `*` 只能整段替换最后一节。`mcp__pup*`、`mcp__puppeteer__nav*` 匹配不到任何工具，而且不会报错
- MCP 工具只认 `mcp__` 开头的规则，裸 `*` 对它无效；要全部禁用请写 `"deny": ["mcp__*"]`

### Agent（子代理）

```json
{
  "permissions": {
    "deny": ["Agent(Explore)", "Agent(Plan)"]
  }
}
```

也可用 CLI flag：

```bash
codebuddy --disallowedTools "Agent(Explore) Agent(Plan)"
```

被 deny 后主代理调起 Agent 工具时该 `subagent_type` 会被拒。

### Skill

```json
{
  "permissions": {
    "deny": ["Skill(dangerous-skill-name)"]
  }
}
```

Skill 规则**必须**是精确匹配，不支持通配符。

## 信任目录

CodeBuddy 默认认为只有**当前工作目录**是受信任的。Read 工具在受信目录内放行，受信外询问；Edit / Bash 永远走完整审批（除非有 allow 规则或处于宽松模式）。

扩大信任范围的几种方式：

| 方式 | 持久度 |
| :--- | :--- |
| `--add-dir <path>` 启动参数 | 进程级 |
| 会话内 `/add-dir` 命令 | 会话级 |
| Web UI 添加目录（`/api/v1/workspace-dirs`） | 进程级（前端持久化） |
| `permissions.additionalDirectories` 配置项 | 持久化 |
| `permissions.trustedDirectories` 配置项 | 持久化 |

最终生效的信任目录 = 工作区根 + `settings.trustedDirectories` + 启动时 `--add-dir` / 会话内 `/add-dir` / Web UI 添加的目录。

> `--add-dir` 和 `permissions.additionalDirectories` 都只授予**文件访问权**，**不会**让 CodeBuddy 加载这些目录里的 `.codebuddy/` 配置（agents / hooks / settings 等都仍以启动目录的为准）。

### 项目目录信任开关

仓库目录是否被你"显式信任"还会影响 allow 规则的可信级别。当目录**未被信任**时：

- `<repo>/.codebuddy/settings.json` 与 `.codebuddy/settings.local.json` 里的 `allow` 规则会被归到**不可信**层（Phase 6），**不能**越过命令安全检查
- 用户在交互界面确认信任后，项目级规则会被提升到 Phase 2 可信层

目的是缓解仓库被克隆后立即跑产生的横向风险。

## 受保护文件 / 路径

任意模式下，CodeBuddy 都会对一组关键路径加额外保护（与 [权限模式](permission-modes.md#受保护的关键文件) 一致）：

- 仓库自身：`.git`、`.gitconfig`、`.gitmodules`
- shell 配置：`.bashrc` / `.zshrc` / `.envrc` 等
- 包管理：`.npmrc` / `.yarnrc` / `bunfig.toml` 等
- IDE 工具：`.vscode` / `.idea` / `.husky` / `.devcontainer`
- CodeBuddy 自身：`.codebuddy`（除 `.codebuddy/worktrees`）
- MCP / 配置：`.mcp.json` / `.codebuddy.json`

`bypassPermissions` 模式仍然会让其中绝大部分通过，但 `rm -rf /` / `rm -rf ~` 这类"灾难性命令"会被强制询问。

## 用 Hooks 扩展权限

[Hooks 钩子系统](hooks-guide.md) 的 `PreToolUse` 钩子会在权限弹审批之前运行，可以编程式 allow / deny / 改写输入。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "/path/to/bash-policy.sh" }]
      }
    ]
  }
}
```

钩子退出码语义：

| 退出码 | 行为 |
| :----- | :--- |
| `0` + JSON 决策 | 按 JSON 里的 `permissionDecision`（allow / ask / deny）执行 |
| `2` | 阻断（stderr 内容回填给模型） |
| 其他非 0 | 非阻断错误（提示但放行） |

注意：

- `PreToolUse` 的结构化 `permissionDecision` 会在常规权限规则前生效：`allow` / `deny` / `ask` 分别直接放行、拒绝或强制询问
- 阻断式钩子（exit code 2）也能在常规 allow 规则前短路，所以可以“先放行 Bash 全部，但用钩子单独拦几条特定命令”
- 如果需要无条件的硬边界，仍建议优先使用 `permissions.deny`，便于在 `/permissions` 和 settings 中统一审计

## 与沙箱的协作

权限规则与 [Bash 沙箱](bash-sandboxing.md) 是互补层：

- **规则层**：约束 CodeBuddy "想不想用"某工具或访问某路径
- **沙箱层**：约束 Bash 子进程在 OS 层"能不能真的访问"某资源

防御纵深的典型组合：

- `deny` 规则阻挡 CodeBuddy 主动尝试受限工具
- 沙箱阻挡所有 Bash 子进程触达白名单外的文件 / 网络 —— 即使 prompt injection 让 CodeBuddy 想绕也做不到
- WebFetch 的 `domain:` allow 规则与沙箱 `allowedDomains` 都生效，最终边界取交集

## Settings 优先级

权限规则继承通用 [Settings 优先级](settings.md)：

```
flagSettings / cliArg / session  > userSettings > policySettings >
projectSettings > localSettings > command/sandbox 来源
```

但**评估顺序**比 settings 优先级更重要：

- `deny` 数组从所有作用域合并，**任一作用域 deny 即拒**
- `allow` 数组按"可信 / 不可信"分两次合并：可信合并里 user / cli / flag / session / policy 永远在；project / local 仅在目录被信任时算可信
- `disableBypassPermissionsMode` 在 user / project / local / CLI 启动参数四层任一为 `"disable"` 即生效

## 示例配置

### 最小化信任：只允许 npm 测试 + 读项目内文件

```json
{
  "permissions": {
    "defaultMode": "default",
    "allow": [
      "Bash(npm test)",
      "Bash(npm run lint)",
      "Read(/src/**)",
      "Read(/test/**)"
    ],
    "deny": [
      "Bash(rm:*)",
      "Bash(curl:*)",
      "Bash(wget:*)",
      "Edit(.git/**)",
      "Edit(/.codebuddy/**)"
    ]
  }
}
```

### CI / 流水线场景：跳过审批 + 强 deny

```json
{
  "permissions": {
    "defaultMode": "bypassPermissions",
    "deny": [
      "Bash(rm -rf /:*)",
      "Bash(sudo:*)",
      "Bash(curl * -o /etc/*)",
      "WebFetch(domain:internal-corp.example)"
    ]
  }
}
```

### 团队共享 + 个人放宽

`<repo>/.codebuddy/settings.json`（提交进 git）：

```json
{
  "permissions": {
    "deny": ["Bash(rm:*)", "Edit(.git/**)"]
  }
}
```

`~/.codebuddy/settings.json`（用户级，私有）：

```json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": ["Bash(git:*)", "Bash(npm:*)"]
  }
}
```

## 相关资源

- [权限模式](permission-modes.md)：default / acceptEdits / plan / bypassPermissions / delegate 等模式
- [Settings 配置](settings.md)：完整配置字段、作用域与合并规则
- [Hooks 钩子系统](hooks-guide.md)：用钩子做编程式权限决策
- [Bash 沙箱化](bash-sandboxing.md)：Bash 命令的 OS 级隔离
- [CLI 参考](cli-reference.md)：`--allowedTools` / `--disallowedTools` / `--add-dir` 等启动参数
- [安全](security.md)：整体安全模型与最佳实践
- [IAM 身份与访问](iam.md)：组织级身份认证与权限控制
