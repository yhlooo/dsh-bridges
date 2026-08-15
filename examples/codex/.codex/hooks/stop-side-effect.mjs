// Stop hook: side effect only. Runs when the agent finishes a turn;
// output is discarded by the bridge.
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const logDir = join(process.cwd(), '.codex', 'hook-logs')
mkdirSync(logDir, { recursive: true })
appendFileSync(join(logDir, 'stops.log'), `${new Date().toISOString()} Stop hook fired\n`)
