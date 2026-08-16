let data = ''
process.stdin.on('data', (chunk) => (data += chunk))
process.stdin.on('end', () => {
  const payload = JSON.parse(data)
  if (payload.tool_name === 'Shell' && /rm -rf/.test(String(payload.tool_input?.command ?? ''))) {
    console.log(JSON.stringify({ permission: 'deny', agent_message: 'destructive command blocked by the example hook' }))
    return
  }
  console.log(JSON.stringify({ permission: 'allow' }))
})
