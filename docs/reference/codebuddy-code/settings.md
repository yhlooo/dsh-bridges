> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/settings.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 设置配置

CodeBuddy Code 使用分层配置系统，让您能够在不同级别进行个性化定制，从个人偏好到团队标准，再到项目特定需求。

## 配置文件

`settings.json` 文件是配置 CodeBuddy Code 的官方机制，支持分层设置：

* **用户设置** 定义在 `~/.codebuddy/settings.json`，应用于所有项目
* **项目设置** 保存在项目目录中：
  * `.codebuddy/settings.json` 用于检入源代码控制并与团队共享的设置
  * `.codebuddy/settings.local.json` 用于不检入的设置，适合个人偏好和实验。CodeBuddy Code 会自动配置 git 忽略此文件

### 完整配置示例

```json
{
  "language": "简体中文",
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run test:*)",
      "Read(~/.zshrc)"
    ],
    "ask": [
      "Bash(git push:*)"
    ],
    "deny": [
      "Bash(curl:*)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  },
  "env": {
    "NODE_ENV": "development",
    "DEBUG": "codebuddy:*"
  },
  "model": "gpt-5",
  "subagents": {
    "agents": {
      "Explore": { "model": "lite" },
      "Plan": { "model": "reasoning" }
    }
  },
  "variantModels": {
    "lite": "<fast-model-id>",
    "reasoning": "<reasoning-model-id>"
  },
  "cleanupPeriodDays": 30,
  "includeCoAuthoredBy": false,
  "statusLine": {
    "type": "command",
    "command": "~/.codebuddy/statusline.sh"
  }
}
```

## 可用设置

`settings.json` 支持以下选项：

