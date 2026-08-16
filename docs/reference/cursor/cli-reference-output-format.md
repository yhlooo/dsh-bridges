> 来源: https://cursor.com/docs/cli/reference/output-format.md
> 抓取日期: 2026-08-16 (UTC)；内容为 Cursor 官方文档原文下载

# Output format

The Cursor Agent CLI provides multiple output formats with the `--output-format` option when combined with `--print`. These formats include structured formats for programmatic use (`json`, `stream-json`) and a simplified text format for human-readable output (`text`).

The default `--output-format` is `text`. This option is only valid when
printing (`--print`) or when print mode is inferred (non-TTY stdout or piped
stdin).

## JSON format

The `json` output format emits a single JSON object (followed by a newline) when the run completes successfully. Deltas and tool events are not emitted; text is aggregated into the final result.

On failure, the process exits with a non-zero code and writes an error message to stderr. No well-formed JSON object is emitted in failure cases.

### Success response

When successful, the CLI outputs a JSON object with the following structure:

```json
{
  "type": "result",
  "subtype": "success",
  "is_error": false,
  "duration_ms": 1234,
  "duration_api_ms": 1234,
  "result": "<full assistant text>",
  "session_id": "<uuid>",
  "request_id": "<optional request id>"
}
```

| Field             | Description                                                         |
| ----------------- | ------------------------------------------------------------------- |
| `type`            | Always `"result"` for terminal results                              |
| `subtype`         | Always `"success"` for successful completions                       |
| `is_error`        | Always `false` for successful responses                             |
| `duration_ms`     | Total execution time in milliseconds                                |
| `duration_api_ms` | API request time in milliseconds (currently equal to `duration_ms`) |
| `result`          | Complete assistant response text (concatenation of all text deltas) |
| `session_id`      | Unique session identifier                                           |
| `request_id`      | Optional request identifier (may be omitted)                        |

## Stream JSON format

The `stream-json` output format emits newline-delimited JSON (NDJSON). Each line contains a single JSON object representing an event during execution. This format aggregates text deltas and outputs **one line per assistant message** (the complete message between tool calls).

The stream ends with a terminal `result` event on success. On failure, the process exits with a non-zero code and the stream may end early without a terminal event; an error message is written to stderr.

**Streaming partial output:** For real-time character-level streaming, use `--stream-partial-output` with `--output-format stream-json`. This emits text as it's generated in small chunks, with multiple `assistant` events per message.

With `--stream-partial-output`, the CLI emits three kinds of `assistant` events. Only the first kind contains new text:

| `timestamp_ms` | `model_call_id` | What it is                                    | Action                                    |
| -------------- | --------------- | --------------------------------------------- | ----------------------------------------- |
| Present        | Absent          | Streaming delta with new text                 | **Use** — append `message.content[].text` |
| Present        | Present         | Buffered flush before a tool call (duplicate) | **Skip**                                  |
| Absent         | Absent          | Final flush at end of turn (duplicate)        | **Skip**                                  |

If you don't need real-time streaming and only want the finished answer, skip all `assistant` events and read the `result` field from the terminal `result` event.

### Event types

#### System initialization

Emitted once at the beginning of each session:

```json
{
  "type": "system",
  "subtype": "init",
  "apiKeySource": "env|flag|login",
  "cwd": "/absolute/path",
  "session_id": "<uuid>",
  "model": "<model display name>",
  "permissionMode": "default"
}
```

Future fields like `tools` and `mcp_servers` may be added to this event.

#### User message

