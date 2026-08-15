> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/hooks.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# Hook 参考指南

> **版本要求**：本文档针对 CodeBuddy Code v1.16.0 及以上版本中提供的 Hooks 实现。
> **功能状态**：Hook 功能当前处于 **Beta** 阶段，接口和行为可能在未来版本中调整。

Hook（钩子）允许你在 CodeBuddy Code 的会话生命周期内插入自定义脚本或命令，实现自动化校验、环境初始化、合规检查等高级能力。

---

## 功能概览

- 完整支持 Hook 事件家族（27+ 种），覆盖工具生命周期（`PreToolUse` / `PostToolUse` / `PostToolUseFailure`）、会话与子代理（`SessionStart` / `SessionEnd` / `Stop` / `SubagentStart` / `SubagentStop` / `StopFailure`）、用户交互（`UserPromptSubmit` / `Notification` / `PermissionRequest` / `PermissionDenied` / `Elicitation` / `ElicitationResult`）、上下文（`PreCompact` / `PostCompact` / `InstructionsLoaded` / `ConfigChange`）、任务与团队（`TaskCreated` / `TaskCompleted` / `TeammateIdle`）、文件与环境（`FileChanged` / `CwdChanged` / `WorktreeCreate` / `WorktreeRemove`）以及启动/维护（`Setup`）。完整事件清单见[插件参考的事件表](./plugins-reference.md#3-hooks钩子)。
- 在自定义 Agent / Skill 的 frontmatter 里直接声明 hooks，scope 与 subagent 生命周期绑定（详见[本文末尾章节](#agent--skill-frontmatter-hooks)）。
- 支持基于正则表达式的 matcher，可按工具名称或事件上下文筛选执行。
- 自动注入 `session_id`、会话转录文件、当前工作目录等上下文信息。
- 支持退出码与 JSON 输出双模式，提供清晰的决策语义。
- 支持 CLI `/hooks` 面板进行图形化配置，所有外部修改需在面板审核后生效，保障安全。
- 钩子脚本在 60 秒超时后自动终止，不影响其他 hook 执行。

---

## 配置

CodeBuddy Code hooks 存储在你的设置文件中：

| 作用域 | 文件路径 | 说明 |
| --- | --- | --- |
| 用户级 | `~/.codebuddy/settings.json` | 适用于所有项目 |
| 项目级 | `<项目根>/.codebuddy/settings.json` | 对项目成员共享的配置 |
| 项目本地 | `<项目根>/.codebuddy/settings.local.json` | 本地未提交配置 |
| 企业策略 | 集成发布的策略文件 | 受企业统一管理 |

**配置合并规则**：来自不同作用域的 hooks 会**合并**而非覆盖。同一事件的所有匹配 hooks 都会并行执行。

## 结构

Hooks 按匹配器组织，每个匹配器可以有多个 hooks:

```json
{
  "hooks": {
    "EventName": [
      {
        "matcher": "ToolPattern",
        "hooks": [
          {
            "type": "command",
            "command": "your-command-here"
          }
        ]
      }
    ]
  }
}
```

**关键字段：**

- **matcher**：用于匹配工具名称的正则表达式模式，区分大小写（仅适用于 PreToolUse 和 PostToolUse)
  - 简单字符串匹配：`Write` 会匹配任何包含 "Write" 的工具名（如 `Write`、`NotebookWrite`）
  - 精确匹配：使用 `^Write$` 仅匹配 Write 工具
  - 多工具匹配：`Edit|Write` 或 `Web.*`
  - 匹配所有工具：以下三种方式等效
    - 使用 `*` 字符
    - 使用空字符串 `""`
    - 省略 matcher 字段
- **hooks**：当模式匹配时执行的 hooks 数组
  - **type**: Hook 执行类型 - `"command"` 用于 shell 命令，或 `"prompt"` 用于基于 LLM 的评估
  - **command**: （对于 type: `"command"`）要执行的 shell 命令（可以使用 `$CODEBUDDY_PROJECT_DIR` 环境变量）。在 macOS/Linux 上使用用户默认 shell（`$SHELL`）执行，在 Windows 上**强制使用 Git Bash** 执行（不支持 cmd.exe 或 PowerShell），因此命令需兼容 bash 语法
  - **prompt**: （对于 type: `"prompt"`）发送给 LLM 进行评估的提示词（仅支持 `Stop`、`UserPromptSubmit`、`PreToolUse` 事件）
  - **timeout**: （可选）hook 运行多长时间（以秒为单位）后取消该特定 hook

对于不使用匹配器的事件（如 UserPromptSubmit、Stop 和 SubagentStop)，你可以省略 matcher 字段：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/prompt-validator.py"
          }
        ]
      }
    ]
  }
}
```

## 项目特定的 Hook 脚本

你可以使用环境变量 `CODEBUDDY_PROJECT_DIR`（仅在 CodeBuddy Code 生成 hook 命令时可用）来引用存储在项目中的脚本：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CODEBUDDY_PROJECT_DIR\"/.codebuddy/hooks/check-style.sh"
          }
        ]
      }
    ]
  }
}
```

