> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/cli-reference.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# CLI 参考

> CodeBuddy Code 命令行工具完整参考手册，包含所有命令和参数说明。

## CLI 命令

| 命令                                | 说明                                     | 示例                                           |
| :---------------------------------- | :--------------------------------------- | :--------------------------------------------- |
| `codebuddy`                         | 启动交互式 REPL                          | `codebuddy`                                    |
| `codebuddy "查询"`                  | 带初始提示词启动 REPL                    | `codebuddy "解释这个项目"`                     |
| `codebuddy -p "查询"`               | 通过 SDK 查询后退出                      | `codebuddy -p "解释这个函数"`                  |
| `cat 文件 \| codebuddy -p "查询"`   | 处理管道内容                             | `cat logs.txt \| codebuddy -p "分析日志"`      |
| `codebuddy -c`                      | 继续最近的对话                           | `codebuddy -c`                                 |
| `codebuddy -c -p "查询"`            | 通过 SDK 继续对话                        | `codebuddy -c -p "检查类型错误"`               |
| `codebuddy -r "<session-id>" "查询"` | 通过 ID 恢复会话                         | `codebuddy -r "abc123" "完成这个 MR"`          |
| `codebuddy update`                  | 更新到最新版本                           | `codebuddy update`                             |
| `codebuddy mcp`                     | 配置 Model Context Protocol (MCP) 服务器 | 参见 [CodeBuddy Code MCP 文档](./mcp.md)      |
| `codebuddy agents [--json]`         | 按来源分组列出全部已配置子代理            | `codebuddy agents --json`                      |
| `codebuddy daemon start`           | 启动 Daemon 守护进程                     | `codebuddy daemon start --port 8080`           |
| `codebuddy daemon stop`            | 停止 Daemon                              | `codebuddy daemon stop`                        |
| `codebuddy daemon status`          | 查看 Daemon 状态                         | `codebuddy daemon status`                      |
| `codebuddy daemon restart`         | 重启 Daemon                              | `codebuddy daemon restart`                     |
| `codebuddy daemon install`         | 注册为系统服务（登录自启）               | `codebuddy daemon install --port 8080`         |
| `codebuddy daemon uninstall`       | 移除系统服务注册                         | `codebuddy daemon uninstall`                   |
| `codebuddy auto-mode defaults`     | 打印 `auto` 模式的内置分类规则           | `codebuddy auto-mode defaults`                 |
| `codebuddy auto-mode config`       | 打印当前生效的 `auto` 模式配置           | `codebuddy auto-mode config`                   |
| `codebuddy auto-mode critique`     | 用 lite 模型审视你的自定义 `auto` 规则   | `codebuddy auto-mode critique`                 |
| `codebuddy ps`                     | 列出所有活跃 Worker 进程                 | `codebuddy ps`                                 |
| `codebuddy logs <pid\|name>`       | 查看 Worker 日志                         | `codebuddy logs feature-x`                     |
| `codebuddy attach <pid\|name>`     | 附加到后台 Worker                        | `codebuddy attach feature-x`                   |
| `codebuddy kill <pid\|name>`       | 终止 Worker 进程                         | `codebuddy kill feature-x`                     |

## CLI 参数

自定义 CodeBuddy Code 行为的命令行参数：

