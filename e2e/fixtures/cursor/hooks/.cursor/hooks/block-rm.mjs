let data = ''
process.stdin.on('data', (chunk) => (data += chunk))
process.stdin.on('end', () => {
  const payload = JSON.parse(data)
  if (payload.tool_name === 'Shell' && String(payload.tool_input?.command ?? '').includes('rm -rf')) {
    console.log(JSON.stringify({ permission: 'deny', agent_message: 'destructive command blocked' }))
    return
  }
  console.log(JSON.stringify({ permission: 'allow' }))
})
