/**
 * Ring-C upstream conformance sentinel.
 *
 * Installs the pinned upstream CLIs from `upstream-tools.json`, verifies each
 * binary runs and reports the expected version, runs the offline probes each
 * tool exposes (`claude doctor`, `codex doctor`, asserted on stable output
 * markers rather than auth-dependent exit codes), and compares the pins
 * against the latest public release. Any install failure, version mismatch,
 * probe-marker miss, or upstream release beyond a pin exits non-zero so the
 * scheduled workflow alerts maintainers to review the drift.
 *
 * Deep behavioral conformance (real agent sessions, hook payloads) needs
 * upstream credentials and stays manual; the failure report prints the review
 * checklist for that path.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const tools = JSON.parse(readFileSync(new URL('./upstream-tools.json', import.meta.url), 'utf8'))
const CODE_EXAMPLE_DIR = join(root, 'examples', 'codex')

const SEMVER = /\d+\.\d+\.\d+/

function capture(command, args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 90_000, ...options }),
    }
  } catch (error) {
    return { ok: false, stdout: `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim() }
  }
}

const problems = []
const rows = []

for (const tool of tools) {
  const installed = capture('npm', ['i', '-g', `${tool.pkg}@${tool.pin}`, ...(tool.npmArgs ?? [])])
  if (!installed.ok) {
    problems.push(`${tool.tool}: install failed: ${installed.stdout}`)
    rows.push({ tool: tool.tool, pinned: tool.pin, installed: 'install failed', latest: '-', probes: '-' })
    continue
  }

  const version = capture(tool.bin, ['--version'])
  const installedVersion = version.ok ? (version.stdout.match(SEMVER)?.[0] ?? '') : ''
  if (!version.ok || installedVersion !== tool.pin) {
    problems.push(`${tool.tool}: version ${installedVersion || 'probe failed'} ≠ pinned ${tool.pin}`)
  }

  const latest = capture('npm', ['view', tool.pkg, 'version'])
  const latestVersion = latest.ok ? latest.stdout.trim() : '?'
  if (latest.ok && latestVersion !== tool.pin) {
    problems.push(`${tool.tool}: upstream released ${latestVersion} (pinned ${tool.pin})`)
  }

  const probeResults = []
  for (const probe of tool.probes ?? []) {
    // Run doctor-style probes in the matching example project so the real CLI
    // inspects the same fixture layout the bridge claims to support. Doctor
    // exit codes depend on auth/network state, so probes assert on a stable
    // output marker instead.
    const cwd = tool.tool === 'codex' ? CODE_EXAMPLE_DIR : root
    const result = capture(tool.bin, probe.args, { cwd })
    const stdout = String(result.stdout ?? '').trim()
    const matched = stdout.includes(probe.marker)
    probeResults.push(`${probe.args.join(' ')}: ${matched ? 'ok' : 'FAILED'}`)
    if (!matched) problems.push(`${tool.tool}: probe ${probe.args.join(' ')} did not report "${probe.marker}"`)
  }

  rows.push({
    tool: tool.tool,
    pinned: tool.pin,
    installed: installedVersion,
    latest: latestVersion,
    probes: probeResults.join('; ') || '-',
  })
}

console.log('upstream conformance:')
for (const row of rows) {
  console.log(`  ${row.tool.padEnd(16)} pin ${row.pinned}  installed ${row.installed}  latest ${row.latest}  probes: ${row.probes}`)
}

if (problems.length > 0) {
  console.error('\nDRIFT OR FAILURE DETECTED — review before the next release:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('\nReview checklist:')
  console.error('  1. diff docs/reference/<tool>/ against the new upstream docs (llms.txt first).')
  console.error('  2. re-run pnpm test:e2e; extend e2e fixtures if any format or hook semantic changed.')
  console.error('  3. update the pin in scripts/upstream-tools.json and this checklist if nothing changed.')
  console.error('  4. behavioral sessions (hook payloads, permission flows) still need credentialed manual runs.')
  process.exit(1)
}

console.log('\nall pins current, all probes ok')
