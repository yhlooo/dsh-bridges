> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/sub-agents.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# 子代理

> 在 CodeBuddy Code 中创建和使用专门的 AI 子代理，用于特定任务工作流和改进的上下文管理。

CodeBuddy Code 中的自定义子代理是专门的 AI 助手，可以被调用来处理特定类型的任务。它们通过提供具有自定义系统提示、工具和独立上下文窗口的特定任务配置，实现更高效的问题解决。

## 什么是子代理？

子代理是预配置的 AI 人格，CodeBuddy Code 可以将任务委派给它们。每个子代理：

* 具有特定的目的和专业领域
* 使用与主对话分离的自己的上下文窗口
* 可以配置为允许使用特定工具
* 包含指导其行为的自定义系统提示

当 CodeBuddy Code 遇到与子代理专业领域相匹配的任务时，它可以将该任务委派给专门的子代理，该子代理独立工作并返回结果。

## 主要优势

| 优势 | 说明 |
| :--- | :--- |
| **上下文保留** | 每个子代理在自己的上下文中运行，防止主对话被污染，并使其专注于高级目标。 |
| **专业化知识** | 子代理可以使用特定领域的详细说明进行微调，从而提高指定任务的成功率。 |
| **可重用性** | 创建后，子代理可以在不同项目中使用，并与您的团队共享以实现一致的工作流。 |
| **灵活的权限** | 每个子代理可以具有不同的工具访问级别，允许您将强大的工具限制为特定的子代理类型。 |

## 快速开始

要创建您的第一个子代理：

1. **打开子代理界面**

   运行以下命令：

   ```
   /agents
   ```

2. **选择"创建新代理"**

   选择是创建项目级别还是用户级别的子代理

3. **定义子代理**

   * **推荐**：先使用 AI 生成，然后自定义以使其成为您自己的
   * 详细描述您的子代理，包括何时应该使用它
   * 选择您想要授予访问权限的工具，或留空以继承所有工具
   * 界面会显示所有可用工具
   * 如果您使用 AI 生成，也可以按 `e` 在自己的编辑器中编辑系统提示

4. **保存并使用**

   您的子代理现在可用。CodeBuddy Code 会在适当时自动使用它，或者您可以显式调用它：

   ```
   > 使用 code-reviewer 子代理检查我最近的更改
   ```

## 子代理配置

### 文件位置

子代理存储为具有 YAML 前置内容的 Markdown 文件，位置有两个：

| 类型           | 位置                     | 范围             | 优先级 |
| :------------- | :----------------------- | :--------------- | :----- |
| **项目子代理** | `.codebuddy/agents/`     | 在当前项目中可用 | 最高   |
| **用户子代理** | `~/.codebuddy/agents/`   | 在所有项目中可用 | 较低   |

当子代理名称冲突时，项目级别的子代理优先于用户级别的子代理。

### 插件代理

[插件](plugins.md)可以提供与 CodeBuddy Code 无缝集成的自定义子代理。插件代理的工作方式与用户定义的代理相同，并在 `/agents` 界面中显示。

**插件代理位置**：插件在其 `agents/` 目录中包含代理（或插件清单中指定的自定义路径）。

**使用插件代理**：

* 插件代理与您的自定义代理一起显示在 `/agents` 中
* 可以显式调用："使用 security-plugin 中的 code-reviewer 代理"
* 可以在适当时由 CodeBuddy Code 自动调用
* 可以通过 `/agents` 界面进行管理（查看、检查）

有关创建插件代理的详细信息，请参阅[插件组件参考](plugins-reference.md)。

### 基于 CLI 的配置

您也可以使用 `--agents` CLI 标志动态定义子代理，该标志接受 JSON 对象：

```bash
codebuddy --agents '{
  "code-reviewer": {
    "description": "代码审查专家。在代码更改后主动使用。",
    "prompt": "你是一位高级代码审查员。专注于代码质量、安全性和最佳实践。",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "gemini-3.0-flash"
  }
}'
```

**优先级**：CLI 定义的子代理的优先级低于项目级别的子代理，但高于用户级别的子代理。

