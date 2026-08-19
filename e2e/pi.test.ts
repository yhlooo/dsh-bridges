/**
 * Ring-A e2e scenarios for the pi bridge: skill/prompt discovery through the
 * real registry (rank bands, trust gating, first-found-wins precedence),
 * context-file memory injection, and broken-settings fail-soft behavior.
 *
 * The fixtures' user dir doubles as the pi config dir (`userPiDir` is the
 * `~/.pi/agent` directory itself), and `PI_CODING_AGENT_DIR` is pinned to it
 * for the duration of each test so a host environment variable cannot leak
 * into the session.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootHarness, fixtureCopy, markRepoRoot, sessionStart, tempUserDir, waitFor } from './harness.js'
import type { Harness } from './harness.js'

describe('e2e: pi bridge through the real registry', () => {
  let harness: Harness | undefined
  let project: Awaited<ReturnType<typeof fixtureCopy>> | undefined
  let user: Awaited<ReturnType<typeof fixtureCopy>> | undefined
  const previousPiDir = process.env['PI_CODING_AGENT_DIR']

  afterEach(async () => {
    await harness?.dispose()
    harness = undefined
    await project?.cleanup()
    await user?.cleanup()
    project = undefined
    user = undefined
    if (previousPiDir === undefined) delete process.env['PI_CODING_AGENT_DIR']
    else process.env['PI_CODING_AGENT_DIR'] = previousPiDir
  })

  beforeEach(() => {
    // Determinism: the bridge honors PI_CODING_AGENT_DIR before userPiDir.
    delete process.env['PI_CODING_AGENT_DIR']
  })

  async function setup(fixture = 'pi/skills', userFixture = 'pi/user'): Promise<Harness> {
    project = await fixtureCopy(fixture)
    user = await fixtureCopy(userFixture)
    process.env['PI_CODING_AGENT_DIR'] = user.dir
    // The claude bridge stays disabled: its userClaudeDir would otherwise
    // read the same skills directory the pi bridge reads as piDir/skills.
    return await bootHarness({ cwd: project.dir, userClaudeDir: user.dir, userPiDir: user.dir, config: { claudeCode: { enabled: false } } })
  }

  it('discovers project and user skills, prompts, and nested bundles', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const pi = skills.filter((skill) => skill.provider === 'pi')
    const names = pi.map((skill) => skill.name)
    expect(names).toContain('user-skill')
    expect(names).toContain('hello')
    expect(names).toContain('project-skill')
    expect(names).toContain('build')
    expect(names).toContain('deep-skill')

    const body = await harness.ctx.skills.get('project-skill', { cwd: project!.dir })
    expect(body?.content).toContain('Project body.')
    const prompt = await harness.ctx.skills.get('build', { cwd: project!.dir })
    expect(prompt?.content).toContain('Build with $1.')
  })

  it('keeps the user skill on a name conflict (pi first-found-wins)', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const shared = skills.filter((skill) => skill.name === 'shared')
    expect(shared).toHaveLength(1)
    const body = await harness.ctx.skills.get('shared', { cwd: project!.dir })
    expect(body?.content).toContain('User shared body.')
  })

  it('gates the project skills on trust while user skills keep loading', async () => {
    // An empty user dir has no settings.json → defaultProjectTrust is ask →
    // non-interactive sessions treat the project as untrusted.
    const emptyUser = await tempUserDir()
    process.env['PI_CODING_AGENT_DIR'] = emptyUser.dir
    project = await fixtureCopy('pi/skills')
    harness = await bootHarness({ cwd: project.dir, userClaudeDir: emptyUser.dir, userPiDir: emptyUser.dir })
    try {
      const skills = await harness.ctx.skills.list({ cwd: project!.dir })
      const pi = skills.filter((skill) => skill.provider === 'pi')
      expect(pi).toHaveLength(0) // only project assets exist, and they are gated
    } finally {
      await harness.dispose()
      harness = undefined
      await emptyUser.cleanup()
    }
  })

  it('injects the global context file, the per-directory chain, and APPEND_SYSTEM.md', async () => {
    // cwd sits in the sub directory: the chain walks root → sub, the root
    // AGENTS.md is the file DSH's own loader already injects (skipped), and
    // the sub AGENTS.md arrives as a project section.
    project = await fixtureCopy('pi/memory')
    await markRepoRoot(project.dir)
    user = await fixtureCopy('pi/user')
    process.env['PI_CODING_AGENT_DIR'] = user.dir
    harness = await bootHarness({
      cwd: join(project.dir, 'sub'),
      userClaudeDir: user.dir,
      userPiDir: user.dir,
      config: { claudeCode: { enabled: false } },
    })
    sessionStart(harness)
    const message = await waitFor(() => harness!.agent.injected[0])
    expect(message.source).toEqual({ kind: 'plugin', plugin: 'dsh-bridges:AGENTS.md' })
    const texts = harness.agent.injected.map((entry) => entry.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n'))
    expect(texts.join('\n')).toContain('Global rules.')
    expect(texts.join('\n')).toContain('Sub rules.')
    expect(texts.join('\n')).not.toContain('Project rules.')
    // APPEND_SYSTEM.md: global then the trusted project file.
    expect(texts.join('\n')).toContain('Append rules.')
    expect(texts.join('\n')).toContain('Project append rules.')
  })

  it('injects a CLAUDE.md project context file (pi candidate order)', async () => {
    harness = await setup('pi/memory-claude')
    sessionStart(harness)
    const message = await waitFor(() => harness!.agent.injected[0])
    const text = message.content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
    expect(text).toContain('Claude rules.')
    expect(text).toContain('Project append rules.')
  })

  it('fails soft on broken user settings: user assets keep loading, project stays gated', async () => {
    harness = await setup('pi/broken-settings')
    await writeFile(join(user!.dir, 'settings.json'), '{ broken json', 'utf8')
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const pi = skills.filter((skill) => skill.provider === 'pi')
    // The broken global settings fall back to defaults (ask → untrusted), so
    // the project skill is gated; the user assets (from the intact user dir)
    // keep loading.
    const names = pi.map((skill) => skill.name)
    expect(names).toContain('user-skill')
    expect(names).toContain('hello')
    expect(names).not.toContain('ok-skill')
    const fresh = await tempUserDir()
    process.env['PI_CODING_AGENT_DIR'] = fresh.dir
    await mkdir(join(fresh.dir, 'skills', 'u-skill'), { recursive: true })
    await writeFile(join(fresh.dir, 'skills', 'u-skill', 'SKILL.md'), '---\ndescription: d\n---\nBody.\n', 'utf8')
    // Rebuild the harness with a healthy user dir to prove the bridge itself
    // stayed healthy after the broken settings round.
    await harness.dispose()
    harness = undefined
    harness = await bootHarness({
      cwd: project!.dir,
      userClaudeDir: fresh.dir,
      userPiDir: fresh.dir,
      config: { claudeCode: { enabled: false } },
    })
    try {
      const again = await harness.ctx.skills.list({ cwd: project!.dir })
      const namesAfter = again.filter((skill) => skill.provider === 'pi').map((skill) => skill.name)
      expect(namesAfter).toContain('u-skill')
      expect(namesAfter).not.toContain('ok-skill')
    } finally {
      await fresh.cleanup()
    }
  })
})
