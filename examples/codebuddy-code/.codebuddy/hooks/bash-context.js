#!/usr/bin/env node
// PostToolUse hook handler (matcher: Bash): append `additionalContext`
// next to every Bash tool result via hook-specific JSON output.
let raw = ''
process.stdin.on('data', (chunk) => (raw += chunk))
process.stdin.on('end', () => {
  let payload = {}
  try {
    payload = JSON.parse(raw || '{}')
  } catch {
    // ignore unreadable payloads
  }
  const response = payload.tool_response
  const context =
    response && response.value && typeof response.value === 'object' && typeof response.value.exit_code === 'number'
      ? `The Bash call ${payload.tool_name ?? ''} finished with exit code ${response.value.exit_code}.`
      : `The ${payload.tool_name ?? 'Bash'} call finished; see the tool result.`
  console.log(JSON.stringify({ hookSpecificOutput: { additionalContext: context } }))
})
