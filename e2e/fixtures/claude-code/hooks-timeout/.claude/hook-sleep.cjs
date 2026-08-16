// E2E hook fixture: record its pid and sleep past the timeout, so the bridge
// has to time out and fail open. The sleep only needs to outlive the 300ms
// hookTimeoutMs: keep it short so the Windows kill path (direct child only,
// orphaned grandchild holds the pipes) does not drag the test out.
const fs = require('node:fs')

fs.writeFileSync('.e2e-hook.pid', String(process.pid))
setTimeout(() => {}, 4_000)
