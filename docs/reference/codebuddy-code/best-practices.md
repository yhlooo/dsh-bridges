> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/best-practices.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# CodeBuddy Code 最佳实践

> 从环境配置到并行扩展，掌握让 CodeBuddy Code 发挥最大效能的技巧与模式。

CodeBuddy Code 是一个智能编程环境。与传统的问答式助手不同，CodeBuddy Code 能够读取文件、执行命令、修改代码，无论您是在旁观察、适时引导，还是离开去做其他事，它都能自主解决问题。

这将改变您的工作方式——您不再需要自己编写代码然后请求审查，而是描述目标，让 CodeBuddy Code 去探索、规划并实现。

本指南汇集了在各类代码库、语言和环境中经过验证的实践模式。

---

## 核心原则：管理上下文窗口

大多数最佳实践都围绕一个核心约束：**CodeBuddy Code 的上下文窗口会逐渐填满，性能也会随之下降**。

上下文窗口承载着整个对话——包括每条消息、CodeBuddy Code 读取的每个文件、每个命令的输出。一次调试会话或代码库探索就可能消耗数万个 token。

这很关键——当上下文接近饱和时，CodeBuddy Code 可能会"遗忘"早期的指令，或更频繁地出错。上下文窗口是您需要管理的最重要资源。

---

## 给 CodeBuddy Code 验证自己工作的方法

> **核心建议**：提供测试用例、截图或预期输出，让 CodeBuddy Code 能够自我检验。这是提升效果最立竿见影的方法。

当 CodeBuddy Code 能够验证自己的工作时，表现会显著提升——无论是运行测试、对比截图，还是校验输出结果。

如果没有明确的成功标准，它可能产出看似正确但实际无效的代码。这时您就成了唯一能发现问题的人，每个错误都需要您亲自排查。

| 策略 | 改进前 | 改进后 |
|------|--------|--------|
| **提供验证标准** | *"写一个检查手机号格式的函数"* | *"写一个 validatePhone 函数。测试用例：13812345678 返回 true，12345 返回 false，138-1234-5678 返回 false。实现后运行测试"* |
| **视觉验证 UI 变更** | *"优化一下这个表格的样式"* | *"[粘贴截图] 按这个设计稿实现。完成后截图对比原图，列出差异并修复"* |
| **解决根本原因** | *"编译报错了"* | *"编译失败，错误信息：[粘贴错误]。找出根本原因并修复，不要只是绕过错误。修复后确认编译通过"* |

验证手段可以是测试套件、linter，或者一个检查输出的 Bash 命令。花点时间让验证足够可靠，值得。

---

## 先探索，再规划，后编码

> **核心建议**：把研究、规划和实现分开进行，避免解决错误的问题。

直接让 CodeBuddy Code 动手写代码，可能产出解决错误问题的代码。使用计划模式，将探索与执行分离。

推荐的工作流程分为四个阶段：

### 1. 探索

进入计划模式。CodeBuddy Code 只读取文件、回答问题，不做任何修改。

```
> 读一下 src/payment 目录，弄清楚我们是怎么处理订单和退款的。
> 顺便看看支付相关的配置是怎么管理的。
```

### 2. 规划

让 CodeBuddy Code 输出详细的实现计划。

```
> 我想接入微信支付。需要改哪些文件？支付流程是怎样的？给我一个详细计划。
```

按 `Ctrl+G` 在文本编辑器中打开计划，在 CodeBuddy Code 继续之前可以直接编辑。

### 3. 实现

切换回普通模式，让 CodeBuddy Code 按计划编码，边做边验证。

```
> 按你的计划实现微信支付流程。为回调通知写测试，跑一遍测试套件，有失败的就修。
```

### 4. 提交

让 CodeBuddy Code 提交代码并创建 MR。

```
> 写个清晰的提交信息，然后开个 MR
```

> **注意**：计划模式很有用，但也有额外开销。对于范围明确、改动很小的任务（如修复拼写错误、加一行日志、重命名变量），直接让 CodeBuddy Code 执行即可。当您对方法不确定、变更涉及多个文件、或对要改的代码不够熟悉时，计划模式才最有价值。

---