> **提示**：如果你的 hook 脚本是 Python 文件，请显式使用 `python3` 来调用，而不是直接执行 `.py` 文件。因为在 Windows 上即使脚本包含 shebang 行（`#!/usr/bin/env python3`），Git Bash 也不一定能正确识别：
> ```json
> "command": "python3 \"$CODEBUDDY_PROJECT_DIR\"/.codebuddy/hooks/my_hook.py"
> ```

## 插件 Hooks

插件可以提供与用户和项目 hooks 无缝集成的 hooks。启用插件时，插件 hooks 会自动与你的配置合并。

**插件 hooks 的工作方式：**

- 插件 hooks 在插件的 `hooks/hooks.json` 文件中定义，或在 hooks 字段提供的自定义路径的文件中定义
- 当插件启用时，其 hooks 会与用户和项目 hooks 合并
- 来自不同来源的多个 hooks 可以响应同一事件
- 插件 hooks 使用 `${CODEBUDDY_PLUGIN_ROOT}` 环境变量来引用插件文件

插件 hook 配置示例：

```json
{
  "description": "Automatic code formatting",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CODEBUDDY_PLUGIN_ROOT}/scripts/format.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## 基于提示词的 Hooks

除了 bash 命令 hooks（`type: "command"`），CodeBuddy Code 还支持基于提示词的 hooks（`type: "prompt"`），使用 LLM 来评估是否允许或阻止某个操作。

> **支持的事件**：目前仅支持 `Stop`、`UserPromptSubmit` 和 `PreToolUse` 三种事件。

> **会话级捷径**：内置斜杠命令 [`/goal`](./goal.md) 是 prompt-based Stop hook 的开箱即用封装——直接输入 `/goal <condition>` 即可让 CodeBuddy 持续工作直到条件满足，无需手写 hook 配置。如果你的判定逻辑可以靠条件文本表达，优先用 `/goal`；只有需要更复杂的 prompt 编排或跨多事件协作时才回到本节自己写 prompt hook。

### 基于提示词的 hooks 如何工作

基于提示词的 hooks 不是执行 bash 命令，而是：

1. 将 hook 输入和你的提示词发送给快速小模型（绑定到 `lite` 槽位的小模型，按 model provider 分别映射）
2. LLM 使用包含决策的结构化 JSON 响应
3. CodeBuddy Code 自动处理决策

### 支持的事件

| 事件 | 用途 |
| --- | --- |
| `Stop` | 智能决定 CodeBuddy 是否应继续工作 |
| `UserPromptSubmit` | 使用 LLM 协助验证用户提示 |
| `PreToolUse` | 做出上下文感知的权限决策 |

### 与 Command Hook 的比较

| 特性 | Command Hooks | Prompt Hooks |
| --- | --- | --- |
| **执行方式** | 运行 bash 脚本 | 查询 LLM |
| **决策逻辑** | 你在代码中实现 | LLM 评估上下文 |
| **设置复杂性** | 需要脚本文件 | 只需配置提示词 |
| **上下文感知** | 受脚本逻辑限制 | 自然语言理解 |
| **性能** | 快速（本地执行） | 较慢（API 调用） |
| **适用场景** | 确定性规则 | 上下文感知决策 |

### 配置

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if CodeBuddy should stop: $ARGUMENTS. Check if all tasks are complete."
          }
        ]
      }
    ]
  }
}
```

**字段：**

- **type**：必须为 `"prompt"`
- **prompt**：发送给 LLM 的提示词文本
  - 使用 `$ARGUMENTS` 作为 hook 输入 JSON 的占位符，会被直接替换
  - 如果不存在 `$ARGUMENTS`，输入 JSON 会以 `\n\nARGUMENTS:\n{JSON}` 格式追加到提示词末尾