| 参数                             | 说明                                                                                                                              | 示例                                                                                               |
| :------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| `--add-dir`                      | 添加额外的工作目录供 CodeBuddy 访问（验证每个路径是否存在）                                                                         | `codebuddy --add-dir ../apps ../lib`                                                               |
| `--agent`                        | 指定当前会话使用的 agent 名称（内置或自定义 agent），优先级高于 settings.json 的 `agent` 配置                                         | `codebuddy --agent my-reviewer`                                                                    |
| `--agents`                       | 通过 JSON 动态定义自定义[子代理](./sub-agents.md)（格式见下文）                                                                     | `codebuddy --agents '{"reviewer":{"description":"审查代码","prompt":"你是代码审查员"}}'`            |
| `--allowedTools`                 | 除了[settings.json 文件](./settings.md)外,无需提示用户即可允许的工具列表                                                          | `"Bash(git log:*)" "Bash(git diff:*)" "Read"`                                                      |
| `--disallowedTools`              | 除了[settings.json 文件](./settings.md)外,应禁止使用的工具列表                                                                    | `"Bash(git log:*)" "Bash(git diff:*)" "Edit"`                                                      |
| `--tools`                        | 限制可用的内置工具集（白名单）。空字符串 `""` 禁用所有内置工具，`"default"` 使用全部工具，或指定逗号分隔的工具名。支持 `Defer(X)` / `NoDefer(X)` 修饰符按需调整工具的延迟加载状态，详见 [工具延迟加载覆盖](tool-defer-overlay.md) | `codebuddy --tools "Bash,Read,Defer(Glob)"`                                                        |
| `--mcp-config <fileOrString>`    | 从 JSON 文件或 JSON 字符串加载 MCP 服务器配置                                                                                     | `codebuddy --mcp-config ./mcp.json`                                                                 |
| `--strict-mcp-config`            | 仅使用 `--mcp-config` 或 SDK `mcpServers` 提供的 MCP 服务器，忽略用户、项目和本地 `.mcp.json` 等文件型配置；未显式传入时，交互模式、`--serve` 和 ACP 会继续加载这些文件型配置 | `codebuddy --serve --strict-mcp-config`                                                             |
| `--no-session-persistence`       | 仅在内存中保留会话上下文，不创建或更新本地 transcript；仍可以只读加载已有会话                                      | `codebuddy --serve --no-session-persistence`                                                       |
| `--print`, `-p`                  | 打印响应后退出,不进入交互模式                             | `codebuddy -p "查询"`                                                                              |
| `--settings`                     | 从 JSON 文件或 JSON 字符串加载额外的设置配置                                                                                       | `codebuddy --settings '{"model":"gpt-5"}' "查询"`                                                  |
| `--setting-sources`              | 指定要加载的设置源,逗号分隔（可选值: `user`, `project`, `local`）。默认: `user,project,local`                                      | `codebuddy --setting-sources project,local "查询"`                                                 |
| `--system-prompt`                | 用自定义文本替换整个系统提示词（在交互和打印模式下都可用）                                                                          | `codebuddy --system-prompt "你是 Python 专家"`                                                     |
| `--system-prompt-file`           | 从文件加载系统提示词,替换默认提示词(仅打印模式)                                                                                   | `codebuddy -p --system-prompt-file ./custom-prompt.txt "查询"`                                     |
| `--append-system-prompt`         | 在默认系统提示词末尾追加自定义文本（在交互和打印模式下都可用）                                                                      | `codebuddy --append-system-prompt "始终使用 TypeScript"`                                           |
| `--output-format`                | 指定打印模式的输出格式(选项: `text`, `json`, `stream-json`)                                                                       | `codebuddy -p "查询" --output-format json`                                                         |
| `--input-format`                 | 指定打印模式的输入格式(选项: `text`, `stream-json`)                                                                               | `codebuddy -p --output-format json --input-format stream-json`                                     |
| `--json-schema`                  | 使用 JSON Schema 验证结构化输出。示例: `'{"type":"object","properties":{"name":{"type":"string"}},"required":["name"]}'`                                                                                   | `codebuddy -p --output-format json --json-schema '{"type":"object","properties":{...}}' "查询"`    |
| `--include-partial-messages`     | 在输出中包含部分流式事件（需要 `--print` 和 `--output-format=stream-json`)                                                         | `codebuddy -p --output-format stream-json --include-partial-messages "查询"`                       |
| `--verbose`                      | 启用详细日志记录,显示完整的轮次输出(在打印和交互模式下都有助于调试)                                                               | `codebuddy --verbose`                                                                              |
| `--brief`                        | 启用 `SendUserMessage` 工具，让 Agent 通过该工具向用户发送消息（也可用环境变量 `CODEBUDDY_BRIEF` 激活）；未开启时该工具不可见         | `codebuddy --brief "帮我实现登录页面"`                                                             |
| `--max-turns`                    | 限制非交互模式下的代理轮次数                                                                                                      | `codebuddy -p --max-turns 3 "查询"`                                                                |
| `--model`                        | 使用别名设置当前会话的模型，如最新模型的别名（`sonnet` 或 `opus`）或模型全名                                                         | `codebuddy --model gpt-5`                                                                          |
| `--autocompact`                  | 设置自动压缩窗口大小：`auto` 跟随模型窗口，或 token 数（如 `400000`、`400k`、`1m`，clamp 到 100k-1M）                                 | `codebuddy --autocompact 400k`                                                                     |
| `--text-to-image-model`          | 设置文生图功能使用的模型 ID                                                                                                           | `codebuddy --text-to-image-model your-image-model`                                                 |
| `--image-to-image-model`         | 设置图生图功能使用的模型 ID                                                                                                           | `codebuddy --image-to-image-model your-edit-model`                                                 |
| `--permission-mode`              | 以指定的[权限模式](./permission-modes.md)开始。常用值：`default`、`acceptEdits`、`auto`、`dontAsk`、`plan`、`bypassPermissions` | `codebuddy --permission-mode auto`                                                                 |
| `--subagent-permission-mode`     | 设置 subagent/团队成员的默认权限模式，覆盖从主 session 继承的模式。支持 `acceptEdits`、`default`、`plan`、`auto`、`dontAsk`、`bypassPermissions` | `codebuddy --subagent-permission-mode dontAsk`                                           |
| `--permission-prompt-tool`       | 指定在非交互模式下处理权限提示的 MCP 工具                                                                                         | `codebuddy -p --permission-prompt-tool mcp_auth_tool "查询"`                                       |
| `--resume`                       | 通过 ID 恢复特定会话,或在交互模式下选择                                                                                           | `codebuddy --resume abc123 "查询"`                                                                 |
| `--continue`                     | 加载当前目录中最近的对话                                                                                                          | `codebuddy --continue`                                                                             |
| `-y` / `--dangerously-skip-permissions` | 跳过权限提示（谨慎使用）                                                                                                            | `codebuddy -y` 或 `codebuddy --dangerously-skip-permissions`                                       |
| `--ide`                          | 启动时自动连接到 IDE（如果恰好有一个有效的 IDE 可用且打开了当前工作目录）                                                          | `codebuddy --ide`                                                                                  |
| `--sandbox`                      | 在沙箱中运行 CodeBuddy（详见下方[沙箱模式](#沙箱模式-beta))                                                                        | `codebuddy --sandbox "分析项目"`                                                                   |
| `--debug`                        | 启用调试模式,支持可选的类别过滤                                                                                                   | `codebuddy --debug`                                                                                |
| `--worktree [name]`              | 在独立的 git worktree 中运行（详见 [Worktree 文档](./worktree.md)）                                                               | `codebuddy --worktree` 或 `codebuddy --worktree my-feature`                                        |
| `--tmux`                         | 在 tmux 会话中运行（与 `--worktree` 配合使用）                                                                                     | `codebuddy --worktree --tmux`                                                                      |
| `--plugin-dir <dirs...>`         | 从本地目录加载插件（用于开发/测试），可指定多个路径。详见 [插件文档](plugins.md)                                                     | `codebuddy --plugin-dir ./my-plugin ../other-plugin`                                               |
| `--bg`                           | 后台运行会话（detached 模式），日志输出到 `~/.codebuddy/logs/`。详见 [Daemon 文档](daemon.md)                                      | `codebuddy --bg "实现登录页面"`                                                                    |
| `--name <name>`                  | 后台会话名称（与 `--bg` 配合使用，便于通过 `ps`/`logs`/`kill` 查找）                                                               | `codebuddy --bg --name feature-x "实现功能"`                                                       |
| `--serve`                        | 启动 HTTP 服务（Web UI、REST API、ACP 协议）                                                                                       | `codebuddy --serve --port 8080`                                                                    |
| `--prewarm`                      | 以预热待命模式启动：先完成启动初始化后挂起，等待外部通过 IPC 唤醒（唤醒时才绑定工作目录）。用于消除会话拉起时的冷启动等待。默认关闭。 | `codebuddy --prewarm --prewarm-id pool1`                                                           |
| `--prewarm-id <id>`              | 预热 IPC 端点标识（默认取进程 PID），用于构造本地 socket/管道地址。配合 `cbc-prewarm` 管理命令使用。                                | `codebuddy --prewarm --prewarm-id pool1`                                                           |

> **重要提示**：在使用 `-p/--print` 进行非交互式执行时，涉及文件读写、命令执行、网络请求等操作必须有一个明确的权限策略：最常见的是 `-y` / `--dangerously-skip-permissions`，也可以使用 `--permission-mode auto`、`--permission-mode dontAsk`、预先配置的 `permissions.allow` 规则，或专门的权限提示 MCP 工具。否则需要人工确认的操作会被阻止。

<Tip>
  `--output-format json` 参数特别适用于脚本和自动化，允许您以编程方式解析 CodeBuddy 的响应。
</Tip>

### Agents 参数格式

`--agents` 参数接受定义一个或多个自定义子代理的 JSON 对象。每个子代理需要一个唯一的名称（作为键）和一个包含以下字段的定义对象：

| 字段              | 必需 | 说明                                                                           |
| :---------------- | :--- | :----------------------------------------------------------------------------- |
| `description`     | 是   | 何时应调用子代理的自然语言描述                                                 |
| `prompt`          | 是   | 指导子代理行为的系统提示词                                                     |
| `tools`           | 否   | 子代理可以使用的特定工具数组（如 `["Read", "Edit", "Bash"]`)。省略则继承所有工具 |
| `disallowedTools` | 否   | 子代理禁止使用的工具数组（黑名单），与 session 级 `--disallowedTools` 取并集生效 |
| `model`           | 否   | 模型 ID、名称或别名、场景变体 `lite` / `reasoning`，或 `inherit` / `default`。省略或设为 `inherit` / `default` 时，继续通过正常的子代理解析链选择模型 |
| `effort`          | 否   | 推理强度：`minimal` / `low` / `medium` / `high` / `xhigh` / `max`。省略则继承会话强度 |
| `maxTurns`        | 否   | 子代理最大执行轮次（正整数）。优先级：env `CODEBUDDY_CODE_SUBAGENT_MAX_TURNS` > Agent 工具 `max_turns` 入参 > 本字段 |
| `background`      | 否   | 设为 `true` 时该子代理总是后台运行（等同 `run_in_background: true`）          |
| `initialPrompt`   | 否   | 该 agent 作为主会话 agent（`--agent` 或 settings `agent`）运行时，自动作为首条用户消息的前缀 |
| `memory`          | 否   | 持久记忆作用域：`user` / `project` / `local`，详见[子代理文档](./sub-agents.md) |

