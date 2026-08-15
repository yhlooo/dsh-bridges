> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/common-workflows.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 常见工作流

> 学习 CodeBuddy Code 的常见工作流程。

本文档中的每个任务都包含清晰的说明、示例命令和最佳实践，帮助您充分利用 CodeBuddy Code。

## 理解新代码库

### 快速了解代码库概况

假设您刚加入一个新项目，需要快速了解其结构。

**步骤：**

1. **导航到项目根目录**
   ```bash
   cd /path/to/project
   ```

2. **启动 CodeBuddy Code**
   ```bash
   codebuddy
   ```

3. **询问高层次概览**
   ```
   > 给我这个代码库的概览
   ```

4. **深入了解特定组件**
   ```
   > 解释这里使用的主要架构模式
   ```

   ```
   > 关键的数据模型有哪些？
   ```

   ```
   > 身份验证是如何处理的？
   ```

**最佳实践：**

- 从宏观问题开始，然后缩小到特定领域
- 询问项目中使用的编码规范和模式
- 请求项目特定术语的词汇表

### 查找相关代码

假设您需要定位与特定功能相关的代码。

**步骤：**

1. **请 CodeBuddy 查找相关文件**
   ```
   > 找到处理用户身份验证的文件
   ```

2. **了解组件如何交互**
   ```
   > 这些身份验证文件如何协同工作？
   ```

3. **理解执行流程**
   ```
   > 追踪从前端到数据库的登录过程
   ```

**最佳实践：**

- 对要查找的内容要具体
- 使用项目中的领域语言

---

## 高效修复 Bug

假设您遇到了错误消息，需要找到并修复其来源。

**步骤：**

1. **与 CodeBuddy 分享错误**
   ```
   > 运行 npm test 时看到错误
   ```

2. **询问修复建议**
   ```
   > 建议几种修复 user.ts 中 @ts-ignore 的方法
   ```

3. **应用修复**
   ```
   > 更新 user.ts 添加你建议的空值检查
   ```

**最佳实践：**

- 告诉 CodeBuddy 重现问题的命令并获取堆栈跟踪
- 提及重现错误的任何步骤
- 让 CodeBuddy 知道错误是间歇性的还是持续性的

---

## 重构代码

假设您需要更新旧代码以使用现代模式和实践。

**步骤：**

1. **识别需要重构的遗留代码**
   ```
   > 在代码库中查找已弃用的 API 使用
   ```

2. **获取重构建议**
   ```
   > 建议如何重构 utils.js 以使用现代 JavaScript 特性
   ```

3. **安全地应用更改**
   ```
   > 重构 utils.js 使用 ES2024 特性，同时保持相同的行为
   ```

4. **验证重构**
   ```
   > 为重构的代码运行测试
   ```

**最佳实践：**

- 请 CodeBuddy 解释现代方法的好处
- 需要时请求更改保持向后兼容性
- 以小的、可测试的增量进行重构

---

## 使用专门的子代理

假设您想使用专门的 AI 子代理来更有效地处理特定任务。

**步骤：**

1. **查看可用的子代理**
   ```
   > /agents
   ```

   这会显示所有可用的子代理并让您创建新的。

2. **自动使用子代理**
   CodeBuddy Code 会自动将适当的任务委派给专门的子代理：

   ```
   > 审查我最近的代码更改是否存在安全问题
   ```

   ```
   > 运行所有测试并修复任何失败
   ```

3. **明确请求特定子代理**
   ```
   > 使用代码审查子代理检查认证模块
   ```

   ```
   > 让调试器子代理调查用户为什么无法登录
   ```

4. **为您的工作流创建自定义子代理**
   ```
   > /agents
   ```

   然后选择"创建新子代理"并按照提示定义：

   - 子代理类型（如 `api-designer`、`performance-optimizer`)
   - 何时使用它
   - 它可以访问哪些工具
   - 它的专门系统提示词

**最佳实践：**

- 在 `.codebuddy/agents/` 中创建项目特定的子代理以便团队共享
- 使用描述性的 `description` 字段以启用自动委派
- 将工具访问限制为每个子代理实际需要的内容
- 查看[子代理文档](./sub-agents.md)了解详细示例

---

## 使用计划模式进行安全的代码分析

