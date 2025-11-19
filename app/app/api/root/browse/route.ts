import fs from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { readDataRoot } from '@/lib/server/config'

type DirectoryEntry = {
  name: string
  path: string
  hasContentPackage: boolean
}

type DirectoryListing = {
  cwd: string
  parent: string | null
  entries: DirectoryEntry[]
}

async function pathExists(target: string) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function resolveDirectory(target?: string): Promise<string> {
  const fallback = await readDataRoot()
  const normalized = target ? path.resolve(target) : fallback
  const stats = await fs.stat(normalized)
  if (!stats.isDirectory()) {
    throw new Error('目标不是有效的目录')
  }
  return normalized
}

function getParentDir(dir: string) {
  const { root } = path.parse(dir)
  if (dir === root) {
    return null
  }
  return path.dirname(dir)
}

async function readDirectoryEntries(dir: string): Promise<DirectoryEntry[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory())
  const mapped = await Promise.all(
    directories.map(async (entry) => {
      const fullPath = path.join(dir, entry.name)
      const hasContentPackage = await pathExists(path.join(fullPath, 'content'))
      return {
        name: entry.name,
        path: fullPath,
        hasContentPackage
      }
    })
  )
  return mapped.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const rawPath = searchParams.get('path') ?? undefined
    const cwd = await resolveDirectory(rawPath)
    const parent = getParentDir(cwd)
    const entries = await readDirectoryEntries(cwd)
    const payload: DirectoryListing = { cwd, parent, entries }
    return NextResponse.json({ data: payload })
  } catch (err) {
    const message = err instanceof Error ? err.message : '无法读取目录'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
