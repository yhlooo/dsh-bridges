> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/memory.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 管理 CodeBuddy 的记忆

> 了解如何通过不同的记忆位置和最佳实践来管理 CodeBuddy Code 跨会话的记忆。

CodeBuddy Code 可以跨会话记住您的偏好，例如代码风格指南和工作流程中的常用命令。

## 确定记忆类型

CodeBuddy Code 提供四种分层结构的记忆位置，每种都有不同的用途：

| 记忆类型 | 位置 | 用途 | 使用场景示例 | 共享范围 |
|---------|------|------|-------------|---------|
| **用户记忆** | `~/.codebuddy/CODEBUDDY.md` | 适用于所有项目的个人偏好 | 代码风格偏好、个人工具快捷方式 | 仅限本人（所有项目） |
| **用户规则** | `~/.codebuddy/rules/*.md` | 模块化的个人规则 | 个人编码习惯、常用工作流 | 仅限本人（所有项目） |
| **项目记忆** | `./CODEBUDDY.md` 或 `./.codebuddy/CODEBUDDY.md` | 项目的团队共享指令 | 项目架构、编码标准、常用工作流程 | 通过源代码管理与团队成员共享 |
| **项目规则** | `./.codebuddy/rules/*.md` | 模块化的、按主题划分的项目指令 | 语言特定指南、测试规范、API 标准 | 通过源代码管理与团队成员共享 |
| **项目记忆（本地）** | `./CODEBUDDY.local.md` | 个人的项目特定偏好 | 您的沙箱 URL、首选测试数据 | 仅限本人（当前项目） |

所有记忆文件在启动 CodeBuddy Code 时自动加载到上下文中。加载顺序如下：

1. **用户级**：加载 `~/.codebuddy/CODEBUDDY.md` 等主文件及 `~/.codebuddy/rules/` 下的所有规则
2. **项目级主文件**：从当前工作目录向上递归加载所有 `CODEBUDDY.md` 和 `CODEBUDDY.local.md`
3. **项目级规则**：仅加载当前工作目录的 `.codebuddy/rules/` 下的规则（不加载父目录的规则）
4. **子目录记忆**：当 CodeBuddy 操作子目录中的文件时，动态加载该子目录的 `CODEBUDDY.md`
5. **本地记忆**：加载 `./CODEBUDDY.local.md`

> **提示**：CODEBUDDY.local.md 文件会自动添加到 .gitignore，非常适合存储不应提交到版本控制的私有项目特定偏好。

## CODEBUDDY.md 导入

CODEBUDDY.md 文件可以使用 `@path/to/import` 语法导入其他文件。以下示例导入了 3 个文件：

```markdown
查看 @README 了解项目概述，@package.json 了解可用的 npm 命令。

# 附加说明
- Git 工作流程 @docs/git-instructions.md
```

支持相对路径和绝对路径。特别是，导入用户主目录中的文件是一种方便的方式，让团队成员可以提供不会提交到仓库的个人指令。导入是 CODEBUDDY.local.md 的替代方案，在多个 git worktree 之间工作得更好。

```markdown
# 个人偏好
- @~/.codebuddy/my-project-instructions.md
```

为避免潜在冲突，代码块和代码范围内的导入不会被解析。

```markdown
此代码范围不会被视为导入：`@tencent-ai/codebuddy-code`
```

导入的文件可以递归导入其他文件，最大深度为 5 层。您可以通过运行 `/memory` 命令查看已加载的记忆文件。

## CodeBuddy 如何查找记忆

CodeBuddy Code 递归读取记忆：从当前工作目录开始，CodeBuddy Code 向上递归到根目录（但不包括根目录 `/`），并读取找到的任何 CODEBUDDY.md 或 CODEBUDDY.local.md 文件。这在大型仓库中特别方便，当您在 `foo/bar/` 目录中运行 CodeBuddy Code，并且在 `foo/CODEBUDDY.md` 和 `foo/bar/CODEBUDDY.md` 两处都有记忆时。

CodeBuddy 还会发现当前工作目录下子树中嵌套的 CODEBUDDY.md。这些文件不会在启动时加载，只有当 CodeBuddy 读取这些子树中的文件时才会包含。

## 使用 `/memory` 管理记忆

在会话中使用 `/memory` 斜杠命令，打开记忆管理面板。在该面板中你可以：

