> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/skills.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# CodeBuddy Code Skills （技能系统）

Skills 是 CodeBuddy Code 的扩展能力系统，允许您创建专业的领域知识和工作流模板，让 AI 助手能够更专业地处理特定类型的任务。

## 什么是 Skills

Skills 类似于为 AI 助手提供的"专业培训"。通过 Skill，您可以：

- **封装专业知识**：将特定领域的最佳实践和操作流程封装成可复用的技能
- **提供工作流模板**：定义标准化的任务处理流程，提高工作效率
- **扩展 AI 能力**：让 AI 助手能够处理更专业、更复杂的任务
- **团队协作共享**：项目级 Skills 可以在团队成员间共享专业知识

## Skills vs Slash Commands

| 特性 | Skills | Slash Commands |
|-----|--------|----------------|
| **触发方式** | AI 模型自动识别并调用 | 用户手动输入命令 |
| **使用场景** | 专业领域任务处理 | 快捷操作和工作流 |
| **权限控制** | 支持工具白名单限制 | 无特殊权限控制 |
| **工作目录** | 支持自定义基础目录 | 使用当前工作目录 |
| **可见性** | 对用户透明，AI 自动决策 | 用户主动发起 |

**简单来说**：
- **Slash Commands** 是用户主动调用的快捷方式
- **Skills** 是 AI 根据任务需求自动选择的专业能力

## 创建 Skills

### 目录结构

Skills 通过在特定目录中创建 `SKILL.md` 文件来定义：

1. **项目级 Skills**：`.codebuddy/skills/`（项目根目录下）
2. **用户级 Skills**：`~/.codebuddy/skills/`（用户主目录下）

每个 Skill 一个独立的目录，包含 `SKILL.md` 文件：

```
.codebuddy/skills/
├── pdf/
│   └── SKILL.md
├── data-analysis/
│   └── SKILL.md
└── code-review/
    └── SKILL.md
```

### SKILL.md 格式

Skill 文件使用 Markdown 格式，支持 YAML Frontmatter 定义元数据：

```markdown
---
name: pdf
description: PDF 文档处理专家
allowed-tools: Read, Write, Bash, WebFetch
---

你是一个 PDF 文档处理专家，擅长：
- 解析和提取 PDF 内容
- 转换 PDF 为其他格式
- 生成 PDF 报告

当用户需要处理 PDF 相关任务时，请使用以下工作流：
1. 首先检查 PDF 文件是否存在
2. 使用适当的工具提取内容
3. 根据需求进行处理
4. 生成结果报告

可用工具：
- pdftotext：提取文本内容
- pdfinfo：获取 PDF 信息
```

### Frontmatter 字段

