> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/plugins-reference.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# CodeBuddy 插件参考文档

> 完整的 CodeBuddy 插件系统技术参考，包括组件规范、CLI 命令和开发工具。

**插件**是一个自包含的组件目录，用于扩展 CodeBuddy 的自定义功能。插件组件包括技能 (Skills)、代理 (Agents)、钩子 (Hooks)、MCP 服务器和 LSP 服务器。

---

## 一、插件组件参考

### 1. Skills（技能）

插件通过添加技能来扩展 CodeBuddy，创建 `/name` 快捷方式供用户或 AI 助手调用。

**位置**：插件根目录的 `skills/` 或 `commands/` 目录

**文件格式**：技能是包含 `SKILL.md` 的目录；命令是简单的 Markdown 文件

**目录结构**:

```
skills/
├── pdf-processor/
│   ├── SKILL.md
│   ├── reference.md （可选）
│   └── scripts/ （可选）
└── code-reviewer/
    └── SKILL.md
```

**集成行为**:

- 安装插件时自动发现技能和命令
- AI 助手可根据任务上下文自动调用
- 技能可以包含辅助文件和脚本

详见 [Skills](skills.md)。

### 2. Agents（代理）

插件可以提供专门的子代理用于特定任务，AI 助手可以在适当时自动调用。

**位置**：插件根目录的 `agents/` 目录

**格式**：描述代理能力的 Markdown 文件

**Frontmatter 配置**:

```markdown
---
name: agent-name
description: 代理的专长和调用时机
model: sonnet
effort: medium
maxTurns: 20
disallowedTools: Write, Edit
---

代理的详细系统提示词，描述其角色、专长和行为。
```

插件代理支持以下 frontmatter 字段：`name`、`description`、`model`、`effort`、`maxTurns`、`tools`、`disallowedTools`、`skills`、`memory`、`background` 和 `isolation`。`isolation` 的唯一有效值为 `"worktree"`。出于安全原因，插件代理不支持 `hooks`、`mcpServers` 和 `permissionMode` 字段。

**集成方式**:

- 代理出现在 `/agents` 界面中
- AI 助手可根据任务上下文自动调用代理
- 用户也可手动调用代理
- 插件代理与内置代理协同工作

详见 [Subagents](sub-agents.md)。

### 3. Hooks（钩子）

插件可以提供事件处理器，自动响应 CodeBuddy 事件。

**位置**：插件根目录的 `hooks/hooks.json`，或在 `plugin.json` 中内联配置

**格式**: JSON 配置，包含事件匹配器和操作