## 在提示中提供具体上下文

> **核心建议**：指令越精确，后续纠正就越少。

CodeBuddy Code 能推断意图，但不会读心。引用具体文件，说明约束条件，指向示例代码。

| 策略 | 改进前 | 改进后 |
|------|--------|--------|
| **限定任务范围** | *"给 user_service.py 加测试"* | *"给 user_service.py 写测试，重点覆盖用户注销的边缘情况，不要用 mock"* |
| **指向来源** | *"为什么 OrderProcessor 的接口设计这么奇怪？"* | *"查一下 OrderProcessor 的 git 历史，总结这个接口是怎么演变成现在这样的"* |
| **引用现有模式** | *"加一个搜索组件"* | *"看看 src/components 里现有组件是怎么写的，特别是 ProductCard.vue 这个例子。按同样的模式实现一个搜索组件，支持关键词高亮和历史记录。只用项目里已有的依赖"* |
| **描述症状** | *"登录有 bug"* | *"用户反馈 token 过期后重新登录会失败。查一下 src/auth/ 的认证流程，重点看 token 刷新逻辑。先写个能复现问题的测试，再修复"* |

模糊提示在探索阶段也有用，允许反复尝试。像 `"这个文件你觉得哪些地方可以改进？"` 这样的提示，往往能发现一些你没想到的问题。

### 提供丰富内容

> **核心建议**：用 `@` 引用文件，粘贴截图，或通过管道输入数据。

您可以通过多种方式向 CodeBuddy Code 提供丰富的上下文：

- **用 `@` 引用文件**：CodeBuddy Code 在回复前会先读取文件，不用您描述代码在哪
- **直接粘贴图片**：复制/粘贴或拖放图片到输入框
- **提供 URL**：文档和 API 参考的链接。用 `/permissions` 可以允许常用域名
- **管道输入数据**：运行 `cat error.log | codebuddy` 直接把文件内容喂给它
- **让 CodeBuddy Code 自己取**：告诉它用 Bash 命令、MCP 工具或读文件来获取所需上下文

---

## 配置您的环境

一些简单的配置步骤，就能让 CodeBuddy Code 在所有会话中更加高效。

### 设置首选语言

如果您希望 CodeBuddy Code 始终使用特定语言回复（如简体中文），可以通过 `/config` 命令设置 Language 选项：

```
> /config
# 选择 Language，输入您的首选语言，如"简体中文"
```

或者直接在 `~/.codebuddy/settings.json` 中配置：

```json
{
  "language": "简体中文"
}
```

设置后，CodeBuddy Code 会使用指定语言进行所有回复和解释，技术术语和代码标识符保持原样。留空则自动根据您的输入语言判断。

### 编写有效的 CODEBUDDY.md

> **核心建议**：运行 `/init` 基于当前项目结构生成初始 CODEBUDDY.md，然后逐步完善。

CODEBUDDY.md 是 CodeBuddy Code 每次对话开始时都会读取的特殊文件，里面包含常用命令、代码风格和工作流规则。它为 CodeBuddy Code 提供了**无法从代码本身推断出的**持久上下文。

`/init` 命令会分析您的代码库，检测构建系统、测试框架和代码模式，为您生成一个可以继续完善的基础版本。

CODEBUDDY.md 没有固定格式，保持简短、易读就好。例如：

```markdown
# 代码风格
- 使用 ES 模块语法 (import/export)，不用 CommonJS (require)
- 导入时尽量解构 (如 import { foo } from 'bar')

# 工作流
- 改完代码记得跑一遍类型检查
- 优先跑单个测试文件，别动不动就跑整个测试套件
```

CODEBUDDY.md 每次会话都会加载，所以只放那些普遍适用的内容。对于只在特定场景下才相关的领域知识或工作流，用 [Skills](skills.md) 代替——CodeBuddy Code 会按需加载它们，不会让每次对话都变得臃肿。

保持精简。写每一行时问问自己：*"不写这行，CodeBuddy Code 会犯错吗？"* 如果不会，就删掉。CODEBUDDY.md 太长的话，CodeBuddy Code 反而会忽略你真正重要的指令。

