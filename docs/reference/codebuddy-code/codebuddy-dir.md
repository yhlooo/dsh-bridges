> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/codebuddy-dir.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# .codebuddy 目录结构说明

> 深入了解 CodeBuddy Code 的配置目录 `~/.codebuddy` 和项目级 `.codebuddy` 的文件与子目录。

CodeBuddy Code 使用两种配置目录：

- **全局目录** `~/.codebuddy/`：存储用户级配置、历史数据、运行时数据等，影响所有项目
- **项目目录** `.codebuddy/`（位于项目根目录）：存储项目级配置、规则、技能、命令等，随项目版本控制共享给团队

---

## 全局目录 `~/.codebuddy/`

```
~/.codebuddy/
├── settings.json              # 用户级全局配置
├── settings.local.json        # 本地个人偏好（不共享）
├── CODEBUDDY.md               # 用户级记忆文件
├── mcp.json                   # 全局 MCP 服务器配置
├── statusline-command.sh      # 自定义状态行脚本（可选）
│
├── agents/                    # 用户级自定义子代理（所有项目可用）
├── rules/                     # 用户级规则文件（所有项目可用）
├── skills/                    # 用户级技能（所有项目可用）
│
├── projects/                  # 各项目的会话与子代理运行时数据
├── sessions/                  # 会话数据
├── plans/                     # 计划模式生成的计划文件
│
├── logs/                      # 运行日志
├── traces/                    # 执行追踪数据（OpenTelemetry）
├── file-history/              # 文件变更历史
├── history.jsonl              # 对话历史
├── blobs/                     # 二进制资源（图片、截图等）
├── tasks/                     # 任务追踪数据
├── teams/                     # Agent 团队运行时数据
├── shell-snapshots/           # Bash 沙箱快照
│
├── plugins/                   # 已安装的插件
├── local_storage/             # CLI 键值持久化存储
├── channels/                  # 频道配置（WeChat 等）
│
├── computer-use/              # Computer Use 功能记录
├── debug/                     # 调试信息
└── usage-data/                # 使用量统计
```

### 核心配置文件

#### `settings.json`

用户级全局配置，适用于所有项目。可通过 `/config` 命令或直接编辑管理。

```json
{
  "language": "简体中文",
  "model": "gpt-5",
  "reasoningEffort": "high",
  "permissions": {
    "defaultMode": "default",
    "allow": ["Bash(git:*)"],
    "deny": ["Read(./.env)", "Read(./secrets/**)"]
  },
  "env": {
    "NODE_ENV": "development"
  },
  "memory": {
    "autoMemoryEnabled": true,
    "typedMemory": true
  },
  "trustedDirectories": ["~/workspace/myproject"]
}
```

完整配置字段参见 [设置配置](settings.md)。

#### `settings.local.json`

本地个人配置，不会被 CodeBuddy Code 自动同步或共享，适合存储仅对本机有效的覆盖项（如 API 密钥、调试开关等）。

#### `CODEBUDDY.md`

用户级记忆文件，在所有项目中生效，适合保存个人编码偏好、常用工作流说明等。

```markdown
## 工具偏好
- 使用 pnpm 而非 npm
- 倾向函数式编程风格

## 代码风格
- 使用 2 空格缩进
```

详见 [记忆管理](memory.md)。

#### `mcp.json`

全局 MCP 服务器配置，格式与项目级 `.mcp.json` 相同：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  }
}
```

详见 [MCP 文档](mcp.md)。

---

### 用户级扩展目录

#### `agents/`

存放对所有项目生效的用户级自定义子代理。每个代理为一个 `.md` 文件：

```
~/.codebuddy/agents/
├── code-reviewer.md      # 代码审查代理
└── translator.md         # 翻译代理
```

文件格式（YAML frontmatter + 系统提示）：

```markdown
---
name: code-reviewer
description: 代码审查专家，在编写代码后主动使用
tools: Read, Grep, Glob, Bash
model: inherit
---

你是一位高级代码审查员，专注于代码质量、安全性和最佳实践...
```

详见 [子代理文档](sub-agents.md)。

#### `rules/`

存放对所有项目生效的用户级规则文件。所有 `.md` 文件自动加载，支持子目录：

```
~/.codebuddy/rules/
├── preferences.md        # 个人编码偏好
└── workflows.md          # 常用工作流规范
```

规则文件支持 frontmatter 控制加载行为：

```markdown
---
alwaysApply: false
paths: src/**/*.ts
---

