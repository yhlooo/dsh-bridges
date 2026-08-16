> 来源: https://cursor.com/docs/reference/sandbox.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# sandbox.json reference

Configure [sandbox](https://cursor.com/docs/agent/security/run-modes.md#sandboxing) behavior with a `sandbox.json` file to control network access, filesystem paths, and more.

## File locations

Place `sandbox.json` in either or both of these locations:

| Location                           | Scope                       | Priority |
| :--------------------------------- | :-------------------------- | :------- |
| `~/.cursor/sandbox.json`           | All workspaces (per-user)   | Lower    |
| `<workspace>/.cursor/sandbox.json` | Single workspace (per-repo) | Higher   |

Both files are optional. When both exist, they are merged with per-repo settings taking priority. Enterprise team-admin policies and Cursor's hardcoded security rules layer on top and cannot be weakened by either file.

## Top-level fields

All fields are optional. Missing fields use the defaults shown below.

| Field                      | Type       | Default                 | Description                                                                                                                                                                     |
| :------------------------- | :--------- | :---------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                     | string     | `"workspace_readwrite"` | Sandbox mode. `"workspace_readwrite"` gives read/write access in the workspace. `"workspace_readonly"` restricts to read-only. `"insecure_none"` disables the sandbox entirely. |
| `additionalReadwritePaths` | `string[]` | `[]`                    | Extra paths the agent can read and write. Only applies when `type` is `"workspace_readwrite"`.                                                                                  |
| `additionalReadonlyPaths`  | `string[]` | `[]`                    | Extra paths the agent can read.                                                                                                                                                 |
| `disableTmpWrite`          | `boolean`  | `false`                 | When `true`, removes default write access to `/tmp` and system temp directories.                                                                                                |
| `enableSharedBuildCache`   | `boolean`  | `false`                 | Redirects build-tool caches (npm, cargo, pip, etc.) to a shared tmpdir so sandboxed and unsandboxed commands share the same caches.                                             |

## `networkPolicy` object

| Field     | Type                  | Default  | Description                                                                                   |
| :-------- | :-------------------- | :------- | :-------------------------------------------------------------------------------------------- |
| `default` | `"allow"` \| `"deny"` | `"deny"` | Action when no allow/deny rule matches.                                                       |
| `allow`   | `string[]`            | `[]`     | Patterns to allow. Supports exact domains, wildcards, and CIDR notation.                      |
| `deny`    | `string[]`            | `[]`     | Patterns to deny. Highest priority; always blocks, even if a pattern also appears in `allow`. |

## Network pattern syntax

The `allow` and `deny` arrays accept three pattern formats:

| Format       | Example                | Matches                                                        |
| :----------- | :--------------------- | :------------------------------------------------------------- |
| Exact domain | `"registry.npmjs.org"` | That exact host                                                |
| Wildcard     | `"*.example.com"`      | Any subdomain of `example.com`, including `example.com` itself |
| CIDR         | `"10.0.0.0/8"`         | Any IP in that range                                           |

**Key rules:**

- Deny always beats allow. If a host matches both lists, it is blocked.
- Private/RFC 1918 addresses (`10.x`, `172.16.x`, `192.168.x`, `127.x`) and cloud metadata endpoints (`169.254.169.254`) are blocked by default to prevent SSRF.
- IPv6 private addresses (`::1`, `fe80::/10`, `fc00::/7`) are also blocked.
- URL paths are ignored; matching is domain/IP only.

## How policies merge

When multiple policy sources exist, they merge in priority order:

```text
per-user  <  per-repo  <  team-admin  <  hardcoded
(lowest)                                (highest)
```

Merge rules:

- **Paths** (`additionalReadwritePaths`, `additionalReadonlyPaths`): unioned across all sources.
- **Network allow lists**: unioned, unless a team-admin allowlist is present (which replaces the union).
- **Network deny lists**: always unioned.
- **`networkPolicy.default`**: `"deny"` wins over `"allow"`.
- **Restrictive booleans** (`disableTmpWrite`, `networkPolicyStrict`): `true` wins.

## Protected paths

Certain paths are always write-protected, regardless of your `sandbox.json` configuration:

- `.cursor/*.json`, `.cursor/**/*.json`, `.cursor/.workspace-trusted`
- `.claude/*.json`, `.claude/**/*.json`
- `.vscode/**`
- `.code-workspace`
- `.git/hooks/**`, `.git/config`, `.git/info/attributes`
- `.cursorignore`

The following `.cursor` subdirectories **are** writable: `rules/`, `commands/`, `worktrees/`, `skills/`, `agents/`.

SSL certificate paths and `~/.ssh` are always readable.

## Environment variables

In addition to the configuration above, Cursor injects environment variables into sandboxed child processes, including `CURSOR_SANDBOX`, `CURSOR_ORIG_UID`, and `CURSOR_ORIG_GID`. See [Run Modes: Environment variables](https://cursor.com/docs/agent/security/run-modes.md#environment-variables) for the full list and usage guidance.

## Examples

### Allow specific domains

```json
{
  "networkPolicy": {
    "default": "deny",
    "allow": [
      "registry.npmjs.org",
      "pypi.org",
      "*.githubusercontent.com"
    ]
  }
}
```

Network traffic is denied by default. Only the listed domains are reachable.

### Allow all network

```json
{
  "networkPolicy": {
    "default": "allow"
  }
}
```

All outbound network traffic is permitted inside the sandbox.

### Full-stack web project

A project where the agent needs to install packages, pull container images, access a database on the local network, and read a shared design-tokens repo:

```json
{
  "networkPolicy": {
    "default": "deny",
    "allow": [
      "registry.npmjs.org",
      "registry.yarnpkg.com",
      "pypi.org",
      "files.pythonhosted.org",
      "*.docker.io",
      "ghcr.io",
      "*.googleapis.com"
    ],
    "deny": [
      "*.internal.corp.example.com"
    ]
  },
  "additionalReadwritePaths": [
    "/home/me/.docker"
  ],
  "additionalReadonlyPaths": [
    "/opt/shared/design-tokens"
  ],
  "enableSharedBuildCache": true
}
```

This configuration lets the agent:

- Install npm/pip packages and pull Docker images.
- Hit Google Cloud APIs.
- Block access to internal corporate services.
- Write to `~/.docker` for container operations.
- Read (but not modify) a shared design-tokens directory.
- Share npm/pip/cargo caches between sandboxed and unsandboxed runs.


---

## Sitemap

[Overview of all docs pages](/llms.txt)
