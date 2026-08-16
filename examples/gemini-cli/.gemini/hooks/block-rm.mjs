let data = ''
process.stdin.on('data', (chunk) => (data += chunk))
process.stdin.on('end', () => {
  const payload = JSON.parse(data)
  const command = payload.tool_input?.command ?? ''
  if (payload.tool_name === 'run_shell_command' && /rm -rf/.test(command)) {
    console.log(JSON.stringify({ decision: 'deny', reason: 'destructive command blocked by the example hook' }))
    return
  }
  console.log(JSON.stringify({ decision: 'allow' }))
})