| 字段 | 必填 | 说明 | 示例 |
|-----|------|------|------|
| `name` | 否 | Skill 名称，未指定时使用目录名 | `pdf` |
| `description` | 否 | Skill 描述，帮助 AI 理解何时使用 | `PDF 文档处理专家 （project)` |
| `allowed-tools` | 否 | 允许使用的工具白名单，逗号分隔 | `Read, Write, Bash` |
| `disable-model-invocation` | 否 | 设置为 `true` 时，Skill 不会出现在 Skill 工具中，只能通过 `/skill-name` 手动触发 | `true` |
| `user-invocable` | 否 | 设置为 `false` 时，Skill 从 `/` 菜单中隐藏，仅供 AI 内部调用或其他 Skill 引用，默认 `true` | `false` |
| `context` | 否 | 设置为 `fork` 时，Skill 在独立的 subagent 上下文中执行 | `fork` |
| `agent` | 否 | 指定 subagent 类型，仅在 `context: fork` 时有效 | `Explore` |
| `model` | 否 | 指定 Skill 执行时使用的模型（仅 `context: fork` 时生效，未配置时回退到 agent 默认模型） | `claude-sonnet-4` |
| `hooks` | 否 | 在 SKILL.md 中声明 Skill 专属的 Hooks，仅 `context: fork` 时生效，详见 [在 Skill 中配置 Hooks](#在-skill-中配置-hooks) | 见下文 |

## 变量占位符

SKILL.md 内容支持以下占位符，加载或执行时自动替换。同样的占位符也适用于自定义斜杠命令和 subagent 定义。

| 占位符 | 替换为 | 适用来源 |
|------|------|------|
| `${CODEBUDDY_PLUGIN_ROOT}` | 插件安装根目录 | 仅插件来源的 skill |
| `${CODEBUDDY_SKILL_DIR}` | 当前 SKILL.md 所在目录的绝对路径 | 所有来源 |
| `${CODEBUDDY_SESSION_ID}` | 当前会话 ID（运行时注入） | 所有来源 |
| `${MY_ENV_VAR}` 等大写环境变量 | `process.env.MY_ENV_VAR` 的值 | 所有来源 |
| `${MY_ENV_VAR:-默认值}` | 环境变量，缺失时使用默认值 | 所有来源 |

为与 Claude Code 保持兼容，`${CLAUDE_PLUGIN_ROOT}`、`${CLAUDE_SKILL_DIR}`、`${CLAUDE_SESSION_ID}` 也被识别为等价的别名。

未设置的环境变量占位符会原样保留，不会被替换为空字符串；用户或项目来源的 skill 中 `${CODEBUDDY_PLUGIN_ROOT}` 会保留字面量（该变量仅适用于插件来源）。

**示例**：

```markdown
---
description: 带占位符的 skill 示例
---

读取脚本 @${CODEBUDDY_SKILL_DIR}/scripts/analyze.py 并使用密钥 ${MY_API_TOKEN:-dev-fallback} 执行。
当前会话标识：${CODEBUDDY_SESSION_ID}
```

## 执行 Shell 命令

与[斜杠命令](slash-commands.md)一样，Skills 也支持在 SKILL.md 中使用 `!`command`` 语法内联执行 Shell 命令。当 Skill 被触发时（无论是 AI 自动调用还是用户通过 `/skill-name` 手动触发），这些命令会被执行，输出结果会替换到 Skill 内容中，供 AI 后续分析。

**示例**：

```markdown
---
description: 项目状态分析
---

### 当前工作目录

!`echo "CWD=$(pwd)"`

### Git 状态

!`git status --short`

### 最近提交

!`git log --oneline -5`

请基于以上信息分析项目当前状态。
```

### 支持的特性

- **`$ARGUMENTS` 参数替换**：在 Shell 命令执行前，`$ARGUMENTS` 会被替换为用户传入的参数
- **`@file` 文件引用**：Shell 命令执行后，`@file` 引用会按大小和 token 上限处理；小文件直接注入，较长内容会截断并附继续读取提示，超大文件保留原始引用
- **错误隔离**：单个命令执行失败不会影响其他命令，失败的命令会被替换为空字符串

> 💡 **处理管道**：`$ARGUMENTS` 替换 → `!`command`` 执行 → `@file` 引用处理，与斜杠命令的处理顺序一致。

## Context Fork

`context: fork` 使 Skill 在隔离的子代理上下文中运行，不访问对话历史。

```yaml
---
name: deep-research
description: 深入研究某个主题
context: fork
agent: Explore
---

研究 $ARGUMENTS：
1. 使用 Glob 和 Grep 查找相关文件
2. 读取并分析代码
3. 总结发现并附加具体文件引用
```

### 可用 Agent 类型

| 类型 | 说明 |
|-----|------|
| `general-purpose` | 通用（默认） |
| `Explore` | 只读工具，优化代码库探索 |
| `Plan` | 规划和分析 |
| 自定义 | `.codebuddy/agents/` 中定义的 agent |

### 隐藏 Skill（user-invocable）

`user-invocable: false` 使 Skill 从 `/` 菜单中隐藏，适用于：
- 背景知识类 Skill（如项目规范、编码标准）
- 仅供其他 Skill 或 AI 内部引用的辅助 Skill

```yaml
---
name: project-guidelines
description: 项目编码规范和最佳实践
user-invocable: false
---

# 项目编码规范

本项目遵循以下编码标准：
- 使用 TypeScript 严格模式
- 函数命名使用 camelCase
- 组件命名使用 PascalCase
...
```

这类 Skill 会被加载到 AI 的上下文中，但用户无法通过 `/` 菜单直接调用。

### 执行流程

1. 创建新的隔离上下文
2. 子代理接收 Skill 内容作为提示
3. `agent` 字段决定执行环境
4. 结果返回主对话

> **注意**：`context: fork` 只适用于包含明确任务的 Skill。仅有指导方针没有具体任务时，不会产生有意义的输出。

## 在 Skill 中配置 Hooks

> **版本要求**：Skill frontmatter `hooks` 字段需要 CodeBuddy Code 支持 Frontmatter Hooks 的版本（Beta）。

除了在 `~/.codebuddy/settings.json` 中全局配置 Hooks，Skill 还可以直接在 SKILL.md 的 frontmatter 里声明 `hooks` 字段，把 Hook 与 Skill 自身打包在一起。这对于 fork 类 Skill 尤其有用——可以在 fork subagent 内部加守卫、日志、回调，且不污染主会话。

### 适用范围

- **仅 `context: fork` 生效**：注入路径（默认 inline 模式）的 Skill 没有清晰的生命周期边界，frontmatter hooks 会被解析但不会注册到运行时。
- **生命周期与 fork subagent 绑定**：fork subagent 启动时注册 hooks，结束时自动清理，不影响主会话和其他 Skill。
- **`Stop` 自动转 `SubagentStop`**：在 frontmatter 中写 `Stop` event 会被自动重写为 `SubagentStop`，对齐 subagent 完成的真实事件。

### 字段格式

`hooks` 字段的结构和 `settings.json` 中的 `hooks` 完全一致——按事件名分组、每条配置可带 `matcher` 和 `hooks[]` 数组：

```yaml
---
name: secure-reviewer
description: 代码审查 Skill，在执行前检查文件白名单
context: fork
agent: Explore
hooks:
  PreToolUse:
    - matcher: "Read|Glob|Grep"
      hooks:
        - type: command
          command: ${CODEBUDDY_SKILL_DIR}/scripts/check-paths.sh
          timeout: 10
  PostToolUse:
    - matcher: "Bash"
      hooks:
        - type: prompt
          prompt: "检查 Bash 输出是否包含敏感信息，发现则在 reason 字段说明。"
  Stop:  # 自动重写为 SubagentStop
    - hooks:
        - type: command
          command: echo "review skill finished" >> ${CODEBUDDY_PROJECT_DIR}/.cbc-review.log
---

请审查 $ARGUMENTS 中提到的文件...
```

支持的 hook `type`：

- `command`：执行 Shell 命令（含 `shell: bash | powershell`、`timeout`、`if`、`once`、`async` 等可选字段）
- `prompt`：交给小模型（默认 Haiku 级）做语义判定
- `agent`：起一个 subagent 做更复杂的判定，可以指定 `agentType` / `model`
- `http`：把事件 payload 通过 POST/PUT/PATCH 发到指定 URL

完整字段语义请参考 [Hook 参考指南](./hooks.md)。

### 安全闸门：admin-trusted

出于安全考虑，**来自非内置来源的 Skill frontmatter hooks 默认不会被注册**。当前所有通过 `.codebuddy/skills/`、项目本地、插件市场加载的 Skill 都属于"非可信来源"——它们可以静默触发 Shell 命令，因此需要用户显式同意。

启用方式：在 `~/.codebuddy/settings.json` 中设置

```json
{
  "allowUntrustedFrontmatterHooks": true
}
```

启用后所有来源的 Skill / Agent frontmatter hooks 才会被注册；否则 CLI 会输出类似下面的 warning 并跳过该 Skill 的 hooks：

```
[AgentTask] Frontmatter hooks from skill 'secure-reviewer' skipped
(source not admin-trusted; enable `allowUntrustedFrontmatterHooks` in settings to allow)
```

> 内置 product-bundled 的 Skill 不受此闸门约束，自动放行。Plugin 通过 `hooks/hooks.json` 配置的 hooks 走另一条路径，**不**受该闸门控制。

### 与全局 hooks 的合并

Skill frontmatter hooks 和 `settings.json` 中的全局 hooks 是**叠加合并**关系——同一事件下两边的所有匹配 hooks 都会被并行触发，不存在覆盖。区别在于：

| 来源 | 作用域 | 受 admin-trusted 闸门约束 |
| --- | --- | --- |
| `settings.json` (全局/项目/local) | 整个会话 | 否 |
| Plugin `hooks/hooks.json` | 整个会话（插件启用时） | 否 |
| Agent `.md` frontmatter | 该 subagent 生命周期 | 是 |
| Skill `SKILL.md` frontmatter（仅 fork） | 该 fork subagent 生命周期 | 是 |

### 调试

- 启动时设置 `CODEBUDDY_DEBUG=1`，可以在日志看到 `[ScopedHookRegistry] registered N hook config(s) for scope ...` 等注册行。
- frontmatter 里非法的 hook 定义会被静默丢弃，但会在日志输出 `[parseFrontmatterHooks] skill 'xxx': event 'YYY' invalid: ...`，仔细看日志即可定位。

## 使用示例

### 示例 1：PDF 处理 Skill

**文件**：`.codebuddy/skills/pdf/SKILL.md`

```markdown
---
name: pdf
description: PDF 文档处理和转换专家
allowed-tools: Read, Write, Bash, WebFetch
---

# PDF 处理专家

你是一个专业的 PDF 文档处理专家。

## 核心能力
- 提取 PDF 文本内容
- 转换 PDF 为 Markdown、HTML 等格式
- 合并和拆分 PDF 文件
- 提取 PDF 元数据和书签

## 工作流程
1. 检查 PDF 文件是否存在并可访问
2. 使用 pdftotext 或 pdfinfo 获取基本信息
3. 根据任务类型选择合适的处理工具
4. 验证输出结果的完整性

## 可用工具
- pdftotext：提取纯文本
- pdfinfo：获取文档信息
- pdftk：合并拆分操作
```

**使用**：当用户询问 "帮我提取这个 PDF 的内容" 时，AI 会自动识别需要 PDF 处理能力并调用该 Skill。

### 示例 2：数据分析 Skill

**文件**：`~/.codebuddy/skills/data-analysis/SKILL.md`

```markdown
---
name: data-analysis
description：数据分析和可视化专家
allowed-tools: Read, Write, Bash, WebFetch, NotebookEdit
---

# 数据分析专家

你是一个专业的数据分析师，擅长使用 Python 和相关工具进行数据分析。

## 核心能力
- 数据清洗和预处理
- 统计分析和建模
- 数据可视化
- 生成分析报告

## 分析流程
1. 理解数据结构和质量
2. 清洗和预处理数据
3. 执行统计分析
4. 创建可视化图表
5. 生成分析结论

## 工具库
- pandas：数据处理
- numpy：数值计算
- matplotlib/seaborn：可视化
- scikit-learn：机器学习

## 最佳实践
- 始终先探索数据质量
- 使用 Jupyter Notebook 进行交互式分析
- 保存中间结果避免重复计算
```

### 示例 3：代码审查 Skill

**文件**：`.codebuddy/skills/code-review/SKILL.md`

```markdown
---
name: code-review
description：代码审查和质量检查专家
allowed-tools: Read, Grep, Bash, Edit
---

# 代码审查专家

你是一个经验丰富的代码审查者，遵循业界最佳实践。

## 审查重点
1. **代码质量**
   - 命名规范
   - 代码复杂度
   - 重复代码

2. **安全性**
   - SQL 注入风险
   - XSS 漏洞
   - 认证授权问题

3. **性能**
   - 算法效率
   - 资源使用
   - 缓存策略

4. **可维护性**
   - 代码注释
   - 模块化设计
   - 测试覆盖

## 审查流程
1. 理解代码变更的目的
2. 检查代码风格和规范
3. 分析潜在的 Bug 和性能问题
4. 验证安全性
5. 提供建设性的改进建议

## 输出格式
- ✅ 优点：列出做得好的地方
- ⚠️ 问题：指出需要改进的地方
- 💡 建议：提供具体的改进方案
```

## AI 如何选择 Skills

AI 根据以下因素决定是否调用 Skill：

1. **任务匹配度**：任务描述与 Skill description 的相关性
2. **工具需求**：任务所需工具是否在 allowed-tools 范围内
3. **上下文相关性**：当前对话上下文是否适合使用该 Skill
4. **Skill 来源**：项目级 Skills 优先于用户级 Skills

## 从设置覆盖 Skill 可见性（skillOverrides）

`skillOverrides` 设置让你在**不修改 SKILL.md** 的情况下，从 settings 控制单个 Skill 的可见性，适用于你不方便改动的 Skill（例如提交进共享仓库的项目 Skill）。

配置位于 settings 的 `skillOverrides`，按 Skill 名索引，每个值为四态之一：

| 值 | 对模型可见 | 在 `/` 菜单 | 说明 |
|---|---|---|---|
| `on` | 名称 + 描述 | 是 | 不覆盖，回退 SKILL.md frontmatter 现状 |
| `name-only` | 仅名称 | 是 | 折叠描述，省 context 预算 |
| `user-invocable-only` | 隐藏 | 是 | 对模型隐藏（不进清单），用户与模型按名调用仍放行 |
| `off` | 隐藏 | 隐藏 | 对模型与菜单都隐藏，按名调用返回禁用提示 |

`/skills` 菜单把 `user-invocable-only` 状态标注为 **`user-only`**；这只是**显示用短标签**，写进配置文件的仍是规范值 `user-invocable-only`。

未列出的 Skill 视为 `on`。示例：

```json
{
  "skillOverrides": {
    "legacy-context": "name-only",
    "deploy": "off"
  }
}
```

设为 `off` 后，`/skill-name` 及模型按名调用都会被拦截并提示：

```
Skill "<name>" is disabled via skillOverrides. Re-enable it in /skills or remove the override from your settings to run it.
```

要点：

- **plugin Skill 不受 `skillOverrides` 影响**，改用 `/plugin` 管理；在 `/skills` 里显示为锁定（`locked by plugin`），不可编辑。
- **`/skills` 菜单可视化编辑**：↑/↓ 选择，`enter` / `space` / `←/→` 循环切换状态，按 `Esc` 时统一写入 `.codebuddy/settings.local.json` 并提示本次改动数量（`Updated N skill override` / `No changes`）；未按 `Esc` 直接离开则不落盘。
- **生效优先级**：`PROJECT_LOCAL（.codebuddy/settings.local.json）> PROJECT（.codebuddy/settings.json）> USER（~/.codebuddy/settings.json）`，高优先级按 Skill 名覆盖低优先级。工作区根即 home 时，PROJECT 与 USER 为同一文件。
- **非法值自动回退**：合并前会先过滤掉不属于四态的非法值，因此高优先级文件里的非法值不会遮蔽低优先级文件里的合法值（回退到上一个有效文件）；全部非法时该 Skill 视为 `on`。

## 权限控制

### allowed-tools 白名单

通过 `allowed-tools` 字段限制 Skill 可以使用的工具：

```yaml
allowed-tools: Read, Write, Bash(git:*), Grep
```

支持的工具模式匹配：
- `Bash(git:*)` - 只允许 git 相关命令
- `Edit(src/**/*.ts)` - 只允许编辑特定路径文件

### 工作目录限制

每个 Skill 都有自己的 `baseDirectory`（SKILL.md 所在目录），可以在 Skill 指令中引用：

```markdown
当处理文件时，优先在 {baseDirectory} 目录下查找相关资源。
```

## 最佳实践

### 1. 清晰的 Skill 描述

```yaml
# ❌ 不好
description：处理文件

# ✅ 好
description: PDF 文档解析和转换专家，支持文本提取和格式转换 （project)
```

### 2. 详细的指令内容

提供详细的：
- 核心能力说明
- 标准工作流程
- 可用工具列表
- 常见场景处理方法
- 输出格式要求

### 3. 合理的工具权限

只授予必需的工具权限：

```yaml
# ❌ 权限过大
allowed-tools: Bash

# ✅ 精确控制
allowed-tools: Read, Write, Bash(git:status,git:diff), Grep
```

### 4. 组织 Skill 目录

按功能领域组织 Skills：

```
.codebuddy/skills/
├── document/
│   ├── pdf/SKILL.md
│   └── markdown/SKILL.md
├── data/
│   ├── analysis/SKILL.md
│   └── visualization/SKILL.md
└── code/
    ├── review/SKILL.md
    └── refactor/SKILL.md
```

## 调试 Skills

### 查看已加载的 Skills

使用 `/skills` 命令查看当前已加载的所有 Skills：

```
/skills
```

Skills 面板会显示：
- **User skills**：用户级 Skills（`~/.codebuddy/skills/`）
- **Project skills**：项目级 Skills（`.codebuddy/skills/`）
- **Plugin skills**：插件提供的 Skills

每个 Skill 会显示名称和预估的 token 数量。

### 常见问题

**Q: Skill 没有被触发？**
- 检查 description 是否清晰描述了 Skill 的功能
- 确认任务描述与 Skill 能力匹配
- 验证 allowed-tools 是否包含所需工具

**Q: Skill 权限不足？**
- 检查 allowed-tools 配置
- 确认工具名称拼写正确
- 使用模式匹配精确控制权限

**Q：项目级和用户级 Skill 冲突？**
- 项目级 Skills 优先级更高
- 使用不同的 name 避免冲突

## 与其他功能的配合

### Skills + Memory

Skills 可以访问 Memory 系统存储的信息：

```markdown
在执行数据分析时，参考 Memory 中保存的数据模式和业务规则。
```

### Skills + Slash Commands

Slash Commands 可以引用 Skills：

```markdown
<!-- .codebuddy/commands/analyze-data.md -->
请使用 data-analysis skill 分析文件：$1
```

### Skills + MCP

Skills 可以调用 MCP 提供的外部工具（如果在 allowed-tools 中）。

## 下一步

- [斜杠命令](slash-commands.md) - 了解用户主动命令
- [设置配置](settings.md) - 配置工具权限
- [MCP 集成](mcp.md) - 扩展外部工具能力

---

*Skills - 让 AI 成为领域专家*
