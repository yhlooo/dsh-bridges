// E2E hook fixture: record its pid and sleep past the test, so teardown and
// timeout behavior can be observed on a live child process.
const fs = require('node:fs')

fs.writeFileSync('.e2e-hook.pid', String(process.pid))
setTimeout(() => {}, 30_000)