| 应该写 | 不应该写 |
|--------|----------|
| CodeBuddy Code 猜不到的命令 | 读代码就能搞清楚的东西 |
| 和默认习惯不同的代码风格 | 标准的语言约定 |
| 测试说明和首选的测试运行器 | 详细的 API 文档（放链接就行） |
| 仓库规范（分支命名、MR 约定） | 经常变化的信息 |
| 项目特有的架构决策 | 长篇大论的解释或教程 |
| 开发环境的坑（必需的环境变量等） | 逐文件的代码描述 |
| 常见陷阱或不明显的行为 | "写干净的代码"之类的废话 |

如果 CodeBuddy Code 有规则却还是不照做，可能是文件太长、规则被淹没了。如果 CodeBuddy Code 问的问题明明 CODEBUDDY.md 里有答案，可能是措辞有歧义。像对待代码一样对待 CODEBUDDY.md：出问题就检查，定期精简，观察改动后 CodeBuddy Code 的行为是否真的变了。

可以用强调词（如 "IMPORTANT" 或 "必须"）来提高遵守度。把 CODEBUDDY.md 提交到 git，让团队一起维护。这个文件的价值会随时间积累。

CODEBUDDY.md 支持用 `@path/to/file` 语法导入其他文件：

```markdown
查看 @README.md 了解项目概述，@package.json 了解可用的 npm 命令。

# 补充说明
- Git 工作流：@docs/git-workflow.md
- 个人配置：@~/.codebuddy/my-overrides.md
```

CODEBUDDY.md 可以放在多个位置：

- **主目录 (`~/.codebuddy/CODEBUDDY.md`)**：对所有 CodeBuddy Code 会话生效
- **项目根目录 (`./CODEBUDDY.md`)**：提交到 git 与团队共享；或命名为 `CODEBUDDY.local.md` 并加到 `.gitignore`
- **父目录**：适合 monorepo，`root/CODEBUDDY.md` 和 `root/packages/foo/CODEBUDDY.md` 都会自动加载
- **子目录**：当 CodeBuddy Code 处理该子目录的文件时，会按需加载

### 配置权限

> **核心建议**：用 `/permissions` 允许安全的命令，或用 `/sandbox` 启用系统级隔离。减少打断的同时保持控制。

默认情况下，CodeBuddy Code 对可能修改系统的操作都会请求权限：写文件、执行命令、调用 MCP 工具等。虽然安全，但频繁确认很烦。批准到第十次的时候，你其实已经不看了，只是机械地点通过。有两种方法减少这种打断：

- **权限白名单**：允许你确认安全的特定命令（如 `npm run lint` 或 `git commit`）
- **沙箱模式**：启用系统级隔离，限制文件系统和网络访问，让 CodeBuddy Code 在定义好的边界内更自由地工作

也可以用 `--dangerously-skip-permissions` 跳过所有权限检查，适合封闭的工作流，如修复 lint 错误或生成样板代码。

> **警告**：让 CodeBuddy Code 随意执行命令可能导致数据丢失、系统损坏，或通过提示注入泄露数据。`--dangerously-skip-permissions` 只应在没有网络的沙箱环境中使用。

详细了解[配置权限](settings.md)和[启用沙箱](bash-sandboxing.md)。

### 使用 CLI 工具

> **核心建议**：与外部服务交互时，让 CodeBuddy Code 使用 CLI 工具，如 `gh`、`glab`、`sentry-cli` 等。

CLI 工具是与外部服务交互最省上下文的方式。如果您用 GitHub 或 GitLab，装好对应的 CLI 就行。CodeBuddy Code 知道怎么用它来创建 issue、开 MR、读评论。没有 CLI 的话，CodeBuddy Code 也能直接调 API，但未认证的请求很容易触发限流。

CodeBuddy Code 也很擅长学习陌生的 CLI 工具。试试这样的提示：`先用 'some-cli --help' 了解一下这个工具，然后用它完成 X、Y、Z。`

### 连接 MCP 服务器

> **核心建议**：运行 `codebuddy mcp add` 连接外部工具，如 Notion、Figma 或数据库。

