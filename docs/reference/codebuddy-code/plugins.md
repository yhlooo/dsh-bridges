> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/plugins.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 创建插件

插件让你可以通过自定义技能、代理、钩子和 MCP 服务器来扩展 CodeBuddy Code 的功能。本指南涵盖如何创建你自己的插件。

要安装已有的插件，请参阅[插件市场](plugin-marketplaces.md)。完整的技术规范请参考[插件参考文档](plugins-reference.md)。

## 何时使用插件 vs 独立配置

CodeBuddy Code 支持两种添加自定义技能、代理和钩子的方式：

| 方式 | 技能名称 | 适用场景 |
|------|----------|----------|
| **独立配置**（`.codebuddy/` 目录） | `/hello` | 个人工作流、项目特定定制、快速实验 |
| **插件**（含 `.codebuddy-plugin/plugin.json` 的目录） | `/plugin-name:hello` | 团队共享、社区分发、版本化发布、跨项目复用 |

**使用独立配置的场景**：

- 为单个项目定制 CodeBuddy Code
- 配置是个人的，不需要共享
- 在打包为插件之前实验技能或钩子
- 需要简短的技能名称，如 `/hello` 或 `/deploy`

**使用插件的场景**：

- 需要与团队或社区共享功能
- 需要在多个项目中使用相同的技能/代理
- 需要版本控制和便捷的更新机制
- 通过市场分发
- 可以接受命名空间化的技能名称如 `/my-plugin:hello`（命名空间防止插件间冲突）

