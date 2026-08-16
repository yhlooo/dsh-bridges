/**
 * Ring-A e2e scenario 1: skill discovery through the real registry.
 *
 * The real plugin registers its providers on the real `skills` registry during
 * apply; these tests assert the merged catalog — names, providers, rank bands,
 * user-over-project precedence, and body loading — exactly as a dsh host would
 * see it for a Claude Code project.
 */
import { describe, expect, it } from 'vitest'
import { bootHarness, fixtureCopy, tempUserDir } from './harness.js'
import type { Harness } from './harness.js'

describe('e2e: claude-code skill discovery through the real registry', () => {
  let harness: Harness | undefined
  let project: Awaited<ReturnType<typeof fixtureCopy>> | undefined
  let user: Awaited<ReturnType<typeof fixtureCopy>> | undefined

  async function setup(): Promise<Harness> {
    project = await fixtureCopy('claude-code/skills')
    user = await fixtureCopy('claude-code/user')
    return await bootHarness({ cwd: project.dir, userClaudeDir: user.dir })
  }

  it('discovers project and user skills and loads their bodies', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const names = skills.map((skill) => skill.name)
    expect(names).toContain('deploy')
    expect(names).toContain('personal')
    expect(names).toContain('shared')

    const deploy = skills.find((skill) => skill.name === 'deploy')!
    expect(deploy.provider).toBe('claude-code')

    const body = await harness.ctx.skills.get('deploy', { cwd: project!.dir })
    expect(body?.content).toContain('Steps to deploy the project.')
  })

  it('maps nested command files to kebab-case group-name skills', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    // `.claude/commands/opsx/explore.md` is `/opsx:explore` upstream; DSH skill
    // names are kebab-case, so it registers as `opsx-explore`.
    expect(skills.map((skill) => skill.name)).toContain('opsx-explore')
    const opsx = skills.find((skill) => skill.name === 'opsx-explore')!
    expect(opsx.provider).toBe('claude-code')
    const body = await harness.ctx.skills.get('opsx-explore', { cwd: project!.dir })
    expect(body?.content).toContain('Explore the codebase structure and report the key subsystems.')
  })

  it('gives the user-level skill the winning rank on a name conflict (personal > project)', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const shared = skills.filter((skill) => skill.name === 'shared')
    expect(shared).toHaveLength(1)
    // Claude Code semantics: the user-level skill wins the merged name, so its
    // body — not the project one — is what the model loads.
    const body = await harness.ctx.skills.get('shared', { cwd: project!.dir })
    expect(body?.content).toContain('User shared skill body.')
  })

  it('finds no skills when neither project nor user provides any', async () => {
    const empty = await tempUserDir()
    harness = await bootHarness({ cwd: empty.dir, userClaudeDir: empty.dir })
    try {
      const skills = await harness.ctx.skills.list({ cwd: empty.dir })
      const claude = skills.filter((skill) => skill.provider === 'claude-code')
      expect(claude).toHaveLength(0)
    } finally {
      await harness.dispose()
      await empty.cleanup()
    }
  })
})
