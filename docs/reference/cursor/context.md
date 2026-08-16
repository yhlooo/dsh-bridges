> 来源: https://cursor.com/help/customization/context.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# @ mentions and context

Type `@` in the chat input to attach specific context to your conversation. This helps Agent focus on the right files and information.

## What can I reference with @?

- **Files & Folders**: `@auth.ts` or `@src/components/` to include files or folders (type `/` after selecting a folder to navigate deeper)
- **Terminals**: `@Terminals` to include terminal output as context
- **Chats**: `@Chats` to reference context from a previous conversation
- **Git diffs**: `@Commit (Diff of Working State)` for uncommitted changes, or `@Branch (Diff with Main)` for your full branch diff
- **Browser**: `@Browser` to attach context from the built-in browser

## When should I use @ mentions?

Use them when you know which files are relevant. For example, if you want Agent to update a component and its tests, mention both files.

If you're not sure which files matter, skip it — Agent finds relevant files through its own search.

## Can I attach multiple items?

Yes. Type `@` multiple times to attach several files, folders, or other context items. Each one gets added to the conversation.

## Related

- [Rules](https://cursor.com/help/customization/rules.md)
- [Ignore files](https://cursor.com/help/customization/ignore-files.md)


---

## Sitemap

[Overview of all docs pages](/llms.txt)