- 打开 Auto Memory 目录
- 打开 `MEMORY.md` 索引文件
- 切换 Auto Memory 开关

## 设置项目记忆

假设您想设置一个 CODEBUDDY.md 文件来存储重要的项目信息、约定和常用命令。项目记忆可以存储在 `./CODEBUDDY.md` 或 `./.codebuddy/CODEBUDDY.md` 中。

使用以下命令为您的代码库引导一个 CODEBUDDY.md：

```
> /init
```

> **提示**：
> - 包含常用命令（构建、测试、lint）以避免重复搜索
> - 记录代码风格偏好和命名约定
> - 添加项目特定的重要架构模式
> - CODEBUDDY.md 记忆既可用于与团队共享的指令，也可用于个人偏好

## 使用 `.codebuddy/rules/` 实现模块化规则

对于较大的项目，您可以使用 `.codebuddy/rules/` 目录将指令组织到多个文件中。这允许团队维护专注的、组织良好的规则文件，而不是一个庞大的 CODEBUDDY.md。

### 基本结构

将 markdown 文件放在项目的 `.codebuddy/rules/` 目录中：

```
your-project/
├── .codebuddy/
│   ├── CODEBUDDY.md           # 主要项目指令
│   └── rules/
│       ├── code-style.md      # 代码风格指南
│       ├── testing.md         # 测试规范
│       └── security.md        # 安全要求
```

`.codebuddy/rules/` 中的所有 `.md` 文件都会自动作为项目记忆加载，优先级与 `.codebuddy/CODEBUDDY.md` 相同。

> **注意**：项目级规则仅从当前工作目录（workDir）的 `.codebuddy/rules/` 加载，不会加载父目录的规则文件夹。这确保规则的作用域清晰明确。

### 规则控制字段

规则文件支持以下 YAML frontmatter 字段来控制加载和应用行为：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `enabled` | boolean | `true` | 是否加载此规则。设为 `false` 时规则完全不加载 |
| `alwaysApply` | boolean | `true` | 是否始终应用此规则 |
| `paths` | string/string[] | - | 触发规则的文件路径 glob 模式 |

#### 规则类型判定

规则类型由 `alwaysApply` 和 `paths` 共同决定：

| alwaysApply | paths | 规则类型 | 行为 |
|-------------|-------|----------|------|
| `true`（默认） | 任意 | ALWAYS | 始终注入到上下文 |
| `false` | 有值 | MANUAL（条件触发） | 仅在操作匹配文件时触发 |
| `false` | 无 | 不支持 | 规则不会加载 |

#### 示例

**始终应用的规则**（默认行为）：

```markdown
---
# alwaysApply 默认为 true，可省略
---

# 通用代码规范

- 使用 2 空格缩进
- 文件末尾保留空行
```

**条件触发规则**：

```markdown
---
alwaysApply: false
paths: src/api/**/*.ts
---

# API 开发规则

- 所有 API 端点必须包含输入验证
- 使用标准错误响应格式
- 包含 OpenAPI 文档注释
```

**禁用规则**（临时关闭）：

```markdown
---
enabled: false
---

# 暂时不使用的规则
```

> **注意**：`paths` 字段不仅限于 `.codebuddy/rules/` 目录，在所有记忆文件（包括 CODEBUDDY.md、CODEBUDDY.local.md）中都可以使用。

### Glob 模式

`paths` 字段支持标准 glob 模式，并启用了 `matchBase` 选项：

| 模式 | 匹配 |
|------|------|
| `**/*.ts` | 任意目录下的所有 TypeScript 文件 |
| `*.ts` | 任意目录下的所有 TypeScript 文件（matchBase 模式） |
| `src/**/*` | `src/` 目录下的所有文件 |
| `*.md` | 任意目录下的 Markdown 文件 |
| `src/components/*.tsx` | 特定目录下的 React 组件 |

> **matchBase 说明**：启用 matchBase 后，不包含路径分隔符的模式（如 `*.ts`）会匹配任意目录下的文件。例如 `*.ts` 可以匹配 `src/utils/helper.ts`。

您可以使用大括号高效匹配多个模式：

```markdown
---
paths: src/**/*.{ts,tsx}
---

# TypeScript/React 规则
```

这会展开匹配 `src/**/*.ts` 和 `src/**/*.tsx`。您也可以用逗号组合多个模式：

```markdown
---
paths: {src，lib}/**/*.ts, tests/**/*.test.ts
---
```

