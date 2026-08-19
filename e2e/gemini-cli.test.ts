/**
 * Ring-A e2e scenarios for the Gemini CLI bridge: skill/command/agent
 * discovery through the real registry (workspace-over-user precedence),
 * GEMINI.md memory injection (chain + @imports), BeforeTool hook blocking
 * (real subprocess, stdin payload, deny decision), hook timeout fail-open,
 * and broken-settings fail-soft.
 */
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { bootHarness, fixtureCopy, markRepoRoot, preToolUse, sessionStart, waitFor } from './harness.js'
import type { Harness } from './harness.js'

describe('e2e: gemini-cli bridge through the real registry', () => {
  let harness: Harness | undefined
  let project: Awaited<ReturnType<typeof fixtureCopy>> | undefined
  let user: Awaited<ReturnType<typeof fixtureCopy>> | undefined
  const previousHome = process.env['GEMINI_CLI_HOME']

  afterEach(async () => {
    await harness?.dispose()
    harness = undefined
    await project?.cleanup()
    await user?.cleanup()
    project = undefined
    user = undefined
    if (previousHome === undefined) delete process.env['GEMINI_CLI_HOME']
    else process.env['GEMINI_CLI_HOME'] = previousHome
  })

  async function setup(fixture = 'gemini-cli/skills'): Promise<Harness> {
    project = await fixtureCopy(fixture)
    user = await fixtureCopy('gemini-cli/user')
    process.env['GEMINI_CLI_HOME'] = user.dir
    return await bootHarness({
      cwd: project.dir,
      userClaudeDir: user.dir,
      userGeminiDir: user.dir,
      config: { claudeCode: { enabled: false }, pi: { enabled: false } },
    })
  }

  it('discovers project and user skills, commands, and agents', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const gemini = skills.filter((skill) => skill.provider === 'gemini-cli')
    const names = gemini.map((skill) => skill.name)
    expect(names).toContain('project-skill')
    expect(names).toContain('user-skill')
    expect(names).toContain('review')
    expect(names).toContain('git-commit') // nested `commands/git/commit.toml` → `/git:commit` upstream
    expect(names).toContain('hello')
    expect(names).toContain('reviewer')

    const body = await harness.ctx.skills.get('review', { cwd: project!.dir })
    expect(body?.content).toContain('Review the diff.')
    const nested = await harness.ctx.skills.get('git-commit', { cwd: project!.dir })
    expect(nested?.content).toContain('Conventional Commits message.')
    const agent = await harness.ctx.skills.get('reviewer', { cwd: project!.dir })
    expect(agent?.content).toContain('Be careful.')
  })

  it('lets the workspace skill win a same-name conflict (workspace > user)', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const shared = skills.filter((skill) => skill.name === 'shared')
    expect(shared).toHaveLength(1)
    const body = await harness.ctx.skills.get('shared', { cwd: project!.dir })
    expect(body?.content).toContain('Project shared body.')
  })

  it('injects the GEMINI.md chain with @imports at session start', async () => {
    project = await fixtureCopy('gemini-cli/memory')
    await markRepoRoot(project.dir)
    user = await fixtureCopy('gemini-cli/user')
    process.env['GEMINI_CLI_HOME'] = user.dir
    harness = await bootHarness({
      cwd: join(project.dir, 'sub'),
      userClaudeDir: user.dir,
      userGeminiDir: user.dir,
      config: { claudeCode: { enabled: false }, pi: { enabled: false } },
    })
    sessionStart(harness)
    const message = await waitFor(() => harness!.agent.injected[0])
    expect(message.source).toEqual({ kind: 'plugin', plugin: 'gemini-cli-memory' })
    const text = message.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
    expect(text).toContain('Global rules.')
    expect(text).toContain('Project rules.')
    expect(text).toContain('Sub rules.')
    expect(text).toContain('Imported rules.')
  })

  it('blocks a destructive BeforeTool hook decision through the real seam', async () => {
    harness = await setup('gemini-cli/hooks')
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

  it('lets a non-matching BeforeTool hook allow the tool', async () => {
    harness = await setup('gemini-cli/hooks')
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

  it('fails open when a BeforeTool hook times out', async () => {
    harness = await setup('gemini-cli/hooks-timeout')
    const decision = await preToolUse(harness, {
      callId: 'call-3' as never,
      rootCallId: 'call-3' as never,
      name: 'read',
      arguments: { file_path: 'x' },
      agent: harness.agent as never,
      signal: new AbortController().signal,
      token: Symbol('e2e') as never,
    })
    expect(decision.kind).toBe('allow')
  })

  it('escapes </system-reminder> in SessionStart hook context', async () => {
    harness = await setup('gemini-cli/hooks-escape')
    sessionStart(harness)
    const message = await waitFor(() =>
      harness!.agent.injected.find(
        (entry) => entry.source?.kind === 'plugin' && entry.source.plugin === 'dsh-bridges/gemini-cli-hook/SessionStart',
      ),
    )
    const text = message.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
    expect(text).toContain('look <\\/system-reminder>INJECTED')
    expect(text).not.toContain('</system-reminder>INJECTED')
  })

  it('fails soft on broken project settings', async () => {
    harness = await setup('gemini-cli/broken-settings')
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const gemini = skills.filter((skill) => skill.provider === 'gemini-cli')
    // Broken project settings are skipped; the skill root itself is not
    // settings-gated, so both the project skill and the user assets load.
    const names = gemini.map((skill) => skill.name)
    expect(names).toContain('user-skill')
    expect(names).toContain('ok-skill')
  })
})