通过 [MCP 服务器](mcp.md)，CodeBuddy Code 可以直接从 issue 系统拉取需求、查询数据库、分析监控数据、集成 Figma 设计稿，实现工作流自动化。

### 设置 Hooks

> **核心建议**：对于必须每次都执行、不能有例外的操作，用 hooks。

[Hooks](hooks-guide.md) 会在 CodeBuddy Code 工作流的特定节点自动运行脚本。与 CODEBUDDY.md 里的指令不同（那些只是"建议"），hooks 是确定性的，保证一定会执行。

CodeBuddy Code 可以帮您写 hooks。试试这样的提示：*"写一个 hook，每次编辑文件后自动跑 eslint"* 或 *"写一个 hook，阻止对 migrations 目录的写入"*。运行 `/hooks` 可以交互式配置，或者直接编辑 `.codebuddy/settings.json`。

### 创建 Skills

> **核心建议**：在 `.codebuddy/skills/` 目录下创建 `SKILL.md` 文件，给 CodeBuddy Code 补充领域知识和可复用的工作流。

[Skills](skills.md) 可以用项目、团队或领域特定的信息来扩展 CodeBuddy Code 的能力。CodeBuddy Code 会在相关场景自动应用它们，您也可以用 `/skill-name` 手动调用。

在 `.codebuddy/skills/` 下新建一个目录，放入 `SKILL.md` 即可创建技能：

```markdown
# .codebuddy/skills/api-conventions/SKILL.md
---
name: api-conventions
description: 我们服务的 REST API 设计规范
---
# API 规范
- URL 路径用 kebab-case
- JSON 字段用 camelCase
- 列表接口必须支持分页
- API 版本放在 URL 路径里 (/v1/, /v2/)
```

Skills 也可以定义可重复执行的工作流：

```markdown
# .codebuddy/skills/fix-issue/SKILL.md
---
name: fix-issue
description: 修复 GitLab issue
disable-model-invocation: true
---
分析并修复 GitLab issue：$ARGUMENTS。

1. 用 `glab issue view` 获取 issue 详情
2. 理解问题描述
3. 在代码库里搜索相关文件
4. 实现修复
5. 写测试并运行验证
6. 确保 lint 和类型检查通过
7. 写好提交信息
8. 推送并创建 MR
```

运行 `/fix-issue 1234` 来调用。对于有副作用的工作流，加上 `disable-model-invocation: true`，确保只能手动触发。

### 创建自定义子代理

> **核心建议**：在 `.codebuddy/agents/` 中定义专门的助手，CodeBuddy Code 可以把特定任务委派给它们。

[子代理](sub-agents.md)在独立的上下文中运行，有自己的工具权限集。适合需要读取大量文件或需要专注执行的任务，不会干扰您的主对话。

```markdown
# .codebuddy/agents/security-reviewer.md
---
name: security-reviewer
description: 审查代码安全漏洞
tools: Read, Grep, Glob, Bash
model: claude-sonnet-4-20250514
---
你是一名资深安全工程师。审查代码时重点关注：
- 注入漏洞（SQL 注入、XSS、命令注入）
- 认证和授权缺陷
- 代码中硬编码的密钥或凭据
- 不安全的数据处理

给出具体的行号和修复建议。
```

明确告诉 CodeBuddy Code 使用子代理：*"用子代理审查一下这段代码的安全问题。"*

### 安装插件

> **核心建议**：运行 `/plugin` 浏览插件市场。插件可以一键添加技能、工具和集成，无需额外配置。

[插件](plugins.md)把技能、hooks、子代理和 MCP 服务器打包成一个可安装的单元，由社区和官方提供。如果您用的是类型化语言，可以安装代码智能插件，让 CodeBuddy Code 获得精确的符号导航能力，并在编辑后自动检测错误。

关于如何在技能、子代理、hooks 和 MCP 之间做选择，请参阅[扩展 CodeBuddy Code](plugins.md)。

---

## 有效沟通

您与 CodeBuddy Code 的沟通方式直接影响输出质量。

### 向代码库提问

> **核心建议**：像问一位资深工程师那样问 CodeBuddy Code。

熟悉新代码库时，把 CodeBuddy Code 当作学习和探索的工具。您可以问它那些原本要问同事的问题：

