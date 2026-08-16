> 来源: https://cursor.com/help/customization/rules.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Rules

Rules give Agent persistent instructions for your project. They help Agent follow your coding style, patterns, and workflows every time, without you repeating yourself in chat.

## What is a rule?

A rule is a persistent set of instructions Agent follows while working in your project. You can scope rules globally, per project, or to specific files.

## How do I create a project rule?

Project rules live in your codebase and are version-controlled. Your whole team benefits when you check them into git.

1. Open the command palette:
   - **Mac**: Press Cmd + Shift + P
   - **Windows/Linux**: Press Ctrl + Shift + P
2. Type "New Cursor Rule" and select it
3. Give your rule a name (e.g., `react-patterns`)
4. Write your instructions in markdown. For example:
   ```md
   - Use TypeScript for all new files
   - Prefer functional components in React
   - Use snake_case for database columns
   ```
5. Choose when the rule applies from the type dropdown:
   - **Always Apply**: included in every conversation
   - **Apply Intelligently**: Agent decides when it's relevant
   - **Apply to Specific Files**: only applies for files matching a pattern (e.g., `*.tsx`)
   - **Apply Manually**: only used when you @mention it in chat
6. Save the file. It's stored in `.cursor/rules/` in your project.

## How do I set up user rules?

User rules are global preferences that apply across all your projects.

1. Open **Customize** in the sidebar
2. Click **Rules**
3. Add your preferences. For example: "Reply in a concise style. Avoid unnecessary repetition."

## How do I use AGENTS.md?

Create an `AGENTS.md` file in your project root. Write instructions in plain markdown. Cursor picks it up automatically.

```md
# Project instructions

- Use TypeScript for all new files
- Follow the repository pattern for data access
- Keep components under 200 lines
```

For more control over when rules apply, use project rules in `.cursor/rules/` instead.

## What are good practices for writing rules?

- Keep rules under 500 lines. Split large rules into smaller, focused files.
- Include concrete examples or reference files with `@filename` in your rule content.
- Start small. Add rules when you notice Agent making the same mistake more than once.
- Check rules into git so your teammates benefit too.

## How do I organize rule files?

Keep all rules in a flat `.cursor/rules/` directory. Cursor discovers rules by scanning this folder, so nested subfolders work but a flat structure is simpler and easier to manage. Name files descriptively (e.g., `react-patterns.mdc`, `api-validation.mdc`).

For large projects, split rules into focused files instead of one long rule. Each file should cover a single concern, such as styling conventions, testing patterns, or API guidelines.

## Where are rules stored?

- **Project rules** are stored in `.cursor/rules/` inside your project folder. They're version-controlled with git.
- **User rules** are stored locally in your Cursor settings, not in any project directory. They apply across all your projects on that machine.
- **Team rules** are stored on Cursor's servers and managed from the team dashboard. They sync automatically to all team members. Team rules support glob patterns, so you can scope a rule to specific file types (e.g., `**/*.py`).

User rules and team rules are not included in profile exports. If you switch machines, re-enter user rules manually or move them into a project rule file.

## How do team rules work?

Team and [Enterprise](https://cursor.com/docs/enterprise.md) plans can create and enforce rules across the entire organization from the [Cursor dashboard](https://cursor.com/dashboard/team-content).

- **Enforced rules** are required for all members and can't be turned off in their settings.
- **Optional rules** are enabled by default but members can disable them in **Customize** > **Rules**.
- Team rules support glob patterns (e.g., `**/*.py`) to scope a rule to specific file types.
- When rules conflict, precedence is: Team Rules > Project Rules > User Rules.

Team rules are free-form text. They don't use the folder structure of project rules, and they sync automatically to all members.

## How do I migrate from .cursorrules?

The `.cursorrules` file in your project root is legacy and will be deprecated. To migrate:

1. Create a new rule using the command palette: search for "New Cursor Rule"
2. Copy your `.cursorrules` content into the new rule file
3. Set the rule type to **Always Apply** (this matches the old behavior)
4. Delete the `.cursorrules` file from your project root

## How does CLAUDE.md work in Cursor?

Cursor reads `CLAUDE.md` files the same way it reads `AGENTS.md`. Place a `CLAUDE.md` file in your project root and Cursor picks it up automatically.

`CLAUDE.md` files are always applied to every conversation, regardless of any `alwaysApply` frontmatter setting. This ensures compatibility with projects that also use Claude Code. If you need conditional rules, use project rules in `.cursor/rules/` instead.

## How do rules with the same name in different folders work?

Cursor identifies rules by their full file path, not their name alone. Two rules with the same filename in different folders both apply if their conditions match. There are no conflicts or overrides based on filename.

## What if a rule doesn't seem to apply?

Check the rule type. For `Apply Intelligently`, make sure you've added a description so Agent knows when it's relevant. For `Apply to Specific Files`, verify the file pattern matches the files you're working with.

Rules only apply to Agent (Chat). They do not apply to Tab completion, Inline Edit, or [Bugbot](https://cursor.com/docs/bugbot.md#rules) PR reviews.

## Related

- [Rules reference](https://cursor.com/docs/rules.md)
- [Skills](https://cursor.com/help/customization/skills.md)
- [Ignore files](https://cursor.com/help/customization/ignore-files.md)


---

## Sitemap

[Overview of all docs pages](/llms.txt)
