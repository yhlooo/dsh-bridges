> 来源: https://cursor.com/docs/agent/security.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Agent Security

AI can behave unexpectedly due to prompt injection, hallucinations, and other issues. We protect users with guardrails that limit what agents can do. By default, sensitive actions require your manual approval. This document explains our guardrails and what they mean for you.

These controls and behaviors are our defaults. We recommend keeping them enabled.

## First-party tool calls

Cursor includes tools that help agents write code: reading files, editing files, running terminal commands, searching the web, and more.

Reading files and searching code don't require approval. Use [.cursorignore](https://cursor.com/docs/reference/ignore-file.md) to block agent access to specific files. Actions that could expose sensitive data require your explicit approval.

Agents can modify workspace files without approval, except for configuration files. Changes save immediately to disk. Always use version control so you can revert changes. Configuration files (like workspace settings) need your approval first.

**Warning:** If you have auto-reload enabled, agent changes might execute before you can review them.

By default, terminal commands need your approval. To let trusted calls run without prompting, configure [Run Modes](https://cursor.com/docs/agent/security/run-modes.md). They range from a simple allowlist to the **Auto-review** classifier, and they're best-effort guardrails rather than a hard security boundary.

## Third-party tool calls

You can connect external tools using [MCP](https://cursor.com/docs/mcp.md). All MCP connections need your approval. After you approve an MCP connection, each tool call still needs individual approval before running. You can pre-approve specific tools with an [MCP allowlist](https://cursor.com/docs/reference/permissions.md#mcp-allowlist-format).

## Network requests

Attackers could use network requests to steal data. Our tools only make network requests to:

- GitHub
- Direct link retrieval
- Web search providers

Agents cannot make arbitrary network requests with default settings.

## Workspace trust

Cursor supports [workspace trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust), but it's disabled by default. When enabled, it prompts you to choose between normal or restricted mode for new workspaces. Restricted mode breaks AI features. For untrusted repos, use a basic text editor instead.

To enable workspace trust:

1. Open your user settings.json file
2. Add the following configuration:

   ```json
   "security.workspace.trust.enabled": true
   ```

Organizations can enforce this setting through MDM solutions.

## Responsible disclosure

Found a vulnerability? Email [security-reports@cursor.com](mailto:security-reports@cursor.com) with details and steps to reproduce.

We acknowledge vulnerability reports within 5 business days. For critical incidents, we notify all users via email.


---

## Sitemap

[Overview of all docs pages](/llms.txt)