- **timeout**: （可选） 超时时间（秒）（默认： 30 秒）
- **continueOnBlock**: （可选）当 prompt hook 返回 `ok: false` 时，是否让 Agent 继续工作而不是停止。设为 `true` 时行为类似 `/goal`：`reason` 会注入对话历史，Agent 继续循环直到条件满足。仅对 `Stop`/`SubagentStop` 事件有意义。默认为 `false`（Agent 停止）

### 响应模式

LLM 必须使用包含以下内容的 JSON 响应：

```jsonc
{
  "ok": true | false,
  "reason": "Explanation for the decision",  // 当 ok 为 false 时必需
  "impossible": false                          // 可选，仅 Stop 事件下生效
}
```

**响应字段：**

- `ok`：`true` 允许操作，`false` 阻止操作
- `reason`：当 `ok` 为 `false` 时必需，显示给 CodeBuddy 的解释
- `impossible`：可选布尔值，仅 `Stop` hook 下有意义。`{ok: false, impossible: true}` 表示评估器判断"在当前会话里这个目标根本不可能完成"（条件自相矛盾、依赖资源不可用、模型已穷尽合理尝试）。CodeBuddy 不再继续循环，UI 显示"无法达成"终态。普通 `{ok: false}` 仍按"未达成、继续工作"处理。

**reason 注入 history 的语义**：`Stop` hook 返回 `{ok: false}` 时，`reason` 文本不是简单地"显示给 CodeBuddy"——它会以 `isMeta=true` 的内部 user message 形式注入到对话 history 中，让主模型在下一轮看到评估器的视角，从而精准补做欠缺的部分。这是 prompt-based Stop hook 能驱动多轮迭代收敛的核心机制（`/goal` 命令底层就是依赖这条链路）。

### 示例：智能 Stop Hook

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether CodeBuddy should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

### 示例：持续工作的 Stop Hook（continueOnBlock）

通过设置 `continueOnBlock: true`，prompt Stop hook 可以在条件不满足时驱动 Agent 继续工作，类似 `/goal` 的效果：

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Check if all tests pass and code is properly formatted. Context: $ARGUMENTS\n\nIf tests pass and code is clean, return {\"ok\": true}.\nIf not, return {\"ok\": false, \"reason\": \"describe what still needs to be fixed\"}.",
            "continueOnBlock": true,
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

当 `continueOnBlock` 为 `true` 时：
- `ok: true` → Agent 正常停止
- `ok: false` → `reason` 注入对话历史，Agent 继续工作直到条件满足
- `ok: false, impossible: true` → Agent 停止，显示"目标不可达成"

当 `continueOnBlock` 为 `false`（默认）时：
- `ok: false` → Agent 停止，不会继续循环

### 示例：UserPromptSubmit 验证

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if this user prompt is safe and appropriate. Input: $ARGUMENTS\n\nCheck if:\n- The prompt contains sensitive information (passwords, secrets)\n- The request is clear and actionable\n- Any security concerns exist\n\nReturn: {\"ok\": true} to allow, or {\"ok\": false, \"reason\": \"explanation\"} to block."
          }
        ]
      }
    ]
  }
}
```

### 示例：PreToolUse 权限决策

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Evaluate if this bash command should be allowed. Input: $ARGUMENTS\n\nCheck if:\n- The command is safe and non-destructive\n- It doesn't access sensitive files or directories\n- It aligns with the user's stated goals\n\nReturn: {\"ok\": true} to allow, or {\"ok\": false, \"reason\": \"explanation\"} to deny."
          }
        ]
      }
    ]
  }
}
```

### 最佳实践

- **在提示词中具体说明**：清楚描述你希望 LLM 评估的内容
- **包含决策标准**：列出 LLM 应考虑的因素
- **测试你的提示词**：验证 LLM 为你的用例做出正确的决策
- **设置适当的超时**：默认为 30 秒，如果需要可调整
- **用于复杂决策**：Command hooks 更适合简单的、确定性的规则

## Hook 事件

### 事件类型

