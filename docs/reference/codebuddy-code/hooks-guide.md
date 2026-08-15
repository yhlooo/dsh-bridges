> 来源: https://cnb.cool/codebuddy/codebuddy-code/-/git/raw/main/docs/hooks-guide.md (commit 3abd1a9)
> 复制日期: 2026-08-15 (UTC)；内容为 CodeBuddy Code 官方仓库文档原文，未改动

# Hooks 入门指南

学习如何通过注册 shell 命令来自定义和扩展 CodeBuddy Code 的行为

> 建议先阅读 [Hook 参考指南](./hooks.md)，了解所有事件、输入输出结构与安全要求。本指南聚焦于实际操作演练与常见示例，帮助你迅速在 CodeBuddy Code 项目中启用 Hooks 功能。
> **注意**：Hook 功能目前处于 **Beta** 阶段，仍在持续打磨，请留意后续版本更新。

---

CodeBuddy Code hooks 是用户定义的 shell 命令，在 CodeBuddy Code 生命周期的不同阶段执行。Hooks 提供了对 CodeBuddy Code 行为的确定性控制，确保特定操作始终发生，而不是依赖 LLM 选择执行它们。

> **执行环境**：Hook 命令在 macOS/Linux 上使用用户默认 shell（`$SHELL`）执行，在 **Windows 上强制使用 Git Bash** 执行（不支持 cmd.exe 或 PowerShell）。因此请确保你的 hook 命令兼容 bash 语法。Windows 用户需要安装 [Git for Windows](https://git-scm.com/download/win)。详见 [Hook 参考指南](./hooks.md) 中的执行详情。

关于 hooks 的参考文档，请参阅 [Hook 参考指南](./hooks.md)。

Hooks 的示例用例包括：

* **通知**：自定义 CodeBuddy Code 等待你的输入或权限时如何通知你。
* **自动格式化**：在每次文件编辑后对 `.ts` 文件运行 prettier,对 `.go` 文件运行 gofmt 等。
* **日志记录**：跟踪和统计所有执行的命令，用于合规或调试。
* **反馈**：当 CodeBuddy Code 生成的代码不符合你的代码库规范时提供自动反馈。
* **自定义权限**：阻止对生产文件或敏感目录的修改。

通过将这些规则编码为 hooks 而不是提示指令，你可以将建议转变为应用级代码，每次都按预期执行。

> ⚠️ **安全警告**：在添加 hooks 时必须考虑其安全影响，因为 hooks 会在 agent 循环期间使用你当前环境的凭据自动运行。例如，恶意 hooks 代码可能会泄露你的数据。在注册 hooks 之前务必审查其实现。有关完整的安全最佳实践，请参阅 [Hook 参考指南](./hooks.md)中的安全注意事项。

## Hook 事件概述

CodeBuddy Code 提供了在工作流程不同阶段运行的多个 hook 事件：

| 事件名称 | 说明 |
|---------|------|
| PreToolUse | 在工具调用之前运行（可以阻止它们） |
| PostToolUse | 在工具调用完成后运行 |
| UserPromptSubmit | 在用户提交提示词后、CodeBuddy 处理之前运行 |
| Notification | 在 CodeBuddy Code 发送通知时运行 |
| Stop | 在 CodeBuddy Code 完成响应时运行 |
| SubagentStop | 在子代理任务完成时运行 |
| PreCompact | 在 CodeBuddy Code 即将运行压缩操作之前运行 |
| SessionStart | 在 CodeBuddy Code 启动新会话或恢复现有会话时运行 |
| SessionEnd | 在 CodeBuddy Code 会话结束时运行 |

每个事件接收不同的数据，可以以不同方式控制 CodeBuddy 的行为。

## 快速开始

在本快速开始中，你将添加一个 hook 来记录 CodeBuddy Code 运行的 shell 命令。

### 前置条件

安装 jq 用于在命令行中处理 JSON。

### 步骤 1：打开 hooks 配置

运行 `/hooks` 斜杠命令并选择 PreToolUse hook 事件。PreToolUse hooks 在工具调用之前运行，可以阻止它们并向 CodeBuddy 反馈应该如何做不同的操作。

### 步骤 2：添加匹配器

选择 **+ Add new matcher…** 以仅在 Bash 工具调用时运行你的 hook。为匹配器输入 `Bash`。

你可以使用 `*` 来匹配所有工具。

### 步骤 3：添加 hook

选择 **+ Add new hook…** 并输入此命令：

```bash
jq -r '"\(.tool_input.command) ~ \(.tool_input.description // "No description")"' >> ~/.codebuddy/bash-command.log
```

### 步骤 4：保存配置

对于存储位置，选择 **User settings**，因为你正在记录到主目录。这样 hook 将应用于所有项目，而不仅仅是当前项目。然后按 Esc 键直到返回 REPL。你的 hook 现在已注册！

### 步骤 5：验证 hook

再次运行 `/hooks` 或检查 `~/.codebuddy/settings.json` 以查看你的配置：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '\"\\(.tool_input.command) ~ \\(.tool_input.description // \"No description\")\"' >> ~/.codebuddy/bash-command.log"
          }
        ]
      }
    ]
  }
}
```

### 步骤 6：测试 hook

让 CodeBuddy 运行一个简单的命令，如 `ls`，然后检查你的日志文件：

```bash
cat ~/.codebuddy/bash-command.log
```

你应该看到类似以下的条目：

```
ls ~ Lists files and directories
```

## 更多示例

### 代码格式化 Hook

在编辑后自动格式化 TypeScript 文件：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | { read file_path; if echo \"$file_path\" | grep -q '\\.ts$'; then npx prettier --write \"$file_path\"; fi; }"
          }
        ]
      }
    ]
  }
}
```

