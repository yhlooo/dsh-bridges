// E2E hook fixture: record the stdin payload the bridge feeds, then block.
const fs = require('node:fs')

const chunks = []
process.stdin.on('data', (chunk) => chunks.push(chunk))
process.stdin.on('end', () => {
  fs.writeFileSync('.e2e-hook-input.json', Buffer.concat(chunks).toString('utf8'))
  process.stderr.write('denied by e2e fixture policy')
  process.exit(2)
})
