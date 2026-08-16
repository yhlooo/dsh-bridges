> 来源: https://cursor.com/docs/reference/permissions.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# permissions.json reference

Use `permissions.json` to configure MCP tool and terminal command allowlists and to steer the [Auto-review mode](https://cursor.com/docs/agent/security/run-modes.md#run-mode) classifier so tools run without approval.

When `permissions.json` defines an allowlist, it **overrides** the corresponding in-app allowlist in Cursor Settings. The in-app allowlist editor becomes read-only for that allowlist type.

## File location

Cursor reads `permissions.json` from two locations:

```text
~/.cursor/permissions.json              # per-user (applies everywhere)
<workspace>/.cursor/permissions.json    # per-repo (applies in this workspace)
```

Both files are optional. When both exist, Cursor **concatenates** the arrays inside every field. Per-user and per-repo entries combine; one does not replace the other. Commit the per-repo file so teammates inherit the same rules.

The files are read on startup and re-read automatically whenever they change. JSONC (JSON with comments) is supported.

## Top-level fields

All fields are optional. Unknown keys are ignored.

| Field               | Type       | Default | Description                                                                                                                                                               |
| :------------------ | :--------- | :------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mcpAllowlist`      | `string[]` | not set | MCP tools that can run without approval. When set, overrides the in-app MCP allowlist.                                                                                    |
| `terminalAllowlist` | `string[]` | not set | Terminal commands that can run without approval. When set, overrides the in-app terminal allowlist.                                                                       |
| `autoRun`           | `object`   | not set | Natural-language guidance for the **Auto-review** mode classifier. See [`autoRun` configuration](https://cursor.com/docs/reference/permissions.md#autorun-configuration). |

Non-string entries inside either array are silently dropped.

## Precedence

Allowlists come from three sources, evaluated in strict priority order:

```text
team admin (dashboard)  >  permissions.json (per-user ∪ per-repo)  >  IDE settings UI
       (highest)                                                          (lowest)
```

- **Team admin controls.** If your team admin has configured Run Mode controls through the dashboard, those settings take effect. Neither `permissions.json` nor the IDE allowlist can add extra entries.
- **permissions.json.** When Run Mode is not admin-controlled and `permissions.json` defines a key, that key's value **replaces** the corresponding IDE allowlist entirely. Arrays from `~/.cursor/permissions.json` and `<workspace>/.cursor/permissions.json` are concatenated before being applied. The in-app editor for that allowlist becomes read-only and the "Add to allowlist" button is hidden.
- **IDE settings.** When Run Mode is not admin-controlled and neither permissions file defines a given key, the IDE allowlist from Cursor Settings is used.

MCP, terminal, and `autoRun` are independent. You can define one in `permissions.json` and manage the others in the IDE. Defining only `mcpAllowlist` in the file overrides the MCP allowlist but leaves the terminal allowlist under IDE control.

If neither file is present, both are unparseable, or no file contains a given key, Cursor falls back to the IDE allowlist for that key. If a key is present in either file but evaluates to an empty array (after concatenation), the effective allowlist for that type is empty. Cursor does not fall back to the IDE allowlist in that case.

## How it appears in Cursor Settings

When `permissions.json` defines an allowlist, Cursor Settings notes that the allowlist is configured via `permissions.json`.

- If the allowlist is controlled by `permissions.json`, the editor becomes read-only and shows the file-defined entries. The "Add to allowlist" option is not available for that allowlist type.
- If the allowlist is admin-controlled, the editor becomes read-only and shows the admin-defined entries.

## MCP allowlist format

Each entry is a `server:tool` string. Both parts are matched case-insensitively. The `*` wildcard matches any value for that part.

| Pattern             | Matches                                                      |
| :------------------ | :----------------------------------------------------------- |
| `my-server:my_tool` | Exactly the tool `my_tool` from the server named `my-server` |
| `my-server:*`       | All tools from `my-server`                                   |
| `*:my_tool`         | The tool `my_tool` from any server                           |
| `*:*`               | All tools from all servers                                   |

The server name is the key you used in `mcp.json` (e.g. `"github"`, `"linear"`). Glob-style `*` patterns also work inside names (e.g. `my-server:list_*` matches `list_issues`, `list_users`, etc.).

Entries that do not contain a `:` are ignored.

## `autoRun` configuration

The `autoRun` object steers the LLM classifier that gates shell, MCP, and Fetch tool calls when [Auto-review mode](https://cursor.com/docs/agent/security/run-modes.md#run-mode) is active. It has no effect in **Allowlist** or **Run Everything**.

| Field                | Type       | Description                                                                                                                     |
| :------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `allow_instructions` | `string[]` | Natural-language hints describing call shapes the classifier should lean toward allowing.                                       |
| `block_instructions` | `string[]` | Natural-language hints describing call shapes the classifier should lean toward blocking, surfacing an approval prompt instead. |

Each entry is a free-form sentence. Write the instruction the way you would tell a teammate what to watch for. Calls that match an `allow_instructions` entry still go through the safety check; calls that match a `block_instructions` entry can still be approved when Cursor insists. Treat both as steering, not enforcement.

Per-user and per-repo entries are concatenated, so a workspace can layer repo-specific guardrails on top of your personal defaults.

## Terminal allowlist format

Each entry is a command or command prefix string.

| Pattern        | Matches                                                                                          |
| :------------- | :----------------------------------------------------------------------------------------------- |
| `git`          | Any command starting with `git` (e.g. `git status`, `git diff`)                                  |
| `git status`   | Only `git status` (and anything starting with `git status `)                                     |
| `npm:install*` | `npm install`, `npm install express`, etc. The `:` separates the base command from an args glob. |

Matching is case-sensitive and uses prefix semantics: `git` matches `git status` but not `gitk`.

## Examples

### Set MCP allowlist globally

```jsonc
{
  // Overrides the in-app MCP allowlist entirely.
  "mcpAllowlist": [
    "github:*",
    "linear:list_issues"
  ]
}
```

### Set terminal allowlist globally

```jsonc
{
  "terminalAllowlist": [
    "git",
    "npm",
    "yarn",
    "pnpm",
    "cargo",
    "make"
  ]
}
```

### Override only one allowlist type

If `permissions.json` only defines `mcpAllowlist`, the MCP allowlist is taken from the file while the terminal allowlist remains under IDE control:

```jsonc
{
  "mcpAllowlist": [
    "github:*",
    "linear:*"
  ]
}
```

Any MCP entries previously set in Cursor Settings are ignored while this file is present. Terminal allowlist entries in Cursor Settings still apply.

### Combined setup

```jsonc
{
  "mcpAllowlist": [
    "github:*",
    "linear:*",
    "notion:search"
  ],
  "terminalAllowlist": [
    "git",
    "npm",
    "cargo build",
    "cargo test"
  ]
}
```

### Steer the Auto-review classifier

```jsonc
{
  "autoRun": {
    "allow_instructions": [
      "Read-only inspections of build artifacts under ./dist are fine."
    ],
    "block_instructions": [
      "Especially for delete operations, I like for the classifier to reject so I can have a chance to review the operation."
    ]
  }
}
```

### Combine per-user and per-repo files

`~/.cursor/permissions.json`:

```jsonc
{
  "terminalAllowlist": ["git", "npm", "pnpm"],
  "autoRun": {
    "block_instructions": [
      "Anything that touches my SSH config or shell rc files."
    ]
  }
}
```

`<workspace>/.cursor/permissions.json`:

```jsonc
{
  "terminalAllowlist": ["cargo build", "cargo test"],
  "autoRun": {
    "block_instructions": [
      "Never run database migrations against the production schema in this repo."
    ]
  }
}
```

The effective config is the concatenation of both files:

```jsonc
{
  "terminalAllowlist": ["git", "npm", "pnpm", "cargo build", "cargo test"],
  "autoRun": {
    "block_instructions": [
      "Anything that touches my SSH config or shell rc files.",
      "Never run database migrations against the production schema in this repo."
    ]
  }
}
```

## Notes

- **Run Mode required.** `permissions.json` only takes effect when Run Mode is enabled in Cursor Settings (**Auto-review**, **Allowlist**, or **Run Everything**). `autoRun` instructions are only consulted in **Auto-review** mode. Before Cursor 3.5, allowlists were not consulted in the deprecated **Ask Every Time** mode.
- **Not a security boundary.** Allowlists and `autoRun` instructions are best-effort convenience. They are not a security guarantee. See [agent security](https://cursor.com/docs/agent/security.md) for details.
- **Override IDE, merge files.** When `permissions.json` defines a key, it fully replaces the in-app allowlist for that type. Entries from per-user and per-repo files are concatenated; IDE entries are not merged in.
- **IDE display.** When `permissions.json` controls an allowlist, the corresponding settings section becomes read-only and shows the file-defined entries. The "Add to allowlist" option is hidden.
- **CLI permissions are separate.** The Cursor CLI has its own permissions system. See [CLI Permissions](https://cursor.com/docs/cli/reference/permissions.md) for that reference.


---

## Sitemap

[Overview of all docs pages](/llms.txt)
