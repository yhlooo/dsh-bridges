let data = ''
process.stdin.on('data', (chunk) => (data += chunk))
process.stdin.on('end', () => {
  const payload = JSON.parse(data)
  if (payload.loop_count < 1) {
    console.log(JSON.stringify({ followup_message: 'Re-check the checklist items once more.' }))
    return
  }
  console.log('{}')
})
