> 来源: https://cursor.com/docs/cli/acp.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# ACP

## Overview

Cursor CLI supports **ACP (Agent Client Protocol)** for advanced integrations. You can run `agent acp` and connect a custom client over `stdio` using JSON-RPC.

Learn more in the official [Agent Client Protocol docs](https://agentclientprotocol.com/).

ACP is intended for building custom clients and integrations. For normal terminal
workflows, use the interactive CLI with `agent`.

## Start ACP server

Start Cursor CLI in ACP mode:

```bash
agent acp
```

## Transport and message format

- Transport: `stdio`
- Protocol envelope: JSON-RPC 2.0
- Framing: newline-delimited JSON (one message per line)
- Direction:
  - Client writes requests/notifications to `stdin`
  - Cursor CLI writes responses/notifications to `stdout`
  - Logs may be written to `stderr`

## Request flow

Typical ACP session flow:

1. `initialize`
2. `authenticate` with `methodId: "cursor_login"`
3. `session/new` (or `session/load`)
4. `session/prompt`
5. Handle `session/update` notifications while the model streams output
6. Handle `session/request_permission` by returning a decision
7. Optionally send `session/cancel`

## Authentication

Cursor CLI advertises `cursor_login` as the ACP auth method. In practice, you can pre-authenticate before startup using existing CLI auth paths:

- `agent login`
- `--api-key` (or `CURSOR_API_KEY`)
- `--auth-token` (or `CURSOR_AUTH_TOKEN`)

You can also pass endpoint and TLS options from the root CLI command:

```bash
agent --api-key "$CURSOR_API_KEY" acp
agent -e https://api2.cursor.sh acp
agent -k acp
```

## Sessions, modes, and permissions

### Sessions

- Create a session with `session/new`
- Resume an existing conversation with `session/load`

### Modes

ACP sessions support the same core modes as CLI:

- `agent` (full tool access)
- `plan` (planning, read-only behavior)
- `ask` (Q\&A/read-only behavior)

### Permissions

When tools need approval, Cursor sends `session/request_permission`. Clients should return one of:

- `allow-once`
- `allow-always`
- `reject-once`

If your client does not answer permission requests, tool execution can block.

## MCP servers

ACP supports [MCP servers](https://cursor.com/docs/mcp.md) defined in a project-level or user-level `.cursor/mcp.json`. Launch `agent` from your project directory and approve the servers you want to use.

Team-level MCP servers configured through the Cursor dashboard are not supported in ACP mode.

## Cursor extension methods

Cursor sends ACP extension methods for richer client UX. There are two types:

- **Blocking methods** (`cursor/ask_question`, `cursor/create_plan`): The agent waits for a response before continuing. Your client must reply with a JSON-RPC response.
- **Notification methods** (`cursor/update_todos`, `cursor/task`, `cursor/generate_image`): The agent sends these as fire-and-forget notifications. Your client can display them but doesn't need to respond.

| Method                  | Type         | Use                                          |
| :---------------------- | :----------- | :------------------------------------------- |
| `cursor/ask_question`   | Blocking     | Ask users multiple-choice questions          |
| `cursor/create_plan`    | Blocking     | Request explicit plan approval               |
| `cursor/update_todos`   | Notification | Notify client about todo state updates       |
| `cursor/task`           | Notification | Notify client about subagent task completion |
| `cursor/generate_image` | Notification | Notify client about generated image output   |

### `cursor/ask_question`

Present multiple-choice questions to the user. The agent blocks until the client responds.

**Request:**

```ts
interface CursorAskQuestionRequest {
  toolCallId: string;
  title?: string;
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ id: string; label: string }>;
    allowMultiple?: boolean;
  }>;
}
```

**Response:**

```ts
interface CursorAskQuestionResponse {
  outcome:
    | {
        outcome: "answered";
        answers: Array<{
          questionId: string;
          selectedOptionIds: string[];
        }>;
      }
    | { outcome: "skipped"; reason?: string }
    | { outcome: "cancelled" };
}
```

**Example request:**

```json
{
  "toolCallId": "call_123",
  "title": "Need input",
  "questions": [
    {
      "id": "q1",
      "prompt": "Which mode should I use?",
      "options": [
        { "id": "agent", "label": "Agent" },
        { "id": "plan", "label": "Plan" }
      ],
      "allowMultiple": false
    }
  ]
}
```

### `cursor/create_plan`

Request plan approval from the user. The agent blocks until the client accepts or rejects the plan.

**Request:**

```ts
interface CursorCreatePlanRequest {
  toolCallId: string;
  name?: string;
  overview?: string;
  plan: string;
  todos: Array<{
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
  }>;
  isProject?: boolean;
  phases?: Array<{
    name: string;
    todos: Array<{
      id: string;
      content: string;
      status: "pending" | "in_progress" | "completed" | "cancelled";
    }>;
  }>;
}
```

- `plan`: A markdown string describing the full plan.
- `phases`: Optional grouping of todos into named phases for larger plans.

**Response:**

```ts
interface CursorCreatePlanResponse {
  outcome:
    | { outcome: "accepted"; planUri?: string }
    | { outcome: "rejected"; reason?: string }
    | { outcome: "cancelled" };
}
```

**Example request:**

```json
{
  "toolCallId": "call_124",
  "name": "Refactor tabs layout",
  "overview": "Tighten layout behavior and preserve existing UX.",
  "plan": "1. Inspect current tab sizing logic.\n2. Update layout calculations.\n3. Verify editor behavior.",
  "todos": [
    { "id": "todo-1", "content": "Inspect current tab sizing logic", "status": "completed" },
    { "id": "todo-2", "content": "Update layout calculations", "status": "in_progress" },
    { "id": "todo-3", "content": "Verify editor behavior", "status": "pending" }
  ],
  "isProject": false
}
```

### `cursor/update_todos`

Update the client's todo list. Sent as a notification; no response required.

**Request:**

```ts
interface CursorUpdateTodosRequest {
  toolCallId: string;
  todos: Array<{
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed" | "cancelled";
  }>;
  merge: boolean;
}
```

- `merge`: When `true`, merge these todos into the existing list. When `false`, replace the entire list.

**Response:**

```ts
interface CursorUpdateTodosResponse {
  outcome:
    | {
        outcome: "accepted";
        todos: Array<{
          id: string;
          content: string;
          status: "pending" | "in_progress" | "completed" | "cancelled";
        }>;
      }
    | { outcome: "rejected"; reason?: string }
    | { outcome: "cancelled" };
}
```

**Example request:**

```json
{
  "toolCallId": "call_125",
  "todos": [
    { "id": "1", "content": "Set up project structure", "status": "completed" },
    { "id": "2", "content": "Add authentication", "status": "in_progress" },
    { "id": "3", "content": "Write unit tests", "status": "pending" }
  ],
  "merge": true
}
```

### `cursor/task`

Notify the client about a subagent task. Sent as a notification; no response required.

**Request:**

```ts
interface CursorTaskRequest {
  toolCallId: string;
  description: string;
  prompt: string;
  subagentType:
    | "unspecified"
    | "computer_use"
    | "explore"
    | "video_review"
    | "browser_use"
    | "shell"
    | "vm_setup_helper"
    | { custom: string };
  model?: string;
  agentId?: string;
  durationMs?: number;
}
```

- `subagentType`: The type of subagent to run. Use `{ custom: "your_type" }` for custom subagent types.
- `agentId`: Set this to resume a previously created subagent.
- `durationMs`: How long the task ran, included in the response.

**Response:**

```ts
interface CursorTaskResponse {
  outcome:
    | { outcome: "completed"; agentId?: string; durationMs?: number }
    | { outcome: "rejected"; reason?: string }
    | { outcome: "cancelled" };
}
```

**Example request:**

```json
{
  "toolCallId": "call_126",
  "description": "Explore codebase",
  "prompt": "Find where authentication is handled and report the file paths.",
  "subagentType": "explore"
}
```

### `cursor/generate_image`

Notify the client about a generated image. Sent as a notification; no response required.

**Request:**

```ts
interface CursorGenerateImageRequest {
  toolCallId: string;
  description: string;
  filePath?: string;
  referenceImagePaths?: string[];
}
```

- `filePath`: Suggested file path for the generated image.
- `referenceImagePaths`: Paths to reference images used as input.

**Response:**

```ts
interface CursorGenerateImageResponse {
  outcome:
    | { outcome: "generated"; filePath: string; imageData?: string }
    | { outcome: "rejected"; reason?: string }
    | { outcome: "cancelled" };
}
```

**Example request:**

```json
{
  "toolCallId": "call_127",
  "description": "Minimal flat app icon for a note-taking app",
  "filePath": "/tmp/icon.png",
  "referenceImagePaths": ["/tmp/reference.png"]
}
```

## Minimal Node.js client

This example shows the minimum control flow for a custom ACP client:

```js
import { spawn } from "node:child_process";
import readline from "node:readline";

const agent = spawn("agent", ["acp"], { stdio: ["pipe", "pipe", "inherit"] });

let nextId = 1;
const pending = new Map();

function send(method, params) {
  const id = nextId++;
  agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function respond(id, result) {
  agent.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

const rl = readline.createInterface({ input: agent.stdout });
rl.on("line", line => {
  const msg = JSON.parse(line);

  if (msg.id && (msg.result || msg.error)) {
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    msg.error ? waiter.reject(msg.error) : waiter.resolve(msg.result);
    return;
  }

  if (msg.method === "session/update") {
    const update = msg.params?.update;
    if (update?.sessionUpdate === "agent_message_chunk" && update.content?.text) {
      process.stdout.write(update.content.text);
    }
    return;
  }

  if (msg.method === "session/request_permission") {
    respond(msg.id, { outcome: { outcome: "selected", optionId: "allow-once" } });
  }
});

const init = async () => {
  await send("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: "acp-minimal-client", version: "0.1.0" }
  });

  await send("authenticate", { methodId: "cursor_login" });
  const { sessionId } = await send("session/new", { cwd: process.cwd(), mcpServers: [] });
  const result = await send("session/prompt", {
    sessionId,
    prompt: [{ type: "text", text: "Say hello in one sentence." }]
  });

  console.log(`\n\n[stopReason=${result.stopReason}]`);
};

init().finally(() => {
  agent.stdin.end();
  agent.kill();
});
```

## IDE integrations

ACP enables Cursor's AI agent to work with editors beyond the Cursor desktop app. Build or use third-party integrations for your preferred development environment.

### Example use cases

- **JetBrains IDEs** — Connect IntelliJ IDEA, WebStorm, PyCharm, or other JetBrains IDEs to Cursor's agent. See the [JetBrains integration guide](https://cursor.com/docs/integrations/jetbrains.md) for setup instructions.

- **Neovim (avante.nvim)** — Use [avante.nvim](https://github.com/yetone/avante.nvim) to connect Neovim to Cursor's agent through ACP. See [Neovim setup](https://cursor.com/docs/cli/acp.md#neovim-avantenvim) below.

- **Zed** — Integrate with Zed's modern editor by spawning `agent acp` and communicating over stdio. Zed extensions can implement the ACP client protocol to route AI requests to Cursor.

- **Custom editors** — Any editor with extension support can implement an ACP client. Spawn the agent process, send JSON-RPC messages over stdio, and handle responses in your editor's UI.

### Neovim (avante.nvim)

[avante.nvim](https://github.com/yetone/avante.nvim) is a Neovim plugin that provides an AI-powered coding assistant. It supports ACP, so you can connect it to Cursor's agent for agentic coding inside Neovim.

Add the following to your lazy.nvim plugin configuration (e.g., `~/.config/nvim/lua/plugins/avante.lua`):

```lua
return {
  {
    "yetone/avante.nvim",
    event = "VeryLazy",
    version = false,
    build = "make",
    opts = {
      provider = "cursor",
      mode = "agentic",
      acp_providers = {
        cursor = {
          command = os.getenv("HOME") .. "/.local/bin/agent",
          args = { "acp" },
          auth_method = "cursor_login",
          env = {
            HOME = os.getenv("HOME"),
            PATH = os.getenv("PATH"),
          },
        },
      },
    },
    dependencies = {
      "nvim-lua/plenary.nvim",
      "MunifTanjim/nui.nvim",
      "nvim-tree/nvim-web-devicons",
      {
        "MeanderingProgrammer/render-markdown.nvim",
        opts = {
          file_types = { "markdown", "Avante" },
        },
        ft = { "markdown", "Avante" },
      },
    },
  },
}
```

Key settings:

- **`provider`**: Set to `"cursor"` to route requests through Cursor's agent.
- **`mode`**: Set to `"agentic"` for full tool access (file edits, terminal commands). Use `"normal"` for chat-only mode.
- **`command`**: Points to the `agent` binary. The default install path is `~/.local/bin/agent`. Adjust if you installed it elsewhere.
- **`auth_method`**: Uses `"cursor_login"`. Run `agent login` in your terminal first to authenticate.

### Building an integration

1. Spawn `agent acp` as a child process
2. Communicate over stdin/stdout using JSON-RPC
3. Handle `session/update` notifications to display streaming responses
4. Respond to `session/request_permission` when tools need approval
5. Optionally implement Cursor extension methods for richer UX

See the [minimal Node.js client](https://cursor.com/docs/cli/acp.md#minimal-nodejs-client) above for a working reference implementation.

## Related

### MCP in CLI

Manage and use MCP servers from Cursor CLI

### MCP Overview

Learn MCP transports, configuration, and server setup


---

## Sitemap

[Overview of all docs pages](/llms.txt)