需确保项目内 `prettier` 依赖可用。

### Markdown 格式化 Hook

自动修复 markdown 文件中缺失的语言标签和格式问题：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CODEBUDDY_PROJECT_DIR\"/.codebuddy/hooks/markdown_formatter.py"
          }
        ]
      }
    ]
  }
}
```

创建 `.codebuddy/hooks/markdown_formatter.py` 文件，内容如下：

```python
#!/usr/bin/env python3
"""
CodeBuddy Code 输出的 Markdown 格式化器。
修复缺失的语言标签和间距问题，同时保留代码内容。
"""
import json
import sys
import re
import os

def detect_language(code):
    """从代码内容进行最佳努力的语言检测。"""
    s = code.strip()
    
    # JSON 检测
    if re.search(r'^\s*[{\[]', s):
        try:
            json.loads(s)
            return 'json'
        except:
            pass
    
    # Python 检测
    if re.search(r'^\s*def\s+\w+\s*\(', s, re.M) or \
       re.search(r'^\s*(import|from)\s+\w+', s, re.M):
        return 'python'
    
    # JavaScript 检测  
    if re.search(r'\b(function\s+\w+\s*\(|const\s+\w+\s*=)', s) or \
       re.search(r'=>|console\.(log|error)', s):
        return 'javascript'
    
    # Bash 检测
    if re.search(r'^#!.*\b(bash|sh)\b', s, re.M) or \
       re.search(r'\b(if|then|fi|for|in|do|done)\b', s):
        return 'bash'
    
    # SQL 检测
    if re.search(r'\b(SELECT|INSERT|UPDATE|DELETE|CREATE)\s+', s, re.I):
        return 'sql'
        
    return 'text'

def format_markdown(content):
    """使用语言检测格式化 markdown 内容。"""
    # 修复未标记的代码块
    def add_lang_to_fence(match):
        indent, info, body, closing = match.groups()
        if not info.strip():
            lang = detect_language(body)
            return f"{indent}```{lang}\n{body}{closing}\n"
        return match.group(0)
    
    fence_pattern = r'(?ms)^([ \t]{0,3})```([^\n]*)\n(.*?)(\n\1```)\s*$'
    content = re.sub(fence_pattern, add_lang_to_fence, content)
    
    # 修复过多的空行（仅在代码块外）
    content = re.sub(r'\n{3,}', '\n\n', content)
    
    return content.rstrip() + '\n'

# 主执行
try:
    input_data = json.load(sys.stdin)
    file_path = input_data.get('tool_input', {}).get('file_path', '')
    
    if not file_path.endswith(('.md', '.mdx')):
        sys.exit(0)  # 不是 markdown 文件
    
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        formatted = format_markdown(content)
        
        if formatted != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(formatted)
            print(f"✓ Fixed markdown formatting in {file_path}")
    
except Exception as e:
    print(f"Error formatting markdown: {e}", file=sys.stderr)
    sys.exit(1)
```

使脚本可执行：

```bash
chmod +x .codebuddy/hooks/markdown_formatter.py
```

> **注意**：虽然脚本包含 shebang 行（`#!/usr/bin/env python3`）并且已设置可执行权限，但在 Windows Git Bash 环境下直接执行 `.py` 文件可能无法正确识别 shebang。因此**建议始终在 command 中显式使用 `python3` 来调用 Python 脚本**，确保跨平台兼容性。

