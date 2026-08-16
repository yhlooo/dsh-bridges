/**
 * Ring-B pack smoke: pack the built bundle, install it into a scratch profile
 * with the real dsh CLI, and assert the composed tree contains the `bridges`
 * row. Skips (exit 0) when the dsh CLI is not on PATH so the check is inert on
 * machines without a harness; CI installs `@deepseek-ai/dsh` explicitly first.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const scratch = mkdtempSync(join(tmpdir(), 'dsh-bridges-smoke-'))
const home = join(scratch, 'home')
const useShell = process.platform === 'win32' // npm/dsh are .cmd shims on Windows

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { shell: useShell, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...options })
  } catch (error) {
    const stdout = error.stdout ?? ''
    const stderr = error.stderr ?? ''
    throw new Error(`${command} ${args.join(' ')} failed:\n${stdout}${stderr}`)
  }
}

try {
  const dsh = process.env.DSH_BIN ?? 'dsh'
  try {
    execFileSync(dsh, ['--version'], { shell: useShell, stdio: 'ignore' })
  } catch {
    console.log('pack smoke skipped: dsh CLI not on PATH')
    process.exit(0)
  }

  // 1. Pack the repo (prepack runs `pnpm build` first).
  const packOutput = run('npm', ['pack', '--pack-destination', scratch], { cwd: root })
  const tarball = join(scratch, packOutput.trim().split('\n').at(-1).trim())

  // 2. Install the tarball into a scratch profile, isolated from the real home.
  const env = { ...process.env, DSH_HOME: home }
  run(dsh, ['plugin', '--profile', 'smoke', 'add', tarball], { env })

  // 3. The composed profile tree must load the bundle as the `bridges` row.
  const dump = run(dsh, ['--profile', 'smoke', '--dump-config'], { env })
  if (!/^- id: bridges\s*\n\s*name: dsh-bridges\s*$/m.test(dump)) {
    throw new Error(`bridges row missing from the composed profile:\n${dump}`)
  }

  console.log('pack smoke ok: dsh-bridges loads in a real profile')
} finally {
  rmSync(scratch, { recursive: true, force: true })
}