**用例**：此方法适用于：

* 快速测试子代理配置
* 不需要保存的会话特定子代理
* 需要自定义子代理的自动化脚本
* 在文档或脚本中共享子代理定义

有关 JSON 格式和所有可用选项的详细信息，请参阅 [CLI 参考文档](cli-reference.md)。

### 文件格式

每个子代理在具有以下结构的 Markdown 文件中定义：

```markdown
---
name: your-sub-agent-name
description：描述何时应该调用此子代理
tools: tool1, tool2, tool3  # 可选 - 省略则继承所有工具
model: gpt-5.1-codex  # 可选 - 指定模型别名或 'inherit'
permissionMode: default  # 可选 - 子代理的权限模式
skills: skill1, skill2  # 可选 - 自动加载的技能
---

在这里编写子代理的系统提示。可以包含多个段落，
应该清晰地定义子代理的角色、能力和解决问题的方法。

包含具体的说明、最佳实践以及子代理应该遵循的任何约束。
```

#### 配置字段

| 字段             | 必需 | 描述                                                                                                                                             |
| :--------------- | :--- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`           | 是   | 使用小写字母和连字符的唯一标识符                                                                                                                 |
| `description`    | 是   | 子代理目的的自然语言描述                                                                                                                         |
| `tools`          | 否   | 特定工具的逗号分隔列表。如果省略，继承主线程中的所有工具。可使用 `Defer(X)` / `NoDefer(X)` 修饰符调整工具的延迟加载状态，详见 [工具延迟加载覆盖](tool-defer-overlay.md) |
| `model`          | 否   | 模型 ID、名称或别名、场景变体 `lite` / `reasoning`，或 `inherit` / `default`。省略或设为 `inherit` / `default` 时，不强制具体模型，继续通过正常的子代理解析链选择模型 |
| `permissionMode` | 否   | 子代理的权限模式。有效值:`default`、`acceptEdits`、`bypassPermissions`、`plan`、`ignore`。控制子代理如何处理权限请求                            |
| `skills`         | 否   | 子代理启动时自动加载的技能名称，逗号分隔                                                                                                         |
| `mcpServers`     | 否   | 子代理专属 MCP server 声明。支持引用已有全局 MCP server, 或声明当前子代理私有 inline MCP server。详见下方说明。                                  |
| `disallowedTools` | 否  | 子代理禁止使用的工具列表（数组或逗号分隔），与 session 级 `disallowedTools` 取并集生效                                                           |
| `effort`         | 否   | 推理强度：`minimal` / `low` / `medium` / `high` / `xhigh` / `max`，省略则继承会话强度                                                            |
| `maxTurns`       | 否   | 子代理最大执行轮次（正整数）。优先级：env `CODEBUDDY_CODE_SUBAGENT_MAX_TURNS` > Agent 工具 `max_turns` 入参 > 本字段                              |
| `background`     | 否   | 设为 `true` 时该子代理总是后台运行（等同调用方传 `run_in_background: true`）；`CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS` 启用时降级为同步执行（仅写日志，无用户可见告警） |
| `initialPrompt`  | 否   | 该 agent 作为主会话 agent（`--agent` 或 settings `agent`）运行时，自动作为首条用户消息的前缀，仅主会话首轮注入                                     |
| `memory`         | 否   | 持久记忆作用域：`user`（`~/.codebuddy/agent-memory/<name>/`）、`project`（`<cwd>/.codebuddy/agent-memory/<name>/`）、`local`（不进版本库）。启用后 spawn 时自动注入 MEMORY.md（截断 200 行 / 25KB），显式 `tools` 白名单自动补 Read/Write/Edit |

#### 嵌套深度与会话预算

- 子代理嵌套深度封顶 **5 层**（主会话为第 0 层，不可配置），超限时 Agent 工具返回错误并提示改用自身工具完成剩余工作。子代理默认不持有 Agent 工具，定义中显式列出 `tools: Agent` 的 agent 才能继续嵌套。
- 每会话 spawn 预算默认 **200** 次，可用 `CODEBUDDY_CODE_MAX_SUBAGENTS_PER_SESSION` 上下调整（正整数，不可关闭）；嵌套 spawn 共享同一份预算，`/clear` 后重置。预算只对 Agent 工具路径的 spawn 计数；workflow / skill 路径直接构造 AgentTask，不过该闸门。

#### 子代理输出扫描

子代理最终报告回传主对话前会做非破坏性去毒（自研规则集，Claude Code 客户端无对应机制）：仿冒的 `<system-reminder>` 标签改写为 `<\system-reminder>`，行首 `Human:` / `Assistant:` 加反斜杠；命中时报告头部会附加 `[harness: subagent output matched ...]` 标记行。去毒只在命中片段插入反斜杠改写、不删除内容，报告诱导的工具调用仍走正常权限检查。

### 子代理专属 MCP server

`mcpServers` 用于给某个子代理声明只在该子代理运行期间可见的 MCP server。它不会写入全局 MCP 配置, 也不会让主对话或其他子代理自动看到。

支持两种写法。

**引用已有全局 MCP server**:

```yaml
---
name: docs-searcher
description: 使用已有 docs MCP 做检索
tools:
  - Read