> **提示**：先在 `.codebuddy/` 中使用独立配置快速迭代，准备共享时再[转换为插件](#将现有配置转换为插件)。

## 快速开始

本快速开始将引导你创建一个包含自定义技能的插件。你将创建一个清单文件（定义插件的配置文件）、添加一个技能，并使用 `--plugin-dir` 参数在本地测试。

### 前提条件

- 已[安装并认证](quickstart.md) CodeBuddy Code

> 如果看不到 `/plugin` 命令，请将 CodeBuddy Code 更新到最新版本。参见[故障排除](troubleshooting.md)获取升级说明。

### 创建你的第一个插件

#### 第 1 步：创建插件目录

每个插件都有自己的目录，包含清单文件和你的技能、代理或钩子。现在创建一个：

```bash
mkdir my-first-plugin
```

#### 第 2 步：创建插件清单

清单文件位于 `.codebuddy-plugin/plugin.json`，定义插件的身份信息：名称、描述和版本。CodeBuddy Code 使用这些元数据在插件管理器中展示你的插件。

在插件目录内创建 `.codebuddy-plugin` 目录：

```bash
mkdir my-first-plugin/.codebuddy-plugin
```

然后创建 `my-first-plugin/.codebuddy-plugin/plugin.json`，内容如下：

```json
{
  "name": "my-first-plugin",
  "description": "A greeting plugin to learn the basics",
  "version": "1.0.0",
  "author": {
    "name": "Your Name"
  }
}
```

| 字段 | 用途 |
|------|------|
| `name` | 唯一标识符和技能命名空间。技能以此为前缀（如 `/my-first-plugin:hello`） |
| `description` | 在插件管理器中浏览或安装插件时显示 |
| `version` | 使用[语义化版本](plugins-reference.md#版本管理)跟踪发布 |
| `author` | 可选。用于归属标注 |

更多字段如 `homepage`、`repository` 和 `license`，参见[完整清单 Schema](plugins-reference.md)。

#### 第 3 步：添加技能

技能放在 `skills/` 目录中。每个技能是一个包含 `SKILL.md` 文件的文件夹。文件夹名称成为技能名称，并以插件命名空间为前缀（在名为 `my-first-plugin` 的插件中，`hello/` 创建 `/my-first-plugin:hello`）。

在插件目录中创建技能目录：

```bash
mkdir -p my-first-plugin/skills/hello
```

然后创建 `my-first-plugin/skills/hello/SKILL.md`，内容如下：

```markdown
---
description: Greet the user with a friendly message
disable-model-invocation: true
---

Greet the user warmly and ask how you can help them today.
```

#### 第 4 步：测试你的插件

使用 `--plugin-dir` 参数运行 CodeBuddy Code 以加载你的插件：

```bash
codebuddy --plugin-dir ./my-first-plugin
```

启动后，尝试你的新技能：

```
/my-first-plugin:hello
```

你会看到 CodeBuddy 回复一个问候语。运行 `/help` 可以看到你的技能列在插件命名空间下。

> **为什么要命名空间？** 插件技能始终带有命名空间（如 `/my-first-plugin:hello`），以防止多个插件中同名技能产生冲突。要更改命名空间前缀，请更新 `plugin.json` 中的 `name` 字段。

#### 第 5 步：添加技能参数

通过接受用户输入使技能更加动态。`$ARGUMENTS` 占位符捕获用户在技能名称后提供的任何文本。

更新你的 `SKILL.md` 文件：

```markdown
---
description: Greet the user with a personalized message
---

# Hello Skill

Greet the user named "$ARGUMENTS" warmly and ask how you can help them today. Make the greeting personal and encouraging.
```

运行 `/reload-plugins` 以获取更改，然后用你的名字尝试技能：

```
/my-first-plugin:hello Alex
```

CodeBuddy 会按名字问候你。更多关于向技能传递参数的信息，参见 [Skills 文档](skills.md)。

---

你已成功创建并测试了一个包含以下关键组件的插件：

- **插件清单**（`.codebuddy-plugin/plugin.json`）：描述插件的元数据
- **技能目录**（`skills/`）：包含你的自定义技能
- **技能参数**（`$ARGUMENTS`）：捕获用户输入实现动态行为

> `--plugin-dir` 参数适用于开发和测试。当你准备与他人共享插件时，参见[插件市场](plugin-marketplaces.md)。

## 插件结构概述

你已经创建了一个包含技能的插件，但插件还可以包含更多内容：自定义代理、钩子、MCP 服务器和 LSP 服务器。

> **常见错误**：不要将 `commands/`、`agents/`、`skills/` 或 `hooks/` 放在 `.codebuddy-plugin/` 目录内。只有 `plugin.json` 放在 `.codebuddy-plugin/` 内。所有其他目录必须在插件根目录层级。

| 目录 | 位置 | 用途 |
|------|------|------|
| `.codebuddy-plugin/` | 插件根目录 | 包含 `plugin.json` 清单 |
| `commands/` | 插件根目录 | Markdown 格式的斜杠命令 |
| `agents/` | 插件根目录 | 自定义代理定义 |
| `skills/` | 插件根目录 | 包含 `SKILL.md` 文件的代理技能 |
| `hooks/` | 插件根目录 | `hooks.json` 事件处理器 |
| `.mcp.json` | 插件根目录 | MCP 服务器配置 |
| `.lsp.json` | 插件根目录 | LSP 服务器配置（代码智能） |
| `bin/` | 插件根目录 | 插件启用时添加到 Bash 工具 `PATH` 的可执行文件 |
| `settings.json` | 插件根目录 | 插件启用时应用的默认[设置](settings.md) |

**示例完整结构**：

```
my-plugin/
├── .codebuddy-plugin/        # 元数据目录（必需）
│   └── plugin.json           # 插件清单文件
├── commands/                  # 命令目录（可选）
│   └── example.md
├── agents/                    # 代理目录（可选）
│   └── example.md
├── skills/                    # 技能目录（可选）
│   └── code-review/
│       └── SKILL.md
├── hooks/                     # Hooks 目录（可选）
│   └── hooks.json
├── bin/                       # 可执行文件目录（可选）
│   └── my-tool
├── .mcp.json                  # MCP 配置文件（可选）
├── .lsp.json                  # LSP 配置文件（可选）
└── settings.json              # 默认设置文件（可选）
```

## 开发更复杂的插件

掌握了基础插件后，你可以创建更复杂的扩展。

### 添加技能

插件可以包含[代理技能](skills.md)来扩展 CodeBuddy 的能力。技能是模型调用的：CodeBuddy 会根据任务上下文自动使用它们。

在插件根目录添加 `skills/` 目录，其中包含带有 `SKILL.md` 文件的技能文件夹：

```
my-plugin/
├── .codebuddy-plugin/
│   └── plugin.json
└── skills/
    └── code-review/
        └── SKILL.md
```

每个 `SKILL.md` 需要包含 `name` 和 `description` 字段的 frontmatter，后跟指令：

```markdown
---
name: code-review
description: Reviews code for best practices and potential issues. Use when reviewing code, checking PRs, or analyzing code quality.
---

When reviewing code, check for:
1. Code organization and structure
2. Error handling
3. Security concerns
4. Test coverage
```

安装插件后，运行 `/reload-plugins` 加载技能。完整的技能编写指南，包括渐进式披露和工具限制，参见[代理技能](skills.md)。

### 添加命令

插件可以提供自定义斜杠命令，用户可以手动触发。命令定义为 Markdown 文件。

**示例**：`commands/example.md`

```markdown
---
description: "示例命令描述"
argument-hint: "[参数]"
---

这是一个示例命令。当用户输入 /my-plugin:example 时会执行此命令。

参数：$ARGUMENTS
```

命令会以 `/plugin-name:command-name` 的格式注册。

详细说明请参考 [Slash Commands 文档](slash-commands.md)。

### 添加 Hooks

Hooks 允许在特定事件发生时自动执行操作。命令通过标准输入接收 hook 输入的 JSON 数据，可以使用 `jq` 提取字段。

**示例**：`hooks/hooks.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npm run lint:fix"
          }
        ]
      }
    ]
  }
}
```

插件 `hooks/hooks.json` 中的 hooks 在插件启用时自动与用户和项目级 hooks **合并**（不会覆盖），并且**不**受 `allowUntrustedFrontmatterHooks` 闸门约束（该闸门只针对 Agent / Skill frontmatter 中声明的 hooks）。

除了 `command`，hook 也支持 `type: prompt`（小模型语义判定）、`type: agent`（subagent 验证）、`type: http`（POST/PUT/PATCH 到指定 URL）三种执行方式，详见 [Hooks 文档](hooks.md)。如果你的插件还需要随 Skill 一起携带 frontmatter hooks，请参考 [Skills 文档 - 在 Skill 中配置 Hooks](skills.md#在-skill-中配置-hooks)（注意此路径受安全闸门约束）。

详细说明请参考 [Hooks 文档](hooks.md)。

### 添加 LSP 服务器

> 对于常见语言如 TypeScript、Python 和 Rust，建议直接从官方插件市场安装预构建的 LSP 插件。仅当需要支持尚未覆盖的语言时才创建自定义 LSP 插件。

LSP（Language Server Protocol）插件为 CodeBuddy 提供实时代码智能。如果需要支持没有官方 LSP 插件的语言，可以在插件中添加 `.lsp.json` 文件：

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

安装插件的用户必须在其机器上预装语言服务器二进制文件。

#### 多语言配置示例

```json
{
  "python": {
    "command": "pylsp",
    "args": [],
    "extensionToLanguage": {
      ".py": "python"
    }
  },
  "rust": {
    "command": "rust-analyzer",
    "args": [],
    "extensionToLanguage": {
      ".rs": "rust"
    }
  }
}
```

#### 安装要求

用户在安装包含 LSP 配置的插件时，必须在其系统上预先安装相应的语言服务器二进制文件：

- **Go**: `go install golang.org/x/tools/gopls@latest`
- **Python**: `pip install python-lsp-server`
- **Rust**: `rustup component add rust-analyzer`

### 携带默认设置

插件可以在根目录包含 `settings.json` 文件，在插件启用时应用默认配置。目前仅支持 `agent` 键。

设置 `agent` 会将插件的一个[自定义代理](sub-agents.md)激活为主线程，应用其系统提示词、工具限制和模型。这让插件在启用时可以改变 CodeBuddy Code 的默认行为。

```json
{
  "agent": "security-reviewer"
}
```

此示例激活插件 `agents/` 目录中定义的 `security-reviewer` 代理。`settings.json` 中的设置优先于 `plugin.json` 中声明的 `settings`。未知键会被静默忽略。

### 本地测试插件

使用 `--plugin-dir` 参数在开发过程中测试插件。这会直接加载你的插件，无需安装。

```bash
codebuddy --plugin-dir ./my-plugin
```

当 `--plugin-dir` 插件与已安装的市场插件同名时，本地副本在该会话中优先使用。这让你可以测试已安装插件的改动而无需卸载它。通过托管设置强制启用的市场插件是唯一的例外，不能被覆盖。

在修改插件时，运行 `/reload-plugins` 无需重启即可获取更新。这会重新加载插件、技能、代理、钩子、插件 MCP 服务器和插件 LSP 服务器。测试你的插件组件：

- 使用 `/plugin-name:skill-name` 尝试技能
- 在 `/agents` 中检查代理是否出现
- 验证钩子是否按预期工作

> 可以通过多次指定参数同时加载多个插件：
>
> ```bash
> codebuddy --plugin-dir ./plugin-one --plugin-dir ./plugin-two
> ```

### 调试插件问题

如果插件没有按预期工作：

1. **检查结构**：确保目录在插件根目录，而不是在 `.codebuddy-plugin/` 内
2. **单独测试组件**：分别检查每个命令、代理和钩子
3. **使用调试模式**：用 `--debug` 参数启动 CodeBuddy 查看详细日志

## plugin.json 清单格式

插件清单文件定义插件的元数据和包含的组件，位于 `.codebuddy-plugin/plugin.json`：

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "插件描述",
  "author": {
    "name": "作者名称",
    "email": "author@example.com"
  },
  "homepage": "https://github.com/username/my-plugin",
  "repository": "https://github.com/username/my-plugin",
  "keywords": ["example"],
  "category": "开发工具",
  "commands": [],
  "agents": [],
  "skills": [],
  "hooks": "./hooks/hooks.json"
}
```

完整的清单 Schema 说明参见[插件参考文档](plugins-reference.md)。

## 共享你的插件

当插件准备好共享时：

1. **添加文档**：包含一个 `README.md`，说明安装和使用方式
2. **版本管理**：在 `plugin.json` 中使用[语义化版本](plugins-reference.md#版本管理)
3. **创建或使用市场**：通过[插件市场](plugin-marketplaces.md)分发
4. **与他人测试**：在更广泛分发之前，让团队成员测试插件

插件上线到市场后，其他人可以按照[插件市场](plugin-marketplaces.md)中的说明安装使用。

## 将现有配置转换为插件

如果你已经在 `.codebuddy/` 目录中有技能或钩子，可以将它们转换为插件以便于共享和分发。

### 迁移步骤

#### 第 1 步：创建插件结构

创建新的插件目录：

```bash
mkdir -p my-plugin/.codebuddy-plugin
```

创建清单文件 `my-plugin/.codebuddy-plugin/plugin.json`：

```json
{
  "name": "my-plugin",
  "description": "Migrated from standalone configuration",
  "version": "1.0.0"
}
```

#### 第 2 步：复制现有文件

将现有配置复制到插件目录：

```bash
# 复制命令
cp -r .codebuddy/commands my-plugin/

# 复制代理（如有）
cp -r .codebuddy/agents my-plugin/

# 复制技能（如有）
cp -r .codebuddy/skills my-plugin/
```

#### 第 3 步：迁移 Hooks

如果你的设置中有 hooks，创建 hooks 目录：

```bash
mkdir my-plugin/hooks
```

创建 `my-plugin/hooks/hooks.json`，将 hooks 配置放入其中。从 `.codebuddy/settings.json` 或 `settings.local.json` 中复制 `hooks` 对象，格式是一样的。命令通过标准输入接收 hook 输入的 JSON 数据，可以使用 `jq` 提取字段：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npm run lint:fix"
          }
        ]
      }
    ]
  }
}
```

#### 第 4 步：测试迁移后的插件

加载插件验证一切正常：

```bash
codebuddy --plugin-dir ./my-plugin
```

测试每个组件：运行你的命令、在 `/agents` 中检查代理、验证钩子正确触发。

### 迁移前后对比

| 独立配置（`.codebuddy/`） | 插件 |
|---------------------------|------|
| 仅在一个项目中可用 | 可通过市场共享 |
| 文件在 `.codebuddy/commands/` | 文件在 `plugin-name/commands/` |
| Hooks 在 `settings.json` 中 | Hooks 在 `hooks/hooks.json` 中 |
| 需要手动复制来共享 | 使用 `/plugin install` 安装 |

> 迁移后，可以删除 `.codebuddy/` 中的原始文件以避免重复。加载时插件版本会优先使用。

## 最佳实践

### 插件开发建议

1. **遵循命名规范**：使用清晰、描述性的插件名称（kebab-case，无空格）
2. **提供完整元数据**：在 `plugin.json` 中提供详细的描述和作者信息
3. **版本管理**：使用语义化版本号（Semantic Versioning）
4. **文档完善**：为每个命令和技能提供清晰的描述
5. **测试充分**：使用 `--plugin-dir` 在本地测试插件后再发布

### 安全注意事项

1. **仅从可信源安装插件**：插件可以执行命令和访问文件系统
2. **审查插件代码**：安装前检查插件的命令和 Hooks
3. **使用权限控制**：通过 CodeBuddy 的权限系统限制插件访问

## 故障排除

### 插件未加载

**问题**：插件已安装但不工作

**解决方案**：

- 确认插件已启用：运行 `/plugin` 进入 "Installed" 标签页查看
- 检查 `plugin.json` 格式是否正确
- 运行 `/reload-plugins` 重新加载插件
- 使用 `--debug` 模式查看加载日志

### 命令不可用

**问题**：插件已安装但命令无法使用

**解决方案**：

- 确认命令文件放在插件根目录的 `commands/` 中，而不是 `.codebuddy-plugin/` 内
- 检查命令文件是否存在且格式正确
- 运行 `/reload-plugins` 刷新

### 验证和测试

在共享前测试你的插件：

```bash
# 验证插件格式
codebuddy plugin validate /path/to/plugin

# 使用 --plugin-dir 本地测试
codebuddy --plugin-dir ./my-plugin

# 测试插件的技能
/my-plugin:skill-name
```

## 后续步骤

### 对于插件用户

- [插件市场](plugin-marketplaces.md) - 浏览市场并安装插件
- [设置](settings.md) - 了解插件配置选项

### 对于插件开发者

- [插件市场](plugin-marketplaces.md) - 打包和共享你的插件
- [插件参考文档](plugins-reference.md) - 完整技术规范
- 深入了解具体的插件组件：
  - [Skills](skills.md) - 技能开发详情
  - [子代理](sub-agents.md) - 代理配置和能力
  - [Hooks](hooks.md) - 事件处理和自动化
  - [MCP](mcp.md) - 外部工具集成
