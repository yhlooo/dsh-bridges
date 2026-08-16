> 来源: https://cursor.com/docs/cli/reference/permissions.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Permissions

Configure what the agent is allowed to do using permission tokens in your CLI configuration. Permissions are set in `~/.cursor/cli-config.json` (global) or `<project>/.cursor/cli.json` (project-specific).

## Permission types

### Shell commands

**Format:** `Shell(commandBase)`

Controls access to shell commands. The `commandBase` is the first token in the command line. Supports glob patterns and an optional `command:args` syntax for finer control.

| Example         | Description                                        |
| --------------- | -------------------------------------------------- |
| `Shell(ls)`     | Allow running `ls` commands                        |
| `Shell(git)`    | Allow any `git` subcommand                         |
| `Shell(npm)`    | Allow npm package manager commands                 |
| `Shell(curl:*)` | Allow `curl` with any arguments                    |
| `Shell(rm)`     | Deny destructive file removal (commonly in `deny`) |

### File reads

**Format:** `Read(pathOrGlob)`

Controls read access to files and directories. Supports glob patterns.

| Example             | Description                             |
| ------------------- | --------------------------------------- |
| `Read(src/**/*.ts)` | Allow reading TypeScript files in `src` |
| `Read(**/*.md)`     | Allow reading markdown files anywhere   |
| `Read(.env*)`       | Deny reading environment files          |
| `Read(/etc/passwd)` | Deny reading system files               |

### File writes

**Format:** `Write(pathOrGlob)`

Controls write access to files and directories. Supports glob patterns. Print mode can use write and shell tools. Use `permissions.allow`, `permissions.deny`, and `--force` to control what runs without prompts.

| Example               | Description                           |
| --------------------- | ------------------------------------- |
| `Write(src/**)`       | Allow writing to any file under `src` |
| `Write(package.json)` | Allow modifying package.json          |
| `Write(**/*.key)`     | Deny writing private key files        |
| `Write(**/.env*)`     | Deny writing environment files        |

### Web fetch

**Format:** `WebFetch(domainOrPattern)`

Controls which domains the agent can fetch when using the web fetch tool (e.g., to retrieve documentation or web pages). Without an allowlist entry, each fetch prompts for approval. Add domains to `allow` to auto-approve fetches from trusted sources.

| Example                     | Description                                       |
| --------------------------- | ------------------------------------------------- |
| `WebFetch(docs.github.com)` | Allow fetches from `docs.github.com`              |
| `WebFetch(*.example.com)`   | Allow fetches from any subdomain of `example.com` |
| `WebFetch(*)`               | Allow fetches from any domain (use with caution)  |

**Domain pattern matching:**

- `*` matches all domains
- `*.example.com` matches subdomains (e.g., `docs.example.com`, `api.example.com`)
- `example.com` matches that exact domain only

### MCP tools

**Format:** `Mcp(server:tool)`

Controls which MCP (Model Context Protocol) tools the agent can run. Use `server` (from `mcp.json`) and `tool` name, with `*` for wildcards.

| Example          | Description                                 |
| ---------------- | ------------------------------------------- |
| `Mcp(datadog:*)` | Allow all tools from the Datadog MCP server |
| `Mcp(*:search)`  | Allow any server's `search` tool            |
| `Mcp(*:*)`       | Allow all MCP tools (use with caution)      |

## Configuration

Add permissions to the `permissions` object in your CLI configuration file:

```json
{
  "permissions": {
    "allow": [
      "Shell(ls)",
      "Shell(git)",
      "Read(src/**/*.ts)",
      "Write(package.json)",
      "WebFetch(docs.github.com)",
      "WebFetch(*.github.com)",
      "Mcp(datadog:*)"
    ],
    "deny": [
      "Shell(rm)",
      "Read(.env*)",
      "Write(**/*.key)",
      "WebFetch(malicious-site.com)"
    ]
  }
}
```

## Pattern matching

- Glob patterns use `**`, `*`, and `?` wildcards
- Relative paths are scoped to the current workspace
- Absolute paths can target files outside the project
- Deny rules take precedence over allow rules
- Use `command:args` (e.g., `curl:*`) to match both command and arguments with globs


---

## Sitemap

[Overview of all docs pages](/llms.txt)
