> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/iam.md
> 抓取日期: 2026-08-16 (UTC)；内容为官方文档原文下载

# 身份和访问管理

> 了解如何为组织中的 CodeBuddy Code 配置用户身份验证、授权和访问控制。

## 认证方法

### 快速开始

根据你的场景选择认证方式：

| 场景 | 推荐方式 | 如何获取凭据 |
|:-----|:--------|:------------|
| 个人开发者 | `CODEBUDDY_API_KEY` | [从平台获取 API Key](#个人用户获取-api-key) |
| 企业/团队（OAuth 集成） | `apiKeyHelper` | [创建应用获取 Client ID/Secret](#企业用户oauth-认证) |
| CI/CD 已有 OAuth token | `CODEBUDDY_AUTH_TOKEN` | 直接使用已有 token |
| 第三方模型服务 | `CODEBUDDY_API_KEY` + `BASE_URL` | 从第三方服务商获取 |

> 当多个认证方式同时配置时，按以下优先级生效：**CODEBUDDY_AUTH_TOKEN > apiKeyHelper > CODEBUDDY_API_KEY**

---

### 个人用户：获取 API Key

适用于个人开发者快速上手，使用 CodeBuddy 平台提供的模型服务。

**第 1 步：获取 API Key**

访问对应平台获取你的 API Key：

| 版本 | 获取地址 |
|:----|:--------|
| 海外版 | <https://www.codebuddy.ai/profile/keys> |
| 中国版 | <https://copilot.tencent.com/profile/> |
| iOA 版 | <https://tencent.sso.copilot.tencent.com/profile/keys> |

**第 2 步：配置环境变量**

> **⚠️ 重要提示：必须正确配置 `CODEBUDDY_INTERNET_ENVIRONMENT` 环境变量！**
>
> 这是用户最常遗漏的配置项。如果不设置或设置错误，将导致认证失败或连接到错误的服务端点。

根据你使用的版本，配置对应的环境变量：

**海外版：**

```bash
export CODEBUDDY_API_KEY="your-api-key"
# 海外版无需设置 CODEBUDDY_INTERNET_ENVIRONMENT（默认值）
```

**中国版：**

```bash
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_INTERNET_ENVIRONMENT=internal
```

**iOA 版：**

```bash
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_INTERNET_ENVIRONMENT=ioa
```

**专享版：**

```bash
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_INTERNET_ENVIRONMENT=cloudhosted
```

**私有化部署：**

```bash
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_INTERNET_ENVIRONMENT=selfhosted
```

| 版本 | `CODEBUDDY_INTERNET_ENVIRONMENT` 值 | 说明 |
|:----|:-----------------------------------|:----|
| 海外版 | 不设置 | 默认值，连接海外服务 |
| 中国版 | `internal` | 连接中国区服务 |
| iOA 版 | `ioa` | 连接腾讯 iOA 内网服务 |
| 专享版 | `cloudhosted` | 连接腾讯代运维的企业实例 |
| 私有化部署 | `selfhosted` | 连接客户自建的企业服务 |

> **💡 专享版 / 私有化部署还需指定服务地址：** 这两种版本的服务地址由企业自定义（如 `https://your-company.copilot.qq.com`），仅设置环境变量不足以让请求指向企业服务。使用 CLI 时在登录流程的「企业域名配置」中填写，会自动写入 `settings.json`；使用 API Key 时需手动配置，详见 [CODEBUDDY_API_KEY](#codebuddy_api_key)；使用 SDK 时通过 `options.endpoint` 传入。

> **💡 持久化配置建议：** 将环境变量添加到 `~/.bashrc`、`~/.zshrc` 或 shell 配置文件中，避免每次手动设置。
>
> ```bash
> # 添加到 ~/.zshrc 或 ~/.bashrc
> echo 'export CODEBUDDY_API_KEY="your-api-key"' >> ~/.zshrc
> echo 'export CODEBUDDY_INTERNET_ENVIRONMENT=internal' >> ~/.zshrc  # 中国版
> source ~/.zshrc
> ```

**第 3 步：开始使用**

```bash
codebuddy
```

---

### 企业用户：OAuth 认证

适用于企业/团队集成，通过 OAuth 2.0 获取 token。

> 目前仅介绍 Client Credentials 授权方式，适用于服务端应用和 CI/CD 场景。

> **前提条件**：企业用户需要先购买 CodeBuddy 旗舰版才能使用 OAuth 认证。详见 [CodeBuddy 旗舰版购买指南](https://cloud.tencent.com/document/product/1749/110012)。

**第 1 步：创建应用，获取 Client ID 和 Secret**

参考 [企业开发者快速入门](https://copilot.tencent.com/apiDocs/open-platform.html) 完成：
1. 创建企业应用
2. 获取 Client ID 和 Client Secret

**第 2 步：创建获取 token 的脚本**

```bash
#!/bin/bash
# get-oauth-token.sh - OAuth 2.0 Client Credentials 流程

CLIENT_ID="${OAUTH_CLIENT_ID}"
CLIENT_SECRET="${OAUTH_CLIENT_SECRET}"
TOKEN_URL="https://copilot.tencent.com/oauth2/token"

response=$(curl -s -X POST "$TOKEN_URL" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials" \
  -d "client_id=$CLIENT_ID" \
  -d "client_secret=$CLIENT_SECRET")

echo "$response" | jq -r '.access_token'
```

**第 3 步：配置 apiKeyHelper**

在 `~/.codebuddy/settings.json` 或项目 `.codebuddy/settings.json` 中配置：

```json
{
  "apiKeyHelper": "/path/to/get-oauth-token.sh"
}
```

配置完成后即可使用 `codebuddy` 命令。

> apiKeyHelper 获取的 token 默认缓存 5 分钟，可通过 `CODEBUDDY_CODE_API_KEY_HELPER_TTL_MS` 环境变量调整（单位：毫秒）。

---

### 第三方模型服务

适用于使用 OpenRouter 等第三方模型服务。

> **注意：** 使用第三方模型服务时，无需设置 `CODEBUDDY_INTERNET_ENVIRONMENT` 环境变量，因为请求直接发送到第三方服务端点。

```bash
export CODEBUDDY_API_KEY="sk-or-v1-xxx"
export CODEBUDDY_BASE_URL="https://openrouter.ai/api/v1"
codebuddy --model openai/gpt-4
```

---

### 认证方式详解

#### CODEBUDDY_API_KEY

静态 API Key，适用于大部分场景。

| 特性 | 说明 |
|:-----|:-----|
| 环境变量 | `CODEBUDDY_API_KEY` |
| 认证类型 | API Key（X-Api-Key 请求头） |
| 适用场景 | 个人开发、第三方模型服务 |

> **⚠️ 注意：使用 API Key 时，必须同时配置 `CODEBUDDY_INTERNET_ENVIRONMENT` 环境变量！**
>
> | 版本 | 配置值 |
> |:----|:------|
> | 海外版 | 不设置（默认） |
> | 中国版 | `internal` |
> | iOA 版 | `ioa` |
> | 专享版 | `cloudhosted` |
> | 私有化部署 | `selfhosted` |

```bash
# 海外版
export CODEBUDDY_API_KEY="your-api-key"

# 中国版
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_INTERNET_ENVIRONMENT=internal

# iOA 版
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_INTERNET_ENVIRONMENT=ioa

# 专享版（服务地址由企业自定义，还需在 settings.json 配置，见下方说明）
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_INTERNET_ENVIRONMENT=cloudhosted

# 私有化部署（服务地址由企业自定义，还需在 settings.json 配置，见下方说明）
export CODEBUDDY_API_KEY="your-api-key"
export CODEBUDDY_INTERNET_ENVIRONMENT=selfhosted
```

> **⚠️ 专享版 / 私有化部署：还需在 `settings.json` 中配置企业服务地址**
>
> 这两个版本的服务地址由企业自定义，仅设置 `CODEBUDDY_INTERNET_ENVIRONMENT` 不足以让请求指向企业服务——还需在 `~/.codebuddy/settings.json` 中补充：
>
> ```json
> {
>   "endpoint": "https://your-company.copilot.qq.com"
> }
> ```
>
> 未配置时，请求会发往默认的公网服务地址，通常表现为鉴权失败或取不到企业模型列表。
>
> 通过 CLI 登录时，该地址会由登录流程的「企业域名配置」自动写入，无需手动编辑。

#### CODEBUDDY_AUTH_TOKEN

已获取的 OAuth Bearer Token，适用于 CI/CD 或已有 token 的场景。

| 特性 | 说明 |
|:-----|:-----|
| 环境变量 | `CODEBUDDY_AUTH_TOKEN` |
| 认证类型 | Bearer Token（Authorization 请求头） |
| 适用场景 | CI/CD 自动化、已有 OAuth token |

```bash
export CODEBUDDY_AUTH_TOKEN="eyJhbGciOiJSUzI1NiIs..."
```

也可以在 settings.json 中配置：

```json
{
  "env": {
    "CODEBUDDY_AUTH_TOKEN": "your-oauth-token"
  }
}
```

#### apiKeyHelper

通过脚本动态获取 token，适用于 OAuth 集成或需要定期刷新 token 的场景。

| 特性 | 说明 |
|:-----|:-----|
| 配置方式 | settings.json 的 `apiKeyHelper` 字段 |
| 认证类型 | Bearer Token（由脚本返回） |
| 缓存机制 | 默认 5 分钟，可通过 `CODEBUDDY_CODE_API_KEY_HELPER_TTL_MS` 配置 |
| 适用场景 | OAuth Client Credentials、Vault 集成、token 自动刷新 |

**脚本要求：**
- 将 token 输出到标准输出（stdout）
- 以退出码 0 表示成功
- 脚本执行超时时间为 30 秒

**配置示例：**

```json
{
  "apiKeyHelper": "/path/to/get-token.sh"
}
```

**从 Vault 获取 token 示例：**

```bash
#!/bin/bash
vault read -field=api_key secret/codebuddy/api-key
```

详细的认证配置请参考[设置文档 - 环境变量](settings.md#环境变量)。

## 访问控制和权限

我们支持细粒度权限，以便您可以精确指定代理允许执行的操作（例如运行测试、运行 linter)和不允许执行的操作（例如更新云基础设施）。这些权限设置可以检入版本控制并分发给组织中的所有开发人员，也可以由各个开发人员自定义。

### 权限系统

CodeBuddy Code 使用分层权限系统来平衡功能和安全性：

| 工具类型 | 示例 | 需要批准 | "是，不再询问"行为 |
|:--------|:-----|:--------|:-----------------|
| 只读 | 文件读取、LS、Grep | 否 | N/A |
| Bash 命令 | Shell 执行 | 是 | 按项目目录和命令永久记住 |
| 文件修改 | 编辑/写入文件 | 是 | 会话结束前有效 |

### 配置权限

您可以使用 `/permissions` 查看和管理 CodeBuddy Code 的工具权限。此 UI 列出所有权限规则及其来源的 settings.json 文件。

* **Allow** 规则将允许 CodeBuddy Code 使用指定的工具，无需进一步手动批准。
* **Ask** 规则将在 CodeBuddy Code 尝试使用指定工具时询问用户确认。Ask 规则优先于 allow 规则。
* **Deny** 规则将阻止 CodeBuddy Code 使用指定工具。Deny 规则优先于 allow 和 ask 规则。
* **Additional directories** 将 CodeBuddy 的文件访问扩展到初始工作目录之外的目录。
* **Default mode** 控制 CodeBuddy 在遇到新请求时的权限行为。

权限规则使用格式： `Tool` 或 `Tool(optional-specifier)`

仅工具名称的规则匹配该工具的任何使用。例如，将 `Bash` 添加到 allow 规则列表将允许 CodeBuddy Code 使用 Bash 工具而无需用户批准。

#### 权限模式

CodeBuddy Code 支持多种权限模式，可在 [settings](settings.md) 的 `permissions.defaultMode` 中配置，也可通过 `--permission-mode` 指定。常用模式如下：

| 模式 | 描述 |
|:----|:-----|
| `default` | 标准逐次审批模式 |
| `acceptEdits` | 自动批准文件编辑，Bash 仍需审批 |
| `auto` | 对原本会弹审批的动作使用分类器自动判定是否放行 |
| `dontAsk` | 不弹权限框；未预批准动作直接拒绝 |
| `plan` | 计划模式；读和探查为主，写源码前先产出计划 |
| `bypassPermissions` | 跳过所有权限提示（需要安全环境） |

更完整的模式语义、切换方式、状态栏提示和子代理继承规则，请直接参考 [权限模式](permission-modes.md)。

<Warning>
  `bypassPermissions` 模式应仅在安全、隔离的环境中使用，例如 Docker 容器或 VM。在生产环境或包含敏感数据的系统上使用此模式可能会带来安全风险。
</Warning>

<Note>
  **`trustAll` / `trustedDirectories` 不是权限模式替代项。** 这两个字段只影响启动时的**目录信任授权提示**（即"是否信任此目录并允许在其中运行 CodeBuddy"的一次性弹窗），和工具执行时是否弹审批无关。

  - 免除工具审批请设置 `permissions.defaultMode` 或使用 `--permission-mode bypassPermissions` / `-y` / `--dangerously-skip-permissions`
  - 免除目录信任弹窗才用 `trustAll: true` 或把目录加入 `trustedDirectories`
  - 两个开关独立；`bypassPermissions` 开着时目录信任弹窗仍会正常出现，反之亦然

  所以"开了 `bypassPermissions` + `trustAll`，其他就不用配"这个说法是不准确的——前者控制工具审批，后者控制目录信任，两者解决的是不同的确认入口。
</Note>

#### 工作目录

默认情况下，CodeBuddy 可以访问其启动目录中的文件。您可以扩展此访问权限：

* **启动时**：使用 `--add-dir <path>` CLI 参数
* **会话期间**：使用 `/add-dir` 斜杠命令
* **持久配置**：添加到[设置文件](settings.md#配置文件)的 `additionalDirectories`

附加目录中的文件遵循与原始工作目录相同的权限规则 - 它们可以无提示读取，文件编辑权限遵循当前权限模式。

#### 工具特定的权限规则

某些工具支持更细粒度的权限控制：

**Bash**

* `Bash(npm run build)` 精确匹配 Bash 命令 `npm run build`
* `Bash(npm run test:*)` 匹配以 `npm run test` 开头的 Bash 命令
* `Bash(curl http://site.com/:*)` 匹配以 `curl http://site.com/` 开头的 curl 命令

<Tip>
  CodeBuddy Code 能识别 shell 操作符（如 `&&`),因此前缀匹配规则如 `Bash(safe-cmd:*)` 不会授予它运行命令 `safe-cmd && other-cmd` 的权限
</Tip>

<Warning>
  Bash 权限模式的重要限制：

  1. 此工具使用**前缀匹配**,而非正则表达式或 glob 模式
  2. 通配符 `:*` 仅在模式末尾有效，用于匹配任何后续内容
  3. 像 `Bash(curl http://github.com/:*)` 这样的模式可以通过多种方式绕过:
     * URL 前的选项: `curl -X GET http://github.com/...` 不匹配
     * 不同协议: `curl https://github.com/...` 不匹配
     * 重定向: `curl -L http://bit.ly/xyz` (重定向到 github)
     * 变量: `URL=http://github.com && curl $URL` 不匹配
     * 额外空格: `curl  http://github.com` 不匹配

  要更可靠地过滤 URL,请考虑：

  * 使用带 `WebFetch(domain:github.com)` 权限的 WebFetch 工具
  * 通过 CODEBUDDY.md 指示 CodeBuddy Code 您允许的 curl 模式
  * 使用 hooks 进行自定义权限验证
</Warning>

**Read & Edit**

`Edit` 规则适用于所有编辑文件的内置工具。CodeBuddy 将尽力将 `Read` 规则应用于所有读取文件的内置工具，如 Grep、Glob 和 LS。

Read 和 Edit 规则都遵循 [gitignore](https://git-scm.com/docs/gitignore) 规范,有四种不同的模式类型:

| 模式 | 含义 | 示例 | 匹配 |
|-----|------|------|------|
| `//path` | 从文件系统根目录的**绝对**路径 | `Read(//Users/alice/secrets/**)` | `/Users/alice/secrets/**` |
| `~/path` | 从**家目录**的路径 | `Read(~/Documents/*.pdf)` | `/Users/alice/Documents/*.pdf` |
| `/path` | **相对于设置文件**的路径 | `Edit(/src/**/*.ts)` | `<设置文件路径>/src/**/*.ts` |
| `path` 或 `./path` | **相对于当前目录**的路径 | `Read(*.env)` | `<cwd>/*.env` |

<Warning>
  像 `/Users/alice/file` 这样的模式不是绝对路径 - 它相对于您的设置文件！使用 `//Users/alice/file` 表示绝对路径。
</Warning>

**示例：**

* `Edit(/docs/**)` - 在 `<项目>/docs/` 中编辑（不是 `/docs/`!)
* `Read(~/.zshrc)` - 读取家目录的 `.zshrc`
* `Edit(//tmp/scratch.txt)` - 编辑绝对路径 `/tmp/scratch.txt`
* `Read(src/**)` - 从 `<当前目录>/src/` 读取

**WebFetch**

* `WebFetch(domain:example.com)` 匹配对 example.com 的获取请求

**MCP**

* `mcp__puppeteer` 匹配 `puppeteer` 服务器提供的任何工具（在 CodeBuddy Code 中配置的名称）
* `mcp__puppeteer__*` 通配符语法,也匹配 `puppeteer` 服务器的所有工具
* `mcp__puppeteer__puppeteer_navigate` 匹配 `puppeteer` 服务器提供的 `puppeteer_navigate` 工具

<Tip>
  要批准 MCP 服务器的所有工具，可以使用以下任一格式：

  * ✅ 使用： `mcp__github` （批准所有 GitHub 工具）
  * ✅ 使用： `mcp__github__*` （批准所有 GitHub 工具，与上一条等价）

  要仅批准特定工具，列出每一个：

  * ✅ 使用： `mcp__github__get_issue`
  * ✅ 使用： `mcp__github__list_issues`
</Tip>

### 权限配置示例

**基础权限配置：**

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Edit",
      "Bash(git:*)",
      "Bash(npm:*)"
    ],
    "ask": [
      "WebFetch",
      "Bash(docker:*)"
    ],
    "deny": [
      "Bash(rm:*)",
      "Bash(sudo:*)",
      "Edit(**/*.env)",
      "Read(~/.ssh/**)"
    ]
  }
}
```

**安全限制配置：**

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Edit(src/**)",
      "Bash(git:status,git:diff)"
    ],
    "deny": [
      "Edit(**/*.env)",
      "Edit(**/*.key)",
      "Edit(**/*.pem)",
      "Bash(wget:*)",
      "Bash(curl:*)",
      "Read(/etc/**)",
      "Read(~/.ssh/**)",
      "Read(~/.aws/**)"
    ],
    "defaultMode": "default"
  }
}
```

### 使用 hooks 进行额外的权限控制

[CodeBuddy Code hooks](hooks.md) 提供了一种注册自定义 shell 命令在运行时执行权限评估的方法。当 CodeBuddy Code 进行工具调用时，PreToolUse hooks 在权限系统运行之前运行，hook 输出可以决定是批准还是拒绝工具调用，以代替权限系统。

详见 [Hooks 文档](hooks.md)。

## 设置优先级

当存在多个设置源时，它们按以下顺序应用（从高到低优先级）:

1. 命令行参数
2. 本地项目设置(`.codebuddy/settings.local.json`)
3. 共享项目设置(`.codebuddy/settings.json`)
4. 用户设置(`~/.codebuddy/settings.json`)

此层次结构确保在适当的地方仍允许项目和用户级别的灵活性。

## 凭据管理

CodeBuddy Code 安全地管理您的身份验证凭据：

| 平台 | 存储位置 |
|:----|:--------|
| macOS | 加密的 macOS Keychain |
| Linux | 系统密钥环（GNOME Keyring、KWallet） |
| Windows | Windows 凭据管理器 |

**动态凭据获取：** 使用 `apiKeyHelper` 配置自定义脚本动态获取 token，详见 [apiKeyHelper 配置](#apikeyhelper)。

## 安全最佳实践

### 1. 最小权限原则

仅授予 CodeBuddy Code 完成任务所需的最小权限：

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Edit(src/**/*.ts)",
      "Bash(npm:test,npm:build)"
    ],
    "deny": [
      "Edit(**/*.env)",
      "Bash(rm:*)",
      "Bash(sudo:*)"
    ]
  }
}
```

### 2. 保护敏感文件

始终拒绝访问包含敏感信息的文件：

```json
{
  "permissions": {
    "deny": [
      "Read(.env)",
      "Read(.env.*)",
      "Read(secrets/**)",
      "Read(~/.ssh/**)",
      "Read(~/.aws/**)",
      "Edit(**/*.key)",
      "Edit(**/*.pem)"
    ]
  }
}
```

### 3. 使用 Bash 沙箱

在支持的平台上启用沙箱以隔离 bash 命令：

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker"]
  }
}
```