| 事件 | 触发时机 | matcher 字段 | 典型场景 |
| --- | --- | --- | --- |
| `PreToolUse` | 工具执行前 | 支持（工具名） | 校验命令、二次审批、日志记录 |
| `PostToolUse` | 工具成功执行后 | 支持 | 自动格式化、补充上下文、压缩/替换工具结果 |
| `Notification` | 权限请求或 60 秒无输入提醒 | 部分支持 | 桌面提示、IM 通知 |
| `UserPromptSubmit` | 用户提交消息时<br/>**注：不包括内部命令** | 不支持 | 内容审查、上下文注入 |
| `Stop` | 主代理响应结束时 | 不支持 | 要求继续执行、追加提醒 |
| `SubagentStop` | 子代理（TaskTool）结束时 | 不支持 | 子任务继续执行或补充说明 |
| `PreCompact` | 执行上下文压缩前 | 支持（`manual`/`auto`） | 保留关键信息、防止压缩 |
| `SessionStart` | 会话创建或恢复时 | 支持（`startup`/`resume`/`clear`/`compact`） | 环境初始化、变量注入 |
| `SessionEnd` | 会话结束时 | 支持（`clear`/`logout`/`prompt_input_exit`/`other`） | 清理资源、持久化日志 |

### PreToolUse

在 CodeBuddy 创建工具参数之后、处理工具调用之前运行。

**常见匹配器：**

- `Task` - 子代理任务
- `Bash` - Shell 命令
- `Glob` - 文件模式匹配
- `Grep` - 内容搜索
- `Read` - 文件读取
- `Edit` - 文件编辑
- `Write` - 文件写入
- `WebFetch`, `WebSearch` - Web 操作

### PostToolUse

在工具成功完成后立即运行。识别与 PreToolUse 相同的匹配器值。

### Notification

在 CodeBuddy Code 发送通知时运行。支持匹配器以按通知类型过滤。

**常见匹配器（部分支持）:**

- `permission_prompt` - 来自 CodeBuddy Code 的权限请求
- `idle_prompt` - 当 CodeBuddy 等待用户输入时（空闲时间超过 60 秒后）
- `auth_success` - 身份验证成功通知
- `elicitation_dialog` - 当 CodeBuddy Code 需要 MCP 工具引导的输入时（暂未支持）

示例：

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/permission-alert.sh"
          }
        ]
      },
      {
        "matcher": "idle_prompt",
        "hooks": [
          {
            "type": "command",
            "command": "/path/to/idle-notification.sh"
          }
        ]
      }
    ]
  }
}
```

### UserPromptSubmit

在用户提交提示词后、CodeBuddy 处理之前运行。这允许你根据提示词/对话添加额外的上下文、验证提示词或阻止某些类型的提示词。

### Stop

在主 CodeBuddy Code 代理完成响应时运行。如果停止是由于用户中断而发生的，则不会运行。

> **会话级捷径**：内置斜杠命令 [`/goal`](./goal.md) 是 session-scoped prompt-based Stop hook 的封装——`/goal <condition>` 一行即可注册一个让 CodeBuddy 持续工作到条件满足为止的 Stop hook，并自动处理三态评估（达成 / 未达成继续 / 不可达成）、turn 计数、token 统计、`/resume` 自动恢复等细节。需要会话级"持续工作直到 X"时优先考虑 `/goal`，不必手写 hook 配置。

### SubagentStop

在 CodeBuddy Code 子代理(Agent 工具调用）完成响应时运行。

### PreCompact

在 CodeBuddy Code 即将运行压缩操作之前运行。

**匹配器：**

- `manual` - 从 `/compact` 调用
- `auto` - 从自动压缩调用（由于上下文窗口已满）

### SessionStart

在 CodeBuddy Code 启动新会话或恢复现有会话时运行。

**匹配器：**

- `startup` - 从启动调用
- `resume` - 从 `--resume`、`--continue` 或 `/resume` 调用
- `clear` - 从 `/clear` 调用
- `compact` - 从自动或手动压缩调用

### SessionEnd

在 CodeBuddy Code 会话结束时运行。用于清理任务、记录会话统计信息或保存会话状态。

**reason 字段将是以下之一：**

- `clear` - 使用 `/clear` 命令清除会话
- `logout` - 用户注销
- `prompt_input_exit` - 用户在提示词输入可见时退出
- `other` - 其他退出原因（包括正常退出）

## Hook 输入

Hooks 通过 stdin 接收包含会话信息和事件特定数据的 JSON 数据：

```jsonc
{
  // 公共字段
  "session_id": "string",
  "transcript_path": "string",  // 对话 JSON 的路径
  "cwd": "string",              // 调用 hook 时的当前工作目录
  "permission_mode": "string",  // 当前权限模式： "default"、"plan"、"acceptEdits" 或 "bypassPermissions"

  // 事件特定字段
  "hook_event_name": "string"
  // ...
}
```

### PreToolUse 输入

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.codebuddy/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "PreToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "content": "file content"
  }
}
```

