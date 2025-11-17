import { NextResponse } from 'next/server'
import { createSheet, deleteSheet, updateSheet } from '@/lib/server/fileStore'

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.name) {
    return NextResponse.json({ error: '缺少表名' }, { status: 400 })
  }
  const created = await createSheet(body.name, body.description)
  return NextResponse.json({ data: created }, { status: 201 })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  if (!body.sheetId) {
    return NextResponse.json({ error: '缺少 sheetId' }, { status: 400 })
  }
  const updated = await updateSheet(body.sheetId, { name: body.name, description: body.description })
  return NextResponse.json({ data: updated })
}

export async function DELETE(req: Request) {
  const body = await req.json()
  if (!body.sheetId) {
    return NextResponse.json({ error: '缺少 sheetId' }, { status: 400 })
  }
  await deleteSheet(body.sheetId)
  return NextResponse.json({ data: null })
}