计划模式指示 CodeBuddy 通过只读操作分析代码库来创建计划，非常适合探索代码库、规划复杂更改或安全地审查代码。

### 何时使用计划模式

- **多步骤实现**：当您的功能需要编辑许多文件时
- **代码探索**：当您想在更改任何内容之前彻底研究代码库时
- **交互式开发**：当您想与 CodeBuddy 就方向进行迭代时

### 如何使用计划模式

**在会话期间开启计划模式**

您可以在会话期间使用快捷键切换权限模式来切换到计划模式：
- 所有平台：按 **Shift+Tab**（Windows 也支持 **Alt+M**）

如果您处于普通模式，按快捷键将首先切换到自动接受模式，终端底部会显示 `⏵⏵ accept edits on`。再次按快捷键将切换到计划模式,显示 `⏸ plan mode on`。

**以计划模式启动新会话**

要以计划模式启动新会话，使用 `--permission-mode plan` 参数：

```bash
codebuddy --permission-mode plan
```

**在计划模式下运行"无头"查询**

您也可以使用 `-p` 直接在计划模式下运行查询（即在["无头模式"](./headless.md)中）:

```bash
codebuddy --permission-mode plan -p "分析身份验证系统并建议改进"
```

### 示例： 规划复杂重构

```bash
codebuddy --permission-mode plan
```

```
> 我需要重构我们的身份验证系统以使用 OAuth2。创建详细的迁移计划。
```

CodeBuddy 将分析当前实现并创建全面的计划。使用后续问题进行完善：

```
> 向后兼容性怎么办？
> 我们应该如何处理数据库迁移？
```

### 将计划模式配置为默认