### PostToolUse 输入

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.codebuddy/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "PostToolUse",
  "tool_name": "Write",
  "tool_input": {
    "file_path": "/path/to/file.txt",
    "content": "file content"
  },
  "tool_response": {
    "filePath": "/path/to/file.txt",
    "success": true
  }
}
```

### Notification 输入

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.codebuddy/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "Notification",
  "message": "CodeBuddy needs your permission to use Bash",
  "notification_type": "permission_prompt"
}
```

### UserPromptSubmit 输入

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.codebuddy/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Write a function to calculate the factorial of a number"
}
```

### Stop 和 SubagentStop 输入

当 CodeBuddy Code 已经由于 stop hook 的结果而继续时，`stop_hook_active` 为 true。

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/xxx/.codebuddy/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "permission_mode": "default",
  "hook_event_name": "Stop",
  "stop_hook_active": true
}
```

### PreCompact 输入

对于手动触发，`custom_instructions` 来自用户传入 `/compact` 的内容。对于自动触发,`custom_instructions` 为空。

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/xxx/.codebuddy/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "permission_mode": "default",
  "hook_event_name": "PreCompact",
  "trigger": "manual",
  "custom_instructions": ""
}
```

### SessionStart 输入

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/xxx/.codebuddy/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "permission_mode": "default",
  "hook_event_name": "SessionStart",
  "source": "startup"
}
```