# TypeScript 规范

- 优先使用 `interface` 而非 `type`
- 禁止使用 `any`
```

详见 [记忆管理 - 规则系统](memory.md#使用-codebuddyrules-实现模块化规则)。

#### `skills/`

存放对所有项目生效的用户级技能。每个技能为独立目录，包含 `SKILL.md`：

```
~/.codebuddy/skills/
└── pdf/
    └── SKILL.md
```

详见 [Skills 文档](skills.md)。

---

### 运行时数据目录

这些目录由 CodeBuddy Code 自动维护，通常无需手动操作：

| 目录 | 说明 |
|------|------|
| `projects/` | 各项目运行时数据，包括会话记录（`.jsonl`）和子代理工具输出（`tool-results/`） |
| `sessions/` | 活跃会话数据 |
| `plans/` | 计划模式生成的计划文件 |
| `logs/` | 运行日志，按日期和进程分组 |
| `traces/` | OpenTelemetry 执行追踪数据 |
| `file-history/` | 每个会话中操作过的文件快照，用于 `/rewind` 回退 |
| `history.jsonl` | 全局对话历史（用于 `/resume` 恢复） |
| `blobs/` | 图片、截图等二进制资源，按内容哈希存储 |
| `tasks/` | 任务管理系统数据（TaskCreate/TaskUpdate） |
| `teams/` | Agent 团队（TeamCreate）运行时数据 |
| `shell-snapshots/` | Bash 沙箱启动快照，加速沙箱创建 |
| `plugins/` | 已安装插件的文件内容 |
| `local_storage/` | CLI 内部键值持久化存储（以内容哈希命名的 `.info` 文件） |

---

## 项目目录 `.codebuddy/`

放置于项目根目录，可以提交到版本控制以供团队共享：

```
.codebuddy/
├── settings.json              # 项目共享配置
├── settings.local.json        # 本地个人配置（.gitignore 自动忽略）
├── CODEBUDDY.md               # 项目级记忆文件
│
├── agents/                    # 项目级自定义子代理
├── rules/                     # 项目级规则文件
├── skills/                    # 项目级技能
├── commands/                  # 自定义斜杠命令
```

### 配置文件

#### `settings.json`

项目共享配置，通过版本控制与团队同步。适合配置项目统一的模型、权限规则、插件等：

```json
{
  "permissions": {
    "allow": ["Read", "Edit", "Bash(git:*)", "Bash(npm:*)"],
    "deny": ["Read(./.env)", "Read(./secrets/**)"]
  },
  "enabledPlugins": {
    "pr-review-toolkit@company-tools": true
  },
  "extraKnownMarketplaces": {
    "company-tools": {
      "source": {
        "source": "github",
        "repo": "myorg/codebuddy-plugins"
      }
    }
  }
}
```

#### `settings.local.json`

本地个人配置，CodeBuddy Code 会自动将其加入 `.gitignore`。适合存储个人覆盖项（如本地调试端口、个人密钥等），不会影响团队其他成员。

#### `CODEBUDDY.md`

项目级记忆文件，随版本控制共享。存储项目架构、约定、常用命令等团队知识：

```markdown
# 项目说明

本项目是 TypeScript monorepo（Yarn workspaces）。

## 常用命令

- `yarn build` — 构建所有包
- `yarn test` — 运行所有测试

## 架构约定

- 使用 CellJS 依赖注入框架
- 协议定义放在 `*-protocol.ts` 文件
```

> **提示**：也可将记忆文件放在根目录的 `CODEBUDDY.md`（不在 `.codebuddy/` 内），两种位置等效。

---

### 项目级扩展目录

#### `agents/`

存放项目专属子代理，优先级高于用户级代理。同名代理时项目级覆盖用户级。

```
.codebuddy/agents/
├── blog-translator.md     # 博客翻译代理
└── docs-reviewer.md       # 文档审查代理
```

#### `rules/`

存放项目级规则，随版本控制共享。适合团队统一的代码规范、工作流约定等。支持子目录组织：

```
.codebuddy/rules/
├── code-style.md          # 代码风格规范
├── testing.md             # 测试规范
├── security.md            # 安全要求
└── frontend/
    ├── react.md           # React 组件规范
    └── styles.md          # 样式规范
