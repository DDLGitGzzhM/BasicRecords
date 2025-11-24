import archiver from 'archiver'
import fs from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { PassThrough, Readable } from 'stream'
import { readDataRoot } from '@/lib/server/config'
import { readRelations } from '@/lib/server/fileStore'

export const runtime = 'nodejs'

function formatTimestamp() {
  return new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)
}

function sanitizeName(name: string) {
  const trimmed = name.trim()
  return trimmed.replace(/[^a-zA-Z0-9_.-]/g, '-') || 'krecord-data'
}

export async function GET() {
  try {
    const root = await readDataRoot()
    // 触发 relations 读取，必要时重建周/月聚合再写入各 JSON
    await readRelations()
    const stats = await fs.stat(root).catch(() => null)
    if (!stats || !stats.isDirectory()) {
      return NextResponse.json({ error: '数据目录不存在或不可读' }, { status: 400 })
    }

    const folderName = sanitizeName(path.basename(root))
    const fileName = `${folderName}-backup-${formatTimestamp()}.zip`

    const archive = archiver('zip', { zlib: { level: 9 } })
    const stream = new PassThrough()

    archive.on('error', (err) => {
      stream.destroy(err)
    })

    archive.pipe(stream)
    
    // 确保 vision 文件夹存在（即使为空也要包含）
    const visionDir = path.join(root, 'vision')
    const visionImageDir = path.join(visionDir, 'image')
    const visionContentDir = path.join(visionDir, 'content')
    const relationsDir = path.join(root, 'relations')
    await fs.mkdir(visionImageDir, { recursive: true }).catch(() => {})
    await fs.mkdir(visionContentDir, { recursive: true }).catch(() => {})
    await fs.mkdir(relationsDir, { recursive: true }).catch(() => {})
    
    // 如果 relations/bubbles.json 不存在，创建一个空文件
    const bubblesFile = path.join(relationsDir, 'bubbles.json')
    try {
      await fs.access(bubblesFile)
    } catch {
      await fs.writeFile(bubblesFile, JSON.stringify([], null, 2), 'utf8').catch(() => {})
    }
    
    archive.directory(root, folderName)
    archive.finalize()

    const responseStream = Readable.toWeb(stream) as unknown as ReadableStream
    return new NextResponse(responseStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, max-age=0'
      }
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : '导出失败'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
