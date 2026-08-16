> 来源: https://cursor.com/docs/cli/reference/slash-commands.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Slash commands

| Command                                | Description                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `/model [filter]`                      | Select a model. Press `Tab` to edit.                                                                                   |
| `/run-everything [on\|off\|status]`    | Toggle Run Everything or show its status. `/auto-run` is an alias.                                                     |
| `/plan [prompt]`                       | Switch to Plan mode, show the current plan, or submit a prompt in Plan mode                                            |
| `/ask`                                 | Toggle Ask mode for read-only questions                                                                                |
| `/debug [prompt]`                      | Toggle Debug mode or submit a prompt in Debug mode                                                                     |
| `/logs`                                | Show the debug log path and copy it to the clipboard                                                                   |
| `/update`                              | Update Cursor Agent to the latest version                                                                              |
| `/max-mode`                            | Toggle Max Mode on legacy request-based plans                                                                          |
| `/rename <name>`                       | Rename the current chat session                                                                                        |
| `/clear`                               | Start a new chat session. `/new`, `/new-chat`, and `/newchat` are aliases.                                             |
| `/resume`                              | Open recent chats and resume one                                                                                       |
| `/fork`                                | Fork the current chat into a new session                                                                               |
| `/summarize`                           | Summarize the conversation to reduce context. `/compress` is an alias.                                                 |
| `/rewind`                              | Jump back to a previous message                                                                                        |
| `/vim`                                 | Toggle Vim keys                                                                                                        |
| `/line-numbers`                        | Toggle line numbers in code blocks                                                                                     |
| `/show-thinking`                       | Toggle thinking block display                                                                                          |
| `/status-indicators`                   | Toggle terminal title status indicators                                                                                |
| `/shell [command]`                     | Enter Shell Mode. `/sh` and `/run` are aliases.                                                                        |
| `/about`                               | Show CLI version, system, and account info. Also copies it to the clipboard.                                           |
| `/setup-terminal`                      | Configure terminal newline keybindings. See [Terminal setup](https://cursor.com/docs/cli/reference/terminal-setup.md). |
| `/help [command]`                      | Show help. Use `/help <command>` for command details.                                                                  |
| `/feedback <message>`                  | Share feedback with the team                                                                                           |
| `/open`                                | Open the repository's Git root in Cursor. `/cursor` is an alias.                                                       |
| `/copy-request-id`                     | Copy the last request ID to the clipboard                                                                              |
| `/copy-conversation-id`                | Copy the current conversation ID to the clipboard                                                                      |
| `/logout`                              | Sign out from Cursor                                                                                                   |
| `/quit`                                | Exit                                                                                                                   |
| `/exit`                                | Exit                                                                                                                   |
| `/mcp [list\|list-tools] [identifier]` | Manage MCP servers and list tools for a server                                                                         |
| `/plugin [subcommand]`                 | Manage plugins and marketplaces                                                                                        |
| `/config`                              | Configure CLI settings interactively                                                                                   |
| `/copy`                                | Copy a previous user message to the clipboard                                                                          |
| `/sandbox`                             | Configure sandbox mode and network access settings                                                                     |
| `/bedrock [subcommand]`                | Configure Bedrock when the Bedrock feature is enabled                                                                  |


---

## Sitemap

[Overview of all docs pages](/llms.txt)