```json
// .codebuddy/settings.json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

查看[设置文档](./settings.md#可用设置)了解更多配置选项。

---

## 处理测试

假设您需要为未覆盖的代码添加测试。

**步骤：**

1. **识别未测试的代码**
   ```
   > 查找 NotificationsService.swift 中未被测试覆盖的函数
   ```

2. **生成测试脚手架**
   ```
   > 为通知服务添加测试
   ```

3. **添加有意义的测试用例**
   ```
   > 为通知服务添加边缘条件的测试用例
   ```

4. **运行并验证测试**
   ```
   > 运行新测试并修复任何失败
   ```

**最佳实践：**

- 要求涵盖边缘情况和错误条件的测试
- 适当时请求单元测试和集成测试
- 让 CodeBuddy 解释测试策略

---

## 创建合并请求

假设您需要为更改创建一个文档完善的合并请求。

**步骤：**

1. **总结您的更改**
   ```
   > 总结我对身份验证模块所做的更改
   ```

2. **使用 CodeBuddy 生成 MR**
   ```
   > 创建一个 mr
   ```

3. **审查并完善**
   ```
   > 用更多关于安全改进的上下文增强 MR 描述
   ```

4. **添加测试详情**
   ```
   > 添加关于如何测试这些更改的信息
   ```

**最佳实践：**

- 直接让 CodeBuddy 为您创建 MR
- 提交前审查 CodeBuddy 生成的 MR
- 让 CodeBuddy 强调潜在的风险或考虑因素

---

## 处理文档

假设您需要为代码添加或更新文档。

**步骤：**

1. **识别未文档化的代码**
   ```
   > 在认证模块中查找没有适当 JSDoc 注释的函数
   ```

2. **生成文档**
   ```
   > 为 auth.js 中未文档化的函数添加 JSDoc 注释
   ```

3. **审查并增强**
   ```
   > 用更多上下文和示例改进生成的文档
   ```

4. **验证文档**
   ```
   > 检查文档是否符合我们的项目标准
   ```

**最佳实践：**

- 指定您想要的文档风格(JSDoc、docstrings 等）
- 在文档中要求示例
- 为公共 API、接口和复杂逻辑请求文档

---

## 处理图片

假设您需要处理代码库中的图片，并希望 CodeBuddy 帮助分析图片内容。

**步骤：**

1. **将图片添加到对话中**
   您可以使用以下任一方法：

   1. 将图片拖放到 CodeBuddy Code 窗口中
   2. 复制图片并用 ctrl+v 粘贴到 CLI 中（不要使用 cmd+v)
   3. 向 CodeBuddy 提供图片路径。例如："分析这张图片： /path/to/your/image.png"

2. **让 CodeBuddy 分析图片**
   ```
   > 这张图片显示了什么？
   ```

   ```
   > 描述这个截图中的 UI 元素
   ```

   ```
   > 这个图表中有什么问题元素吗？
   ```

3. **使用图片提供上下文**
   ```
   > 这是错误的截图。是什么原因造成的？
   ```

   ```
   > 这是我们当前的数据库架构。我们应该如何为新功能修改它？
   ```

4. **从视觉内容获取代码建议**
   ```
   > 生成与此设计稿匹配的 CSS
   ```

   ```
   > 什么 HTML 结构可以重现这个组件？
   ```

**最佳实践：**

- 当文本描述不清楚或繁琐时使用图片
- 包含错误、UI 设计或图表的截图以获得更好的上下文
- 您可以在对话中处理多张图片
- 图片分析适用于图表、截图、原型设计等

---

## 引用文件和目录

使用 @ 快速包含文件或目录，无需等待 CodeBuddy 读取它们。

**步骤：**

1. **引用单个文件**
   ```
   > 解释 @src/utils/auth.js 中的逻辑
   ```

   默认会在对话中包含文件内容；如果文件过大，会保留原始 `@file` 供后续使用 Read 或 Grep 继续读取；如果内容较长，可能只包含前一段并附带继续读取提示。

2. **引用目录**
   ```
   > @src/components 的结构是什么？
   ```

   这会提供带有文件信息的目录列表。

3. **引用 MCP 资源（暂不支持）**
   ```
   > 显示来自 @github:repos/owner/repo/issues 的数据
   ```

   这会使用 @server:resource 格式从连接的 MCP 服务器获取数据。详见 [MCP 资源](./mcp.md)。

**最佳实践：**

- 文件路径可以是相对路径或绝对路径
- @ 文件引用会将文件目录及父目录中的 CODEBUDDY.md 添加到上下文
- 目录引用显示文件列表，而不是内容；目录过大时会折叠未展示的其余条目
- 您可以在单条消息中引用多个文件（例如，"@file1.js 和 @file2.js")

---

## 使用扩展思考

假设您正在处理复杂的架构决策、具有挑战性的 bug 或需要深入推理的多步骤实现规划。

> **注意**：思考模式在 CodeBuddy Code 中默认禁用。您可以使用 `Tab` 按需开启思考，或使用"思考"或"深入思考"等提示词。

**步骤：**

1. **提供上下文并让 CodeBuddy 思考**
   ```
   > 我需要为我们的 API 实现一个使用 OAuth2 的新身份验证系统。深入思考在代码库中实现这个的最佳方法。
   ```

   CodeBuddy 将从代码库收集相关信息并使用扩展思考，这将在界面中可见。

2. **用后续提示完善思考**
   ```
   > 思考这种方法的潜在安全漏洞
   ```

   ```
   > 深入思考我们应该处理的边缘情况
   ```

**从扩展思考中获得最大价值的提示：**

扩展思考对复杂任务最有价值，例如：

- 规划复杂的架构更改
- 调试复杂问题
- 为新功能创建实现计划
- 理解复杂的代码库
- 评估不同方法之间的权衡

使用 `Tab` 在会话期间开启和关闭思考。

提示思考的方式会导致不同的思考深度：

- "思考"触发基本扩展思考
- "深入思考"、"多思考"、"思考更多"或"思考更久"等强化短语触发更深入的思考

> **注意**: CodeBuddy 会在响应上方以斜体灰色文本显示其思考过程。

---

## 恢复之前的对话

假设您一直在使用 CodeBuddy Code 处理任务，需要在稍后的会话中继续之前的工作。

CodeBuddy Code 提供两个恢复之前对话的选项：

- `--continue` 自动继续最近的对话
- `--resume` 显示对话选择器

**步骤：**

1. **继续最近的对话**
   ```bash
   codebuddy --continue
   ```

   这会立即恢复您最近的对话，无需任何提示。

2. **在非交互模式下继续**
   ```bash
   codebuddy --continue --print "继续我的任务"
   ```

   在非交互模式下使用 `--print` 与 `--continue` 来恢复最近的对话，非常适合脚本或自动化。

3. **显示对话选择器**
   ```bash
   codebuddy --resume
   ```

   这会显示一个交互式对话选择器，提供清晰的列表视图，显示：

   - 会话摘要（或初始提示）
   - 元数据： 经过时间、消息数量和 git 分支

   使用方向键导航并按 Enter 选择对话。按 Esc 退出。

**最佳实践：**

- 对话历史存储在本地计算机上
- 使用 `--continue` 快速访问最近的对话
- 使用 `--resume` 当您需要选择特定的过去对话时
- 恢复时，您会在继续之前看到整个对话历史
- 恢复的对话以与原始相同的模型和配置开始

**工作原理：**

1. **对话存储**：所有对话都自动与完整的消息历史一起保存在本地
2. **消息反序列化**：恢复时，整个消息历史被恢复以保持上下文
3. **工具状态**：保留之前对话中的工具使用和结果
4. **上下文恢复**：对话以所有之前的上下文完整恢复

**示例：**

```bash
# 继续最近的对话
codebuddy --continue