- 日志系统是怎么工作的？
- 怎么新建一个 API 接口？
- handler.go 第 78 行的 `defer func() { ... }()` 是干嘛的？
- PaymentService 处理了哪些边缘情况？
- 为什么这里调用的是 `processAsync()` 而不是 `processSync()`？

这是很高效的入职方式——缩短上手时间，减少对同事的打扰。不需要什么特殊技巧，直接问就好。

### 让 CodeBuddy Code 采访您

> **核心建议**：做大功能之前，先让 CodeBuddy Code 采访您。从简短描述开始，让它用 AskUserQuestion 工具来深挖细节。

CodeBuddy Code 会问一些您可能没想到的问题，涵盖技术实现、用户体验、边缘情况和各种取舍。

```
我想做一个 [简要描述]。用 AskUserQuestion 工具详细采访我。

问技术方案、用户体验、边缘情况、潜在风险和权衡。别问显而易见的问题，深挖那些我可能没考虑到的难点。

一直问到我们把所有方面都覆盖了，然后把完整的需求规格写到 SPEC.md。
```

规格写完后，开一个新会话来实现它。新会话有干净的上下文，可以专注于实现，而且您有书面规格可以随时参考。

---

## 管理您的会话

对话是持久的，也是可回退的。善用这一点！

### 及早纠正，经常纠正

> **核心建议**：一发现 CodeBuddy Code 跑偏了，立刻纠正。

好结果来自紧密的反馈循环。虽然 CodeBuddy Code 有时能一次搞定，但快速纠正往往能更快地得到更好的方案。

- **`Esc`**：按 `Esc` 键可以中途打断 CodeBuddy Code。上下文会保留，您可以重新引导方向
- **`Esc + Esc` 或 `/rewind`**：连按两次 `Esc` 或运行 `/rewind` 打开回退菜单，恢复到之前的对话和代码状态
- **"撤销刚才的改动"**：让 CodeBuddy Code 回滚它的修改
- **`/clear`**：在不相关的任务之间清空上下文。上下文里塞太多无关内容会拖慢效率

如果同一个问题您已经纠正了两次还是不对，说明上下文里已经堆满了失败的尝试。这时候运行 `/clear`，用一个更清晰的提示重新开始，把学到的东西融入进去。干净的会话配上更好的提示，几乎总是比不断追加纠正的长会话效果更好。

### 主动管理上下文

> **核心建议**：任务切换时运行 `/clear` 清空上下文。

当上下文快满的时候，CodeBuddy Code 会自动压缩对话历史，保留重要的代码和决策，释放空间。

长会话中，CodeBuddy Code 的上下文窗口可能被无关的对话、文件内容和命令输出塞满。这会拖慢效率，有时还会分散它的注意力。

- 任务之间多用 `/clear` 彻底清空上下文
- 自动压缩触发时，CodeBuddy Code 会总结最重要的内容，包括代码模式、文件状态和关键决策
- 想要更精细的控制，可以运行 `/compact <指令>`，比如 `/compact 只保留 API 相关的改动`
- 也可以在 CODEBUDDY.md 里指定压缩规则，比如 `"压缩时，始终保留修改过的文件列表和测试命令"`，确保关键上下文不丢失

### 用子代理做调研

> **核心建议**：用 `"派个子代理调查一下 X"` 来委托调研任务。子代理在独立的上下文中工作，不会污染您的主对话。

上下文是核心瓶颈，子代理是应对这一问题最强大的工具之一。当 CodeBuddy Code 研究代码库时，会读取大量文件，这些都在消耗您的上下文。子代理在独立的上下文窗口中运行，最后只返回摘要：

```
派个子代理调查一下我们的认证系统是怎么处理 token 刷新的，
还有看看有没有现成的 OAuth 工具可以复用。
```

子代理会深入代码库，读取相关文件，然后汇报发现——整个过程不会干扰您的主对话。

您也可以在 CodeBuddy Code 实现完某个功能后，用子代理来做验证：

```
派个子代理检查一下这段代码的边缘情况
```

### 利用检查点回退

