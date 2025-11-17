import { NextResponse } from 'next/server'
import { appendDiaryEntry, deleteDiaryEntry, readDiaryEntries, updateDiaryEntry } from '@/lib/server/fileStore'

export async function GET() {
  const diaries = await readDiaryEntries()
  return NextResponse.json({ data: diaries })
}

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.title) {
    return NextResponse.json({ error: '标题必填' }, { status: 400 })
  }
  const entry = await appendDiaryEntry({
    title: body.title,
    mood: body.mood ?? 'Neutral',
    tags: Array.isArray(body.tags) ? body.tags : [],
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    occurredAt: body.occurredAt,
    cover: body.cover,
    parentId: typeof body.parentId === 'string' ? body.parentId : null,
    content: body.content ?? ''
  })
  return NextResponse.json({ data: entry }, { status: 201 })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  if (!body.id) {
    return NextResponse.json({ error: '缺少日记 ID' }, { status: 400 })
  }
  const updated = await updateDiaryEntry(body.id, {
    title: body.title,
    mood: body.mood,
    tags: Array.isArray(body.tags) ? body.tags : undefined,
    attachments: Array.isArray(body.attachments) ? body.attachments : undefined,
    occurredAt: body.occurredAt,
    cover: body.cover,
    parentId: typeof body.parentId === 'string' ? body.parentId : body.parentId === null ? null : undefined,
    content: body.content
  })
  return NextResponse.json({ data: updated })
}

export async function DELETE(req: Request) {
  const body = await req.json()
  if (!body.id) {
    return NextResponse.json({ error: '缺少日记 ID' }, { status: 400 })
  }
  await deleteDiaryEntry(body.id)
  return NextResponse.json({ data: null })
}
