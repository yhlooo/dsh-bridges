> 来源: https://cursor.com/docs/agent/overview.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Cursor Agent

Agent is Cursor's assistant that can complete complex coding tasks independently, run terminal commands, and edit code. Access in sidepane with Cmd+I.

Learn more about [how agents work](https://cursor.com/learn/agents.md) and help you build faster.

## How Agent works

An agent is built on three components:

1. **Instructions**: The system prompt and [rules](https://cursor.com/docs/rules.md) that guide agent behavior
2. **Tools**: File editing, codebase search, terminal execution, and more
3. **Model**: The agent model you pick for the task

Cursor's agent orchestrates these components for each model we support, tuning instructions and tools specifically for every frontier model. As new models are released, you can focus on building software while Cursor handles the model-specific optimizations.

## Tools

Tools are the building blocks of Agent. They are used to search your codebase and the web to find relevant information, make edits to your files, run terminal commands, and more.

To understand how tool calling works under the hood, see our [tool calling fundamentals](https://cursor.com/learn/tool-calling.md).

There is no limit on the number of tool calls Agent can make during a task.

### Search files and folders

Search for files by name, read directory structures, and find exact keywords or patterns within files.

### Web

Generate search queries and perform web searches.

### Fetch Rules

Retrieve specific [rules](https://cursor.com/docs/rules.md) based on type and description.

### Read files

Intelligently read the content of a file. Also supports image files (.png, .jpg, .gif, .webp, .svg) and includes them in the conversation context for analysis by vision-capable models.

### Edit files

Suggest edits to files and apply them automatically.

### Run shell commands

Execute terminal commands and monitor output. By default, Cursor uses the first terminal profile available.

To set your preferred terminal profile:

1. Open Command Palette (`Cmd/Ctrl+Shift+P`)
2. Search for "Terminal: Select Default Profile"
3. Choose your desired profile

### Browser

Control a browser to take screenshots, test applications, and verify visual changes. Agent can navigate pages, interact with elements, and capture the current state for analysis. See the [Browser documentation](https://cursor.com/docs/agent/tools/browser.md) for details.

### Image generation

Generate images from text descriptions or reference images. Useful for creating UI mockups, product assets, and visualizing architecture diagrams. Images are saved to your project's `assets/` folder by default and shown inline in chat.

### Ask questions

Ask clarifying questions during a task. While waiting for your response, the agent continues reading files, making edits, or running commands. Your answer is incorporated as soon as it arrives.

## Checkpoints

Checkpoints save snapshots of your codebase during an Agent session. Agent automatically creates them before making significant changes, capturing the state of all modified files.

If Agent takes a wrong turn, click any checkpoint in the chat timeline to preview your files at that point, then restore to revert all files to that state. You can also restore from the `Restore Checkpoint` button on previous requests or the + button when hovering over a message.

Checkpoints are useful for exploratory work, complex refactoring, and iterative development where you want safe rollback points.

Checkpoints are stored locally and separate from Git. Only use them for undoing Agent changes; use Git for permanent version control.

## Queued messages

Queue follow-up messages while Agent is working on the current task. Your instructions wait in line and execute automatically when ready.

[Media](/docs-static/images/agent/planning/agent-queue.mp4)

### Using the queue

1. While Agent is working, type your next instruction
2. Press Enter to add it to the queue
3. Messages appear in order below the active task
4. Drag to reorder queued messages as needed
5. Agent processes them sequentially after finishing

### Keyboard shortcuts

While Agent is working:

- Press Enter to queue your message (it waits until Agent finishes the current task)
- Press Cmd+Enter to send immediately, bypassing the queue

### Immediate messaging

When you use Cmd+Enter to send immediately, your message is appended to the most recent user message in the chat and processed right away without waiting in the queue.

- Your message attaches to tool results and sends immediately
- This creates a more responsive experience for urgent follow-ups
- Use this when you need to interrupt or redirect Agent's current work


---

## Sitemap

[Overview of all docs pages](/llms.txt)
