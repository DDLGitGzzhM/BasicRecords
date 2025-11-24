import { NextResponse } from 'next/server'
import { readProfileConfig, updatePinnedDiaries } from '@/lib/server/fileStore'

const MAX_PINNED = 50

export async function GET() {
  const config = await readProfileConfig()
  return NextResponse.json({ data: config })
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}))
  const incoming = Array.isArray(body.pinnedDiaryIds) ? body.pinnedDiaryIds : null
  if (!incoming) {
    return NextResponse.json({ error: 'pinnedDiaryIds 应为字符串数组' }, { status: 400 })
  }
  const normalized = Array.from(
    new Set(incoming.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0))
  ).slice(0, MAX_PINNED)
  const updated = await updatePinnedDiaries(normalized)
  return NextResponse.json({ data: updated })
}