# 用特定提示继续最近的对话
codebuddy --continue --print "显示我们的进度"

# 显示对话选择器
codebuddy --resume

# 在非交互模式下继续最近的对话
codebuddy --continue --print "再次运行测试"
```

---

## 使用 Git Worktrees 运行并行 CodeBuddy Code 会话

假设您需要同时处理多个任务，并在 CodeBuddy Code 实例之间完全隔离代码。

**步骤：**

1. **了解 Git worktrees**
   Git worktrees 允许您将同一仓库的多个分支检出到单独的目录中。每个 worktree 都有自己的工作目录和隔离的文件,同时共享相同的 Git 历史。在[官方 Git worktree 文档](https://git-scm.com/docs/git-worktree)中了解更多。

2. **创建新的 worktree**
   ```bash
   # 用新分支创建新 worktree
   git worktree add ../project-feature-a -b feature-a

   # 或用现有分支创建 worktree
   git worktree add ../project-bugfix bugfix-123
   ```

   这会创建一个新目录，其中包含仓库的单独工作副本。

3. **在每个 worktree 中运行 CodeBuddy Code**
   ```bash
   # 导航到您的 worktree
   cd ../project-feature-a

   # 在这个隔离环境中运行 CodeBuddy Code
   codebuddy
   ```

4. **在另一个 worktree 中运行 CodeBuddy**
   ```bash
   cd ../project-bugfix
   codebuddy
   ```

5. **管理您的 worktrees**
   ```bash
   # 列出所有 worktrees
   git worktree list

   # 完成后删除 worktree
   git worktree remove ../project-feature-a
   ```

**最佳实践：**

- 每个 worktree 都有自己独立的文件状态，非常适合并行 CodeBuddy Code 会话
- 一个 worktree 中的更改不会影响其他 worktree,防止 CodeBuddy 实例相互干扰
- 所有 worktrees 共享相同的 Git 历史和远程连接
- 对于长时间运行的任务，您可以让 CodeBuddy 在一个 worktree 中工作，而在另一个中继续开发
- 使用描述性目录名称轻松识别每个 worktree 用于哪个任务
- 记得根据项目设置在每个新 worktree 中初始化开发环境。根据您的技术栈，这可能包括：
  - JavaScript 项目： 运行依赖安装(`npm install`、`yarn`)
  - Python 项目： 设置虚拟环境或使用包管理器安装
  - 其他语言： 遵循项目的标准设置过程

---

## 将 CodeBuddy 用作 Unix 风格实用程序

### 将 CodeBuddy 添加到验证流程

假设您想将 CodeBuddy Code 用作 linter 或代码审查员。

**将 CodeBuddy 添加到构建脚本：**

```json
// package.json
{
    ...
    "scripts": {
        ...
        "lint:codebuddy": "codebuddy -p '你是一个 linter。请查看相对于 main 的更改并报告任何与拼写错误相关的问题。在一行上报告文件名和行号，在第二行上报告问题描述。不要返回任何其他文本。'"
    }
}
```

**最佳实践：**

- 在 CI/CD 管道中使用 CodeBuddy 进行自动代码审查
- 自定义提示以检查与项目相关的特定问题
- 考虑为不同类型的验证创建多个脚本

### 管道输入输出

假设您想将数据通过管道传输到 CodeBuddy,并以结构化格式获取数据。

**通过 CodeBuddy 传输数据：**

```bash
cat build-error.txt | codebuddy -p '简洁地解释此构建错误的根本原因' > output.txt
```

**最佳实践：**

- 使用管道将 CodeBuddy 集成到现有的 shell 脚本中
- 与其他 Unix 工具结合以实现强大的工作流
- 考虑使用 --output-format 获得结构化输出

### 控制输出格式

假设您需要 CodeBuddy 的输出采用特定格式，特别是在将 CodeBuddy Code 集成到脚本或其他工具时。

**步骤：**

1. **使用文本格式（默认）**
   ```bash
   cat data.txt | codebuddy -p '总结这些数据' --output-format text > summary.txt
   ```

   这只输出 CodeBuddy 的纯文本响应（默认行为）。

2. **使用 JSON 格式**
   ```bash
   cat code.py | codebuddy -p '分析此代码的 bug' --output-format json > analysis.json
   ```

   这会输出包含元数据（包括成本和持续时间）的消息 JSON 数组。

3. **使用流式 JSON 格式**
   ```bash
   cat log.txt | codebuddy -p '解析此日志文件的错误' --output-format stream-json
   ```

   这会在 CodeBuddy 处理请求时实时输出一系列 JSON 对象。每条消息都是有效的 JSON 对象，但如果连接起来，整个输出不是有效的 JSON。

**最佳实践：**

- 对于只需要 CodeBuddy 响应的简单集成，使用 `--output-format text`
- 当您需要完整的对话日志时，使用 `--output-format json`
- 对于每个对话轮次的实时输出，使用 `--output-format stream-json`

---

## 创建自定义斜杠命令

CodeBuddy Code 支持自定义斜杠命令，您可以创建这些命令来快速执行特定提示或任务。

有关更多详细信息，请参见[斜杠命令](./slash-commands.md)参考页面。

### 创建项目特定命令

假设您想为项目创建可重用的斜杠命令，以便所有团队成员都可以使用。

**步骤：**

1. **在项目中创建命令目录**
   ```bash
   mkdir -p .codebuddy/commands
   ```

2. **为每个命令创建 Markdown 文件**
   ```bash
   echo "分析此代码的性能并建议三个具体的优化:" > .codebuddy/commands/optimize.md
   ```

3. **在 CodeBuddy Code 中使用自定义命令**
   ```
   > /optimize
   ```

**最佳实践：**

- 命令名称源自文件名（例如，`optimize.md` 变成 `/optimize`)
- 您可以在子目录中组织命令（例如，`.codebuddy/commands/frontend/component.md` 创建 `/component`,描述中显示"(project:frontend)")
- 项目命令对克隆仓库的每个人都可用
- Markdown 文件内容成为调用命令时发送给 CodeBuddy 的提示

### 使用 $ARGUMENTS 添加命令参数

假设您想创建可以接受用户额外输入的灵活斜杠命令。

**步骤：**

1. **创建带 $ARGUMENTS 占位符的命令文件**
   ```bash
   echo '查找并修复问题 #$ARGUMENTS。按照以下步骤: 1. 理解工单中描述的问题 2. 在代码库中定位相关代码 3. 实现解决根本原因的方案 4. 添加适当的测试 5. 准备简洁的 MR 描述' > .codebuddy/commands/fix-issue.md
   ```

2. **使用带问题编号的命令**
   在 CodeBuddy 会话中，使用带参数的命令。

   ```
   > /fix-issue 123
   ```

   这会将提示中的 $ARGUMENTS 替换为"123"。

**最佳实践：**

- $ARGUMENTS 占位符会被命令后面的任何文本替换
- 您可以在命令模板中的任何位置放置 $ARGUMENTS
- 其他有用的应用： 为特定函数生成测试用例、为组件创建文档、审查特定文件中的代码或将内容翻译成指定语言

### 创建个人斜杠命令

假设您想创建在所有项目中都有效的个人斜杠命令。

**步骤：**

1. **在主目录中创建命令目录**
   ```bash
   mkdir -p ~/.codebuddy/commands
   ```

2. **为每个命令创建 Markdown 文件**
   ```bash
   echo "审查此代码的安全漏洞,重点关注:" > ~/.codebuddy/commands/security-review.md
   ```

3. **使用您的个人自定义命令**
   ```
   > /security-review
   ```

**最佳实践：**

- 用 `/help` 列出时，个人命令在描述中显示"(user)"
- 个人命令仅对您可用，不与团队共享
- 个人命令在所有项目中都有效
- 您可以使用这些命令在不同代码库中保持一致的工作流

---

## 直接让 CodeBuddy Code 帮你完成配置

假设您需要配置 Bash 超时、创建自定义 Skill、设置 Git Hook 或调整 CodeBuddy 的各种行为，但不想花时间查找文档或手动编辑配置文件。

**步骤:**

1. **直接询问配置方法**
   ```
   > 参考 CodeBuddy Code 官方文档，如何配置 Bash 命令的超时时间？
   ```

   CodeBuddy 会查阅官方文档并解释具体的配置方法，包括：
   - 配置文件的位置
   - 具体的配置项名称和格式
   - 可用的配置选项和默认值
   - 配置生效的方式

2. **让 CodeBuddy 帮你完成配置**
   ```
   > 参考 CodeBuddy Code 官方文档，把 Bash 超时改成 30 分钟
   ```

   CodeBuddy 会：
   - 查找当前的配置文件
   - 按照官方推荐的方式修改配置
   - 验证配置语法是否正确
   - 提示配置生效的方式(如需要重启等)

3. **调整输出语言和格式**
   ```
   > 参考 CodeBuddy Code 官方文档，如何把输出调整为中文？
   ```

   CodeBuddy 会解释：
   - 如何在用户级或项目级 CODEBUDDY.md 中配置语言偏好
   - 具体的配置示例和语法
   - 配置的优先级和继承规则
   - 如何验证配置是否生效

   ```
   > 参考 CodeBuddy Code 官方文档，如何让 CodeBuddy 的回答更简洁？
   ```

4. **创建自定义 Skill**
   ```
   > 参考 CodeBuddy Code 官方文档，帮我创建一个 PDF 处理的 Skill
   ```

   CodeBuddy 会：
   - 创建 `.codebuddy/skills/pdf/` 目录
   - 生成符合官方规范的 `SKILL.md` 文件
   - 配置合适的工具权限
   - 添加必要的元数据和描述
   - 提供使用示例

5. **配置 Git Hook**
   ```
   > 参考 CodeBuddy Code 官方文档，配置一个 Git 提交前的代码检查 Hook
   ```

   CodeBuddy 会根据你的项目类型创建相应的 Hook 配置，包括：
   - Hook 的触发时机和条件
   - Hook 执行的具体命令
   - 错误处理和日志记录
   - 如何临时跳过 Hook

6. **配置 MCP 服务器**
   ```
   > 参考 CodeBuddy Code 官方文档，如何配置 GitHub MCP 服务器？
   ```

   CodeBuddy 会：
   - 解释 MCP 的工作原理
   - 生成配置文件
   - 配置认证信息
   - 测试连接是否正常

7. **验证配置**
   ```
   > 参考 CodeBuddy Code 官方文档，检查我的 Bash 超时配置是否正确
   ```

   ```
   > 参考 CodeBuddy Code 官方文档，验证我的 MCP 服务器配置
   ```

**最佳实践:**

- 直接告诉 CodeBuddy 你想要什么，加上"参考 CodeBuddy Code 官方文档"前缀确保获得准确信息
- 让 CodeBuddy 生成配置文件，而不是手动编写，避免语法错误
- 配置完成后让 CodeBuddy 验证是否正确，确保配置生效
- 询问配置的优先级和继承规则，理解复杂配置场景
- 只有在 CodeBuddy 无法解决时，才需要查阅更深入的文档或联系技术支持

**常见配置示例:**

```
> 参考 CodeBuddy Code 官方文档，帮我创建一个代码审查的用户级 Skill
```

```
> 参考 CodeBuddy Code 官方文档，如何设置默认权限模式为计划模式？
```

```
> 参考 CodeBuddy Code 官方文档，创建一个自定义斜杠命令来运行测试
```

```
> 参考 CodeBuddy Code 官方文档，Git Worktree 怎么配合 CodeBuddy Code 使用？
```

```
> 参考 CodeBuddy Code 官方文档，如何配置自定义模型提供商？
```

```
> 参考 CodeBuddy Code 官方文档，如何禁用某些工具的使用？
```

```
> 参考 CodeBuddy Code 官方文档，如何配置代理服务器？
```

```
> 参考 CodeBuddy Code 官方文档，如何自定义工具使用的快捷键？
```
---

## 询问 CodeBuddy 的功能

CodeBuddy 内置了对其官方文档的访问，可以回答关于自己功能、限制和最佳实践的问题。在询问时加上"参考 CodeBuddy Code 官方文档"前缀，可以确保获得准确的官方信息。

**功能查询示例:**

```
> 参考 CodeBuddy Code 官方文档，CodeBuddy Code 可以创建合并请求吗？
```

```
> 参考 CodeBuddy Code 官方文档，CodeBuddy Code 如何处理权限？
```

```
> 参考 CodeBuddy Code 官方文档，有哪些斜杠命令可用？
```

```
> 参考 CodeBuddy Code 官方文档，如何在 CodeBuddy Code 中使用 MCP？
```

```
> 参考 CodeBuddy Code 官方文档，如何为 Amazon Bedrock 配置 CodeBuddy Code？
```

```
> 参考 CodeBuddy Code 官方文档，CodeBuddy Code 有哪些限制？
```

**配置和集成查询:**

```
> 参考 CodeBuddy Code 官方文档，如何把输出调整为中文？
```

```
> 参考 CodeBuddy Code 官方文档，如何配置代理服务器？
```

```
> 参考 CodeBuddy Code 官方文档，支持哪些模型提供商？
```

```
> 参考 CodeBuddy Code 官方文档，如何在 CI/CD 中使用 CodeBuddy Code？
```

```
> 参考 CodeBuddy Code 官方文档，如何配置企业部署？
```

**高级功能查询:**

```
> 参考 CodeBuddy Code 官方文档，子代理系统是如何工作的？
```

```
> 参考 CodeBuddy Code 官方文档，如何创建自定义 Skill？
```

```
> 参考 CodeBuddy Code 官方文档，Hook 系统支持哪些事件？
```

```
> 参考 CodeBuddy Code 官方文档，如何使用思考模式？
```

```
> 参考 CodeBuddy Code 官方文档，计划模式和普通模式有什么区别？
```

**工作流和最佳实践查询:**

```
> 参考 CodeBuddy Code 官方文档，处理大型代码库的最佳实践是什么？
```

```
> 参考 CodeBuddy Code 官方文档，如何优化 token 使用？
```

```
> 参考 CodeBuddy Code 官方文档，如何在团队中共享配置？
```

```
> 参考 CodeBuddy Code 官方文档，如何处理敏感信息？
```

```
> 参考 CodeBuddy Code 官方文档，并行运行多个会话的最佳方法是什么？
```

**最佳实践:**

- 使用"参考 CodeBuddy Code 官方文档"前缀确保获得准确的官方信息
- CodeBuddy 始终可以访问最新的 CodeBuddy Code 文档，无论您使用的版本如何
- 提出具体问题以获得详细答案，可以询问：
  - 功能特性和使用方法
  - 配置选项和语法
  - 最佳实践和注意事项
  - 限制和已知问题
  - 集成和扩展方式
- CodeBuddy 可以解释复杂功能，如 MCP 集成、企业配置和高级工作流
- 不仅可以问"是什么"，还可以直接让 CodeBuddy 帮你"做什么"
- 如果对某个功能不确定，先询问官方文档再开始配置

---

## 下一步

**[CLI 参考](./cli-reference.md)** - 完整的命令行参数和选项
**[交互模式](./interactive-mode.md)** - 掌握键盘快捷键和技巧
**[斜杠命令](./slash-commands.md)** - 了解内置命令
**[Skills 技能系统](./skills.md)** - 扩展 AI 专业能力
**[MCP 集成](./mcp.md)** - 扩展工具能力

---

*掌握这些工作流程，让 CodeBuddy Code 成为您最得力的开发助手*
