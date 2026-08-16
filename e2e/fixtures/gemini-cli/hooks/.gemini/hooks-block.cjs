let data = ''
process.stdin.on('data', (chunk) => (data += chunk))
process.stdin.on('end', () => {
  const payload = JSON.parse(data)
  if (payload.tool_name === 'run_shell_command' && payload.tool_input && payload.tool_input.command && payload.tool_input.command.includes('rm -rf')) {
    console.log(JSON.stringify({ decision: 'deny', reason: 'destructive command blocked' }))
    process.exit(0)
  }
  console.log(JSON.stringify({ decision: 'allow' }))
})