示例：

```bash
codebuddy --agents '{
  "code-reviewer": {
    "description": "专业代码审查员。代码更改后主动使用。",
    "prompt": "你是高级代码审查员。专注于代码质量、安全性和最佳实践。",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "lite"
  },
  "debugger": {
    "description": "错误和测试失败的调试专家。",
    "prompt": "你是专业调试人员。分析错误，识别根本原因并提供修复方案。"
  }
}'
```

有关创建和使用子代理的更多详细信息，请参见[子代理文档](./sub-agents.md)。

### 系统提示词参数

CodeBuddy Code 提供三个自定义系统提示词的参数，每个参数用途不同：

| 参数                     | 行为                   | 模式            | 使用场景                                       |
| :----------------------- | :--------------------- | :-------------- | :--------------------------------------------- |
| `--system-prompt`        | **替换**整个默认提示词 | 交互 + 打印模式 | 完全控制 CodeBuddy 的行为和指令                |
| `--system-prompt-file`   | 用文件内容**替换**     | 仅打印模式      | 从文件加载提示词以确保可重现性和版本控制       |
| `--append-system-prompt` | **追加**到默认提示词   | 交互 + 打印模式 | 添加特定指令同时保留默认 CodeBuddy Code 行为   |

**何时使用：**

* **`--system-prompt`**：当您需要完全控制 CodeBuddy 的系统提示词时使用。这会移除所有默认 CodeBuddy Code 指令，给您一个空白画布。
  ```bash
  codebuddy --system-prompt "你是只编写带类型注解代码的 Python 专家"
  ```