### SessionEnd 输入

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/xxx/.codebuddy/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "SessionEnd",
  "reason": "other"
}
```

## Hook 输出

Hooks 有两种方式将输出返回给 CodeBuddy Code。

### 简单方式： 退出代码

Hooks 通过退出代码、stdout 和 stderr 传达状态：

- **退出代码 0**：成功。stdout 在 transcript 模式(CTRL-R)中显示给用户，但 UserPromptSubmit 和 SessionStart 除外，其中 stdout 会添加到上下文中。
- **退出代码 2**：阻塞错误。消息来源优先级：stdout（JSON 的 `reason`/`stopReason` 字段或纯文本）> stderr。即 **stderr 仅作为 fallback**，只有当 stdout 没有输出任何内容时才会传递给 CodeBuddy。因此调试日志可以安全地写入 stderr，不会污染给 Agent 的反馈消息。
- **其他退出代码**：非阻塞错误。stderr 显示给用户，执行继续。

#### 退出代码 2 的行为

> **注意**：下表中"显示消息"指的是按优先级从 stdout 或 stderr 获取的消息（参见上文 fallback 说明）。

| Hook 事件 | 行为 |
|------------|----------|
| PreToolUse | 阻止工具调用，向 CodeBuddy 显示消息 |
| PostToolUse | 向 CodeBuddy 显示消息（工具已运行，用于补充上下文）；可用 `updatedToolOutput` 替换工具结果 |
| Notification | N/A，仅向用户显示消息 |
| UserPromptSubmit | 阻止提示词处理，清除提示词，仅向用户显示消息 |
| Stop | 阻止停止，向 CodeBuddy 显示消息并继续对话 |
| SubagentStop | 阻止停止，向 CodeBuddy 子代理显示消息并继续执行 |
| PreCompact | 阻止压缩操作，仅向用户显示消息 |
| SessionStart | N/A，仅向用户显示消息 |
| SessionEnd | N/A，仅向用户显示消息 |

### 高级方式： JSON 输出

Hooks 可以在 stdout 中返回结构化 JSON 以实现更复杂的控制。

#### 公共 JSON 字段

所有 hook 类型都可以包含这些可选字段：

```jsonc
{
  "continue": true, // CodeBuddy 在 hook 执行后是否继续（默认： true)
  "stopReason": "string", // 当 continue 为 false 时显示给 CodeBuddy 的消息
  "reason": "string", // stopReason 的别名，两者等效

  "suppressOutput": true, // 在 transcript 模式中隐藏 stdout（默认： false)
  "systemMessage": "string" // 显示给用户的可选警告消息（不传给 Agent）
}
```

**消息字段说明**：
- `stopReason` / `reason`：传递给 CodeBuddy Agent 的消息，用于解释为什么阻止操作
- `systemMessage`：仅显示给用户的警告信息，不会传给 Agent

#### PreToolUse 决策控制

PreToolUse hooks 可以控制工具调用是否继续。

```jsonc
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow" | "deny" | "ask",
    "permissionDecisionReason": "显示在权限对话框中的原因说明",
    "modifiedInput": {
      "field_to_modify": "new value"
    }
  }
}
```

- `"allow"` 绕过权限系统，直接执行工具
- `"deny"` 阻止工具调用执行，`permissionDecisionReason` 会传递给 Agent
- `"ask"` 要求用户在 UI 中确认工具调用，`permissionDecisionReason` 会显示在确认对话框中
- `modifiedInput` 允许你在执行前修改工具的输入参数（部分字段覆盖）

#### PostToolUse 上下文注入与结果替换

PostToolUse 在工具执行**完成后**触发，无法阻止已执行的操作，但可以：

1. 向 Agent **追加**额外上下文（`additionalContext`）；
2. **替换**将要发送给 Agent 的工具结果（`updatedToolOutput`）。

**追加上下文**（原始工具结果保留，在其后追加一段提示）：

```jsonc
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "补充给 CodeBuddy 的额外信息，如代码规范检查结果"
  }
}
```

**替换工具结果**（用返回值整个替换原始工具输出后再发给 Agent）：

```jsonc
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "updatedToolOutput": "精简后的工具输出"
  }
}
```

- `updatedToolOutput` 对**所有工具**生效（内置工具与 MCP 工具均可）。
- 典型用途：压缩冗长的工具输出（如超大命令日志、超长文件内容）以节省上下文 token —— 这类"压缩型" hook 依赖的正是替换能力。
- 与 `additionalContext` 的区别：`additionalContext` 是**追加**（结果只会变长），`updatedToolOutput` 是**替换**（结果可以变短）。
- 两者可同时返回：先用 `updatedToolOutput` 替换，再把 `additionalContext` 追加到替换后的内容上。
- 对 MCP 工具，返回的 `updatedToolOutput` 若为数组则原样作为 MCP content 数组，否则包装为单个文本块。

> **注意**：`decision: "block"` 字段已废弃。由于工具已执行完成，此时无法真正"阻止"操作。

#### UserPromptSubmit 决策控制

```jsonc
{
  "continue": false, // 设为 false 阻止提示词处理
  "reason": "阻止原因（仅显示给用户）",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "注入给 CodeBuddy 的额外上下文"
  }
}
```

> **注意**：`decision: "block"` 字段已废弃，请使用 `continue: false`。

#### Stop/SubagentStop 决策控制

```jsonc
{
  "continue": false, // 设为 false 阻止停止，让 Agent 继续工作
  "reason": "告诉 Agent 为什么需要继续工作的原因"
}
```

> **注意**：`decision: "block"` 字段已废弃，请使用 `continue: false`。

#### SessionStart 决策控制

```jsonc
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "My additional context here"
  }
}
```

## 使用 MCP 工具

CodeBuddy Code hooks 与模型上下文协议(MCP)工具无缝配合。

### MCP 工具命名

MCP 工具遵循 `mcp__<server>__<tool>` 模式，例如：

- `mcp__memory__create_entities` - Memory 服务器的创建实体工具
- `mcp__filesystem__read_file` - Filesystem 服务器的读取文件工具
- `mcp__github__search_repositories` - GitHub 服务器的搜索工具

### 为 MCP 工具配置 Hooks

你可以针对特定的 MCP 工具或整个 MCP 服务器：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__memory__.*",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Memory operation initiated' >> ~/mcp-operations.log"
          }
        ]
      },
      {
        "matcher": "mcp__.*__write.*",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /home/user/scripts/validate-mcp-write.py"
          }
        ]
      }
    ]
  }
}
```

## 安全注意事项

### 免责声明

**使用风险自负**: CodeBuddy Code hooks 会在你的系统上自动执行任意 shell 命令。通过使用 hooks，你承认：