### 子目录

规则可以组织到子目录中以获得更好的结构：

```
.codebuddy/rules/
├── frontend/
│   ├── react.md
│   └── styles.md
├── backend/
│   ├── api.md
│   └── database.md
└── general.md
```

所有 `.md` 文件都会被递归发现。

### 符号链接

`.codebuddy/rules/` 目录支持符号链接，允许您在多个项目之间共享通用规则：

```bash
# 符号链接共享规则目录
ln -s ~/shared-codebuddy-rules .codebuddy/rules/shared

# 符号链接单个规则文件
ln -s ~/company-standards/security.md .codebuddy/rules/security.md
```

符号链接会被解析，其内容正常加载。循环符号链接会被检测并优雅处理。

### 用户级规则

您可以在 `~/.codebuddy/rules/` 中创建适用于所有项目的个人规则：

```
~/.codebuddy/rules/
├── preferences.md    # 您的个人编码偏好
└── workflows.md      # 您首选的工作流程
```

用户级规则在项目规则之前加载，给予项目规则更高的优先级。

> **最佳实践**：
> - **保持规则专注**：每个文件应涵盖一个主题（如 `testing.md`、`api-design.md`）
> - **使用描述性文件名**：文件名应表明规则涵盖的内容
> - **谨慎使用条件规则**：仅当规则真正适用于特定文件类型时才添加 `paths` frontmatter
> - **用子目录组织**：分组相关规则（如 `frontend/`、`backend/`）

## 记忆最佳实践

- **具体明确**："使用 2 空格缩进"比"正确格式化代码"更好。
- **使用结构组织**：将每条记忆格式化为要点，并在描述性 markdown 标题下分组相关记忆。
- **定期审查**：随着项目发展更新记忆，确保 CodeBuddy 始终使用最新的信息和上下文。

## 设置语言偏好

