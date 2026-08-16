// E2E hook fixture: record its pid and sleep past the timeout, so the bridge
// has to time out and fail open.
const fs = require('node:fs')

fs.writeFileSync('.e2e-hook.pid', String(process.pid))
setTimeout(() => {}, 30_000)