> **核心建议**：CodeBuddy Code 的每个操作都会创建检查点。您可以把对话、代码或两者一起恢复到任意历史状态。

CodeBuddy Code 在做修改前会自动创建检查点。连按两次 `Escape` 或运行 `/rewind` 打开检查点菜单。您可以选择：只恢复对话（保留代码改动）、只恢复代码（保留对话）、或者两者都恢复。

不需要小心翼翼地规划每一步——您尽可以让 CodeBuddy Code 尝试一些冒险的做法。如果不行，回退后换个思路再试。检查点跨会话持久化，所以您可以关掉终端，回来后仍然能回退。

> **警告**：检查点只追踪 *CodeBuddy Code* 做的改动，不追踪外部进程。它不能替代 git。

### 恢复对话

> **核心建议**：运行 `codebuddy --continue` 继续上次的对话，或用 `--resume` 从最近的会话中选一个。

CodeBuddy Code 会把对话保存在本地。当一个任务跨越多次工作时（比如开始做一个功能，被打断了，第二天回来继续），您不必从头解释上下文：

```bash
codebuddy --continue    # 继续最近的对话
codebuddy --resume      # 从历史会话中选择
```

用 `/rename` 给会话起个有意义的名字（比如 `"支付重构"`、`"内存泄漏排查"`），方便以后找。像管理 git 分支一样管理会话——不同的工作线可以有各自独立、持久的上下文。

---

## 自动化与扩展

当您能高效使用一个 CodeBuddy Code 之后，可以通过并行会话、无头模式和脚本编排来成倍提升产出。

前面所有内容都假设是"一个人、一个 CodeBuddy Code、一个对话"的场景。但 CodeBuddy Code 可以水平扩展。这一节介绍如何做更多事。

### 无头模式

> **核心建议**：在 CI、pre-commit hooks 或脚本中使用 `codebuddy -p "prompt"`。加上 `--output-format stream-json` 可以获得流式 JSON 输出。

用 `codebuddy -p "您的提示"` 可以无头运行 CodeBuddy Code，不需要交互式会话。这是把 CodeBuddy Code 集成到 CI 流水线、pre-commit hooks 或任何自动化工作流的方式。输出格式（纯文本、JSON、流式 JSON）让您可以程序化地解析结果。

```bash
# 一次性查询
codebuddy -p "解释一下这个项目是做什么的"

# 结构化输出，方便脚本处理
codebuddy -p "列出所有 API 端点" --output-format json

# 流式输出，实时处理
codebuddy -p "分析这个日志文件" --output-format stream-json
```

### 多会话并行

> **核心建议**：并行运行多个 CodeBuddy Code 会话，可以加速开发、做隔离实验，或启动复杂工作流。

并行会话有两种主要方式：

- **多终端窗口**：在不同目录启动多个 CodeBuddy Code 实例
- **Git Worktrees**：每个会话在独立的 worktree 中工作

除了并行加速，多会话还能实现质量导向的工作流。新鲜的上下文有助于代码审查——因为 CodeBuddy Code 不会对自己刚写的代码有偏见。

例如，"写代码/审代码"模式：

| 会话 A（写代码） | 会话 B（审代码） |
|------------------|------------------|
| `给 API 端点实现一个限流中间件` | |
| | `审查 @src/middleware/rateLimiter.ts 里的限流器实现。找边缘情况、竞态条件，检查和现有中间件模式是否一致。` |
| `这是审查意见：[会话 B 的输出]。处理一下这些问题。` | |

测试也可以这样做：让一个 CodeBuddy Code 写测试，另一个写代码来让测试通过。

### 脚本编排

> **核心建议**：循环遍历任务列表，每个任务调用一次 `codebuddy -p`。用 `--allowedTools` 限制批量操作的权限范围。

对于大规模迁移或批量分析，可以把工作分配给多个并行的 CodeBuddy Code 调用：

**1. 生成任务列表**

让 CodeBuddy Code 列出所有需要处理的文件（比如 `列出所有需要迁移的 2000 个 Python 文件`）

**2. 写脚本循环处理**

