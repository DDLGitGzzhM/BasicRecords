import { NextResponse } from 'next/server'
import path from 'path'
import { saveAsset } from '@/lib/server/fileStore'

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]/g, '_')
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const occurredAt = searchParams.get('occurredAt') ?? undefined
  const formData = await req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '未上传文件' }, { status: 400 })
  }
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const basename = sanitizeFilename(file.name || `asset-${Date.now()}`)
  const key = `${Date.now()}-${basename}`
  const { relative } = await saveAsset(key, buffer, occurredAt ?? undefined)
  return NextResponse.json({ data: { path: relative.replace(/\\/g, '/') } }, { status: 201 })
}
