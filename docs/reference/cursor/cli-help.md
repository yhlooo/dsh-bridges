> 来源: https://cursor.com/help/integrations/cli.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# CLI

Ship code with AI agents right from your terminal.

## How do I install the CLI?

```bash
curl https://cursor.com/install -fsS | bash
```

On Windows PowerShell:

```powershell
irm 'https://cursor.com/install?win32=true' | iex
```

## What can the CLI do?

The CLI brings Cursor's AI capabilities to your terminal. It supports Agent, Plan, and Ask modes, so you can do almost everything you'd do in the editor without opening an IDE.

Learn more at [cursor.com/cli](https://cursor.com/cli).

## Can I use the CLI for automation?

Yes. Use headless mode for scripts, CI pipelines, and [GitHub Actions](https://cursor.com/docs/cli/github-actions.md). Automate doc updates, trigger security reviews, or build custom coding workflows. See the [Headless CLI docs](https://cursor.com/docs/cli/headless.md) for setup.

## Does the CLI work with other editors?

Yes. Cursor CLI works with any IDE or editor, not just Cursor. Plug it into your existing workflow anywhere you have a terminal.

## How do I authenticate the CLI?

Run `agent auth` or set the `CURSOR_API_KEY` environment variable. See the [CLI authentication docs](https://cursor.com/docs/cli/reference/authentication.md) for details.

## What if the CLI reports "invalid API key" on a network error?

If DNS resolution fails or the CLI can't reach Cursor's servers, the error message may say "invalid API key" instead of a network error. Check your network connection first. If you're behind a VPN or firewall, verify that `*.cursor.sh` and `*.cursorapi.com` are accessible.

## How do I update the CLI?

Run:

```bash
agent update
```

To switch release channels (e.g., from `stable` to `lab`), run:

```bash
agent set-channel lab
```

## Related

- [CLI overview](https://cursor.com/docs/cli/overview.md)
- [CLI installation](https://cursor.com/docs/cli/installation.md)
- [CLI authentication](https://cursor.com/docs/cli/reference/authentication.md)
- [GitHub Actions](https://cursor.com/docs/cli/github-actions.md)
- [cursor.com/cli](https://cursor.com/cli)


---

## Sitemap

[Overview of all docs pages](/llms.txt)
