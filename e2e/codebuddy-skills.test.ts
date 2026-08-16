/**
 * Ring-A e2e scenario 2: codebuddy-code skill discovery through the real
 * registry.
 *
 * The real plugin registers its providers on the real `skills` registry during
 * apply; these tests assert the merged catalog — nested skill bundles and
 * nested commands mapped onto kebab-case names — exactly as a dsh host would
 * see it for a CodeBuddy Code project.
 */
import { describe, expect, it } from 'vitest'
import { bootHarness, fixtureCopy, tempUserDir } from './harness.js'
import type { Harness } from './harness.js'

describe('e2e: codebuddy-code skill discovery through the real registry', () => {
  let harness: Harness | undefined
  let project: Awaited<ReturnType<typeof fixtureCopy>> | undefined
  let user: Awaited<ReturnType<typeof fixtureCopy>> | undefined

  async function setup(): Promise<Harness> {
    project = await fixtureCopy('codebuddy-code/skills')
    user = await fixtureCopy('codebuddy-code/user')
    return await bootHarness({
      cwd: project.dir,
      userClaudeDir: user.dir,
      config: { codebuddyCode: { enabled: true, skills: true, userCodebuddyDir: user.dir, watch: false } },
    })
  }

  it('discovers project and user skills, including nested bundles and commands', async () => {
    harness = await setup()
    const skills = await harness.ctx.skills.list({ cwd: project!.dir })
    const names = skills.map((skill) => skill.name)
    expect(names).toContain('deploy')
    expect(names).toContain('pathto-skill')
    expect(names).toContain('frontend-build')
    expect(names).toContain('team-tools')

    const nested = skills.find((skill) => skill.name === 'pathto-skill')!
    expect(nested.provider).toBe('codebuddy-code')
    const body = await harness.ctx.skills.get('pathto-skill', { cwd: project!.dir })
    expect(body?.content).toContain('Nested skill body.')

    const command = skills.find((skill) => skill.name === 'frontend-build')!
    expect(command.provider).toBe('codebuddy-code')
    const commandBody = await harness.ctx.skills.get('frontend-build', { cwd: project!.dir })
    expect(commandBody?.content).toContain('Build command body.')
  })

  it('finds no codebuddy skills when neither project nor user provides any', async () => {
    const empty = await tempUserDir()
    harness = await bootHarness({
      cwd: empty.dir,
      userClaudeDir: empty.dir,
      config: { codebuddyCode: { enabled: true, skills: true, userCodebuddyDir: empty.dir, watch: false } },
    })
    try {
      const skills = await harness.ctx.skills.list({ cwd: empty.dir })
      const codebuddy = skills.filter((skill) => skill.provider === 'codebuddy-code')
      expect(codebuddy).toHaveLength(0)
    } finally {
      await harness.dispose()
      await empty.cleanup()
    }
  })
})
