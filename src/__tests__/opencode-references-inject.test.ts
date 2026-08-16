import { describe, expect, it, vi } from 'vitest'
import { fx } from './fixture-paths.js'
import type { BridgeDirEntry, FsAdapter } from '../fs-adapter.js'
import { registerReferences } from '../agents/opencode/references.js'
import { OpencodeSettingsLoader } from '../agents/opencode/settings.js'
import type { UserMessage } from '@deepseek-ai/dsh-llm'

const silent = { debug: () => {}, info: () => {}, warn: vi.fn(), error: () => {} }

class TreeFs implements FsAdapter {
  constructor(public files: Map<string, string>) {}
  async listDir(): Promise<BridgeDirEntry[]> {
    return []
  }
  async readText(path: string): Promise<string> {
    const value = this.files.get(path)
    if (value === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    return value
  }
  async fileExists(path: string): Promise<boolean> {
    return this.files.has(path)
  }
  async stamp(path: string): Promise<string | undefined> {
    return this.files.has(path) ? `v:${this.files.get(path)}` : undefined
  }
  async dirExists(): Promise<boolean> {
    return false
  }
}

function textOf(message: UserMessage): string {
  return message.content.map((block) => (block.type === 'text' ? block.text : '')).join('')
}

describe('registerReferences', () => {
  it('injects local references with alias, path, and description', async () => {
    const files = new Map<string, string>([
      [
        fx('proj', 'opencode.json'),
        JSON.stringify({
          references: {
            docs: { path: '../docs', description: 'Product docs' },
            hidden: { path: './secret', hidden: true },
            sdk: { repository: 'owner/repo' },
          },
        }),
      ],
    ])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
    const injected: UserMessage[] = []
    // The module subscribes via ctx.on; capture the listener and drive it.
    let registered: ((payload: never) => void) | undefined
    registerReferences(
      {
        on: (_event: string, listener: never) => {
          registered = listener
        },
      } as never,
      silent,
      loader,
    )
    const agent = {
      session: { header: { cwd: fx('proj') } },
      inject: (message: UserMessage) => injected.push(message),
    }
    registered?.({ agent, source: 'startup' } as never)
    // injectReferences is fire-and-forget; flush the microtask queue.
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(injected).toHaveLength(1)
    const text = textOf(injected[0]!)
    expect(text).toContain('@docs')
    expect(text).toContain(fx('docs'))
    expect(text).toContain('Product docs')
    expect(text).not.toContain('@hidden')
    expect(text).not.toContain('@sdk')
    expect(silent.warn).toHaveBeenCalled()
  })

  it('injects nothing when no references are configured', async () => {
    const files = new Map<string, string>([[fx('proj', 'opencode.json'), '{}']])
    const loader = new OpencodeSettingsLoader(silent, new TreeFs(files), { userOpencodeDir: fx('home', 'u', '.config', 'opencode') })
    const injected: UserMessage[] = []
    let registered: ((payload: never) => void) | undefined
    registerReferences(
      {
        on: (_event: string, listener: never) => {
          registered = listener
        },
      } as never,
      silent,
      loader,
    )
    const agent = { session: { header: { cwd: fx('proj') } }, inject: (message: UserMessage) => injected.push(message) }
    registered?.({ agent, source: 'startup' } as never)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(injected).toHaveLength(0)
  })
})
