#!/usr/bin/env node
// PreToolUse guard (matcher: ^Bash$): refuse recursive deletions in this
// demo project. Exit code 2 blocks the tool call; the message follows
// Codex priority: JSON reason > stopReason > stderr.
let raw = ''
process.stdin.on('data', (chunk) => (raw += chunk))
process.stdin.on('end', () => {
  let command = ''
  try {
    const payload = JSON.parse(raw || '{}')
    const input = payload.tool_input
    if (input && typeof input.command === 'string') command = input.command
  } catch {
    // unreadable payload: fail open
  }
  if (/^rm\s+(-[^\s]*r[^\s]*\s+|-[^\s]*\s*-[^\s]*r|--recursive\s)/.test(command)) {
    console.log(JSON.stringify({ reason: `refusing recursive deletion in the example project: ${command}` }))
    process.exit(2)
  }
})
