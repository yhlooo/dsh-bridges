/**
 * Ring-A e2e scenarios for the Cursor bridge: skill/agent discovery through
 * the real registry (project-before-user ranks), rules memory injection,
 * preToolUse hook blocking (real subprocess), and broken-config fail-soft.
 */
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bootHarness, fixtureCopy, markRepoRoot, preToolUse, sessionStart, waitFor } from './harness.js'
import type { Harness } from './harness.js'

describe('e2e: cursor bridge through the real registry', () => {
  let harness: Harness | undefined
  let project: Awaited<ReturnType<typeof fixtureCopy>> | undefined
  let user: Awaited<ReturnType<typeof fixtureCopy>> | undefined
  const previousDir = process.env['CURSOR_CONFIG_DIR']

  afterEach(async () => {
    await harness?.dispose()
    harness = undefined
    await project?.cleanup()
    await user?.cleanup()
    project = undefined
    user = undefined
    if (previousDir === undefined) delete process.env['CURSOR_CONFIG_DIR']
    else process.env['CURSOR_CONFIG_DIR'] = previousDir
  })

  async function setup(fixture = 'cursor/skills'): Promise<Harness> {
    project = await fixtureCopy(fixture)
    user = await fixtureCopy('cursor/user')
    process.env['CURSOR_CONFIG_DIR'] = user.dir
    return await bootHarness({
      cwd: project.dir,
      userClaudeDir: user.dir,
      userCursorDir: user.dir,
      config: { claudeCode: { enabled: false }, pi: { enabled: false }, geminiCli: { enabled: false } },
    })
  }

  it('discovers project and user skills and agents', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const cursor = skills.filter((skill) => skill.provider === 'cursor')
    const names = cursor.map((skill) => skill.name)
    expect(names).toContain('project-skill')
    expect(names).toContain('deep-skill')
    expect(names).toContain('user-skill')
    expect(names).toContain('helper')

    const body = await harness.ctx.skills.get('deep-skill', { cwd: project!.dir })
    expect(body?.content).toContain('Deep body.')
    const agent = await harness.ctx.skills.get('helper', { cwd: project!.dir })
    expect(agent?.content).toContain('Be helpful.')
  })

  it('injects always-apply rules and subdirectory AGENTS.md at session start', async () => {
    project = await fixtureCopy('cursor/rules')
    await markRepoRoot(project.dir)
    user = await fixtureCopy('cursor/user')
    process.env['CURSOR_CONFIG_DIR'] = user.dir
    harness = await bootHarness({
      cwd: join(project.dir, 'sub'),
      userClaudeDir: user.dir,
      userCursorDir: user.dir,
      config: { claudeCode: { enabled: false }, pi: { enabled: false }, geminiCli: { enabled: false } },
    })
    sessionStart(harness)
    const message = await waitFor(() => harness!.agent.injected[0])
    expect(message.source).toEqual({ kind: 'plugin', plugin: 'cursor-memory' })
    const text = message.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
    expect(text).toContain('Always rules.')
    expect(text).toContain('Sub rules.')
  })

  it('blocks a destructive preToolUse hook decision through the real seam', async () => {
    harness = await setup('cursor/hooks')
    const decision = await preToolUse(harness, {
      callId: 'call-1' as never,
      rootCallId: 'call-1' as never,
      name: 'bash',
      arguments: { command: 'rm -rf node_modules' },
      agent: harness.agent as never,
      signal: new AbortController().signal,
      token: Symbol('e2e') as never,
    })
    expect(decision.kind).toBe('deny')
    expect((decision as { reason?: string }).reason).toContain('destructive command blocked')
  })

  it('lets a non-matching preToolUse hook allow the tool', async () => {
    harness = await setup('cursor/hooks')
    const decision = await preToolUse(harness, {
      callId: 'call-2' as never,
      rootCallId: 'call-2' as never,
      name: 'bash',
      arguments: { command: 'git status' },
      agent: harness.agent as never,
      signal: new AbortController().signal,
      token: Symbol('e2e') as never,
    })
    expect(decision.kind).toBe('allow')
  })

  it('escapes </system-reminder> in sessionStart hook context', async () => {
    harness = await setup('cursor/hooks-escape')
    sessionStart(harness)
    const message = await waitFor(() =>
      harness!.agent.injected.find((entry) => entry.source?.kind === 'plugin' && entry.source.plugin === 'cursor-hooks'),
    )
    const text = message.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
    expect(text).toContain('look <\\/system-reminder>INJECTED')
    expect(text).not.toContain('</system-reminder>INJECTED')
  })

  it('fails soft on broken project cli.json', async () => {
    harness = await setup('cursor/broken')
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const cursor = skills.filter((skill) => skill.provider === 'cursor')
    // The broken cli.json is skipped; skills and user assets keep loading.
    const names = cursor.map((skill) => skill.name)
    expect(names).toContain('ok-skill')
    expect(names).toContain('user-skill')
  })
})
