> 来源: https://cursor.com/docs/cli/overview.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Cursor CLI

Cursor CLI lets you interact with AI agents directly from your terminal to write, review, and modify code. Whether you prefer an interactive terminal interface or print automation for scripts and CI pipelines, the CLI provides powerful coding assistance right where you work.

## Getting started

```bash
# Install (macOS, Linux, WSL)
curl https://cursor.com/install -fsS | bash

# Install (Windows PowerShell)
irm 'https://cursor.com/install?win32=true' | iex

# Run interactive session
agent
```

[Media](https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/uploads/plan-mode.mp4)

## Interactive mode

Start a conversational session with the agent to describe your goals, review proposed changes, and approve commands:

```bash
# Start interactive session
agent

# Start with initial prompt
agent "refactor the auth module to use JWT tokens"
```

## Modes

The CLI supports the same modes as the editor. Switch between modes using slash commands, keyboard shortcuts, or the `--mode` flag.

| Mode      | Description                                                  | Shortcut                                    |
| :-------- | :----------------------------------------------------------- | :------------------------------------------ |
| **Agent** | Full access to all tools for complex coding tasks            | Default (no `--mode` value needed)          |
| **Plan**  | Design your approach before coding with clarifying questions | Shift+Tab, `/plan`, `--plan`, `--mode=plan` |
| **Ask**   | Read-only exploration without making changes                 | `/ask`, `--mode=ask`                        |

## Non-interactive mode

Use print mode for non-interactive scenarios like scripts, CI pipelines, or automation:

```bash
# Run with specific prompt and model
agent -p "find and fix performance issues" --model "gpt-5"

# Use with git changes included for review
agent -p "review these changes for security issues" --output-format text
```

## Cloud Agent handoff

Push your conversation to a [Cloud Agent](https://cursor.com/docs/cloud-agent.md) to continue running while you're away. Prepend `&` to any message:

```bash
# Send a task to Cloud Agent mid-conversation
& refactor the auth module and add comprehensive tests
```

Pick up your Cloud Agent tasks on web or mobile at [cursor.com/agents](https://cursor.com/agents).

## Sessions

Resume previous conversations to maintain context across multiple interactions:

```bash
# Open previous chats and resume one
agent ls

# Resume latest conversation
agent resume

# Continue the previous session
agent --continue

# Resume specific conversation
agent --resume="chat-id-here"
```

## Sandbox controls

Configure command execution settings with `/sandbox` or the `--sandbox <mode>` flag (`enabled` or `disabled`). Toggle sandbox mode on or off and control network access through an interactive menu. Settings persist across sessions.

[Media](https://ptht05hbb1ssoooe.public.blob.vercel-storage.com/assets/uploads/sandox.mp4)

## Sudo password prompting

Run commands requiring elevated privileges without leaving the CLI. When a command needs `sudo`, Cursor displays a secure, masked password prompt. Your password flows directly to `sudo` via a secure IPC channel; the AI model never sees it.


---

## Sitemap

[Overview of all docs pages](/llms.txt)
