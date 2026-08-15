> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/slash-commands.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# CodeBuddy Code 斜杠命令 （Slash Commands)

CodeBuddy Code 支持斜杠命令，允许您在聊天中执行特殊操作、管理会话以及自定义常用工作流。

## 内置斜杠命令 （Built-in Slash Commands)

这些命令用于管理您的 CodeBuddy Code 会话。以下是当前的支持情况：

| 命令 | 参数 | CodeBuddy 支持情况 | 描述 |
| --- | --- |:---:| --- |
| `/help` | | ✅ 支持 | 显示帮助信息，并提供反馈渠道的指引。 |
| `/clear` | | ✅ 支持 | 开启全新对话（旧对话可通过 `/resume` 恢复）。 |
| `/login` | | ✅ 支持 | 登录到您的账号。 |
| `/logout` | | ✅ 支持 | 退出当前的账号。 |
| `/doctor` | | ✅ 支持 | 检查 CodeBuddy Code 的状态和环境。 |
| `/status` | | ✅ 支持 | 显示当前仓库和会话的状态。 |
| `/add-dir` | `<path>` | ✅ 支持 | 添加工作目录。指定要添加的目录路径。 |
| `/agents` | | ✅ 支持 | 管理内置和自定义 AI 智能体；查看内置子代理的生效路由值及其来源，并将模型设置保存到 Global 或 Project 范围。具体场景模型可在 `/model` 中查看。 |
| `/branch` | `[name]` | ✅ 支持 | 在当前对话位置创建一个分支，复制活跃对话历史到新 session 并自动切换。可选指定分支名称。 |
| `/btw` | `<question>` | ✅ 支持 | 快速提问，不中断当前 Agent 工作流。适用于在 Agent 执行任务时临时提出简短问题，答案基于已有上下文生成。 |
| `/compact`| | ✅ 支持 | 压缩上下文。 |
| `/config`| `[list \| get \| set]` | ✅ 支持 | 查看或修改本地配置。不带参数时打开交互式面板，`list` 列出当前设置，`get <key>` 读取设置，`set <key> <value>` 修改设置。 |
| `/context` | | ✅ 支持 | 计算当前会话的上下文 token 分布情况。 |
| `/cost` | | ✅ 支持 | 显示会话的成本和 Token 使用情况。 |
| `/init` | | ✅ 支持 | 初始化一个新的 CodeBuddy 存储库。 |
| `/mcp` | | ✅ 支持 | 管理 MCP 连接。 |
| `/memory`| | ✅ 支持 | 管理长期记忆 |
| `/model` | `[list \| model-name]` | ✅ 支持 | 切换或查看主模型。不带参数时打开交互式界面。`list` 列出可用模型，带模型名称参数时直接切换主模型。 |
| `/model:lite` | `[list \| model-id]` | ✅ 支持 | 切换或查看 `lite` 场景变体（Explore 等轻量子任务使用）的生效模型、来源。不带参数时打开交互式选择界面（含 Global / Project 设置），`list` 列出可用模型，带模型 ID 参数时直接切换。 |
| `/model:reasoning` | `[list \| model-id]` | ✅ 支持 | 切换或查看 `reasoning` 场景变体（复杂分析任务使用）的生效模型、来源。不带参数时打开交互式选择界面（含 Global / Project 设置），`list` 列出可用模型，带模型 ID 参数时直接切换。 |
| `/model:text-to-image` | `[list \| model-id]` | ✅ 支持 | 切换或查看当前使用的文生图模型。不带参数时打开交互式选择界面，`list` 列出可用模型，带模型 ID 参数时直接切换到指定模型。 |
| `/model:image-to-image` | `[list \| model-id]` | ✅ 支持 | 切换或查看当前使用的图生图模型。不带参数时打开交互式选择界面，`list` 列出可用模型，带模型 ID 参数时直接切换到指定模型。 |
| `/permissions` | | ✅ 支持 | 管理工具权限和工作区目录访问权限。 |
| `/plan` | | ✅ 支持 | 预览当前计划模式下的计划文件内容。 |
| `/goal` | `<condition> \| clear` | ✅ 支持 | 持续工作直到达成条件。`/goal <condition>` 设定一个目标条件（例：`/goal all tests pass`），会话级注册一个 prompt 类型的 Stop hook，模型每次想停下来时由小模型评估器判断条件是否满足；不满足则把 reason 注入 history 让模型继续工作。`/goal` 不带参数打开 recap 面板，`/goal clear`（别名：`stop` / `off` / `reset` / `none` / `cancel`）提前结束目标。详见 [goal 文档](./goal.md)。 |
| `/upgrade` | | ✅ 支持 | 在浏览器中打开升级页面，查看高级功能和订阅选项。 |
| `/bashes` | | ✅ 支持 | 列出和管理后台任务。 |
| `/terminal-setup` | | ✅ 支持 | 配置 Shift+Enter 快捷键绑定，用于在输入框中插入换行符。 |
| `/todos` | | ✅ 支持 | 显示当前会话中的待办事项列表。 |
| `/statusline` | | ✅ 支持 | 配置终端状态行显示，可以显示会话信息、模型状态等。 |
| `/security-review` | | ✅ 支持 | 执行当前分支的代码安全审查，由高级安全工程师进行焦点式的安全审查以识别高置信度的安全漏洞。 |
| `/theme` | | ✅ 支持 | 打开主题选择面板，可选择和预览不同的终端主题(dark、light、colorblind-friendly、ANSI 等）。 |
| `/export` | | ✅ 支持 | 导出当前对话到文件或剪贴板。 |
| `/feedback` | | ✅ 支持 | 打开反馈页面，提交 Bug 报告或功能建议。 |
| `/fork` | `[name]` | ✅ 支持 | 在当前对话位置创建一个分支（`/branch` 的别名）。复制活跃对话历史到新 session 并自动切换，可通过 `/resume` 返回原对话。 |
| `/resume` | `[list \| session-id]` | ✅ 支持 | 恢复之前的会话。不带参数时打开交互式面板，`list` 列出所有会话，带 session-id 时直接切换到指定会话。 |
| `/rewind` | | ✅ 支持 | 回退对话到之前的某个消息点，可选择仅回退对话、仅回退代码或同时回退两者。详见 [检查点](checkpointing.md)。 |
| `/sandbox` | | ✅ 支持 | 管理 Bash 命令沙箱模式，控制命令执行的安全策略。详见 [沙箱文档](bash-sandboxing.md)。 |
| `/stats` | | ✅ 支持 | 显示使用统计信息，包括 Token 使用量、模型调用次数、会话时长等详细数据，支持总览和按模型分类两个视图。 |
| `/ide` | | ✅ 支持 | 管理 IDE 集成状态。可以查看当前连接的 IDE、切换 IDE 连接或断开连接。详见 [IDE 集成文档](ide-integrations.md)。 |
| `/plugin` | `[action] [args...]` | ✅ 支持 | 管理插件和插件市场。不带参数时打开交互式界面,支持 `marketplace add`、`install`、`enable`、`disable`、`uninstall` 等操作。详见 [插件文档](plugins.md)。 |
| `/plugin-validate` | `[path]` | ✅ 支持 | 验证插件目录结构和 manifest 有效性。不带参数时验证当前目录。详见 [插件参考文档](plugins-reference.md)。 |
| `/reload-plugins` | | ✅ 支持 | 重新加载所有插件（Skills、Agents、Hooks、MCP/LSP 服务器等）,无需重启。 |
| `/skills` | | ✅ 支持 | 查看当前已加载的所有 Skills,包括用户级、项目级和插件级 Skills,并显示预估 token 数量。详见 [Skills 文档](skills.md)。 |
| `/insights` | | ✅ 支持 | 生成 AI 驱动的使用洞察报告,分析您的 CodeBuddy Code 使用模式、交互风格、项目领域、摩擦点等多个维度,并生成可在浏览器中查看的 HTML 报告。 |
| `/simplify` | `[target]` | ✅ 支持 | 清理已变更的代码，不改变行为。自动启动 4 个并行 Agent 分别从复用、简化、效率、抽象层次四个角度审查代码，然后汇总并应用修复。仅做质量清理，不查找正确性 bug（查 bug 请用 `/code-review`）。 |
| `/code-review` | `[--fix] [--comment] [target]` | ✅ 支持 | 审查当前 diff 中的正确性 bug 和代码质量问题。支持 `--fix` 自动修复发现的问题，`--comment` 将发现作为 PR 内联评论发布。按严重程度排列发现，包含文件、行号、严重等级和修复建议。 |
| `/verify` | `[description]` | ✅ 支持 | 验证代码变更是否按预期工作。自动识别变更类型，运行相关测试套件、构建检查和类型检查，报告测试结果并标记失败或警告。 |
| `/copy` | `[N]` | ✅ 支持 | 复制最近一条 AI 回复到系统剪贴板。可选参数 N 指定第 N 条（1 = 最新，2 = 次新，依此类推），同时写入临时文件 `/tmp/codebuddy/response.md` 作为备份。 |
| `/debug` | `[issue description]` | ✅ 支持 | 启用调试日志并帮助诊断会话问题。自动读取当前会话的调试日志尾部（最后 20 行），如果调试日志未启用则自动开启，分析日志中的错误和警告并给出修复建议。 |

---

## 自定义斜杠命令 （Custom Slash Commands)

这是 CodeBuddy Code 最强大的功能之一。您可以将常用的提示(Prompts)、脚本和工作流封装成可复用的自定义命令，从而极大地提升效率。

> 💡 **另请参阅**：[Skills 技能系统](skills.md) - 如果您需要创建 AI 自动识别并调用的专业能力模板，而不是用户手动触发的命令，请查看 Skills 文档。

### 创建自定义命令

自定义命令通过在特定目录中创建 `.md` (Markdown) 文件来定义。

1.  **项目级命令**：在您的项目根目录下创建 `.codebuddy/commands/` 文件夹。此处的命令对所有项目协作者可用。
2.  **个人全局命令**：在您的用户主目录下创建 `~/.codebuddy/commands/` 文件夹。此处的命令在您所有的项目中都可用。

创建一个命令，只需在上述任一目录中添加一个 `.md` 文件即可。例如,`test.md` 文件会自动注册为 `/test` 命令。

#### 子目录中的命令命名

您可以在 `commands/` 目录下创建子目录来组织您的命令。子目录中的命令会使用冒号分隔的层级命名结构：

- `commands/test.md` → `/test`
- `commands/frontend/build.md` → `/frontend:build`
- `commands/backend/deploy/staging.md` → `/backend:deploy:staging`

这种命名方式让您可以：
- 按功能模块组织命令（如 `frontend`、`backend`、`database` 等）
- 创建层级化的命令结构
- 避免命名冲突，提高命令的可维护性

### Frontmatter 与元数据

您可以在 Markdown 文件的顶部使用 YAML Frontmatter 来定义命令的元数据。

```markdown
---
description: "为我的项目运行单元测试并报告结果。"
argument-hint: "[test-file]"
allowed-tools: Bash(npm run:*)
model: gemini-3.1-pro
---

请为我运行 `npm run test -- $1` 命令，并总结测试结果。如果未提供测试文件，则运行所有测试。
```

支持的元数据字段：

| 字段 | 描述 | 示例 |
|------|------|------|
| `description` | 命令的简短描述,会在自动补全提示中显示。| `"运行单元测试"` |
| `argument-hint` | 描述命令需要的参数,为用户提供输入提示。| `"[test-file]"` 或 `"[pr-number] [priority] [assignee]"` |
| `model` | 指定执行该命令时使用的 AI 模型。| `gemini-3.1-pro` |
| `allowed-tools` | 该命令可以使用的工具列表,支持工具细粒度权限控制。| `Bash(git:*), Read` |
| `disable-model-invocation` | 设置为 `true` 时，命令不会出现在 Skill 工具中，只能通过 `/command-name` 手动触发。| `true` |

> 💡 **注意**：如果指定了 `allowed-tools`,命令只能使用列出的工具。使用 `Bash(git:*)` 表示允许所有 git 命令,`Bash(git add:*)` 表示仅允许 `git add` 命令。

### 使用参数

您的自定义命令可以接收参数，就像 Shell 脚本一样。有两种方式来处理参数：

#### 方式一：位置参数 （$1, $2, $3, ...)

按位置访问单个参数。这种方式适合需要在命令的不同部分使用不同参数的情况。

**示例： `review-pr.md`**
```markdown
---
description: "代码审查"
argument-hint: "[pr-number] [priority] [assignee]"
---

请审查 PR #$1，优先级为 $2，并分配给 $3 进行最终确认。

重点检查以下方面：
- 代码风格和最佳实践
- 性能影响
- 安全问题
- 测试覆盖率
```

* 调用 `/review-pr 456 high alice` 时：
  - `$1` = `456`
  - `$2` = `high`
  - `$3` = `alice`

#### 方式二：捕获所有参数 （$ARGUMENTS)

一次性捕获所有参数。这种方式适合参数个数不确定的情况。

**示例： `fix-issue.md`**
```markdown
---
description: "修复代码问题"
argument-hint: "[issue-number] [details...]"
---

请修复 issue #$ARGUMENTS，遵循我们的编码标准。

按照以下步骤：
1. 理解问题
2. 定位根本原因
3. 实现修复
4. 添加测试
5. 验证修复效果
```

* 调用 `/fix-issue 123 high-priority refactor-auth-module` 时：
  - `$ARGUMENTS` = `123 high-priority refactor-auth-module`

> 💡 **参数解析规则**：参数通过空格分隔，支持单引号和双引号来处理含有空格的参数。例如 `/greet "Hello World"` 会将 `"Hello World"` 作为单个参数传递。

### 执行 Shell 命令

在命令的任何一行前面加上 `!` 前缀,命令用反引号包围,该行就会被当作 Shell 命令执行,其输出 (`stdout`) 会被捕获并注入到上下文中，供 AI 后续分析。

> ⚠️ **重要提示**：使用 Shell 命令执行时，必须在 `allowed-tools` frontmatter 中包含 `Bash` 工具，否则命令无法执行。

**示例： `status.md`**
```markdown
---
description: "显示当前的 git 仓库状态并进行分析。"
allowed-tools: Bash(git status:*), Bash(git diff:*)
---

当前 git 状态：
!`git status`

当前分支的变更：
!`git diff HEAD`

请基于上面的输出，为我总结当前分支的状况。
```

**更多示例： `commit.md`**
```markdown
---
description: "创建一个 git 提交。"
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git commit:*)
argument-hint: "[message]"
---

## 当前状态

- Git 状态： !`git status`
- 分段变更： !`git diff --cached`
- 最近提交： !`git log --oneline -5`

## 任务

基于上面的信息，使用提供的提交消息创建一个 git 提交：$1

如果没有提供消息，使用默认的描述性消息。
```

### 文件引用

在命令中使用 `@` 前缀来包含文件内容。系统会自动读取文件并将其内容注入到 AI 上下文中。

**示例**
```markdown
---
description: "代码审查"
---

请审查以下文件：

@src/utils/helpers.js
@src/utils/validators.js

找出潜在的性能问题和代码风格问题。
```

---

## 最佳实践

### 1. 描述要清晰明确

编写清晰的 `description` 和 `argument-hint`，帮助用户和 AI 理解命令的用途：

```markdown
---
description: "执行安全审计，扫描代码中的潜在漏洞和安全问题"
argument-hint: "[files...] [--severity high|medium|low]"
---
```

### 2. 使用细粒度的工具权限

通过 `allowed-tools` 限制命令可以使用的工具和操作：

```markdown
---
allowed-tools: Bash(npm test:*), Bash(git diff:*), Read
description: "运行测试并与主分支比较"
---
```

这比允许所有工具更安全和高效。

### 3. 组织命令到子目录

为大量命令创建逻辑分组：

```
.codebuddy/commands/
├── frontend/
│   ├── build.md
│   ├── test.md
│   └── lint.md
├── backend/
│   ├── migrate.md
│   ├── deploy.md
│   └── logs.md
└── git/
    ├── commit.md
    ├── review.md
    └── release.md
```

调用方式：
- `/frontend:build`
- `/backend:deploy`
- `/git:commit "message"`

### 4. 提供有用的上下文

在 Shell 命令执行前插入有用的信息：

```markdown
---
description: "分析代码覆盖率"
allowed-tools: Bash(npm run:*)
---

## 当前状态

项目根目录： !`pwd`
当前分支： !`git rev-parse --abbrev-ref HEAD`

## 任务

请运行测试并生成覆盖率报告：
!`npm run coverage`

基于上述结果，为我总结代码覆盖率情况。
```

### 5. 处理可选参数

使用条件逻辑处理可选参数：

```markdown
---
description: "运行特定或全部测试"
argument-hint: "[test-file]"
allowed-tools: Bash(npm run:*)
---

$1 为空时将运行所有测试，否则运行指定的测试文件。

命令： !`npm run test -- $1`
```

### 6. 指定特定模型

为需要特定能力的命令指定模型：

```markdown
---
description: "代码复杂性分析"
model: gemini-3.1-pro
---

分析这段代码的复杂性...
```

---

## 常见用法场景

### 场景1：代码审查工作流

创建 `.codebuddy/commands/code-review.md`：

```markdown
---
description: "对指定文件进行代码审查"
argument-hint: "[file-paths...]"
allowed-tools: Read
---

请对以下文件进行代码审查，关注代码质量、可维护性和安全性：

@$ARGUMENTS

审查要点：
1. 代码风格和命名约定
2. 函数复杂度
3. 错误处理
4. 性能考虑
5. 安全隐患
```

### 场景2：自动化部署

创建 `.codebuddy/commands/deploy.md`：

```markdown
---
description: "部署应用到指定环境"
argument-hint: "[environment] [version]"
allowed-tools: Bash(npm run:*), Bash(git:*)
---

## 部署流程

当前版本： !`cat package.json | grep version`
最近的标签： !`git describe --tags --abbrev=0`

目标环境： $1
目标版本： $2

准备部署 $2 到 $1 环境...
```

### 场景3：项目诊断

创建 `.codebuddy/commands/diagnose.md`：

```markdown
---
description: "诊断项目状态和环境"
allowed-tools: Bash(npm list:*), Bash(git:*), Bash(node --version:*)
---

## 项目诊断报告

Node 版本： !`node --version`
NPM 版本： !`npm --version`
Git 状态： !`git status --short`
依赖信息： !`npm list --depth=0`

基于上述信息，为我总结项目状态并提出建议。
```

---

## 故障排除

### 命令不执行

1. **检查命令文件位置**
   - 项目命令：`.codebuddy/commands/*.md`
   - 全局命令：`~/.codebuddy/commands/*.md`

2. **检查 frontmatter 格式**
   - 确保 YAML 语法正确
   - 如果指定了 `allowed-tools`，确保工具格式正确

3. **检查 Shell 命令权限**
   - 如果使用了 `!` 前缀执行命令,必须在 `allowed-tools` 中包含 `Bash` 工具

### 参数未正确替换

确保使用了正确的参数格式：
- `$1`, `$2`, `$3` 用于位置参数
- `$ARGUMENTS` 用于所有参数
- 在 frontmatter 中正确指定了 `argument-hint`

### 文件引用不工作

1. 使用绝对路径或相对于项目根目录的相对路径
2. 确保路径中没有空格，或使用引号围绕完整路径
3. 检查文件是否存在和可读

---

## 技巧与窍门

- 📝 **版本控制**：将项目命令提交到 Git，团队成员可以共享
- 🔒 **权限控制**：使用 `allowed-tools` 确保命令只使用必要的权限
- ⚡ **性能**：避免在 Shell 命令中执行耗时操作
- 🎯 **清晰性**：使用明确的命名和描述，帮助团队理解命令的用途