mcpServers:
  - docs
---
```

这里的 `docs` 必须已经是全局已连接的 MCP server。子代理只借用它, 子代理结束时不会关闭它。

**声明 inline MCP server**:

```yaml
---
name: browser-checker
description: 使用私有 MCP 做浏览器检查
tools:
  - ToolSearch
  - DeferExecuteTool
mcpServers:
  - browser_private:
      type: stdio
      command: node
      args:
        - /absolute/path/to/browser-mcp-server.js
      defer_loading: true
---
```

inline MCP server 只在该子代理 session 内创建, 子代理结束时自动关闭。它不会进入全局 MCP 池。

#### 安全策略

| 来源 | `mcpServers` 行为 |
|---|---|
| 用户子代理: `~/.codebuddy/agents/*.md` | 允许 inline MCP。 |
| 项目子代理: `.codebuddy/agents/*.md` | 允许 inline MCP, 但需要项目本地批准。 |
| Plugin agent | 忽略 `mcpServers`。 |
| `strictMcpConfig=true` | 跳过所有 agent frontmatter/product `mcpServers`。 |

项目子代理的 inline MCP 需要写入项目本地配置, 位置是当前 workspace 的 `.codebuddy/settings.local.json`:

```json
{
  "enabledMcpjsonServers": ["browser_private"]
}
```

也可以在本次启动时通过 CLI settings 批准:

```bash
codebuddy --settings '{"enabledMcpjsonServers":["browser_private"]}'
```

注意: 这里使用 server name, 与已有 PROJECT MCP 的审批方式保持一致。不要写到用户全局 `settings.json`, 因为项目 MCP 审批只读取项目本地和 CLI scope。

#### Direct 和 deferred

scoped MCP 使用与 CodeBuddy 全局 MCP 相同的延迟加载策略。默认情况下, MCP 工具会走 deferred loading: 模型先通过 `ToolSearch` 发现工具, 再通过 `DeferExecuteTool` 调用工具。

默认 deferred 配置示例:

```yaml
tools:
  - ToolSearch
  - DeferExecuteTool
mcpServers:
  - finance_data:
      type: stdio
      command: node
      args:
        - /absolute/path/to/finance-mcp-server.js
```

如果希望 MCP 工具直接出现在子代理 tool list 中, 可以显式关闭 defer:

```yaml
mcpServers:
  - finance_data:
      type: stdio
      command: node
      args:
        - /absolute/path/to/finance-mcp-server.js
      defer_loading: false
```

也可以通过 `tools` 字段里的 `Defer(...)` / `NoDefer(...)` 修饰符对单个工具调整延迟加载行为。



### 模型选择

`model` 字段允许您控制子代理使用的 [AI 模型](models.md)：

* **模型 ID、名称或别名**：直接选择一个可用模型
* **场景变体**：使用 `lite` 或 `reasoning`，再由 `/model` 或 `variantModels` 映射到具体模型
* **`inherit` / `default`，或省略**：不强制具体模型，继续按环境变量、单次调用、按子代理设置、内置声明和主对话模型的顺序解析

> **注意**：使用 `inherit` 时，如果没有更高优先级的配置，子代理最终会继承主对话模型，有助于保持功能和响应风格一致。

### 可用工具

子代理可以被授予访问 CodeBuddy Code 任何内部工具的权限。有关可用工具的完整列表，请参阅[设置文档](settings.md)。

> **提示**：**推荐**：使用 `/agents` 命令修改工具访问权限 - 它提供了一个交互式界面，列出所有可用工具，包括任何连接的 MCP 服务器工具，使选择所需工具变得更容易。

您有两个选项来配置工具：

* **省略 `tools` 字段**以继承主线程中的所有工具（默认），包括 MCP 工具
* **指定单个工具**作为逗号分隔列表以获得更精细的控制（可以手动编辑或通过 `/agents` 编辑）

**MCP 工具**：子代理可以访问来自配置的 MCP 服务器的 MCP 工具。当省略 `tools` 字段时，子代理继承主线程可用的所有 MCP 工具。

## 管理子代理

### 使用 /agents 命令（推荐）

`/agents` 命令提供了一个全面的子代理管理界面：

```
/agents
```

这打开了一个交互式菜单，您可以在其中：

* 查看所有可用的子代理（内置、用户和项目）
* 查看内置子代理当前生效的路由值及其子代理层来源；场景变体对应的具体模型在 `/model` 中查看
* 通过 **Edit Model** 为内置子代理设置模型或 `lite` / `reasoning` 场景变体
* 通过 **View Definition** 查看内置子代理定义
* 使用引导式设置创建新子代理
* 编辑现有的自定义子代理，包括其工具访问权限
* 删除自定义子代理
* 查看存在重复项时哪些子代理处于活动状态
* **管理工具权限**，包含所有可用工具的完整列表

### 为内置子代理配置模型（per-Agent 模型）

内置子代理（如 `Explore`、`general-purpose`、`Plan`）也可以**按子代理粒度独立指定模型**，各子代理互不影响、可自由组合。这解决了以往「只能通过环境变量一刀切、无法区分」的痛点。

**在 `/agents` 面板可视化配置**：

1. 运行 `/agents`，用 `↑/↓` 选中一个内置子代理，按 `Enter` 进入其动作菜单。
2. 选 **Edit Model**，进入模型选择器：
   * 首项 **Inherit / Default** —— 清除该子代理的配置，回落默认编排。
   * 通用场景变体 `lite` / `reasoning`。
   * 全部可用模型（与 `/model` 一致）。
3. 用 `Tab` 在 **Global（全局）** 与 **Project（项目）** 两个保存范围间切换，`Enter` 确认。
4. 列表即时刷新为「生效路由值 + 子代理层来源」。该值可能是具体模型，也可能是 `lite` / `reasoning`；场景变体最终映射到的具体模型和来源可通过 `/model:lite` / `/model:reasoning` 查看。

面板的 **SOURCE** 列展示每个子代理路由值的来源，让默认编排透明化：

| 来源标签 | 含义 |
|---|---|
| `env-global` | 环境变量 `CODEBUDDY_CODE_SUBAGENT_MODEL` 一刀切接管（见下方优先级） |
| `settings-project` | 项目级配置（`.codebuddy/settings.json`） |
| `settings-user` | 全局级配置（`~/.codebuddy/settings.json`） |
| `product-default` | 内置默认声明（如 `Explore` = `lite`） |
| `inherit` | 无任何声明，继承主对话模型 |
| `fallback-main` | 配置的模型被禁用/本地未知，降级回主对话模型 |

**配置存储**：写入 settings 的 `subagents.agents.<子代理名>.model` 字段（`agents` 的 key = 子代理名，`model` = 模型 ID / 别名 / 变体 / `inherit` / `default`）。也可手动编辑 `settings.json`，详见 [设置文档](settings.md)。

**优先级（从高到低）**：

1. 环境变量 `CODEBUDDY_CODE_SUBAGENT_MODEL`（**一刀切**，对所有子代理统一生效，最高）
2. 本次调用的工具入参（模型 ID、名称、别名或 `default` / `lite` / `reasoning`，单次生效）
3. **项目级** `subagents.agents.<子代理名>.model`
4. **全局级** `subagents.agents.<子代理名>.model`
5. 内置默认声明（`product.json` 的 `agents[].models[0]`，如 `Explore` = `lite`）
6. 继承主对话模型（兜底）

> **说明**：设置了 `CODEBUDDY_CODE_SUBAGENT_MODEL` 时，面板仍允许保存 per-Agent 配置（不报错），但会显示「被环境变量统一覆盖」的提示；取消该环境变量后 per-Agent 配置恢复生效。

### 直接文件管理

您也可以通过直接处理子代理的文件来管理它们：

```bash
# 创建项目子代理
mkdir -p .codebuddy/agents
echo '---
name: test-runner
description：主动运行测试并修复失败
---

你是一位测试自动化专家。当你看到代码更改时，主动运行相应的测试。
如果测试失败，分析失败原因并修复它们，同时保持原始测试意图。' > .codebuddy/agents/test-runner.md

# 创建用户子代理
mkdir -p ~/.codebuddy/agents
# ... 创建子代理文件
```

> **注意**：通过手动添加文件创建的子代理将在下次启动 CodeBuddy Code 会话时加载。要立即创建和使用子代理而无需重启，请改用 `/agents` 命令。

## 有效使用子代理

### 自动委派

CodeBuddy Code 根据以下因素主动委派任务：

* 您请求中的任务描述
* 子代理配置中的 `description` 字段
* 当前上下文和可用工具

> **提示**：为了鼓励更多主动的子代理使用，在您的 `description` 字段中包含"use PROACTIVELY"或"MUST BE USED"之类的短语。

### 显式调用

通过在您的命令中提及特定子代理来请求它：

```
> 使用 test-runner 子代理修复失败的测试
> 让 code-reviewer 子代理检查我最近的更改
> 请 debugger 子代理调查这个错误
```

## 内置子代理

CodeBuddy Code 包括开箱即用的内置子代理：

### General-Purpose 子代理

General-Purpose 子代理是一个功能强大的代理，适用于需要探索和操作的复杂多步骤任务。与 Explore 子代理不同，它可以修改文件并执行更广泛的操作。

**主要特征：**

* **模型**：使用默认编排，可通过 `/agents` 为该子代理独立调整
* **工具**：可以访问所有工具
* **模式**：可以读写文件、执行命令、进行修改
* **用途**：复杂的研究任务、多步骤操作、代码修改

**CodeBuddy Code 何时使用它：**

CodeBuddy Code 在以下情况下委派给 General-Purpose 子代理：

* 任务需要同时进行探索和修改
* 需要复杂推理来解释搜索结果
* 如果初始搜索失败可能需要多种策略
* 任务有多个相互依赖的步骤

**示例场景：**

```
用户： 找到所有处理身份验证的地方，并更新它们以使用新的令牌格式

CodeBuddy Code: [调用 general-purpose 子代理]
[代理在代码库中搜索身份验证相关代码]
[代理读取并分析多个文件]
[代理进行必要的编辑]
[返回所做更改的详细说明]
```

### Plan 子代理

Plan 子代理是一个专门的内置代理，设计用于计划模式期间使用。当 CodeBuddy Code 在计划模式（非执行模式）中运行时，它使用 Plan 子代理进行研究并收集有关您的代码库的信息，然后再呈现计划。

**主要特征：**

* **模型**：使用默认编排，可通过 `/agents` 为该子代理独立调整
* **工具**：可以访问 Read、Glob、Grep 和 Bash 工具以进行代码库探索
* **用途**：搜索文件、分析代码结构和收集上下文
* **自动调用**：当 CodeBuddy Code 处于计划模式并需要研究代码库时，它会自动使用此代理

**工作原理：**
当您处于计划模式，CodeBuddy Code 需要理解您的代码库以创建计划时，它将研究任务委派给 Plan 子代理。这防止了代理的无限嵌套（子代理不能生成其他子代理），同时仍然允许 CodeBuddy Code 收集必要的上下文。

**示例场景：**

```
用户： [在计划模式中] 帮我重构身份验证模块

CodeBuddy Code：让我先研究一下你的身份验证实现...
[内部调用 Plan 子代理探索身份验证相关文件]
[Plan 子代理搜索代码库并返回发现]
CodeBuddy Code：根据我的研究，这是我提议的计划...
```

> **提示**：Plan 子代理仅在计划模式中使用。在正常执行模式中，CodeBuddy Code 使用 General-Purpose 代理或您创建的其他自定义子代理。

### Explore 子代理

Explore 子代理是一个快速、轻量级的代理，专为搜索和分析代码库而优化。它以严格的只读模式运行，专为快速文件发现和代码探索而设计。

**主要特征：**

* **模型**：内置声明为 `lite` 场景变体；实际模型由对应的环境变量、项目和用户 `variantModels`、主模型 `relatedModels` 及默认编排共同决定
* **模式**：严格只读 - 不能创建、修改或删除文件
* **可用工具**：
  * Glob - 文件模式匹配
  * Grep - 使用正则表达式进行内容搜索
  * Read - 读取文件内容
  * Bash - 仅限只读命令（ls、git status、git log、git diff、find、cat、head、tail）

**CodeBuddy Code 何时使用它：**

当 CodeBuddy Code 需要搜索或理解代码库但不需要进行更改时，它会委派给 Explore 子代理。这比主代理直接运行多个搜索命令更高效，因为在探索过程中找到的内容不会膨胀主对话。

**彻底程度级别：**

调用 Explore 子代理时，CodeBuddy Code 会指定彻底程度级别：

* **Quick** - 快速搜索，最少探索。适用于目标明确的查找。
* **Medium** - 中等探索。平衡速度和彻底性。
* **Very thorough** - 跨多个位置和命名约定的全面分析。当目标可能在意外位置时使用。

**示例场景：**

```
用户： 客户端的错误在哪里处理？

CodeBuddy Code: [以 "medium" 彻底程度调用 Explore 子代理]
[Explore 使用 Grep 搜索错误处理模式]
[Explore 使用 Read 检查可能相关的文件]
[返回包含绝对文件路径的发现]
CodeBuddy Code：客户端错误在 src/services/process.ts:712 中处理...
```

```
用户： 代码库的结构是什么？

CodeBuddy Code: [以 "quick" 彻底程度调用 Explore 子代理]
[Explore 使用 Glob 和 ls 映射目录结构]
[返回关键目录及其用途的概述]
```

## 示例子代理

### 代码审查员

```markdown
---
name: code-reviewer
description：代码审查专家。主动审查代码的质量、安全性和可维护性。在编写或修改代码后立即使用。
tools: Read, Grep, Glob, Bash
model: inherit
---

你是一位确保代码质量和安全性高标准的高级代码审查员。

被调用时：
1. 运行 git diff 查看最近的更改
2. 专注于修改的文件
3. 立即开始审查

审查清单：
- 代码清晰易读
- 函数和变量命名良好
- 没有重复代码
- 正确的错误处理
- 没有暴露的密钥或 API 密钥
- 实现了输入验证
- 良好的测试覆盖率
- 考虑了性能问题

按优先级组织反馈：
- 严重问题（必须修复）
- 警告（应该修复）
- 建议（考虑改进）

包含如何修复问题的具体示例。
```

### 调试器

```markdown
---
name: debugger
description：错误、测试失败和意外行为的调试专家。遇到任何问题时主动使用。
tools: Read, Edit, Bash, Grep, Glob
---

你是一位专门从事根因分析的专家级调试器。

被调用时：
1. 捕获错误消息和堆栈跟踪
2. 确定复现步骤
3. 隔离故障位置
4. 实现最小修复
5. 验证解决方案有效

调试过程：
- 分析错误消息和日志
- 检查最近的代码更改
- 形成并测试假设
- 添加策略性调试日志
- 检查变量状态

对于每个问题，提供：
- 根因解释
- 支持诊断的证据
- 具体的代码修复
- 测试方法
- 预防建议

专注于修复根本问题，而不仅仅是症状。
```

### 数据科学家

```markdown
---
name: data-scientist
description: SQL 查询、BigQuery 操作和数据洞察的数据分析专家。用于数据分析任务和查询时主动使用。
tools: Bash, Read, Write
model: gpt-5.1-codex
---

你是一位专门从事 SQL 和 BigQuery 分析的数据科学家。

被调用时：
1. 理解数据分析需求
2. 编写高效的 SQL 查询
3. 在适当时使用 BigQuery 命令行工具 （bq)
4. 分析并总结结果
5. 清晰地呈现发现

关键实践：
- 编写带有适当过滤器的优化 SQL 查询
- 使用适当的聚合和连接
- 包含解释复杂逻辑的注释
- 格式化结果以提高可读性
- 提供数据驱动的建议

对于每次分析：
- 解释查询方法
- 记录任何假设
- 突出关键发现
- 根据数据建议下一步

始终确保查询高效且经济。
```

## 最佳实践

* **从 AI 生成的代理开始**：我们强烈建议使用 AI 生成您的初始子代理，然后对其进行迭代以使其成为您自己的。这种方法给您最好的结果 - 一个坚实的基础，您可以自定义以满足您的特定需求。

* **设计专注的子代理**：创建具有单一、明确职责的子代理，而不是尝试让一个子代理做所有事情。这提高了性能并使子代理更可预测。

* **编写详细的提示**：在您的系统提示中包含具体的说明、示例和约束。您提供的指导越多，子代理的表现就越好。

* **限制工具访问**：仅授予子代理目的所需的工具。这提高了安全性并帮助子代理专注于相关操作。

* **版本控制**：将项目子代理检查到版本控制中，以便您的团队可以从中受益并协作改进它们。

## 高级用法

### 链接子代理

对于复杂的工作流，您可以链接多个子代理：

```
> 首先使用 code-analyzer 子代理找到性能问题，然后使用 optimizer 子代理修复它们
```

### 动态子代理选择

CodeBuddy Code 根据上下文智能地选择子代理。使您的 `description` 字段具体且面向行动以获得最佳结果。

### 可恢复的子代理

子代理可以被恢复以继续之前的对话，这对于需要在多个调用中继续的长期运行的研究或分析任务特别有用。

**工作原理：**

* 每个子代理执行都被分配一个唯一的 `agentId`
* 代理的对话存储在单独的记录文件中：`agent-{agentId}.jsonl`
* 您可以通过 `resume` 参数提供其 `agentId` 来恢复之前的代理
* 恢复时，代理继续使用其之前对话的完整上下文

**示例工作流：**

初始调用：

```
> 使用 code-analyzer 代理开始审查身份验证模块

[代理完成初始分析并返回 agentId: "abc123"]
```

恢复代理：

```
> 恢复代理 abc123 并继续分析授权逻辑

[代理继续使用之前对话的完整上下文]
```

**用例：**

* **长期运行的研究**：将大型代码库分析分解为多个会话
* **迭代细化**：继续细化子代理的工作而不失去上下文
* **多步工作流**：让子代理在保持上下文的同时顺序处理相关任务

**技术细节：**

* 子代理的对话历史和工具结果存储在父 session 的 `subagents/` 子目录中
* 在恢复期间禁用记录以避免重复消息
* 同步代理和[后台代理](#后台代理）都可以被恢复
* `resume` 参数接受来自之前执行的代理 ID

**运行时数据存储目录：**

```
~/.codebuddy/projects/{projectDir}/
  └── {parentSessionId}/
      ├── tool-results/                          ← 主 session 的工具输出文件
      └── subagents/                             ← 子代理数据
          ├── agent-{agentId}.jsonl              ← 子代理对话历史
          └── agent-{agentId}/
              └── tool-results/                  ← 子代理的工具输出文件
                  └── {callId}.txt
```

> **说明**：当工具输出过大时，完整输出会保存到 `tool-results/` 目录中的文件，模型收到的是截断内容和文件路径指针，可以按需读取完整内容。详见[环境变量参考](env-vars.md#工具输出外部化机制)。

**程序化用法：**

如果您使用 Agent SDK 或直接与 AgentTool 交互，您可以传递 `resume` 参数：

```typescript
{
  "description": "继续分析",
  "prompt": "现在检查错误处理模式",
  "subagent_type": "code-analyzer",
  "resume": "abc123"  // 来自之前执行的代理 ID
}
```


跟踪您可能想要稍后恢复的任务的代理 ID。CodeBuddy Code 在子代理完成其工作时显示代理 ID。

### 后台代理

后台代理允许您在后台运行子代理任务，而不阻塞主对话。这对于长时间运行的任务特别有用，您可以继续与 CodeBuddy Code 交互，同时任务在后台执行。

**工作原理：**

* 使用 `run_in_background: true` 参数启动后台代理
* 任务立即返回一个任务 ID，不会阻塞主对话
* 后台代理在分离模式下运行，中间消息不会干扰主对话
* 使用 `TaskOutput` 工具获取后台任务的状态和结果

**启动后台代理：**

```
> 在后台运行 code-analyzer 代理来审查整个代码库

[任务已在后台启动。任务 ID: task-abc123]

**获取后台任务输出：**

使用 `TaskOutput` 工具查询后台任务的状态和结果：

```
> 查看后台任务 task-abc123 的状态

任务 ID: task-abc123
状态： running
耗时： 2m 30s

提示词：
审查整个代码库的代码质量问题

响应：
（任务仍在运行中）
```

**后台任务状态：**

| 状态 | 说明 |
| :--- | :--- |
| `pending` | 任务已创建，等待执行 |
| `running` | 任务正在执行中 |
| `completed` | 任务已成功完成 |
| `failed` | 任务执行失败 |
| `cancelled` | 任务被用户取消 |
| `killed` | 任务被强制终止 |

**程序化用法：**

如果您使用 Agent SDK 或直接与 Agent 工具交互，可以传递 `run_in_background` 参数：

```typescript
{
  "description": "分析代码库",
  "prompt": "审查所有 TypeScript 文件的潜在问题",
  "subagent_type": "code-analyzer",
  "run_in_background": true  // 在后台运行
}
```

**获取输出的参数：**

`TaskOutput` 工具支持以下参数：

| 参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `task_id` | string | 必需。后台任务的 ID |
| `block` | boolean | 是否等待任务完成。默认为 `true` |
| `timeout` | number | 等待超时时间（毫秒）。默认 30000ms，最大 600000ms |

**用例：**

* **并行分析**：同时运行多个代码分析任务，而不阻塞主对话
* **长时间任务**：执行耗时的代码库扫描或重构分析
* **批量处理**：后台处理大量文件或执行复杂的多步骤任务
* **非阻塞工作流**：在等待后台任务完成的同时继续其他工作

**权限处理：**

后台代理在执行过程中的工具调用会自动处理权限，无需用户交互。这是为了确保后台任务能够顺利执行而不会因等待用户输入而阻塞。

> **注意**：后台代理适用于不需要频繁用户交互的任务。如果任务需要多次用户确认或输入，建议使用前台模式执行。

## 性能考虑

* **上下文效率**：代理帮助保留主上下文，实现更长的整体会话
* **延迟**：子代理每次调用时都从干净的状态开始，并且可能会增加延迟，因为它们收集有效完成工作所需的上下文。

## 相关文档

* [插件](plugins.md) - 通过插件扩展 CodeBuddy Code 的自定义代理
* [斜杠命令](slash-commands.md) - 了解其他内置命令
* [设置配置](settings.md) - 配置 CodeBuddy Code 行为
* [Hooks](hooks.md) - 使用事件处理程序自动化工作流

---

*本文档帮助您了解如何在 CodeBuddy Code 中创建和使用子代理来提高工作效率。*
