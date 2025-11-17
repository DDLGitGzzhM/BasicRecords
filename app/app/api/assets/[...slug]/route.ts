import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import mime from 'mime-types'
import { readDataRoot } from '@/lib/server/config'

export async function GET(_request: Request, { params }: { params: { slug: string[] } }) {
  const relativePath = (params.slug ?? []).join('/')
  if (!relativePath) {
    return NextResponse.json({ error: '缺少路径' }, { status: 400 })
  }
  const root = await readDataRoot()
  const target = path.join(root, relativePath)
  if (!target.startsWith(root)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }
  try {
    const file = await fs.readFile(target)
    const contentType = mime.lookup(target) || 'application/octet-stream'
    return new NextResponse(file, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=120'
      }
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 })
  }
}
