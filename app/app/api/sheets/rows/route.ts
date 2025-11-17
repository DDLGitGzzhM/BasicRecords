import { NextResponse } from 'next/server'
import { addSheetRow, deleteSheetRow, updateSheetRow } from '@/lib/server/fileStore'

export async function POST(req: Request) {
  const body = await req.json()
  if (!body.sheetId) {
    return NextResponse.json({ error: '缺少 sheetId' }, { status: 400 })
  }
  if (!body.row) {
    return NextResponse.json({ error: '缺少行数据' }, { status: 400 })
  }
  const created = await addSheetRow(body.sheetId, body.row)
  return NextResponse.json({ data: created }, { status: 201 })
}

export async function PATCH(req: Request) {
  const body = await req.json()
  if (!body.sheetId || !body.rowId || !body.row) {
    return NextResponse.json({ error: '参数不足' }, { status: 400 })
  }
  const updated = await updateSheetRow(body.sheetId, body.rowId, body.row)
  return NextResponse.json({ data: updated })
}

export async function DELETE(req: Request) {
  const body = await req.json()
  if (!body.sheetId || !body.rowId) {
    return NextResponse.json({ error: '参数不足' }, { status: 400 })
  }
  await deleteSheetRow(body.sheetId, body.rowId)
  return NextResponse.json({ data: null })
}