Contains the user's input prompt:

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": [{ "type": "text", "text": "<prompt>" }]
  },
  "session_id": "<uuid>"
}
```

#### Assistant message

Emitted once per complete assistant message (between tool calls). Each event contains the full text of that message segment:

```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [{ "type": "text", "text": "<complete message text>" }]
  },
  "session_id": "<uuid>"
}
```

When `--stream-partial-output` is enabled, assistant events may include two additional fields:

| Field           | Description                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `timestamp_ms`  | Present on streaming deltas and pre-tool-call flushes. Absent on the final flush at the end of a turn.       |
| `model_call_id` | Present only on the buffered flush emitted before a tool call. Use this to identify and skip duplicate text. |

See the [streaming partial output note](https://cursor.com/docs/cli/reference/output-format.md#stream-json-format) above for how to filter these events.

#### Tool call events

Tool calls are tracked with start and completion events:

**Tool call started:**

```json
{
  "type": "tool_call",
  "subtype": "started",
  "call_id": "<string id>",
  "tool_call": {
    "readToolCall": {
      "args": { "path": "file.txt" }
    }
  },
  "session_id": "<uuid>"
}
```

**Tool call completed:**

```json
{
  "type": "tool_call",
  "subtype": "completed",
  "call_id": "<string id>",
  "tool_call": {
    "readToolCall": {
      "args": { "path": "file.txt" },
      "result": {
        "success": {
          "content": "file contents...",
          "isEmpty": false,
          "exceededLimit": false,
          "totalLines": 54,
          "totalChars": 1254
        }
      }
    }
  },
  "session_id": "<uuid>"
}
```

#### Tool call types

**Read file tool:**

- **Started**: `tool_call.readToolCall.args` contains `{ "path": "file.txt" }`
- **Completed**: `tool_call.readToolCall.result.success` contains file metadata and content

**Write file tool:**

- **Started**: `tool_call.writeToolCall.args` contains `{ "path": "file.txt", "fileText": "content...", "toolCallId": "id" }`
- **Completed**: `tool_call.writeToolCall.result.success` contains `{ "path": "/absolute/path", "linesCreated": 19, "fileSize": 942 }`

**Other tools:**

- May use `tool_call.function` structure with `{ "name": "tool_name", "arguments": "..." }`

#### Terminal result

The final event emitted on successful completion:

```json
{
  "type": "result",
  "subtype": "success",
  "duration_ms": 1234,
  "duration_api_ms": 1234,
  "is_error": false,
  "result": "<full assistant text>",
  "session_id": "<uuid>",
  "request_id": "<optional request id>"
}
```

### Example sequence

Here's a representative NDJSON sequence showing the typical flow of events:

```json
{"type":"system","subtype":"init","apiKeySource":"login","cwd":"/Users/user/project","session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff","model":"Claude 4 Sonnet","permissionMode":"default"}
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Read README.md and create a summary"}]},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"I'll read the README.md file"}]},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"tool_call","subtype":"started","call_id":"toolu_vrtx_01NnjaR886UcE8whekg2MGJd","tool_call":{"readToolCall":{"args":{"path":"README.md"}}},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"tool_call","subtype":"completed","call_id":"toolu_vrtx_01NnjaR886UcE8whekg2MGJd","tool_call":{"readToolCall":{"args":{"path":"README.md"},"result":{"success":{"content":"# Project\n\nThis is a sample project...","isEmpty":false,"exceededLimit":false,"totalLines":54,"totalChars":1254}}}},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Based on the README, I'll create a summary"}]},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"tool_call","subtype":"started","call_id":"toolu_vrtx_01Q3VHVnWFSKygaRPT7WDxrv","tool_call":{"writeToolCall":{"args":{"path":"summary.txt","fileText":"# README Summary\n\nThis project contains...","toolCallId":"toolu_vrtx_01Q3VHVnWFSKygaRPT7WDxrv"}}},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"tool_call","subtype":"completed","call_id":"toolu_vrtx_01Q3VHVnWFSKygaRPT7WDxrv","tool_call":{"writeToolCall":{"args":{"path":"summary.txt","fileText":"# README Summary\n\nThis project contains...","toolCallId":"toolu_vrtx_01Q3VHVnWFSKygaRPT7WDxrv"},"result":{"success":{"path":"/Users/user/project/summary.txt","linesCreated":19,"fileSize":942}}}},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Done! I've created the summary in summary.txt"}]},"session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff"}
{"type":"result","subtype":"success","duration_ms":5234,"duration_api_ms":5234,"is_error":false,"result":"I'll read the README.md fileBased on the README, I'll create a summaryDone! I've created the summary in summary.txt","session_id":"c6b62c6f-7ead-4fd6-9922-e952131177ff","request_id":"10e11780-df2f-45dc-a1ff-4540af32e9c0"}
```

## Text format

The `text` output format provides only the final assistant message without any intermediate progress updates or tool call summaries. This is the cleanest output format for scripts that only need the agent's final response.

This format is ideal when you want just the answer or final message from the agent, without any progress indicators or tool execution details.

### Example output

```
The command to move this branch onto main is `git rebase --onto main HEAD~3`.
```

Only the final assistant message (after the last tool call) is output, with no tool call summaries or intermediate text.

## Notes

- Each event is emitted as a single line terminated by `\n`
- `thinking` events are suppressed in print mode and will not appear in any output format
- Field additions may occur over time in a backward-compatible way (consumers should ignore unknown fields)
- The `json` format waits for completion before outputting results
- The `stream-json` format outputs complete agent messages
- The `--stream-partial-output` flag provides real-time text deltas for character-level streaming (only works with `stream-json` format)
- Tool call IDs can be used to correlate start/completion events
- Session IDs remain consistent throughout a single agent execution


---

## Sitemap

[Overview of all docs pages](/llms.txt)
