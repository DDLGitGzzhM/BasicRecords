import { NextResponse } from 'next/server'
import { saveVisionBackground } from '@/lib/server/fileStore'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '未上传文件' }, { status: 400 })
    }
    
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const filename = file.name || `background-${Date.now()}.jpg`
    
    const { relative } = await saveVisionBackground(filename, buffer)
    
    return NextResponse.json({ data: { path: relative } }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}