- 你对所配置的命令负全部责任
- Hooks 可以修改、删除或访问你的用户账户可以访问的任何文件
- 恶意或编写不当的 hooks 可能导致数据丢失或系统损坏
- Tencent Cloud 不提供任何保证，并对因使用 hooks 而导致的任何损害不承担任何责任
- 你应该在安全环境中彻底测试 hooks，然后再在生产环境中使用

### 安全最佳实践

1. **验证和清理输入** - 永远不要盲目信任输入数据
2. **始终引用 shell 变量** - 使用 `"$VAR"` 而不是 `$VAR`
3. **阻止路径遍历** - 检查文件路径中的 `..`
4. **使用绝对路径** - 为脚本指定完整路径（对项目路径使用 `"$CODEBUDDY_PROJECT_DIR"`)
5. **跳过敏感文件** - 避免 `.env`、`.git/`、密钥等

### 配置安全

直接编辑设置文件中的 hooks 不会立即生效。CodeBuddy Code:

1. 在启动时捕获 hooks 的快照
2. 在整个会话期间使用此快照
3. 如果 hooks 在外部被修改，会发出警告
4. 需要在 `/hooks` 菜单中审查才能应用更改

## Hook 执行详情

- **超时**：默认 60 秒执行限制，可按命令配置
- **并行化**：所有匹配的 hooks 并行运行
- **去重**：多个相同的 hook 命令会自动去重
- **执行 Shell**：
  - **macOS/Linux**：使用用户默认 shell（`$SHELL` 环境变量，通常为 bash 或 zsh），回退到 `/bin/sh`
  - **Windows**：**强制使用 Git Bash**（不支持 cmd.exe 或 PowerShell）。如果未找到 Git Bash，会报错提示安装 [Git for Windows](https://git-scm.com/download/win)。可通过 `CODEBUDDY_CODE_GIT_BASH_PATH` 环境变量指定 bash.exe 路径
  - 可通过 `CODEBUDDY_CODE_SHELL` 环境变量覆盖默认 shell（仅支持 POSIX shell：bash、zsh、sh）
- **环境**：在当前目录中使用 CodeBuddy Code 的环境运行
  - `CODEBUDDY_PROJECT_DIR` 环境变量包含项目根目录的绝对路径
- **输入**：通过 stdin 的 JSON
- **输出**:
  - PreToolUse/PostToolUse/Stop/SubagentStop：在 transcript 中显示进度(Ctrl-R)
  - Notification/SessionEnd：仅记录到调试(`--debug`)
  - UserPromptSubmit/SessionStart: stdout 作为上下文添加给 CodeBuddy

## 调试

### 基本故障排除

如果你的 hooks 不工作：

1. **检查配置** - 运行 `/hooks` 查看你的 hook 是否已注册
2. **验证语法** - 确保你的 JSON 设置有效
3. **测试命令** - 首先手动运行 hook 命令
4. **检查权限** - 确保脚本可执行
5. **查看日志** - 使用 `codebuddy --debug` 查看 hook 执行详情

**常见问题：**

- 引号未转义 - 在 JSON 字符串中使用 `\"`
- 错误的匹配器 - 检查工具名称是否完全匹配（区分大小写）
- 找不到命令 - 为脚本使用完整路径

### 高级调试

对于复杂的 hook 问题：

1. **检查 hook 执行** - 使用 `codebuddy --debug` 查看详细的 hook 执行
2. **验证 JSON 模式** - 使用外部工具测试 hook 输入/输出
3. **检查环境变量** - 验证 CodeBuddy Code 的环境是否正确
4. **测试边缘情况** - 尝试使用不寻常的文件路径或输入的 hooks
5. **监控系统资源** - 检查 hook 执行期间的资源耗尽
6. **使用结构化日志** - 在你的 hook 脚本中实现日志记录

### 调试输出示例

**注：该功能暂未支持。**

使用 `codebuddy --debug` 查看 hook 执行详情：

```text
[DEBUG] Executing hooks for PostToolUse:Write
[DEBUG] Getting matching hook commands for PostToolUse with query: Write
[DEBUG] Found 1 hook matchers in settings
[DEBUG] Matched 1 hooks for query "Write"
[DEBUG] Found 1 hook commands to execute
[DEBUG] Executing hook command: <Your command> with timeout 60000ms
[DEBUG] Hook command completed with status 0: <Your stdout>
```

进度消息出现在 transcript 模式 （Ctrl-R) 中，显示：