```bash
for file in $(cat files.txt); do
  codebuddy -p "把 $file 从 Class 组件迁移到 Hooks。返回 OK 或 FAIL。" \
    --allowedTools "Edit,Bash(git commit *)"
done
```

**3. 先小范围测试，再大规模运行**

根据前几个文件的执行情况调整提示，然后跑完整列表。`--allowedTools` 限制 CodeBuddy Code 能用的工具，这在无人值守时很重要。

也可以把 CodeBuddy Code 集成到现有的数据处理流水线里：

```bash
codebuddy -p "<您的提示>" --output-format json | your_command
```

开发时加 `--verbose` 方便调试，生产环境去掉。

### 安全的自主模式

用 `codebuddy --dangerously-skip-permissions` 可以跳过所有权限检查，让 CodeBuddy Code 不间断地工作。适合那些封闭的工作流，比如修复 lint 错误或生成样板代码。

> **警告**：让 CodeBuddy Code 随意执行命令有风险——可能导致数据丢失、系统损坏，或通过提示注入泄露数据。为了降低风险，请在没有网络访问的容器中使用 `--dangerously-skip-permissions`。
>
> 启用沙箱 (`/sandbox`) 后，您可以获得类似的自主性，但安全性更好。沙箱提前划定边界，而不是绕过所有检查。

---

## 避免常见的坑

这些是常见的失败模式。早点识别能省不少时间：

### 1. 无关上下文干扰

您从一个任务开始，中间问了 CodeBuddy Code 一些无关的事，然后又回到第一个任务。上下文里塞满了无关信息。

**解决方法**：任务切换时用 `/clear`。

### 2. 反复纠正

CodeBuddy Code 做错了，您纠正，还是错，再纠正。上下文被失败的尝试污染了。

**解决方法**：纠正两次还不行，就 `/clear` 然后写一个更好的提示，把学到的东西融入进去。

### 3. CODEBUDDY.md 写太多

CODEBUDDY.md 太长的话，CodeBuddy Code 会忽略一半，因为重要规则被淹没在噪音里了。

**解决方法**：狠心精简。如果没有这条规则 CodeBuddy Code 也做对了，就删掉它或者转成 hook。

### 4. 只信任不验证

CodeBuddy Code 产出的代码看起来没问题，但其实没处理边缘情况。

**解决方法**：始终提供验证手段（测试、脚本、截图）。验证不了的东西，别上线。

### 5. 无边界的探索

您让 CodeBuddy Code "调查一下"某个东西，但没限定范围。CodeBuddy Code 读了几百个文件，把上下文填满了。

**解决方法**：缩小调查范围，或者用子代理——这样探索不会消耗主对话的上下文。

---

## 培养您的直觉

本指南里的模式不是教条。它们是通常有效的起点，但未必是每种场景的最优解。

有时您*应该*让上下文积累——因为您正在深挖一个复杂问题，历史记录是有价值的。有时您应该跳过计划直接让 CodeBuddy Code 自己摸索——因为任务本身就是探索性的。有时模糊的提示恰好合适——因为您想先看看 CodeBuddy Code 怎么理解问题，再加约束。

留意什么方法有效。当 CodeBuddy Code 产出很棒的结果时，回想一下您做了什么：提示怎么写的、给了什么上下文、用的什么模式。当 CodeBuddy Code 表现挣扎时，问问为什么：上下文太乱？提示太模糊？任务太大一次吃不下？

随着时间推移，您会培养出任何指南都无法替代的直觉。您会知道什么时候该具体、什么时候该开放，什么时候该计划、什么时候该探索，什么时候该清空上下文、什么时候该让它继续积累。

---

## 相关资源

- **[快速入门](quickstart.md)** - 5 分钟上手
- **[常见工作流](common-workflows.md)** - 调试、测试、MR 等场景的分步指南
- **[CODEBUDDY.md 指令管理](memory.md)** - 存储项目约定和持久上下文
- **[Skills 技能系统](skills.md)** - 扩展专业能力
- **[配置参考](settings.md)** - 配置 CodeBuddy Code 的行为
- **[CLI 命令参考](cli-reference.md)** - 完整的命令行参考

---

*掌握这些最佳实践，让 CodeBuddy Code 成为您最得力的编程搭档*
