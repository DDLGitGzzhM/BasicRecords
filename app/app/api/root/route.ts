import { NextResponse } from 'next/server'
import { readDataRoot, writeDataRoot, getDefaultDataRoot } from '@/lib/server/config'
import { readDiaryEntries } from '@/lib/server/fileStore'

export async function GET() {
  const path = await readDataRoot()
  return NextResponse.json({ data: { path } })
}

export async function POST(req: Request) {
  const body = await req.json()
  const incomingPath = (body?.path as string | undefined)?.trim()
  if (!incomingPath) {
    return NextResponse.json({ error: '路径不能为空' }, { status: 400 })
  }
  const normalized = incomingPath === '__DEFAULT__' ? getDefaultDataRoot() : incomingPath
  await writeDataRoot(normalized)
  await readDiaryEntries()
  const updated = await readDataRoot()
  return NextResponse.json({ data: { path: updated } })
}