```

所有 `.md` 文件自动递归加载。

#### `skills/`

存放项目级技能，每个技能一个目录，包含 `SKILL.md` 和可选的辅助文件：

```
.codebuddy/skills/
├── case-executor/
│   ├── SKILL.md           # 技能定义
│   ├── scripts/           # 辅助脚本
│   └── references/        # 参考资料
└── cnb-api/
    └── SKILL.md
```

`SKILL.md` 格式：

```markdown
---
name: case-executor
description: 执行 JSON 测试用例并生成报告
allowed-tools: Read, Write, Bash
---

你是测试执行专家，负责运行 JSON 格式的 UI 测试用例...
```

详见 [Skills 文档](skills.md)。

#### `commands/`

存放自定义斜杠命令，通过 `/command-name` 触发。支持目录嵌套（使用 `/group:command` 调用）：

```
.codebuddy/commands/
├── deploy.md              # /deploy 命令
├── team/
│   ├── issue-start.md     # /team:issue-start 命令
│   └── create-issue.md    # /team:create-issue 命令
└── openspec/
    └── propose.md         # /openspec:propose 命令
```

命令文件格式：

```markdown
---
description: 创建一个新的 Issue
argument-hint: "<描述> ; <类型> ; <产品>"
allowed-tools: Bash
---

根据以下描述创建 Issue：$ARGUMENTS
```

详见 [斜杠命令文档](slash-commands.md)。

---

## 配置优先级

多层配置按以下优先级应用（高优先级覆盖低优先级）：

```
命令行参数                         （最高优先级）
    ↓
.codebuddy/settings.local.json    （项目本地，不提交版本控制）
    ↓
.codebuddy/settings.json          （项目共享，团队统一）
    ↓
~/.codebuddy/settings.json        （用户全局，个人偏好）
    ↓
产品内置默认配置                   （最低优先级）
```

代理/技能/规则的优先级：**项目级 > 用户级 > 插件级**，同名时项目级优先。

## 记忆加载顺序

```
1. 用户级记忆：~/.codebuddy/CODEBUDDY.md
2. 用户级规则：~/.codebuddy/rules/*.md（递归）
3. 项目级记忆：CODEBUDDY.md（从 cwd 向上递归查找）
4. 项目级规则：.codebuddy/rules/*.md（仅 cwd，不向上）
5. 项目本地记忆：CODEBUDDY.local.md
6. 子目录记忆：工具操作文件时动态加载该子目录的 CODEBUDDY.md
```

## 版本控制建议

| 文件/目录 | 是否提交版本控制 | 说明 |
|-----------|:---:|------|
| `.codebuddy/settings.json` | ✅ 建议提交 | 团队共享配置 |
| `.codebuddy/settings.local.json` | ❌ 不提交 | 自动添加至 .gitignore |
| `CODEBUDDY.md` / `.codebuddy/CODEBUDDY.md` | ✅ 建议提交 | 团队共享知识 |
| `CODEBUDDY.local.md` | ❌ 不提交 | 自动添加至 .gitignore |
| `.codebuddy/agents/` | ✅ 建议提交 | 团队共享子代理 |
| `.codebuddy/rules/` | ✅ 建议提交 | 团队共享规则 |
| `.codebuddy/skills/` | ✅ 建议提交 | 团队共享技能 |
| `.codebuddy/commands/` | ✅ 建议提交 | 团队共享命令 |

## 相关资源

- [设置配置](settings.md) — 完整的配置字段参考
- [记忆管理](memory.md) — CODEBUDDY.md 和规则系统详解
- [子代理](sub-agents.md) — 创建和使用自定义子代理
- [Skills 文档](skills.md) — 技能系统详解
- [斜杠命令](slash-commands.md) — 自定义命令参考
- [MCP 文档](mcp.md) — MCP 服务器配置

---

*合理利用 `.codebuddy` 目录，让 CodeBuddy Code 更了解你的项目和团队规范。*