* **`--system-prompt-file`**：当您想从文件加载自定义提示词时使用，适用于团队一致性或版本控制的提示词模板。
  ```bash
  codebuddy -p --system-prompt-file ./prompts/code-review.txt "审查这个 MR"
  ```

* **`--append-system-prompt`**：当您想添加特定指令同时保留 CodeBuddy Code 的默认功能时使用。这是大多数用例的最安全选项。
  ```bash
  codebuddy --append-system-prompt "始终使用 TypeScript 并包含 JSDoc 注释"
  ```

<Note>
  `--system-prompt` 和 `--system-prompt-file` 互斥。不能同时使用这两个参数。
</Note>

<Tip>
  对于大多数用例，建议使用 `--append-system-prompt`,因为它在添加自定义需求的同时保留了 CodeBuddy Code 的内置功能。仅当需要完全控制系统提示词时才使用 `--system-prompt` 或 `--system-prompt-file`。
</Tip>

## 沙箱模式 （Beta)

> **Beta 功能**: Sandbox 功能目前处于 Beta 阶段。
> 
> **详细文档**：查看 [Bash 沙箱](./bash-sandboxing.md) 获取沙箱隔离功能说明。

### 沙箱参数

```bash
--sandbox [url]                       在沙箱中运行 CodeBuddy:
                                      - 不带参数或 "container"：使用容器 （Docker/Podman)
                                      - 提供完整的 E2B API URL：使用云端沙箱
--sandbox-upload-dir                  上传当前工作目录到沙箱 （仅 E2B)
--sandbox-new                         强制创建新沙箱 （忽略缓存的沙箱）
--sandbox-id <id>                     连接到指定的沙箱 ID 或别名
--sandbox-kill                        退出时终止沙箱 （默认： 保持运行以便复用）
--teleport <value>                    Teleport 模式： 连接到远程创建的沙箱
```

