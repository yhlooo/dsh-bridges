/**
 * Filesystem access adapter: routes reads through the DSH filesystem service
 * (`ctx.fs`, which honors the sandbox and observation policy) when one is
 * present, and falls back to plain Node filesystem I/O otherwise.
 * @module @dsh-bridges/claude-code/fs-adapter
 */
import { readFile, readdir, stat as fsStat } from 'node:fs/promises'
import { join } from 'node:path'
import type { FileSystem } from '@deepseek-ai/dsh-fs'

/** One directory entry classified for skill discovery. */
export interface BridgeDirEntry {
  name: string
  isDir: boolean
  isFile: boolean
}

/** The minimal filesystem surface the bridge subsystems consume. */
export interface FsAdapter {
  listDir(path: string, signal?: AbortSignal): Promise<BridgeDirEntry[]>
  readText(path: string, signal?: AbortSignal): Promise<string>
  /** True when the path exists and is a regular file. */
  fileExists(path: string, signal?: AbortSignal): Promise<boolean>
  /** Opaque freshness stamp of the path, or undefined when absent/unstatable. */
  stamp(path: string, signal?: AbortSignal): Promise<string | undefined>
  /** Whether the directory exists. */
  dirExists(path: string, signal?: AbortSignal): Promise<boolean>
}

const isMissing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException)?.code === 'ENOENT' || (error as NodeJS.ErrnoException)?.code === 'ENOTDIR'

/** Adapter over the optional `ctx.fs` service. */
class ServiceFsAdapter implements FsAdapter {
  constructor(private readonly fs: FileSystem) {}

  private async resolveOptional(path: string, signal?: AbortSignal) {
    try {
      const target = await this.fs.resolve(path, { signal })
      if (await this.fs.stat(target, signal)) return target
      return undefined
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async listDir(path: string, signal?: AbortSignal): Promise<BridgeDirEntry[]> {
    const target = await this.resolveOptional(path, signal)
    if (!target) return []
    const entries = await this.fs.listDir(target, signal)
    return entries.map((entry) => ({
      name: entry.name,
      isDir: entry.type === 'directory',
      isFile: entry.type === 'file',
    }))
  }

  async readText(path: string, signal?: AbortSignal): Promise<string> {
    const target = await this.resolveOptional(path, signal)
    if (!target) throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })
    return this.fs.readText(target, signal)
  }

  async fileExists(path: string, signal?: AbortSignal): Promise<boolean> {
    return (await this.resolveOptional(path, signal)) !== undefined
  }

  async stamp(path: string, signal?: AbortSignal): Promise<string | undefined> {
    try {
      const info = await this.fs.stat(await this.fs.resolve(path, { signal }), signal)
      return info ? String(info.version) : undefined
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async dirExists(path: string, signal?: AbortSignal): Promise<boolean> {
    try {
      const target = await this.fs.resolve(path, { signal })
      const info = await this.fs.stat(target, signal)
      return info?.type === 'directory'
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }
}

/** Plain Node filesystem adapter for deployments without `ctx.fs`. */
class NodeFsAdapter implements FsAdapter {
  async listDir(path: string): Promise<BridgeDirEntry[]> {
    let entries
    try {
      entries = await readdir(path)
    } catch (error) {
      if (isMissing(error)) return []
      throw error
    }
    const result: BridgeDirEntry[] = []
    for (const name of entries) {
      try {
        // `stat` follows symlinks, so a symlinked skill directory resolves.
        const info = await fsStat(join(path, name))
        result.push({ name, isDir: info.isDirectory(), isFile: info.isFile() })
      } catch {
        // Unreadable child: keep it out of discovery.
      }
    }
    return result
  }

  async readText(path: string): Promise<string> {
    return readFile(path, 'utf8')
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      return (await fsStat(path)).isFile()
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  async stamp(path: string): Promise<string | undefined> {
    try {
      const info = await fsStat(path)
      return String(info.mtimeMs)
    } catch (error) {
      if (isMissing(error)) return undefined
      throw error
    }
  }

  async dirExists(path: string): Promise<boolean> {
    try {
      return (await fsStat(path)).isDirectory()
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }
}

/** Build the adapter matching the current deployment. */
export function createFsAdapter(fs: FileSystem | undefined): FsAdapter {
  return fs ? new ServiceFsAdapter(fs) : new NodeFsAdapter()
}