推荐使用 `/config` 命令配置首选响应语言（详见 [设置配置](settings.md#可用设置)），这是最简单直接的方式：

```
> /config
# 选择 Language，输入您的首选语言，如"简体中文"
```

如果需要更细粒度的控制（如代码注释语言、提交信息语言），可以在记忆文件中添加：

```markdown
## CodeBuddy Added Memories

### 语言偏好
- 代码注释使用中文
- 提交信息使用中文
```

项目级语言设置会覆盖用户级设置。

## 分层记忆策略示例

### 用户级记忆 (`~/.codebuddy/CODEBUDDY.md`)

```markdown
## CodeBuddy Added Memories

### 工具偏好
- 使用 pnpm 而非 npm

### 代码偏好
- 倾向函数式编程风格
- 优先代码可读性
```

> **提示**：响应语言推荐通过 `/config` 设置，而非在记忆文件中配置。

### 项目级记忆 (`./CODEBUDDY.md`)

```markdown
## CodeBuddy Added Memories

### 项目架构
- 使用微服务架构
- 前端：React + TypeScript
- 后端：Node.js + Express

### 团队约定
- PR 需要 2 人审查
- 遵循 Conventional Commits
```

### 本地项目记忆 (`./CODEBUDDY.local.md`)

```markdown
## CodeBuddy Added Memories

### 本地开发配置
- 数据库端口：5433
- 使用 debug 模式
- 跳过 CI 快速测试
```

## Auto Memory 系统

Auto Memory 是 CodeBuddy Code 的自动记忆系统，允许 CodeBuddy 在会话之间自动保存和检索持久化记忆。与 CODEBUDDY.md 的静态记忆不同，Auto Memory 由 CodeBuddy 在工作过程中自主决定保存什么内容。

### 存储位置

- **项目记忆**：`~/.codebuddy/memories/{project-id}/`
- **全局记忆**：`~/.codebuddy/memories/global/`

每个项目都有一个 `MEMORY.md` 索引文件，其前 200 行会自动加载到会话上下文。详细的记忆内容应存储在独立的主题文件中（如 `preferences.md`、`decisions.md`），并从 MEMORY.md 链接引用。

### 启用与禁用

- 通过 `/config` 面板切换 Auto Memory 开关
- 通过 `/memory` 命令面板切换
- 通过 `settings.json` 配置：`"memory": { "autoMemoryEnabled": false }`
- 通过环境变量：`CODEBUDDY_DISABLE_AUTO_MEMORY=1`

### Typed Memory 模式

Typed Memory 是 Auto Memory 的增强版本，提供结构化的记忆类型系统（默认启用）。记忆文件使用 YAML frontmatter 和 4 种类型进行管理。

**4 种记忆类型：**

| 类型 | 用途 | 示例 |
|------|------|------|
| `user` | 用户的角色、目标、偏好和知识背景 | “用户是高级后端工程师，擅长 Go” |
| `feedback` | 用户对 CodeBuddy 行为的纠正和指导 | “不要在测试中 mock 数据库” |
| `project` | 项目进行中的工作、目标和决策 | “下周三起冻结非关键合并” |
| `reference` | 外部系统和资源的指引 | “bug 跟踪在 Linear 项目 INGEST 中” |

**记忆文件格式：**

```markdown
---
name: 用户角色
description: 用户的职业背景和技术专长
type: user
---

用户是资深后端工程师，拥有 10 年 Go 语言经验，但首次接触项目的 React 前端部分。
```

**禁用方式（如需回退到通用格式）：**

- 通过 `settings.json` 配置：`"memory": { "typedMemory": false }`
- 通过环境变量：`CODEBUDDY_TYPED_MEMORY_ENABLED=false`

> **提示**：Typed Memory 默认启用。如果禁用，Auto Memory 会使用简化的通用格式，无类型系统和 YAML frontmatter。

## 缓存与重载

| 操作 | 重新加载 | 说明 |
|------|---------|------|
| 进程重启 | 是 | 缓存清空 |
| 通过 /memory 编辑 | 是 | 自动清除缓存 |
| /clear 命令 | 否 | 仅清除消息历史 |
| 手动修改文件 | 否 | 需手动重启 |
| 新增/删除规则文件 | 否 | 需手动重启 |

## 常见问题

**AGENTS.md 和 CODEBUDDY.md 有什么区别？**

CodeBuddy Code 同时支持 AGENTS.md 和 CODEBUDDY.md 作为项目记忆文件：

- **AGENTS.md 支持**：如果项目中存在 `CODEBUDDY.md` 文件，项目级记忆将使用 CODEBUDDY.md，否则使用 AGENTS.md
- **自动检测**：系统会自动检测项目中是否存在 AGENTS.md 文件

### 推荐使用 CODEBUDDY.md

虽然我们保持对 AGENTS.md 的支持，但建议新项目使用 CODEBUDDY.md 作为记忆文件名，以保持与 CodeBuddy Code 品牌的一致性。

**如何迁移 AGENTS.md 到 CODEBUDDY.md？**

重命名 `AGENTS.md` 为 `CODEBUDDY.md` 即可。系统自动检测，CODEBUDDY.md 优先加载。

**记忆文件如何同步？**

- **项目记忆**：通过 Git 与团队同步
- **用户记忆**：本地存储，不同步
- **本地项目记忆**：本地存储，自动添加到 .gitignore

**条件规则什么时候触发？**

在以下情况触发：
- 使用 `@path/to/file` 引用文件时
- 使用 Read、Glob、Grep、Edit、Write 等文件操作工具时

触发后，匹配规则会作为系统提醒注入到当前消息上下文。当所有条件规则都已注入后，不会重复注入。

**如何调试规则加载问题？**

1. 运行 `/memory` 查看已加载的规则列表
2. 检查 frontmatter 格式是否正确（`---` 分隔符）
3. 确认 glob 模式是否匹配
4. 重启 CodeBuddy 清除缓存

**规则文件大小有限制吗？**

建议保持简洁。特别大的规范文档使用 `@import` 语法引用而非直接包含。

## 与 CodeBuddy IDE 的兼容性

CodeBuddy Code CLI 和 CodeBuddy IDE 都支持记忆/规则功能，但条件规则的触发方式不同：

- **CLI**：条件规则通过 glob 模式自动匹配文件操作触发（包括 @ 引用和工具调用），不支持模型智能选择规则
- **IDE**：条件规则支持用户通过 @RuleName 手动引用，也支持模型基于上下文智能决策激活规则


## 相关资源

- [设置配置](settings.md) - 配置 CodeBuddy Code 行为
- [斜杠命令](slash-commands.md) - 所有可用命令
- [快速入门](quickstart.md) - 快速上手指南

---

*通过有效的记忆管理，让 CodeBuddy Code 更好地理解您的需求和偏好*