### 沙箱使用示例

```bash
# 容器沙箱 （Docker/Podman，自动挂载当前目录）
codebuddy --sandbox "分析这个项目"

# E2B 云端沙箱 （自动复用）
codebuddy --sandbox https://api.e2b.dev "创建 Python web 应用"

# 强制创建新沙箱
codebuddy --sandbox --sandbox-new "从头开始"

# 连接到指定沙箱
codebuddy --sandbox --sandbox-id sb_abc123 "继续工作"

# 退出时清理沙箱
codebuddy --sandbox --sandbox-kill "临时测试"

# Teleport 模式 - 连接到远程创建的沙箱
codebuddy --teleport session_abc123XYZ4567890 "连接到远程沙箱"
```

### 沙箱环境变量

```bash
E2B_API_KEY                          E2B API 密钥 （E2B 沙箱必需）
E2B_TEMPLATE                         E2B 模板 ID （默认： base)
CODEBUDDY_SANDBOX_IMAGE              自定义 Docker 镜像 （容器沙箱）
```

## 下一步

掌握 CLI 命令后，您可以：

- **[学习交互模式](./interactive-mode.md)** - 掌握键盘快捷键和技巧
- **[探索斜杠命令](./slash-commands.md)** - 了解内置命令
- **[Skills 技能系统](./skills.md)** - 扩展 AI 专业能力
- **[学习 MCP 集成](./mcp.md)** - 扩展工具能力

---

*精确的命令行操作是高效开发的基础*
