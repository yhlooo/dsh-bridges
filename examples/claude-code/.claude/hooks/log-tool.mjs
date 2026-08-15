// PreToolUse hook handler (matcher: Bash): log every Bash call.
// The payload's tool names are Claude Code names (`Bash`, `Edit`, …) —
// the bridge translates DeepSeek Harness names before invoking hooks.
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let raw = ''
process.stdin.on('data', (chunk) => (raw += chunk))
process.stdin.on('end', () => {
  let payload = {}
  try {
    payload = JSON.parse(raw || '{}')
  } catch {
    // ignore unreadable payloads; never block the tool call
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()
  const logDir = join(projectDir, '.claude', 'hook-logs')
  mkdirSync(logDir, { recursive: true })
  appendFileSync(
    join(logDir, 'tools.jsonl'),
    JSON.stringify({
      at: new Date().toISOString(),
      event: payload.hook_event_name,
      tool_name: payload.tool_name,
      tool_input: payload.tool_input,
    }) + '\n',
  )
})