| 配置键 | 描述 | 示例 |
|:------|:-----|:-----|
| `language` | 首选响应语言，设置后 CodeBuddy Code 将使用指定语言进行回复。留空则自动根据用户输入判断语言 | `"简体中文"` |
| `apiKeyHelper` | 自定义脚本，在 `/bin/sh` 中执行，生成认证值。此值将作为模型请求的 `X-Api-Key` 和 `Authorization: Bearer` 头发送 | `/bin/generate_temp_api_key.sh` |
| `textToImageModel` | 文生图功能使用的模型 ID | `"your-image-model"` |
| `imageToImageModel` | 图生图功能使用的模型 ID | `"your-edit-model"` |
| `cleanupPeriodDays` | 根据最后活动日期本地保留聊天记录的时长(默认:30 天) | `20` |
| `env` | 应用于每个会话的环境变量 | `{"FOO": "bar"}` |
| `includeCoAuthoredBy` | 是否在 git 提交和拉取请求中包含 `co-authored-by CodeBuddy` 署名(默认:`true`） | `false` |
| `permissions` | 权限配置，见下表 | |
| `autoMode` | `auto` 权限模式的分类器规则，见 [Auto Mode 配置](#auto-mode-配置) | `{"allow": ["$defaults", "允许 dev 环境发布"]}` |
| `hooks` | 配置在工具执行前后运行的自定义命令。见 [hooks 文档](hooks.md) | `{"PreToolUse": {"Bash": "echo 'Running command...'"}}` |
| `disableAllHooks` | 禁用所有 [hooks](hooks.md) | `true` |
| `allowUntrustedFrontmatterHooks` | 是否允许执行来自**非 product 内置**来源的 agent/skill 的 frontmatter `hooks` 字段（包括用户本地 `.codebuddy/agents\|skills/*.md` 和插件市场）。默认 `false`，防止不可信的 md 文件静默启动 shell 命令；只有 product 内置 agent/skill 不受影响。 | `true` |
| `model` | 覆盖 CodeBuddy Code 使用的默认模型。直接编辑 settings.json 后**已开启的会话不生效**（需重启进程或执行 `/clear`（新建会话）后才应用新值）；通过 `/model` 或 `/config set model` 切换则立即生效 | `"gpt-5"` |
| `outputStyle` | 输出风格。直接编辑 settings.json 后**已开启的会话不生效**（需重启进程或执行 `/clear`（新建会话）后才应用新值）；通过样式面板（`/output-style`）或 `/config set outputStyle` 切换则立即生效 | `"concise"` |
| `subagents` | 按内置子代理名称指定模型。格式为 `{"agents": {"<子代理名>": {"model": "..."}}}`；`model` 支持模型 ID、名称、别名、`lite` / `reasoning` 或 `inherit` / `default`。各子代理互不影响，支持用户全局和项目两种范围，可在 `/agents` 中编辑。优先级：`CODEBUDDY_CODE_SUBAGENT_MODEL` > 本次 Agent 工具调用的 `model` 入参 > 项目设置 > 用户全局设置 > 内置声明 > 主模型。详见 [子代理文档](sub-agents.md) | `{"agents": {"Explore": {"model": "lite"}, "Plan": {"model": "reasoning"}}}` |
| `variantModels` | 将通用场景变体映射到模型，键为 `lite` 或 `reasoning`，值为模型 ID 或别名。该映射影响所有使用相应变体的逻辑，可通过 `/model:lite` / `/model:reasoning` 编辑。优先级：对应的变体环境变量 > 项目设置 > 用户全局设置 > 主模型的 `relatedModels` > 适用的产品内置默认 > 主模型 | `{"lite": "<fast-model-id>", "reasoning": "<reasoning-model-id>"}` |
| `agent` | 覆盖主线程使用的 agent 名称（内置或自定义 agent），应用该 agent 的 system prompt、工具限制和模型配置。优先级：`product.json default` → `plugin agent` → `settings.json agent` → `CLI --agent` | `"my-reviewer"` |
| `statusLine` | 配置自定义状态行以显示上下文。见 [statusLine 文档](#状态行配置） | `{"type": "command", "command": "~/.codebuddy/statusline.sh"}` |
| `enableAllProjectMcpServers` | 自动批准项目 `.mcp.json` 文件中定义的所有 MCP 服务器 | `false` |
| `enabledMcpjsonServers` | 从 `.mcp.json` 文件批准的特定 MCP 服务器列表 | `["memory", "github"]` |
| `disabledMcpjsonServers` | 从 `.mcp.json` 文件拒绝的特定 MCP 服务器列表 | `["filesystem"]` |
| `autoCompactEnabled` | 开启自动压缩功能 | `true` |
| `autoCompactWindow` | 自动压缩计算的上下文窗口基准值（token），触发点 = `min(该值, 模型有效预算) × 阈值`；留空跟随模型窗口，clamp 到 [100k, 1M] 且不超过模型实际窗口。环境变量 `CODEBUDDY_AUTO_COMPACT_WINDOW` 优先级更高 | `200000` |
| `autoUpdates` | 自动更新设置 | `false` |
| `alwaysThinkingEnabled` | 始终启用思考模式 | `true` |
| `showTokensCounter` | 是否在界面中显示 Tokens 计数器 | `false` |
| `endpoint` | 自定义服务端点地址 | `"https://api.example.com"` |
| `envRouteMode` | 环境路由模式配置 | `"production"` |
| `sandbox` | Bash 沙箱配置,见[Bash沙箱设置](#bash沙箱设置) | `{"enabled": true}` |
| `promptSuggestionEnabled` | 启用 Prompt 建议功能，在 Agent 完成对话后自动预测下一步操作（默认：`true`） | `false` |
| `reasoningEffort` | Reasoning effort 级别配置，控制模型推理的深度。可选值：`minimal`、`low`、`medium`、`high`、`xhigh`、`max`。留空时使用产品配置默认值。可通过 `/config` 面板切换，选择 `auto` 等效于清除此设置 | `"high"` |
| `memory` | [Experimental] 记忆功能配置，见[记忆功能配置](#记忆功能配置experimental) | `{"enabled": true}` |
| `trustedDirectories` | 已经信任过的工作目录列表。命中的目录启动时不会再弹"是否信任此目录"的授权提示。通常由首次启动时的弹窗自动写入，也可手动编辑 | `["~/workspace/myproj"]` |
| `trustAll` | 信任所有工作目录，启动时不再弹"是否信任此目录"的授权提示。**仅免除目录信任授权，不会跳过工具执行权限**——是否弹工具审批仍由 `permissions.defaultMode` / `bypassPermissions` 模式决定，与本字段相互独立 | `true` |
| `gateway` | Remote Gateway 配置，见 [Gateway 配置](#gateway-配置) | `{"runTimeoutMs": 1800000}` |
| `disableUEAutoExclude` | 禁用 Unreal Engine 项目自动排除。默认 `false`：当 cwd 顶层存在 `*.uproject` 文件时，Grep/Glob 工具会自动在 ripgrep 搜索中排除 `Intermediate/ DerivedDataCache/ Saved/ Binaries/ Build/ .vs/` 六个 UE 编译产物和 IDE 缓存目录。设为 `true` 可关闭该行为，让搜索覆盖这些目录 | `true` |

### 权限设置

| 配置键 | 描述 | 示例 |
|:------|:-----|:-----|
| `allow` | [权限规则](iam.md#配置权限)数组,允许工具使用。**注意:** Bash 规则使用前缀匹配,不是正则表达式 | `[ "Bash(git diff:*)" ]` |
| `ask` | [权限规则](iam.md#配置权限)数组,在工具使用时询问确认 | `[ "Bash(git push:*)" ]` |
| `deny` | [权限规则](iam.md#配置权限)数组,拒绝工具使用。用于排除 CodeBuddy Code 访问敏感文件。**注意:** Bash 模式是前缀匹配,可以被绕过(参见 [Bash 权限限制](iam.md#工具特定的权限规则)) | `[ "WebFetch", "Bash(curl:*)", "Read(./.env)", "Read(./secrets/**)" ]` |
| `additionalDirectories` | CodeBuddy 可以访问的额外[工作目录](iam.md#工作目录) | `[ "../docs/" ]` |
| `defaultMode` | 打开 CodeBuddy Code 时的默认[权限模式](permission-modes.md)。常用值：`default`、`acceptEdits`、`auto`、`dontAsk`、`plan`、`bypassPermissions` | `"acceptEdits"` |
| `disableBypassPermissionsMode` | 设置为 `"disable"` 以防止激活 `bypassPermissions` 模式。这会禁用 `-y` 和 `--dangerously-skip-permissions` 命令行标志 | `"disable"` |
| `disableAutoMode` | 设置为 `"disable"` 以防止激活 `auto` 模式。禁用后，`--permission-mode auto` 和 `defaultMode: "auto"` 都会回退到 `default` | `"disable"` |
| `subagentPermissionMode` | 覆盖 subagent/团队成员的默认权限模式。设置后所有 subagent 使用此模式，而非继承主 session 的模式。Agent 工具的 `mode` 参数优先级更高；但主会话若处于 `auto` / `dontAsk`，子代理仍会受父会话权限上限约束 | `"bypassPermissions"` |

### Auto Mode 配置

`autoMode` 是一个**顶层 settings 字段**，不是 `permissions` 的子字段。它定义 `auto` 权限模式使用的分类器上下文与规则。

#### `autoMode` 里有哪些字段？

| 配置键 | 作用 | 示例 |
|:------|:-----|:-----|
| `environment` | 描述哪些仓库、域名、服务、存储位置属于你的受信边界，帮助分类器判断什么算“内部” | `["$defaults", "Trusted internal domains: staging.example.com"]` |
| `allow` | 补充“在 auto 下通常可自动放行”的自然语言规则 | `["$defaults", "允许 dev namespace 的发布"]` |
| `soft_deny` | 补充“通常应拦截，但在明确用户意图下可重试”的规则描述 | `["$defaults", "修改共享测试数据库 schema"]` |
| `hard_deny` | 补充“默认必须阻断”的高风险规则描述 | `["$defaults", "把私有仓库内容发布到公网"]` |

这些字段的值都是**字符串数组**。数组项不是正则，也不是工具模式，而是写给分类器看的**自然语言规则**。

#### 分类器会从哪里读取 `autoMode`？

CodeBuddy 只会从以下来源读取 `autoMode`：

| 来源 | 典型位置 | 用途 |
|:-----|:---------|:-----|
| user settings | `~/.codebuddy/settings.json` | 跨项目的个人受信边界 |
| project-local settings | `.codebuddy/settings.local.json` | 某个项目、某台机器上的本地补充规则 |
| CLI `--settings` | `codebuddy --settings '{...}'` | 一次性自动化或临时覆盖 |

不会读取的来源：

- 共享项目配置 `.codebuddy/settings.json`

原因是：`autoMode` 属于本地安全边界定义，仓库提交的配置不应该悄悄改变你本机对“哪些地方算内部、哪些动作算允许”的判断。

#### 与 `permissions.defaultMode: "auto"` 的区别

这里有两个容易混淆的限制：

1. **`autoMode` 规则来源**：允许来自 user / project-local / CLI
2. **默认进入 `auto` 模式的授权来源**：只允许来自 user / CLI

也就是说：

- `.codebuddy/settings.local.json` **可以**补充 `autoMode.environment / allow / soft_deny / hard_deny`
- 但 `.codebuddy/settings.local.json` **不能**通过 `permissions.defaultMode: "auto"` 让会话默认进入 `auto`
- `.codebuddy/settings.json` 两者都不行：既不能提供 `autoMode`，也不能授予 `defaultMode: "auto"`

#### 多个来源如何合并？

`autoMode` 的四个字段会按来源顺序合并：

1. user
2. project-local
3. CLI

合并时遵循两个原则：

- 每个字段**独立合并**，互不影响
- 每个字段都是把不同来源的数组**追加**在一起，再统一处理 `"$defaults"`

这意味着：

- 你只设置 `environment`，不会影响 `allow` / `soft_deny` / `hard_deny` 的默认值
- 你可以在 user settings 里放组织级受信域名，再在 project-local 补充某个项目独有的 staging 服务

#### `"$defaults"` 怎么工作？

`"$defaults"` 是一个特殊占位符，表示“把内置默认规则插到这里”。

例如：

```json
{
  "autoMode": {
    "environment": [
      "$defaults",
      "Trusted internal domains: staging.example.com"
    ]
  }
}
```

表示：

- 先使用内置 `environment` 默认规则
- 再追加你自定义的 `staging.example.com`

关键语义：

- 字段**未配置**：该字段直接使用内置默认规则
- 字段里**包含** `"$defaults"`：在该位置展开默认规则
- 字段里**不包含** `"$defaults"`：表示**完整替换**该字段的内置默认规则
- 多个来源都写了 `"$defaults"` 时，内置规则只会展开**一次**，不会重复注入

额外提醒：

- `soft_deny` / `hard_deny` 如果不写 `"$defaults"`，等于主动放弃内置安全规则
- 运行时会对此打 warning，但不会阻止你这样配置

#### 如何检查当前生效结果？

```bash
codebuddy auto-mode defaults
codebuddy auto-mode config
codebuddy auto-mode critique
```

这三个命令分别用于：

- `defaults`：打印内置默认规则
- `config`：打印**最终生效**的规则（含多来源合并、`"$defaults"` 展开后的结果）
- `critique`：让 lite 模型审视你自定义的 `allow` / `soft_deny` / `hard_deny` 是否含糊、冗余或容易误伤

如果你准备完全接管某个字段，最稳妥的做法通常是：

1. 先运行 `codebuddy auto-mode defaults`
2. 复制内置规则
3. 在你的 settings 中显式改写
4. 再运行 `codebuddy auto-mode config` 检查最终结果

#### 配置示例

##### 只补充受信环境

```json
{
  "autoMode": {
    "environment": [
      "$defaults",
      "Source control: git.example.com/acme and all repos under it",
      "Trusted internal domains: staging.example.com, api.internal.example.com",
      "Trusted buckets: s3://acme-build-artifacts"
    ]
  }
}
```

##### 同时补充 allow / deny 规则

```json
{
  "permissions": {
    "defaultMode": "auto"
  },
  "autoMode": {
    "environment": [
      "$defaults",
      "Trusted internal domains: staging.example.com"
    ],
    "allow": [
      "$defaults",
      "允许 dev namespace 的发布"
    ],
    "soft_deny": [
      "$defaults",
      "修改共享测试数据库 schema"
    ],
    "hard_deny": [
      "$defaults",
      "把私有仓库内容发布到公网"
    ]
  }
}
```

### 记忆功能配置

记忆功能允许 CodeBuddy Code 在会话之间保持持久化记忆，自动管理项目上下文和学习历史。

| 配置键 | 描述 | 示例 |
|:------|:-----|:-----|
| `autoMemoryEnabled` | 是否启用 Auto Memory 功能（默认：`true`）。Auto Memory 允许 CodeBuddy 自动管理跨会话的持久化记忆，存储在 `~/.codebuddy/memories/` 目录 | `true` |
| `typedMemory` | 是否启用 Typed Memory 模式（默认：`true`）。启用后使用 4 种记忆类型（user/feedback/project/reference）+ YAML frontmatter 格式管理记忆 | `true` |
| `relevanceSelection` | 是否启用记忆相关性选择（默认：`true`）。启用后根据用户查询自动选择最多 5 个相关记忆注入上下文 | `true` |
| `memoryExtraction` | 是否启用后台记忆提取（默认：`false`）。启用后在对话结束时自动从对话中提取值得记住的信息 | `true` |
| `teamMemory.enabled` | 是否启用团队记忆模式（默认：`false`）。启用后，项目记忆存储在项目目录下，便于团队共享 | `true` |
| `teamMemory.userId` | 团队用户 ID，用于隔离不同用户的记忆。默认自动获取（git user.name > 系统用户名） | `"yangsubo"` |

**配置示例：**

```json
{
  "memory": {
    "autoMemoryEnabled": true,
    "typedMemory": true,
    "relevanceSelection": true,
    "memoryExtraction": false,
    "teamMemory": {
      "enabled": true,
      "userId": "yangsubo"
    }
  }
}
```

**记忆存储位置：**

- **个人模式**（默认）：`~/.codebuddy/memories/{project-id}/`
- **团队模式**：`{project}/.codebuddy/memories/@{user-id}/`
- **全局记忆**：`~/.codebuddy/memories/global/`

也可以通过 `/config` 命令在设置面板中启用此功能。

### Bash沙箱设置

配置高级沙箱行为。沙箱将 bash 命令与您的文件系统和网络隔离。详见 [Bash 沙箱文档](bash-sandboxing.md)。

**文件系统和网络限制**通过 Read、Edit 和 WebFetch 权限规则配置，而非通过这些沙箱设置。

| 配置键 | 描述 | 示例 |
|:------|:-----|:-----|
| `enabled` | 启用 bash 沙箱(仅限 macOS/Linux)。默认:false | `true` |
| `autoAllowBashIfSandboxed` | 在沙箱环境中自动批准 bash 命令。默认:true | `true` |
| `excludedCommands` | 应在沙箱外运行的命令 | `["git", "docker"]` |
| `allowUnsandboxedCommands` | 允许通过 `dangerouslyDisableSandbox` 参数在沙箱外运行命令。设置为 `false` 时，完全禁用 | 
| `network.allowUnixSockets` | 沙箱中可访问的 Unix 套接字路径（用于 SSH 代理等） | `["~/.ssh/agent-socket"]` |
| `network.allowLocalBinding` | 允许绑定到 localhost 端口(仅限 macOS)。默认: false | `true` |
| `network.httpProxyPort` | 如果您希望使用自己的代理,使用的 HTTP 代理端口。如果未指定,CodeBuddy 将运行自己的代理 | `8080` |
| `network.socksProxyPort` | 如果您希望使用自己的代理,使用的 SOCKS5 代理端口。如果未指定,CodeBuddy 将运行自己的代理 | `8081` |
| `enableWeakerNestedSandbox` | 为无特权的 Docker 环境启用较弱的沙箱(仅限 Linux)。**降低安全性。** 默认:false | `true` |

**配置示例：**

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker"],
    "network": {
      "allowUnixSockets": [
        "/var/run/docker.sock"
      ],
      "allowLocalBinding": true
    }
  },
  "permissions": {
    "deny": [
      "Read(.envrc)",
      "Read(~/.aws/**)"
    ]
  }
}
```

**文件系统访问**通过 Read/Edit 权限控制：

* Read deny 规则阻止沙箱中的文件读取
* Edit allow 规则允许文件写入（除默认值外，如当前工作目录）
* Edit deny 规则阻止允许路径内的写入

> **注意**：沙箱默认将 CodeBuddy 配置文件（`settings.json`、`settings.local.json`）加入写保护列表，防止沙箱内的命令或工具篡改配置。详见 [Bash 沙箱 - 配置文件保护](bash-sandboxing.md#配置文件保护)。

**网络访问**通过 WebFetch 权限控制：

* WebFetch allow 规则允许网络域
* WebFetch deny 规则阻止网络域

### 设置优先级

设置按优先级顺序应用（从高到低）:

1. **命令行参数**
   * 特定会话的临时覆盖

2. **本地项目设置** (`.codebuddy/settings.local.json`)
   * 个人项目特定设置

3. **共享项目设置** (`.codebuddy/settings.json`)
   * 源代码控制中的团队共享项目设置

4. **用户设置** (`~/.codebuddy/settings.json`)
   * 个人全局设置

此层次结构确保团队可以建立共享标准，同时仍允许个人自定义体验。

### 配置系统要点

* **内存文件 （CODEBUDDY.md)**：包含 CodeBuddy 在启动时加载的指令和上下文
* **设置文件 （JSON)**：配置权限、环境变量和工具行为
* **斜杠命令**：可在会话期间使用 `/command-name` 调用的自定义命令
* **MCP 服务器**：使用额外工具和集成扩展 CodeBuddy Code
* **优先级**：更高级别的配置覆盖更低级别的配置
* **继承**：设置被合并，更具体的设置添加或覆盖更广泛的设置

### 排除敏感文件

为防止 CodeBuddy Code 访问包含敏感信息的文件（如 API 密钥、秘密、环境文件），在 `.codebuddy/settings.json` 文件中使用 `permissions.deny` 设置：

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./config/credentials.json)",
      "Read(./build)"
    ]
  }
}
```

匹配这些模式的文件将对 CodeBuddy Code 完全不可见，防止任何敏感数据的意外泄露。

## Gateway 配置

`gateway` 字段配置 Remote Gateway（`--serve` 模式下 HTTP/SSE 对外暴露 `/api/v1/runs` 等端点）的行为。

```json
{
  "gateway": {
    "auth": "none",
    "maxConnections": 5,
    "tokenTtlMs": 86400000,
    "runTimeoutMs": 1800000
  }
}
```

| 字段 | 描述 | 默认 |
|:-----|:-----|:-----|
| `auth` | 认证模式。`"password"` 要求客户端携带密码，`"none"` 不做认证。`--serve` 未显式配置时默认为 `"password"`；显式设为 `"none"` 可关闭（此时同机任意进程即可经该服务执行命令、读写文件，仅建议隔离环境 / CI 使用） | `"password"`（`--serve`） |
| `password` | `auth: "password"` 时的密码。为空首次启动会自动生成并打印到日志 | 自动生成 |
| `corsOrigins` | 允许跨域访问 Gateway 的额外 Origin 列表。服务自身监听端口的 loopback 来源自动放行，**其他端口的 `localhost` 页面需在此显式声明**（如本地开发的 Vite dev server） | `[]` |
| `maxConnections` | ACP 协议最大并发连接数。环境变量 `CODEBUDDY_ACP_MAX_CONNECTIONS` 优先级更高 | `5` |
| `tokenTtlMs` | ACP session token 有效期（毫秒）。环境变量 `CODEBUDDY_ACP_TOKEN_TTL_MS` 优先级更高 | `86400000`（24 小时）|
| `runTimeoutMs` | `/api/v1/runs` 任务执行超时（毫秒）。超时返回 `{code:'EXECUTION_ERROR', message:'Task timed out after Xmin'}` | `1800000`（30 分钟）|

### `runTimeoutMs` 覆盖优先级

长任务（如复杂 agent 多轮搜索、大文件处理）可能超过默认 30 分钟，支持两种覆盖方式：

1. **HTTP 请求头 `X-Codebuddy-Run-Timeout`**（毫秒数）— **针对单次请求覆盖**，优先级最高
2. **`settings.json` 里 `gateway.runTimeoutMs`** — 进程级默认值
3. **内置默认值** — 30 分钟

示例：

```bash
# 单次请求给 60 分钟
curl -X POST http://127.0.0.1:7890/api/v1/runs \
  -H "Content-Type: application/json" \
  -H "X-Codebuddy-Run-Timeout: 3600000" \
  -d '{"id":"run-1","type":"message","payload":{"text":"..."}}'
```

设为 `0` 或负数关闭超时保护（不建议，长任务未结束会一直占用 SSE 长连接）。

## 子代理配置

CodeBuddy Code 支持为内置子代理独立选择模型，也支持通过 Markdown 文件创建自定义子代理。

内置子代理与场景模型可以在用户级或项目级 `settings.json` 中组合配置：

```json
{
  "subagents": {
    "agents": {
      "Explore": { "model": "lite" },
      "Plan": { "model": "reasoning" }
    }
  },
  "variantModels": {
    "lite": "<fast-model-id>",
    "reasoning": "<reasoning-model-id>"
  }
}
```

* 使用 `/agents` 编辑内置子代理映射；使用 `/model:lite` / `/model:reasoning` 编辑 `lite` 和 `reasoning` 映射。
* **Global** 写入用户设置，**Project** 写入共享项目设置。
* `subagents` 按子代理名合并，`variantModels` 按变体名合并。项目级覆盖 `Explore` 不会删除用户级的其他子代理配置；项目级覆盖 `reasoning` 也不会删除用户级的 `lite`。
* 在 `/agents` 中选择 **Inherit / Default**，或在 `/model` 中选择 **Default**，会删除所选范围的对应项并恢复低优先级解析链。

自定义子代理存储为带有 YAML frontmatter 的 Markdown 文件：

* **用户子代理**：`~/.codebuddy/agents/` - 在所有项目中可用
* **项目子代理**：`.codebuddy/agents/` - 特定于项目，可与团队共享

自定义子代理文件定义专用提示、模型和工具权限。完整配置方式和优先级详见 [子代理文档](sub-agents.md)。

## 插件配置

CodeBuddy Code 支持插件系统，允许您使用自定义命令、代理、hooks 和 MCP 服务器扩展功能。插件通过市场分发，可在用户和项目级别配置。

### 插件设置

`settings.json` 中的插件相关设置：

```json
{
  "enabledPlugins": {
    "formatter@company-tools": true,
    "deployer@company-tools": true,
    "analyzer@security-plugins": false
  },
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": {
        "source": "github",
        "repo": "company/codebuddy-plugins"
      }
    }
  }
}
```

#### `enabledPlugins`

控制启用哪些插件。格式：`"plugin-name@marketplace-name": true/false`

**作用域**：

* **用户设置** (`~/.codebuddy/settings.json`)：个人插件偏好
* **项目设置** (`.codebuddy/settings.json`)：与团队共享的项目特定插件
* **本地设置** (`.codebuddy/settings.local.json`)：每台机器的覆盖（不提交）

**示例**:

```json
{
  "enabledPlugins": {
    "code-formatter@team-tools": true,
    "deployment-tools@team-tools": true,
    "experimental-features@personal": false
  }
}
```

#### `extraKnownMarketplaces`

定义应为项目提供的额外市场。通常在项目级设置中使用，以确保团队成员可以访问所需的插件源。

**当项目包含 `extraKnownMarketplaces` 时**:

1. 团队成员在信任文件夹时被提示安装市场
2. 然后团队成员被提示从该市场安装插件
3. 用户可以跳过不需要的市场或插件（存储在用户设置中）
4. 安装遵守信任边界并需要明确同意

**示例**:

```json
{
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": {
        "source": "github",
        "repo": "company-org/codebuddy-plugins"
      }
    },
    "security-plugins": {
      "source": {
        "source": "git",
        "url": "https://git.company.com/security/plugins.git"
      }
    }
  }
}
```

**市场源类型**:

* `github`: GitHub 仓库（使用 `repo`)
* `git`:任何 git URL(使用 `url`)
* `directory`:本地文件系统路径(使用 `path`,仅用于开发）

### 管理插件

使用 `/plugin` 命令交互式管理插件：

* 浏览市场中的可用插件
* 安装/卸载插件
* 启用/禁用插件
* 查看插件详细信息（提供的命令、代理、hooks)
* 添加/删除市场

详见 [插件文档](plugins.md)。

## 环境变量

CodeBuddy Code 支持通过环境变量来控制其行为。所有环境变量也可以在 [`settings.json`](#可用设置) 的 `env` 字段中配置，这样可以自动为每个会话应用，或为整个团队推出配置。

完整的环境变量参考文档请参见 [**环境变量参考**](./env-vars.md)。

### 快速入门

**基础认证配置**：

```bash
# 使用 API 密钥
export CODEBUDDY_API_KEY="your-api-key"
codebuddy

# 或使用授权令牌
export CODEBUDDY_AUTH_TOKEN="your-token"
codebuddy
```

**设置代理**：

```bash
export HTTPS_PROXY="https://proxy.example.com:8080"
export NO_PROXY="localhost,127.0.0.1"
codebuddy
```

**启用高级功能**：

```bash
# 扩展思考
export MAX_THINKING_TOKENS="10000"

# 自动内存
export CODEBUDDY_DISABLE_AUTO_MEMORY="0"

codebuddy -p "你的查询"
```

### 在 settings.json 中配置

环境变量也可以在 `settings.json` 的 `env` 字段中设置：

```json
{
  "env": {
    "CODEBUDDY_API_KEY": "your-api-key",
    "HTTPS_PROXY": "https://proxy.example.com:8080",
    "MAX_THINKING_TOKENS": "10000"
  }
}
```

更多配置示例和高级用法，请参见 [**环境变量参考**](./env-vars.md) 和 [**使用示例**](./env-vars.md#使用示例)。

## 状态行配置

配置终端底部显示的状态行，可以显示当前会话、模型、成本等信息：

| 配置键 | 类型 | 描述 |
|--------|------|------|
| `statusLine.type` | string | 状态行类型，目前支持 "command" |
| `statusLine.command` | string | 执行的命令路径，支持 ~ 路径扩展 |

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.codebuddy/statusline-script.sh"
  }
}
```

状态行命令会接收包含会话信息的 JSON 数据作为 stdin 输入，包括：
- `session_id`：会话 ID
- `model`：当前模型信息
- `workspace`：工作空间路径信息
- `cost`：成本统计信息
- `version`：应用版本

使用 `/statusline` 命令可以快速配置状态行。

## 配置管理命令

使用 `codebuddy config` 命令管理配置：

### 基本语法
```bash
codebuddy config [command] [options]
```

### 可用命令

| 命令 | 语法 | 描述 |
|------|------|------|
| `get` | `codebuddy config get <key>` | 获取配置值 |
| `set` | `codebuddy config set [options] <key> <value>` | 设置配置值 |
| `list` | `codebuddy config list`(别名:`ls`）| 列出所有配置 |
| `add` | `codebuddy config add <key> <values...>` | 向数组配置添加项目 |
| `remove` | `codebuddy config remove <key> [values...]`(别名:`rm`）| 移除配置或数组项 |

### 选项

| 选项 | 描述 | 适用命令 |
|------|------|----------|
| `-g, --global` | 设置全局配置 | `set` |

### 使用示例

#### 查看配置
```bash
# 列出所有配置
codebuddy config list

# 获取特定配置值
codebuddy config get model
codebuddy config get permissions
```

#### 设置配置
```bash
# 设置项目级模型（不需要 -g 标志）
codebuddy config set model gpt-5

# 设置全局模型（需要 -g 标志）
codebuddy config set -g model gpt-4

# 设置项目级权限配置（不需要 -g 标志）
codebuddy config set permissions '{"allow": ["Read", "Edit"], "deny": ["Bash(rm:*)"]}'

# 设置项目级环境变量（不需要 -g 标志）
codebuddy config set env '{"NODE_ENV": "development", "DEBUG": "true"}'

# 设置全局专用配置（需要 -g 标志）
codebuddy config set -g cleanupPeriodDays 30
codebuddy config set -g includeCoAuthoredBy false
```

## CodeBuddy 可用的工具

CodeBuddy Code 可以访问一组强大的工具，帮助它理解和修改您的代码库：

| 工具 | 描述 | 需要权限 |
|:-----|:-----|:---------|
| **AskUserQuestion** | 向用户询问多选问题以收集信息或澄清歧义 | 否 |
| **Bash** | 在您的环境中执行 shell 命令 | 是 |
| **TaskOutput** | 从正在运行或已完成的后台任务检索输出 | 否 |
| **Edit** | 对特定文件进行有针对性的编辑 | 是 |
| **MultiEdit** | 在单个操作中对单个文件进行多次编辑 | 是 |
| **ExitPlanMode** | 提示用户退出计划模式并开始编码 | 是 |
| **Glob** | 基于模式匹配查找文件 | 否 |
| **Grep** | 在文件内容中搜索模式 | 否 |
| **TaskStop** | 通过 ID 终止正在运行的后台任务 | 否 |
| **LSP** | 与 LSP 服务器交互获取代码智能功能（跳转定义、查找引用、悬停信息等） | 否 |
| **NotebookEdit** | 修改 Jupyter notebook 单元格 | 是 |
| **Read** | 读取文件内容 | 否 |
| **Skill** | 在主对话中执行技能 | 是 |
| **SlashCommand** | 运行[自定义斜杠命令](slash-commands.md#slashcommand-工具) | 是 |
| **Task** | 运行子代理以处理复杂的多步骤任务 | 否 |
| **TaskOutput** | 从正在运行或已完成的后台任务检索输出 | 否 |
| **TaskCreate** | 创建任务以跟踪工作进度 | 否 |
| **TaskUpdate** | 更新任务状态（pending/in_progress/completed） | 否 |
| **TaskList** | 列出当前任务 | 否 |
| **TaskGet** | 获取特定任务详情 | 否 |
| **WebFetch** | 从指定 URL 获取内容 | 是 |
| **WebSearch** | 执行带域过滤的网络搜索 | 是 |
| **Write** | 创建或覆盖文件 | 是 |

权限规则可以使用 `/permissions` 或在[权限设置](#权限设置)中配置。另见[工具特定的权限规则](iam.md#工具特定的权限规则)。

### 使用 hooks 扩展工具

您可以使用 [CodeBuddy Code hooks](hooks.md) 在任何工具执行前后运行自定义命令。

例如，您可以在 CodeBuddy 修改 Python 文件后自动运行 Python 格式化程序，或通过阻止对某些路径的 Write 操作来防止修改生产配置文件。

## 常见配置场景

### 团队协作配置

**项目共享配置**（`.codebuddy/settings.json`）：
```json
{
  "model": "gpt-5",
  "permissions": {
    "allow": ["Read", "Edit", "Bash(git:*)", "Bash(npm:*)"],
    "ask": ["WebFetch", "Bash(docker:*)"],
    "deny": ["Bash(rm:*)", "Bash(sudo:*)"]
  },
  "env": {
    "NODE_ENV": "development"
  }
}
```

**个人本地配置**（`.codebuddy/settings.local.json`）：
```json
{
  "model": "gpt-4",
  "env": {
    "DEBUG": "myapp:*"
  }
}
```

### 安全配置

限制敏感操作和文件访问：

```json
{
  "permissions": {
    "allow": ["Read", "Edit(src/**)", "Bash(git:status,git:diff)"],
    "ask": ["WebFetch", "Bash(curl:*)"],
    "deny": [
      "Edit(**/*.env)",
      "Edit(**/*.key)",
      "Edit(**/*.pem)",
      "Bash(wget:*)",
      "Read(/etc/**)",
      "Read(~/.ssh/**)"
    ],
    "defaultMode": "default"
  }
}
```

### 沙箱安全配置

启用沙箱并配置文件系统和网络访问：

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker", "git"],
    "network": {
      "allowUnixSockets": ["/var/run/docker.sock"],
      "allowLocalBinding": true
    }
  },
  "permissions": {
    "allow": [
      "Edit(src/**)",
      "WebFetch(https://api.github.com/**)"
    ],
    "deny": [
      "Read(.envrc)",
      "Read(~/.aws/**)",
      "Edit(**/*.env)"
    ]
  }
}
```

## 另见

* [身份和访问管理](iam.md#配置权限) - 了解 CodeBuddy Code 的权限系统
* [Bash 沙箱](bash-sandboxing.md) - 了解沙箱隔离功能
* [故障排除](troubleshooting.md) - 常见配置问题的解决方案

---

*合适的配置让 CodeBuddy Code 更懂您的需求 ⚙️*