**配置示例**:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CODEBUDDY_PLUGIN_ROOT}/scripts/format-code.sh"
          }
        ]
      }
    ]
  }
}
```

**可用事件**:

插件钩子响应与用户定义钩子相同的生命周期事件：

| 事件 | 触发时机 |
|------|----------|
| `SessionStart` | 会话开始或恢复时 |
| `UserPromptSubmit` | 用户提交提示时，在 AI 处理之前 |
| `PreToolUse` | 工具调用执行前，可以阻断 |
| `PermissionRequest` | 权限对话框出现时 |
| `PermissionDenied` | 工具调用被自动模式分类器拒绝时。返回 `{retry: true}` 告知模型可重试 |
| `PostToolUse` | 工具调用成功后 |
| `PostToolUseFailure` | 工具调用失败后 |
| `Notification` | CodeBuddy 发送通知时 |
| `SubagentStart` | 子代理启动时 |
| `SubagentStop` | 子代理完成时 |
| `TaskCreated` | 通过 `TaskCreate` 创建任务时 |
| `TaskCompleted` | 任务被标记为已完成时 |
| `Stop` | AI 完成响应时 |
| `StopFailure` | 轮次因 API 错误结束时。输出和退出码被忽略 |
| `TeammateIdle` | 团队成员即将进入空闲时 |
| `InstructionsLoaded` | CODEBUDDY.md 或 `.codebuddy/rules/*.md` 文件加载到上下文时 |
| `ConfigChange` | 会话期间配置文件变更时 |
| `CwdChanged` | 工作目录变更时（例如 AI 执行 `cd` 命令） |
| `FileChanged` | 监视的文件在磁盘上变更时。`matcher` 字段指定要监视的文件名 |
| `WorktreeCreate` | 通过 `--worktree` 或 `isolation: "worktree"` 创建工作树时 |
| `WorktreeRemove` | 工作树被移除时（会话退出或子代理完成时） |
| `PreCompact` | 上下文压缩之前 |
| `PostCompact` | 上下文压缩完成后 |
| `Elicitation` | MCP 服务器在工具调用期间请求用户输入时 |
| `ElicitationResult` | 用户响应 MCP elicitation 后，响应发回服务器之前 |
| `SessionEnd` | 会话终止时 |

**钩子类型**:

- `command`：执行 shell 命令或脚本
- `http`：将事件 JSON 作为 POST 请求发送到 URL
- `prompt`：使用 LLM 评估提示词（使用 `$ARGUMENTS` 占位符获取上下文）
- `agent`：运行带工具的代理验证器，用于复杂验证任务

**与 Skill / Agent frontmatter hooks 的区别**:

插件可以通过两条不同的路径携带 hooks：

| 路径 | 作用域 | 安全闸门 |
| --- | --- | --- |
| `hooks/hooks.json`（本节描述） | 整个会话（插件启用时） | 不受 `allowUntrustedFrontmatterHooks` 约束，启用插件即生效 |
| `agents/*.md` 或 `skills/SKILL.md` 中的 `hooks` frontmatter | 仅在该 subagent / fork skill 生命周期内 | 受 `allowUntrustedFrontmatterHooks` 闸门约束，默认拒绝；用户需在 `settings.json` 显式开启 |

由于 frontmatter hooks 受安全闸门拦截，插件分发的 Skill / Agent 如果依赖 frontmatter hooks 才能正常工作，应在插件 README 中明确告知用户开启 `allowUntrustedFrontmatterHooks` 设置。详见 [Hook 参考指南 - Frontmatter Hooks](./hooks.md#agent--skill-frontmatter-hooks)。

### 4. MCP Servers（MCP 服务器）

插件可以捆绑 Model Context Protocol (MCP) 服务器，将 CodeBuddy 与外部工具和服务连接。

**位置**：插件根目录的 `.mcp.json`，或在 `plugin.json` 中内联配置

**格式**: 标准 MCP 服务器配置

**配置示例**:

```json
{
  "mcpServers": {
    "plugin-database": {
      "command": "${CODEBUDDY_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CODEBUDDY_PLUGIN_ROOT}/config.json"],
      "env": {
        "DB_PATH": "${CODEBUDDY_PLUGIN_ROOT}/data"
      }
    },
    "plugin-api-client": {
      "command": "npx",
      "args": ["@company/mcp-server", "--plugin-mode"],
      "cwd": "${CODEBUDDY_PLUGIN_ROOT}"
    }
  }
}
```

**集成行为**:

- 插件启用时自动启动 MCP 服务器
- 服务器作为标准 MCP 工具出现在工具包中
- 服务器功能与现有工具无缝集成
- 插件服务器可独立于用户 MCP 服务器进行配置

### 5. LSP Servers（LSP 服务器）

> **提示**: 需要使用 LSP 插件? 可从官方市场安装——在 `/plugin` Discover 标签中搜索 "lsp"。本节介绍如何为官方市场未涵盖的语言创建 LSP 插件。

插件可以提供 [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) (LSP) 服务器，为 AI 助手在代码库上工作时提供实时代码智能支持。

LSP 集成提供:

* **即时诊断**: AI 助手在每次编辑后立即看到错误和警告
* **代码导航**: 跳转到定义、查找引用和悬停信息
* **语言感知**: 代码符号的类型信息和文档

**位置**: 插件根目录的 `.lsp.json` 文件，或在 `plugin.json` 中内联配置

**格式**: JSON 配置，将语言服务器名称映射到其配置

**`.lsp.json` 文件格式**:

```json
{
  "go": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

**在 `plugin.json` 中内联配置**:

```json
{
  "name": "my-plugin",
  "lspServers": {
    "go": {
      "command": "gopls",
      "args": ["serve"],
      "extensionToLanguage": {
        ".go": "go"
      }
    }
  }
}
```

**必需字段**:

| 字段 | 描述 |
| :--- | :--- |
| `command` | 要执行的 LSP 二进制文件（必须在 PATH 中） |
| `extensionToLanguage` | 将文件扩展名映射到语言标识符 |

**可选字段**:

| 字段 | 描述 |
| :--- | :--- |
| `args` | LSP 服务器的命令行参数 |
| `transport` | 通信传输方式: `stdio`（默认）或 `socket` |
| `env` | 启动服务器时设置的环境变量 |
| `initializationOptions` | 在初始化期间传递给服务器的选项 |
| `settings` | 通过 `workspace/didChangeConfiguration` 传递的设置 |
| `workspaceFolder` | 服务器的工作区文件夹路径 |
| `startupTimeout` | 等待服务器启动的最大时间（毫秒） |
| `shutdownTimeout` | 等待优雅关闭的最大时间（毫秒） |
| `restartOnCrash` | 服务器崩溃时是否自动重启 |
| `maxRestarts` | 放弃前的最大重启尝试次数 |

> **警告**: **您必须单独安装语言服务器二进制文件。** LSP 插件配置 CodeBuddy 如何连接到语言服务器，但不包含服务器本身。如果在 `/plugin` Errors 标签中看到 `Executable not found in $PATH` 错误，请为您的语言安装所需的二进制文件。

**可用的 LSP 插件**:

| 插件 | 语言服务器 | 安装命令 |
| :--- | :--- | :--- |
| `pyright-lsp` | Pyright (Python) | `pip install pyright` 或 `npm install -g pyright` |
| `typescript-lsp` | TypeScript Language Server | `npm install -g typescript-language-server typescript` |
| `rust-lsp` | rust-analyzer | [参见 rust-analyzer 安装](https://rust-analyzer.github.io/manual.html#installation) |

先安装语言服务器，然后从市场安装插件。

---

## 二、插件安装作用域

安装插件时，选择一个**作用域**来决定插件的可用范围：

| 作用域 | 设置文件 | 使用场景 |
| :--- | :--- | :--- |
| `user` | `~/.codebuddy/settings.json` | 个人插件，所有项目可用（默认） |
| `project` | `.codebuddy/settings.json` | 团队插件，通过版本控制共享 |
| `local` | `.codebuddy/settings.local.json` | 项目特定插件，被 gitignore |
| `managed` | 托管设置 | 托管插件（只读，仅支持更新） |

插件使用与其他 CodeBuddy 配置相同的作用域系统。详见 [Settings](settings.md)。

---

## 三、插件清单架构（plugin.json）

`.codebuddy-plugin/plugin.json`（或 `.workbuddy-plugin/plugin.json`、`.claude-plugin/plugin.json`）文件定义插件的元数据和配置。本节记录所有支持的字段和选项。

清单是可选的。如果省略，CodeBuddy 会自动发现[默认位置](#文件位置参考)中的组件，并从目录名派生插件名称。当需要提供元数据或自定义组件路径时使用清单。

### 完整架构示例

```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "插件简短描述",
  "author": {
    "name": "作者名称",
    "email": "[email protected]",
    "url": "https://github.com/author"
  },
  "homepage": "https://docs.example.com/plugin",
  "repository": "https://github.com/author/plugin",
  "license": "MIT",
  "keywords": ["keyword1", "keyword2"],
  "commands": ["./custom/commands/special.md"],
  "agents": "./custom/agents/",
  "skills": "./custom/skills/",
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "outputStyles": "./styles/",
  "lspServers": "./.lsp.json",
  "defaultEnabled": false,
  "dependencies": [
    "audit-logger",
    { "name": "secrets-vault", "version": "~2.1.0" }
  ],
  "experimental": {
    "themes": "./themes/",
    "monitors": "./monitors/monitors.json"
  }
}
```

### 必需字段

如果包含清单，`name` 是唯一必需字段。

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `name` | string | 唯一标识符（kebab-case，无空格） | `"deployment-tools"` |

此名称用于组件命名空间。例如在 UI 中，插件 `plugin-dev` 的代理 `agent-creator` 将显示为 `plugin-dev:agent-creator`。

### 元数据字段

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `version` | string | 语义化版本。如果在 marketplace 条目中也设置了，`plugin.json` 优先。只需在一处设置。 | `"2.1.0"` |
| `description` | string | 插件用途简述 | `"部署自动化工具"` |
| `author` | object | 作者信息 | `{"name": "开发团队", "email": "[email protected]"}` |
| `homepage` | string | 文档 URL | `"https://docs.example.com"` |
| `repository` | string | 源代码 URL | `"https://github.com/user/plugin"` |
| `license` | string | 许可证标识符 | `"MIT"`, `"Apache-2.0"` |
| `keywords` | array | 发现标签 | `["deployment", "ci-cd"]` |
| `defaultEnabled` | boolean | 没有显式设置时是否启用，默认 `true` | `false` |
| `dependencies` | array | 当前插件依赖的其他插件，可声明 semver 范围和 marketplace | `[{"name":"helper","version":"^2.0.0"}]` |

### 组件路径字段

| 字段 | 类型 | 描述 | 示例 |
|------|------|------|------|
| `commands` | string \| array | 自定义命令文件/目录（替换默认 `commands/`） | `"./custom/cmd.md"` 或 `["./cmd1.md"]` |
| `agents` | string \| array | 自定义代理文件（替换默认 `agents/`） | `"./custom/agents/reviewer.md"` |
| `skills` | string \| array | 自定义技能目录（替换默认 `skills/`） | `"./custom/skills/"` |
| `hooks` | string \| array \| object | 钩子配置路径或内联配置 | `"./my-extra-hooks.json"` |
| `mcpServers` | string \| array \| object | MCP 配置路径或内联配置 | `"./my-extra-mcp-config.json"` |
| `outputStyles` | string \| array | 自定义输出样式文件/目录（替换默认 `output-styles/`） | `"./styles/"` |
| `experimental.themes` | string \| array | Claude experimental 字段；CodeBuddy 当前仅识别，不加载到运行时 | `"./themes/"` |
| `experimental.monitors` | string \| array | Claude experimental 字段；CodeBuddy 当前仅识别，不启动后台 monitor | `"./monitors/monitors.json"` |
| `lspServers` | string \| array \| object | LSP 配置路径或内联配置 | `"./.lsp.json"` |
| `userConfig` | object | 启用时提示用户配置的值。详见[用户配置](#用户配置) | 见下方 |
| `channels` | array | 消息注入的频道声明。详见[频道](#频道) | 见下方 |

### 默认启用

`defaultEnabled: false` 使首次安装的插件保持禁用。已有 `enabledPlugins` 设置优先于该默认值，因此升级或重装不会改变用户已经明确选择的状态。如果一个插件是已启用插件的依赖，则依赖关系优先，CodeBuddy 会显式启用它。

### 插件依赖

`dependencies` 可以同时写在 `plugin.json` 和 marketplace 插件条目中，两处声明会合并。字符串依赖解析到声明方所在 marketplace；对象支持以下字段：

| 字段 | 必需 | 描述 |
|------|------|------|
| `name` | 是 | 插件名 |
| `version` | 否 | Node semver 范围，例如 `~2.1.0`、`^2.0`、`>=1.4` |
| `marketplace` | 否 | 依赖所在 marketplace；省略时使用声明方 marketplace |

跨 marketplace 自动安装默认被阻止。需要在根插件所属 marketplace 的 `marketplace.json` 中显式授权：

```json
{
  "name": "acme-tools",
  "allowCrossMarketplaceDependenciesOn": ["acme-shared"],
  "plugins": []
}
```

只有根 marketplace 的 allowlist 生效，不传递信任。用户已经手动安装且版本满足要求的跨 marketplace 依赖可以直接复用。

版本约束通过 Git tag 解析。发布方使用 `{plugin-name}--v{version}` 命名 tag，例如 `secrets-vault--v2.1.3`。CodeBuddy 会合并所有已启用插件对同一依赖的范围，并选择满足交集的最高版本。tag semver 记录在 `resolvedVersion`；缓存目录使用声明版本加 12 位 commit SHA 后缀，避免被强制移动的 tag 复用旧内容。

安装插件会自动安装完整的传递依赖。启用插件只会传递启用已经安装的依赖；缺失依赖时启用失败。禁用或卸载仍被已启用插件依赖的插件会被阻止。

自动安装的依赖在 `installed_plugins.json` 中标记为 `auto: true`。普通卸载会保留这些依赖；使用 `plugin prune` 或 `plugin uninstall --prune` 才会清理不再被任何手动安装插件需要的 auto dependency。显式安装一个 auto dependency 会将其提升为手动安装，之后不会被 prune。

### 用户配置

`userConfig` 字段声明在插件启用时 CodeBuddy 提示用户输入的值。用此替代要求用户手动编辑 `settings.json`。

```json
{
  "userConfig": {
    "api_endpoint": {
      "description": "您团队的 API 端点",
      "sensitive": false
    },
    "api_token": {
      "description": "API 认证令牌",
      "sensitive": true
    }
  }
}
```

键必须是有效标识符。每个值可作为 `${user_config.KEY}` 在 MCP 和 LSP 服务器配置、钩子命令中替换，以及（仅非敏感值）在技能、命令和代理内容中替换。值也作为 `CLAUDE_PLUGIN_OPTION_<KEY>` 与 `CODEBUDDY_PLUGIN_OPTION_<KEY>` 环境变量导出到插件子进程。环境变量名中的非字母、数字或下划线字符会替换为 `_`，然后转为大写。

非敏感值存储在 `settings.json` 的 `pluginConfigs[<plugin-id>].options` 中。敏感值存储到系统密钥链（或在密钥链不可用时存储到 `~/.codebuddy/.credentials.json`）。密钥链存储与 OAuth 令牌共享，总限制约 2 KB，因此敏感值应保持较小。

### 频道

`channels` 字段允许插件声明一个或多个消息频道，用于向对话中注入内容。每个频道绑定到插件提供的一个 MCP 服务器。

```json
{
  "channels": [
    {
      "server": "telegram",
      "userConfig": {
        "bot_token": { "description": "Telegram bot token", "sensitive": true },
        "owner_id": { "description": "您的 Telegram 用户 ID", "sensitive": false }
      }
    }
  ]
}
```

`server` 字段是必需的，必须匹配插件 `mcpServers` 中的一个键。可选的按频道 `userConfig` 使用与顶层相同的 schema，允许在启用插件时提示输入 bot token 或 owner ID。

### 路径行为规则

对于 `commands`、`agents`、`skills` 和 `outputStyles`，自定义路径会**替换**默认目录。如果清单指定了 `commands`，则不会扫描默认的 `commands/` 目录。Hooks、MCP servers 和 LSP servers 对处理多个来源有不同的语义。

- 所有路径必须相对于插件根目录并以 `./` 开头
- 自定义路径中的组件使用相同的命名和命名空间规则
- 可以将多个路径指定为数组
- 要保留默认目录并添加更多路径，在数组中包含默认目录：`"commands": ["./commands/", "./extras/deploy.md"]`

**路径示例**:

```json
{
  "commands": [
    "./specialized/deploy.md",
    "./utilities/batch-process.md"
  ],
  "agents": [
    "./custom-agents/reviewer.md",
    "./custom-agents/tester.md"
  ]
}
```

### 环境变量

CodeBuddy 提供三个 Claude Code 兼容路径变量。它们会在技能、命令和代理内容、钩子配置、MCP 或 LSP 服务器配置中内联替换，也会作为环境变量导出到钩子、MCP 与 LSP 子进程。每个 `CLAUDE_*` 名称都有对应的 `CODEBUDDY_*` 别名。

**`${CODEBUDDY_PLUGIN_ROOT}`**：插件安装目录的绝对路径。用于引用插件捆绑的脚本、二进制文件和配置文件。此路径在插件更新时会变化，因此写入此处的文件不会在更新后保留。

**兼容性**：同时支持 `${CLAUDE_PLUGIN_ROOT}` 变量名以兼容 Claude Code 插件。

**`${CODEBUDDY_PLUGIN_DATA}`**：用于插件状态的持久化目录，在更新后保留。用于已安装的依赖项（如 `node_modules` 或 Python 虚拟环境）、生成的代码、缓存以及任何需要跨插件版本持久化的文件。首次被占位符引用或导出到插件子进程时自动创建该目录。

**兼容性**：同时支持 `${CLAUDE_PLUGIN_DATA}` 变量名。

**`${CODEBUDDY_PROJECT_DIR}`**：当前工作区根目录。用于插件脚本定位用户项目，不应写入插件自身的持久化状态。

**兼容性**：同时支持 `${CLAUDE_PROJECT_DIR}` 变量名。

插件子进程还会收到以下选项环境变量：

- `CLAUDE_PLUGIN_OPTION_<KEY>`：Claude Code 标准名称
- `CODEBUDDY_PLUGIN_OPTION_<KEY>`：CodeBuddy 别名
- `PLUGIN_OPT_<KEY>`：为已有 CodeBuddy 插件保留的兼容名称

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "${CODEBUDDY_PLUGIN_ROOT}/scripts/process.sh"
          }
        ]
      }
    ]
  }
}
```

#### 持久化数据目录

`${CODEBUDDY_PLUGIN_DATA}` 目录解析为 `~/.codebuddy/plugins/data/{id}/`，其中 `{id}` 是插件标识符，`a-z`、`A-Z`、`0-9`、`_` 和 `-` 之外的字符替换为 `-`。例如安装为 `formatter@my-marketplace` 的插件，目录为 `~/.codebuddy/plugins/data/formatter-my-marketplace/`。

常见用法是安装语言依赖一次并跨会话和插件更新重用。由于数据目录的生命周期超越任何单一插件版本，仅检查目录存在性无法检测更新何时更改了插件的依赖清单。推荐的模式是将捆绑的清单与数据目录中的副本进行比较，不同时重新安装。

以下 `SessionStart` 钩子在首次运行时安装 `node_modules`，并在插件更新包含更改的 `package.json` 时再次安装：

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "diff -q \"${CODEBUDDY_PLUGIN_ROOT}/package.json\" \"${CODEBUDDY_PLUGIN_DATA}/package.json\" >/dev/null 2>&1 || (cd \"${CODEBUDDY_PLUGIN_DATA}\" && cp \"${CODEBUDDY_PLUGIN_ROOT}/package.json\" . && npm install) || rm -f \"${CODEBUDDY_PLUGIN_DATA}/package.json\""
          }
        ]
      }
    ]
  }
}
```

`diff` 在存储副本缺失或与捆绑副本不同时以非零退出，涵盖首次运行和依赖变更更新。如果 `npm install` 失败，尾部的 `rm` 删除已复制的清单，以便下次会话重试。

捆绑在 `${CODEBUDDY_PLUGIN_ROOT}` 中的脚本可以针对持久化的 `node_modules` 运行：

```json
{
  "mcpServers": {
    "routines": {
      "command": "node",
      "args": ["${CODEBUDDY_PLUGIN_ROOT}/server.js"],
      "env": {
        "NODE_PATH": "${CODEBUDDY_PLUGIN_DATA}/node_modules"
      }
    }
  }
}
```

卸载插件的最后一个安装作用域时，数据目录会自动删除；若同一插件仍安装在其他作用域，则保留。CLI 默认删除，传递 `--keep-data` 可保留。`plugin prune` 会删除孤立自动依赖的数据目录。

---

## 四、插件缓存和文件解析

插件有两种指定方式：

- 通过 `codebuddy --plugin-dir`，仅在会话期间有效
- 通过市场安装，适用于未来会话

出于安全和验证目的，CodeBuddy 将**市场**插件复制到用户的本地**版本化插件缓存**（`~/.codebuddy/plugins/cache/<marketplace>/<plugin>/<version>`），而不是原地使用。市场源码仍保存在 `~/.codebuddy/plugins/marketplaces/<marketplace>`，理解此行为对于开发引用外部文件的插件很重要。

### 路径遍历限制

已安装的插件无法引用其目录之外的文件。遍历到插件根目录之外的路径（如 `../shared-utils`）在安装后不会工作，因为那些外部文件不会被复制到缓存中。

### 使用外部依赖

如果插件需要访问同一 marketplace 中的共享文件，可以在插件目录中创建符号链接。缓存复制时按目标位置处理：

- 指向插件自身目录内：保留为相对符号链接。
- 指向同一 marketplace 的其他位置：解引用并复制目标内容。
- 指向 marketplace 外部：跳过该符号链接。

```bash
# 在插件目录内
ln -s ../../shared-plugin/skills/foo ./skills/foo
```

这在允许 marketplace 内共享文件的同时，避免插件把任意宿主机文件带入缓存。

---

## 五、插件目录结构

### 标准插件布局

完整的插件遵循以下结构：

```
enterprise-plugin/
├── .codebuddy-plugin/        # 元数据目录（可选）
│   └── plugin.json             # 插件清单
├── commands/                 # 默认命令位置
│   ├── status.md
│   └── logs.md
├── agents/                   # 默认代理位置
│   ├── security-reviewer.md
│   ├── performance-tester.md
│   └── compliance-checker.md
├── skills/                   # 代理技能
│   ├── code-reviewer/
│   │   └── SKILL.md
│   └── pdf-processor/
│       ├── SKILL.md
│       └── scripts/
├── output-styles/            # 输出样式定义
│   └── terse.md
├── themes/                   # Claude 标准主题定义；当前仅识别，不加载
│   └── dracula.json
├── monitors/                 # Claude 标准后台 monitor；当前仅识别，不启动
│   └── monitors.json
├── hooks/                    # 钩子配置
│   ├── hooks.json            # 主钩子配置
│   └── security-hooks.json   # 额外钩子
├── bin/                      # 插件可执行文件，添加到 PATH
│   └── my-tool               # 可在 Bash 工具中作为裸命令调用
├── settings.json             # 插件默认设置
├── .mcp.json                 # MCP 服务器定义
├── .lsp.json                 # LSP 服务器配置
├── scripts/                  # 钩子和实用脚本
│   ├── security-scan.sh
│   ├── format-code.py
│   └── deploy.js
├── LICENSE                   # 许可证文件
└── CHANGELOG.md              # 版本历史
```

> **重要**: `.codebuddy-plugin/` 目录包含 `plugin.json` 文件。所有其他目录（`commands/`、`agents/`、`skills/`、`output-styles/`、`themes/`、`monitors/`、`hooks/`）必须位于插件根目录，而不是 `.codebuddy-plugin/` 内部。同时兼容 `.workbuddy-plugin/` 与 `.claude-plugin/` 目录。

### 文件位置参考

| 组件 | 默认位置 | 用途 |
|------|----------|------|
| **Manifest** | `.codebuddy-plugin/plugin.json` | 插件元数据和配置（可选） |
| **Commands** | `commands/` | 技能 Markdown 文件（旧版；新技能使用 `skills/`） |
| **Agents** | `agents/` | 子代理 Markdown 文件 |
| **Skills** | `skills/` | 带有 `<name>/SKILL.md` 结构的技能 |
| **Output styles** | `output-styles/` | 输出样式定义 |
| **Themes** | `themes/` | Claude 标准字段；CodeBuddy 当前仅识别，不加载到运行时 |
| **Monitors** | `monitors/monitors.json` | Claude 标准字段；CodeBuddy 当前仅识别，不启动后台 monitor |
| **Hooks** | `hooks/hooks.json` | 钩子配置 |
| **MCP servers** | `.mcp.json` | MCP 服务器定义 |
| **LSP servers** | `.lsp.json` | 语言服务器配置 |
| **Executables** | `bin/` | 添加到 Bash 工具 PATH 的可执行文件。启用插件时此目录中的文件可在任何 Bash 工具调用中作为裸命令调用 |
| **Settings** | `settings.json` | 插件默认配置。当前运行时应用 `agent`；`subagentStatusLine` 仅识别并保留 |

---

## 六、CLI 命令参考

CodeBuddy 提供 CLI 命令用于非交互式插件管理，适用于脚本和自动化。

### plugin install

从可用市场安装插件。

```bash
codebuddy plugin install <plugin> [options]
```

**参数**:

- `<plugin>`: 插件名称或 `plugin-name@marketplace-name`（指定特定市场）

**选项**:

| 选项 | 描述 | 默认 |
|------|------|------|
| `-s, --scope <scope>` | 安装作用域：`user`、`project` 或 `local` | `user` |
| `-h, --help` | 显示命令帮助 | |

作用域决定已安装插件添加到哪个设置文件。例如 `--scope project` 写入 `.codebuddy/settings.json` 中的 `enabledPlugins`，使插件对所有克隆该项目仓库的人可用。

**示例**:

```bash
# 安装到用户作用域（默认）
codebuddy plugin install formatter@my-marketplace

# 安装到项目作用域（与团队共享）
codebuddy plugin install formatter@my-marketplace --scope project

# 安装到本地作用域（被 gitignore）
codebuddy plugin install formatter@my-marketplace --scope local
```

### plugin uninstall

移除已安装的插件。

```bash
codebuddy plugin uninstall <plugin> [options]
```

**参数**:

- `<plugin>`: 插件名称或 `plugin-name@marketplace-name`

**选项**:

| 选项 | 描述 | 默认 |
|------|------|------|
| `-s, --scope <scope>` | 从指定作用域卸载：`user`、`project` 或 `local` | `user` |
| `--keep-data` | 保留插件的[持久化数据目录](#持久化数据目录) | |
| `--prune` | 同时清理该作用域中不再被需要的 auto dependency | |
| `-y, --yes` | 跳过 `--prune` 确认；stdin 或 stdout 非 TTY 时必须指定 | |
| `-h, --help` | 显示命令帮助 | |

**别名**: `remove`, `rm`

默认情况下，从最后一个剩余作用域卸载时也会删除插件的 `${CODEBUDDY_PLUGIN_DATA}` 目录。使用 `--keep-data` 可保留它，例如在测试新版本后重新安装时。

### plugin prune

清理指定作用域中不再被任何手动安装插件依赖的 auto dependency。

```bash
codebuddy plugin prune [options]
```

| 选项 | 描述 | 默认 |
|------|------|------|
| `-s, --scope <scope>` | 清理作用域：`user`、`project` 或 `local` | `user` |
| `--dry-run` | 只列出将被清理的插件，不修改设置和 registry | |
| `-y, --yes` | 跳过确认；stdin 或 stdout 非 TTY 且未指定时只列出候选项 | |
| `-h, --help` | 显示命令帮助 | |

### plugin enable

启用已禁用的插件。

```bash
codebuddy plugin enable <plugin> [options]
```

**参数**:

- `<plugin>`: 插件名称或 `plugin-name@marketplace-name`

**选项**:

| 选项 | 描述 | 默认 |
|------|------|------|
| `-s, --scope <scope>` | 启用作用域：`user`、`project` 或 `local` | 自动检测当前安装作用域 |
| `-h, --help` | 显示命令帮助 | |

### plugin disable

禁用插件但不卸载。

```bash
codebuddy plugin disable <plugin> [options]
```

**参数**:

- `<plugin>`: 插件名称或 `plugin-name@marketplace-name`

**选项**:

| 选项 | 描述 | 默认 |
|------|------|------|
| `-s, --scope <scope>` | 禁用作用域：`user`、`project` 或 `local` | 自动检测当前安装作用域 |
| `-h, --help` | 显示命令帮助 | |

### plugin update

更新插件到最新版本。

```bash
codebuddy plugin update <plugin> [options]
```

**参数**:

- `<plugin>`: 插件名称或 `plugin-name@marketplace-name`

**选项**:

| 选项 | 描述 | 默认 |
|------|------|------|
| `-s, --scope <scope>` | 更新作用域：`user`、`project`、`local` 或 `managed` | `user` |
| `-h, --help` | 显示命令帮助 | |

### plugin list

列出已安装插件及其版本、marketplace、启用状态和依赖错误。`--json` 可用于脚本读取 `dependencyErrors`。

```bash
codebuddy plugin list --json
```

### 市场管理

```bash
# 添加市场
codebuddy plugin marketplace add <source> [--name <name>]

# 列出市场
codebuddy plugin marketplace list

# 更新市场
codebuddy plugin marketplace update <name>

# 删除市场
codebuddy plugin marketplace remove <name>
```

**市场源格式**:

```bash
# 本地目录
codebuddy plugin marketplace add /path/to/marketplace

# GitHub 简写
codebuddy plugin marketplace add owner/repo

# Git URL
codebuddy plugin marketplace add https://github.com/owner/repo.git

# HTTP URL (marketplace.json)
codebuddy plugin marketplace add https://example.com/marketplace.json
```

---

## 七、调试和开发工具

### 调试命令

使用 `codebuddy --debug` 查看插件加载详情：

**显示内容**:

- 正在加载哪些插件
- 插件清单中的任何错误
- 命令、代理和钩子注册
- MCP 服务器初始化

### 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| 插件未加载 | 无效的 `plugin.json` | 运行 `codebuddy plugin validate` 或 `/plugin validate` 检查 `plugin.json`、skill/agent/command frontmatter 和 `hooks/hooks.json` 的语法和 schema 错误 |
| 命令未出现 | 错误的目录结构 | 确保 `commands/` 在插件根目录，而不是 `.codebuddy-plugin/` 内部 |
| 钩子未触发 | 脚本不可执行 | 运行 `chmod +x script.sh` |
| MCP 服务器失败 | 缺少 `${CODEBUDDY_PLUGIN_ROOT}` | 所有插件路径使用此变量 |
| 路径错误 | 使用了绝对路径 | 所有路径必须是相对路径并以 `./` 开头 |
| LSP `Executable not found in $PATH` | 语言服务器未安装 | 安装二进制文件（例如：`npm install -g typescript-language-server typescript`） |

### 常见错误信息

**清单验证错误**:

- `Invalid JSON syntax: Unexpected token } in JSON at position 142`: 检查缺少的逗号、多余的逗号或未引用的字符串
- `Plugin has an invalid manifest file at .codebuddy-plugin/plugin.json. Validation errors: name: Required`: 缺少必需字段
- `Plugin has a corrupt manifest file at .codebuddy-plugin/plugin.json. JSON parse error: ...`: JSON 语法错误

**插件加载错误**:

- `Warning: No commands found in plugin my-plugin custom directory: ./cmds. Expected .md files or SKILL.md in subdirectories.`: 命令路径存在但不包含有效的命令文件
- `Plugin directory not found at path: ./plugins/my-plugin. Check that the marketplace entry has the correct path.`: marketplace.json 中的 `source` 路径指向不存在的目录
- `Plugin my-plugin has conflicting manifests: both plugin.json and marketplace entry specify components.`: 删除重复的组件定义或在 marketplace 条目中移除 `strict: false`

### 钩子排查

**钩子脚本未执行**:

1. 检查脚本是否可执行：`chmod +x ./scripts/your-script.sh`
2. 验证 shebang 行：第一行应为 `#!/bin/bash` 或 `#!/usr/bin/env bash`
3. 检查路径是否使用 `${CODEBUDDY_PLUGIN_ROOT}`：`"command": "${CODEBUDDY_PLUGIN_ROOT}/scripts/your-script.sh"`
4. 手动测试脚本：`./scripts/your-script.sh`

**钩子未在预期事件上触发**:

1. 验证事件名称正确（区分大小写）：`PostToolUse`，而不是 `postToolUse`
2. 检查 matcher 模式是否匹配目标工具：`"matcher": "Write|Edit"` 用于文件操作
3. 确认钩子类型有效：`command`、`http`、`prompt` 或 `agent`

### MCP 服务器排查

**服务器未启动**:

1. 检查命令是否存在且可执行
2. 验证所有路径使用 `${CODEBUDDY_PLUGIN_ROOT}` 变量
3. 检查 MCP 服务器日志：`codebuddy --debug` 显示初始化错误
4. 在 CodeBuddy 之外手动测试服务器

**服务器工具未出现**:

1. 确保服务器在 `.mcp.json` 或 `plugin.json` 中正确配置
2. 验证服务器正确实现了 MCP 协议
3. 检查调试输出中的连接超时

### 目录结构错误

**症状**: 插件加载但组件（命令、代理、钩子）缺失。

**正确结构**: 组件必须在插件根目录，而不是 `.codebuddy-plugin/` 内部。只有 `plugin.json` 属于 `.codebuddy-plugin/`。

```
my-plugin/
├── .codebuddy-plugin/
│   └── plugin.json      <- 只有清单在这里
├── commands/             <- 在根级别
├── agents/               <- 在根级别
└── hooks/                <- 在根级别
```

如果组件在 `.codebuddy-plugin/` 内部，将它们移到插件根目录。

**调试检查清单**:

1. 运行 `codebuddy --debug` 并查找 "loading plugin" 消息
2. 检查每个组件目录是否在调试输出中列出
3. 验证文件权限允许读取插件文件

---

## 八、版本管理参考

### 语义化版本控制

遵循语义化版本控制进行插件发布：

```json
{
  "name": "my-plugin",
  "version": "2.1.0"
}
```

**版本格式**: `MAJOR.MINOR.PATCH`

- **MAJOR**: 不兼容的 API 更改
- **MINOR**: 向后兼容的功能添加
- **PATCH**: 向后兼容的错误修复

**最佳实践**:

- 第一个稳定版本从 `1.0.0` 开始
- 分发更改前更新 `plugin.json` 中的版本
- 在 `CHANGELOG.md` 文件中记录变更
- 使用预发布版本（如 `2.0.0-beta.1`）进行测试

> **注意**: CodeBuddy 使用版本来判断是否需要更新插件。如果更改了插件代码但未更新 `plugin.json` 中的版本，由于缓存机制，现有用户不会看到变更。
>
> 如果插件在[市场](plugin-marketplaces.md)目录中，可以通过 `marketplace.json` 管理版本，并从 `plugin.json` 中省略 `version` 字段。

### 版本化缓存

CodeBuddy 按以下优先级计算缓存键：

1. `plugin.json` 的 `version`
2. marketplace 插件条目的 `version`
3. Git 来源的 commit SHA；`git-subdir` 还包含子目录路径哈希
4. 无法确定版本时使用 `unknown`

没有显式版本的 Git 插件以 12 位 commit SHA 为缓存目录名。通过版本约束解析 tag 时，缓存目录额外包含 12 位 commit SHA 后缀；约束校验使用单独记录的 `resolvedVersion`，不依赖可能过期的 manifest 版本。

旧版本已经记录为 `unknown` 的 Git marketplace 插件会在启动时自动迁移：CodeBuddy 从当前 marketplace checkout 解析 commit SHA，将源码物化到对应的 SHA 缓存目录，再原子更新 `installed_plugins.json`。旧的 `unknown` 目录只会被标记为 orphan；至少保留 14 天，并且仍有活动会话的 `.in_use` 标记时不会删除。非 Git 来源且没有显式版本的插件继续使用 `unknown`。

---

## 九、与 Claude Code 的兼容性

CodeBuddy 插件系统在设计上兼容 Claude Code 插件规范，但存在以下差异：

### 命名差异

| 概念 | Claude Code | CodeBuddy |
|------|-------------|-----------|
| 元数据目录 | `.claude-plugin/` | `.codebuddy-plugin/`（优先）、`.workbuddy-plugin/` 或 `.claude-plugin/`（兼容） |
| 环境变量 | `${CLAUDE_PLUGIN_ROOT}` | `${CODEBUDDY_PLUGIN_ROOT}`（优先）或 `${CLAUDE_PLUGIN_ROOT}`（兼容） |
| 数据目录变量 | `${CLAUDE_PLUGIN_DATA}` | `${CODEBUDDY_PLUGIN_DATA}`（优先）或 `${CLAUDE_PLUGIN_DATA}`（兼容） |

### 迁移指南

从 Claude Code 迁移到 CodeBuddy：

1. 可选择将 `.claude-plugin/` 重命名为 `.codebuddy-plugin/`
2. 可选择将脚本中的 `${CLAUDE_PLUGIN_ROOT}` 替换为 `${CODEBUDDY_PLUGIN_ROOT}`
3. 可选择将 `${CLAUDE_PLUGIN_DATA}` 替换为 `${CODEBUDDY_PLUGIN_DATA}`

**注意**：保持原有命名也完全兼容，CodeBuddy 会自动识别。

---

## 相关资源

- [插件](plugins.md) - 教程和实用指南
- [插件市场](plugin-marketplaces.md) - 创建和管理市场
- [Skills](skills.md) - 技能开发详情
- [Subagents](sub-agents.md) - 代理配置和能力
- [Hooks](hooks.md) - 事件处理和自动化
- [MCP](mcp.md) - 外部工具集成
- [Settings](settings.md) - 插件配置选项