此 hook 会自动：

* 检测未标记代码块中的编程语言
* 为语法高亮添加适当的语言标签
* 修复过多的空行，同时保留代码内容
* 仅处理 markdown 文件(.md，.mdx)

### 自定义通知 Hook

当 CodeBuddy 需要输入时获取桌面通知：

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'CodeBuddy Code' 'Awaiting your input'"
          }
        ]
      }
    ]
  }
}
```

Windows/macOS 需要替换为 `powershell` 或 `osascript` 的通知命令。

### 文件保护 Hook

阻止对敏感文件的编辑：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "python3 -c \"import json, sys; data=json.load(sys.stdin); path=data.get('tool_input',{}).get('file_path',''); sys.exit(2 if any(p in path for p in ['.env', 'package-lock.json', '.git/']) else 0)\""
          }
        ]
      }
    ]
  }
}
```

### 在 Skill 中使用 Hooks（frontmatter）

如果你想把 Hook 与某个具体的 Skill 一起分发——例如让 `code-reviewer` Skill 在执行任何 `Bash` 命令前先做白名单检查——可以直接在 SKILL.md 的 frontmatter 中声明 `hooks`，作用域会自动随该 fork subagent 的生命周期开闭，**不影响主会话和其他 Skill**。

> 仅 `context: fork` 的 Skill 支持 frontmatter hooks。注入式（默认）Skill 没有清晰的生命周期边界，frontmatter hooks 会被解析但不会注册。

```yaml
---
name: code-reviewer
description: 代码审查 Skill，执行前检查 Bash 命令白名单
context: fork
agent: Explore
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: ${CODEBUDDY_SKILL_DIR}/scripts/check-bash.sh
          timeout: 5
  Stop:  # 自动重写为 SubagentStop
    - hooks:
        - type: command
          command: echo "review done at $(date)" >> ${CODEBUDDY_PROJECT_DIR}/.cbc-review.log
---

请审查 $ARGUMENTS 涉及的代码...
```

**启用前**：在 `~/.codebuddy/settings.json` 中开启闸门（默认关闭，所有非内置来源的 frontmatter hooks 都会被静默跳过）：

```json
{
  "allowUntrustedFrontmatterHooks": true
}
```

更详细的字段语义、安全闸门与作用域规则见 [Skills 文档 - 在 Skill 中配置 Hooks](./skills.md#在-skill-中配置-hooks) 与 [Hook 参考指南 - Frontmatter Hooks](./hooks.md#agent--skill-frontmatter-hooks)。

## 最佳实践与建议

1. **小步验证**：先从日志类 hook 入手再逐步添加高风险操作。
2. **控制超时**：默认 60 秒，如脚本存在长时间任务请确保及时输出或拆分处理。
3. **使用 matcher 过滤**：合理设置 `matcher` 可减少无关 hook 执行次数。
4. **统一脚本目录**：建议在项目根创建 `.codebuddy/hooks/` 目录集中管理脚本并纳入版本控制。
5. **重视安全**：
   * 避免在 hook 中直接使用未验证的用户输入。
   * 对外部命令使用绝对路径，防止 PATH 劫持。
   * 结合 `/hooks` 面板的安全确认机制，确保所有 hook 均被审核运行。
6. **与 MCP 工具配合**：MCP 工具名称形如 `mcp__<server>__<tool>`,可在 `matcher` 中通过正则整批控制,如 `mcp__github__.*`。
7. **面板是权威入口**：任何外部文件修改都需要在面板确认后生效，务必完成该步骤。
8. **Python 脚本调用**：始终使用 `python3 your_script.py` 而不是直接执行 `.py` 文件，因为 Windows Git Bash 环境下不一定能正确识别 Python 脚本的 shebang 行。
9. **Windows 兼容性**：Hook 命令在 Windows 上通过 Git Bash 执行。请确保命令使用 bash 语法，且避免依赖 cmd.exe 或 PowerShell 特有的语法。

## 了解更多

* 关于 hooks 的参考文档，请参阅 [Hook 参考指南](./hooks.md)。
* 有关全面的安全最佳实践和安全指南，请参阅 Hook 参考指南中的[安全注意事项](./hooks.md#安全注意事项)。
* 有关故障排除步骤和调试技术，请参阅 Hook 参考指南中的[调试](./hooks.md#调试)部分。

---

现在你已掌握在 CodeBuddy Code 中启用 hooks 的核心流程。更多事件字段细节、决策控制和安全注意事项请查阅 [Hook 参考指南](./hooks.md)。祝你构建出既强大又安全的自动化工作流！
