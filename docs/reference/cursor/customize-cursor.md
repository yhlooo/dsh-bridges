> 来源: https://cursor.com/docs/customize-cursor.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Customize Cursor

Plugins, skills, and MCPs let you customize Cursor for your workflows. The **Customize** page brings them into one place.

Open **Customize** from the sidebar in Cursor to add and manage extensions at the user, team, or workspace level. You can install official and community plugins, connect MCP servers (including your own), and control which rules, skills, subagents, commands, and hooks are active for each scope.

## What you can do from Customize

From the Customize page, you can:

- **Browse and install** plugins, skills, and MCPs from the [Cursor Marketplace](/marketplace) with one click
- **Install Team MCP servers** shared through your team's [Default marketplace](https://cursor.com/docs/plugins.md#default-team-marketplace)
- **See your team leaderboard** of the most popular plugins, skills, and MCPs across your team and the community
- **Add and manage** plugins, skills, MCPs, subagents, rules, commands, and hooks without switching between separate settings pages
- **Filter by scope** to see what is installed for you, your workspace, or your team
- **Open plugin canvases** for shared setup templates your team can reuse

Learn more in the [changelog](/changelog/customize).

## Extension components

Cursor extensions are built from composable pieces. Plugins often bundle several of these together, but you can also add each component on its own.

| Component     | Description                                                                                                                                                                                                                                                                                                                |
| :------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plugins**   | Distributable bundles that package rules, skills, subagents, commands, MCP servers, and hooks. Install from the [marketplace](/marketplace) or a [team marketplace](https://cursor.com/docs/plugins.md#team-marketplaces).                                                                                                 |
| **Rules**     | Persistent instructions that shape how Agent works with your code. Use [project rules](https://cursor.com/docs/rules.md#project-rules), [user rules](https://cursor.com/docs/rules.md#user-rules), [team rules](https://cursor.com/docs/rules.md#team-rules), or [`AGENTS.md`](https://cursor.com/docs/rules.md#agentsmd). |
| **Skills**    | Specialized capabilities Agent loads when relevant. Skills package domain knowledge, workflows, and scripts in `SKILL.md` files. See [Agent Skills](https://cursor.com/docs/skills.md).                                                                                                                                    |
| **Subagents** | Specialized assistants Agent delegates to for parallel or isolated work. Each subagent runs in its own context window. See [Subagents](https://cursor.com/docs/subagents.md).                                                                                                                                              |
| **Hooks**     | Scripts that observe, control, or extend the agent loop at specific lifecycle events. See [Hooks](https://cursor.com/docs/hooks.md).                                                                                                                                                                                       |
| **Commands**  | Reusable prompts you invoke with `/` in Agent chat. Commands are markdown files that define a focused workflow or action.                                                                                                                                                                                                  |

For MCP servers that connect Cursor to external tools and data sources, see [Model Context Protocol (MCP)](https://cursor.com/docs/mcp.md).

## Marketplace leaderboard

Cursor shows a leaderboard of the most popular plugins, skills, and MCPs across your team.

Add any entry to your setup with one click from the Customize page and extend Cursor for your workflow. The leaderboard helps you discover what teammates and the community use most, so you can adopt proven setups quickly.

Browse the full catalog in the [Cursor Marketplace](/marketplace). For community plugins and MCP servers, see [cursor.directory](https://cursor.directory).

## Learn more

### Plugins

Browse the marketplace, install plugins, and set up team marketplaces

### Rules

Write project, user, and team rules that guide Agent behavior

### Skills

Package specialized workflows in portable SKILL.md files

### MCP

Connect Cursor to external tools, APIs, and data sources

### Subagents

Delegate complex tasks to specialized agents

### Hooks

Run scripts at key points in the agent loop


---

## Sitemap

[Overview of all docs pages](/llms.txt)
