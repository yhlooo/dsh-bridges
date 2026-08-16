/**
 * opencode `references` config bridged into session context.
 *
 * Upstream, agents receive the resolved paths and descriptions of configured
 * references in their system context. The bridge mirrors that: at session
 * start it injects a system-reminder listing every non-hidden local
 * reference (`@alias` → absolute path + description). Git `repository`
 * references would need a network clone; the bridge does not fetch them and
 * logs a warning instead (same policy as remote `instructions` entries).
 * @module dsh-bridges/agents/opencode/references
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { BridgeLogger } from '../../util.js'
import { escapeReminderClose } from '../../util.js'
import type { OpencodeSettingsLoader } from './settings.js'

const PLUGIN_SOURCE = 'opencode-references'
const MAX_LINES = 64
const MAX_LINE_CHARS = 512

export function registerReferences(ctx: Context, logger: BridgeLogger, loader: OpencodeSettingsLoader): void {
  ctx.on('agent/session-start', (payload) => {
    if (payload.source === 'resume') return
    void injectReferences(payload.agent, logger, loader)
  })
}

async function injectReferences(agent: Agent, logger: BridgeLogger, loader: OpencodeSettingsLoader): Promise<void> {
  const cwd = agent.session.header.cwd
  const settings = await loader.load(cwd)
  const entries = [...settings.references.values()]
  const lines: string[] = []
  for (const reference of entries) {
    if (reference.repository !== undefined) {
      logger.warn(`opencode: reference @${reference.alias} uses a git repository; the bridge does not fetch remote references and skips it`)
      continue
    }
    if (reference.hidden === true || reference.path === undefined) continue
    const description = reference.description !== undefined ? `: ${reference.description}` : ''
    lines.push(`- @${reference.alias} -> ${reference.path}${description}`)
  }
  if (lines.length === 0) return
  const capped = lines.slice(0, MAX_LINES).map((line) => line.slice(0, MAX_LINE_CHARS))
  const body = capped.join('\n')
  agent.inject(
    createUserMessage({
      content: [
        {
          type: 'text',
          text:
            '<system-reminder>\n' +
            'The following opencode references are available. Use them when relevant without attaching them manually.\n\n' +
            `${escapeReminderClose(body)}\n` +
            '</system-reminder>',
        },
      ],
      source: { kind: 'plugin', plugin: PLUGIN_SOURCE },
    }),
  )
}