详见[Bash 沙箱文档](bash-sandboxing.md)。

### 4. 审查权限日志

定期检查 CodeBuddy Code 的权限使用情况，确保符合安全策略。

### 5. 团队配置共享

将团队级别的权限配置检入版本控制：

```bash
# 创建团队共享配置
.codebuddy/settings.json

# 添加到 .gitignore
.codebuddy/settings.local.json
```

## 常见问题

### 使用 API Key 认证失败怎么办？

这是最常见的问题，通常是因为 **未配置或错误配置了 `CODEBUDDY_INTERNET_ENVIRONMENT` 环境变量**。

**排查步骤：**

1. 确认你使用的版本（海外版/中国版/iOA 版）
2. 检查环境变量是否正确设置：

```bash
# 检查当前配置
echo $CODEBUDDY_API_KEY
echo $CODEBUDDY_INTERNET_ENVIRONMENT
```

3. 根据版本设置正确的环境变量：

| 版本 | `CODEBUDDY_INTERNET_ENVIRONMENT` |
|:----|:--------------------------------|
| 海外版 | 不设置 |
| 中国版 | `internal` |
| iOA 版 | `ioa` |
| 专享版 | `cloudhosted` |
| 私有化部署 | `selfhosted` |

**常见错误：**

- ❌ 中国版用户忘记设置 `CODEBUDDY_INTERNET_ENVIRONMENT=internal`
- ❌ iOA 版用户设置成了 `internal` 而不是 `ioa`
- ❌ 专享版 / 私有化部署用户只设了环境变量，忘记指定企业服务地址（CLI 的「企业域名配置」或 SDK 的 `options.endpoint`），导致请求仍发往默认公网地址
- ❌ 环境变量只在当前终端生效，新开终端后失效（建议添加到 shell 配置文件）

### 如何临时绕过权限？

使用 `--permission-mode bypassPermissions` 启动 CodeBuddy Code:

```bash
codebuddy --permission-mode bypassPermissions
```

<Warning>
  仅在安全、隔离的环境中使用此选项！
</Warning>

### 如何为特定项目设置不同的权限？

在项目根目录创建 `.codebuddy/settings.json`:

```json
{
  "permissions": {
    "allow": ["项目特定的权限"]
  }
}
```

### 如何查看当前权限配置？

使用 `/permissions` 命令查看所有生效的权限规则及其来源。

## 另见

* [设置配置](settings.md) - 了解完整的配置选项
* [Hooks 文档](hooks.md) - 使用 hooks 进行高级权限控制
* [Bash 沙箱](bash-sandboxing.md) - 了解沙箱隔离功能
* [MCP 集成](mcp.md) - 配置 MCP 服务器权限

---

*通过适当的权限配置，确保 CodeBuddy Code 在安全边界内工作*