- 正在运行哪个 hook
- 正在执行的命令
- 成功/失败状态
- 输出或错误消息

## Agent / Skill Frontmatter Hooks

除了在 `~/.codebuddy/settings.json` 中全局配置 hooks 外，还可以直接在自定义 Agent 的 `.md` 文件或 Skill 的 `SKILL.md` 的 YAML frontmatter 里声明 `hooks` 字段。这种方式让 Hook 与 Agent / Skill 一起作为"原子单位"分发，scope 自动随 subagent 生命周期开闭，不污染主会话。

### 字段格式

`hooks` 字段结构和 settings.json 完全一致——按事件名分组，每个事件下若干个 `{matcher?, hooks[]}` 配置；hook `type` 支持 `command` / `prompt` / `agent` / `http` 四种：

```yaml
---
name: my-reviewer
description: Code reviewer with pre-tool-use guard
hooks:
  PreToolUse:
    - matcher: Bash
      hooks:
        - type: command
          command: ./guard.sh
          once: true
  SubagentStop:
    - hooks:
        - type: command
          command: echo "reviewer finished"
        - type: http
          url: https://example.com/notify
          method: POST
---
```

### 生命周期与作用域

- **范围限定**：Skill 仅 `context: fork` 时支持 frontmatter hooks（注入路径无清晰生命周期边界，不接入）；自定义 Agent 总是支持。
- **自动注册/清理**：subagent 启动时把 frontmatter hooks 注册到 `ScopedHookRegistry`，subagent 退出时自动注销。Hooks 仅对该 subagent 自身的工具调用 / 生命周期事件生效。
- **`Stop` → `SubagentStop` 重写**：在 frontmatter 中写 `Stop` 事件会被自动重写为 `SubagentStop`——subagent 完成时不会触发主会话的 `Stop`，写 `Stop` 是想表达"subagent 自己结束"的语义。
- **与全局 hooks 合并**：相同事件下，frontmatter hooks 与 `settings.json` / 插件 `hooks/hooks.json` 会**叠加**（不覆盖），全部并行触发。

### 安全闸门（`allowUntrustedFrontmatterHooks`）

frontmatter hooks 可以静默触发 Shell 命令，因此**来自非内置来源的 frontmatter hooks 默认不会被注册**：

| 来源 | 默认是否注册 |
| --- | --- |
| Product 内置 Agent / Skill | ✅ 自动放行 |
| `.codebuddy/agents/*.md`（用户/项目本地 Agent） | ❌ 默认拒绝 |
| `.codebuddy/skills/SKILL.md`（用户/项目本地 Skill） | ❌ 默认拒绝 |
| 插件市场分发的 Agent / Skill | ❌ 默认拒绝 |
| 插件 `hooks/hooks.json`（不是 frontmatter） | ✅ 不受闸门约束 |

需要启用时，在 `~/.codebuddy/settings.json` 设置：

```json
{
  "allowUntrustedFrontmatterHooks": true
}
```

被闸门拦截时 CLI 会输出 warning：

```
[AgentTask] Frontmatter hooks from skill 'xxx' skipped
(source not admin-trusted; enable `allowUntrustedFrontmatterHooks` in settings to allow)
```

### 容错与诊断

- **静默丢弃非法定义**：单条 hook 不符合 schema 时只跳过该条，不影响整段 hooks 解析；warning 中包含 `event 'YYY' invalid: <详细原因>` 便于定位。
- **未知事件名**：会被 warning 跳过（`unknown event 'XXX'`），不会让整个 frontmatter 报废。
- **YAML 完全破损**：日志会输出 `Malformed YAML frontmatter in '<path>'`。
- **运行时调试**：`CODEBUDDY_DEBUG=1` 启动后可以看到 `[ScopedHookRegistry] registered N hook config(s) for scope '<sessionId>' (...)` 这样的注册日志，确认 hooks 是否就位。

> 在 Skill 中使用 frontmatter hooks 的完整示例见 [Skills 文档 - 在 Skill 中配置 Hooks](./skills.md#在-skill-中配置-hooks)。

---

通过本文档，你可以了解 CodeBuddy Code 中的 Hook 机制及其配置方式。若需快速实践示例，请继续阅读 [Hook 入门指南](./hooks-guide.md)。
