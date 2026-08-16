> 来源: https://cursor.com/docs/cli/reference/configuration.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Configuration

Configure the Agent CLI using the `cli-config.json` file.

## File location

| Type    | Platform    | Path                                       |
| :------ | :---------- | :----------------------------------------- |
| Global  | macOS/Linux | `~/.cursor/cli-config.json`                |
| Global  | Windows     | `$env:USERPROFILE\.cursor\cli-config.json` |
| Project | All         | `<project>/.cursor/cli.json`               |

Only permissions can be configured at the project level. All other CLI
settings must be set globally.

Override with environment variables:

- **`CURSOR_CONFIG_DIR`**: custom directory path
- **`XDG_CONFIG_HOME`** (Linux/BSD): uses `$XDG_CONFIG_HOME/cursor/cli-config.json`

## Schema

### Required fields

| Field               | Type      | Description                                                                                    |
| :------------------ | :-------- | :--------------------------------------------------------------------------------------------- |
| `version`           | number    | Config schema version (current: `1`)                                                           |
| `editor.vimMode`    | boolean   | Enable Vim keybindings (default: `false`)                                                      |
| `permissions.allow` | string\[] | Permitted operations (see [Permissions](https://cursor.com/docs/cli/reference/permissions.md)) |
| `permissions.deny`  | string\[] | Forbidden operations (see [Permissions](https://cursor.com/docs/cli/reference/permissions.md)) |

### Optional fields

| Field                                 | Type    | Description                                                             |
| :------------------------------------ | :------ | :---------------------------------------------------------------------- |
| `channel`                             | string  | Release channel used for CLI updates                                    |
| `model`                               | object  | Selected model configuration                                            |
| `maxMode`                             | boolean | Persisted preference for max mode in the model picker                   |
| `hasChangedDefaultModel`              | boolean | CLI-managed model override flag                                         |
| `notifications`                       | boolean | Send a terminal notification when the agent finishes or needs input     |
| `hints`                               | boolean | Show CLI hints while the agent is working                               |
| `rewind`                              | boolean | Enable `/rewind` to restore an earlier message in the session           |
| `suggestNextPrompt`                   | boolean | Suggest a follow-up prompt at the end of each turn                      |
| `display.showLineNumbers`             | boolean | Show line numbers in rendered code blocks                               |
| `display.showThinkingBlocks`          | boolean | Render model thinking blocks when available                             |
| `display.showStatusIndicators`        | boolean | Enable terminal title status indicators                                 |
| `display.showStatusLineRunningTime`   | boolean | Show elapsed running time in the status line                            |
| `approvalMode`                        | string  | Approval mode: `allowlist`, `auto-review`, or `unrestricted`            |
| `sandbox.mode`                        | string  | Sandbox mode override                                                   |
| `sandbox.networkAccess`               | string  | Network access setting for sandbox mode                                 |
| `network.useHttp1ForAgent`            | boolean | Use HTTP/1.1 instead of HTTP/2 for agent connections (default: `false`) |
| `attribution.attributeCommitsToAgent` | boolean | Add "Made with Cursor" trailer to Agent commits (default: `true`)       |
| `attribution.attributePRsToAgent`     | boolean | Add "Made with Cursor" footer to Agent PRs (default: `true`)            |

## Examples

### Minimal config

```json
{
  "version": 1,
  "editor": { "vimMode": false },
  "permissions": { "allow": ["Shell(ls)"], "deny": [] }
}
```

### Enable Vim mode

```json
{
  "version": 1,
  "editor": { "vimMode": true },
  "permissions": { "allow": ["Shell(ls)"], "deny": [] }
}
```

### Configure permissions

```json
{
  "version": 1,
  "editor": { "vimMode": false },
  "permissions": {
    "allow": ["Shell(ls)", "Shell(echo)"],
    "deny": ["Shell(rm)"]
  }
}
```

See [Permissions](https://cursor.com/docs/cli/reference/permissions.md) for available permission types and examples.

## Troubleshooting

**Config errors**: Move the file aside and restart:

```bash
mv ~/.cursor/cli-config.json ~/.cursor/cli-config.json.bad
```

**Changes don't persist**: Ensure valid JSON and write permissions. Some fields are CLI-managed and may be overwritten.

## Notes

- Pure JSON format (no comments)
- CLI performs self-repair for missing fields
- Corrupted files are backed up as `.bad` and recreated
- Permission entries are exact strings (see [Permissions](https://cursor.com/docs/cli/reference/permissions.md) for details)

## Models

You can select a model for the CLI using the `/model` slash command.

```bash
/model auto
/model gpt-5
/model sonnet-4-thinking
```

See the [Slash commands](https://cursor.com/docs/cli/reference/slash-commands.md) docs for other commands.

## Proxy configuration

If your network routes traffic through a proxy server, configure the CLI using environment variables and the config file.

### Environment variables

Set these environment variables before running the CLI:

```bash
export HTTP_PROXY=http://your-proxy:port
export HTTPS_PROXY=http://your-proxy:port
export NODE_USE_ENV_PROXY=1
```

If your proxy performs SSL inspection (man-in-the-middle), also trust your organization's CA certificate:

```bash
export NODE_EXTRA_CA_CERTS=/path/to/corporate-ca-cert.pem
```

### HTTP/1.1 fallback

Some enterprise proxies (like Zscaler) don't support HTTP/2 bidirectional streaming. Enable HTTP/1.1 mode in your config:

```json
{
  "version": 1,
  "editor": { "vimMode": false },
  "permissions": { "allow": [], "deny": [] },
  "network": {
    "useHttp1ForAgent": true
  }
}
```

This switches agent connections to HTTP/1.1 with Server-Sent Events (SSE), which works with most corporate proxies.

See [Network Configuration](https://cursor.com/docs/enterprise/network-configuration.md) for proxy testing commands and troubleshooting.


---

## Sitemap

[Overview of all docs pages](/llms.txt)
