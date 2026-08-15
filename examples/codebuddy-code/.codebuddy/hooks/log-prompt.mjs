// UserPromptSubmit hook handler: append the user's prompt to a JSONL log.
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

let raw = ''
process.stdin.on('data', (chunk) => (raw += chunk))
process.stdin.on('end', () => {
  let payload = {}
  try {
    payload = JSON.parse(raw || '{}')
  } catch {
    payload = { prompt: raw }
  }
  const projectDir = process.env.CODEBUDDY_PROJECT_DIR || process.cwd()
  const logDir = join(projectDir, '.codebuddy', 'hook-logs')
  mkdirSync(logDir, { recursive: true })
  appendFileSync(
    join(logDir, 'prompts.jsonl'),
    JSON.stringify({
      at: new Date().toISOString(),
      event: payload.hook_event_name,
      prompt: payload.prompt ?? '',
    }) + '\n',
  )
})
