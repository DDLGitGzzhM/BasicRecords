import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DiaryDetailView } from '@/components/diary/DiaryDetailView'
import { readDiaryEntryById } from '@/lib/server/fileStore'

export const dynamic = 'force-dynamic'

export default async function DiaryDetailPage({ params }: { params: { id: string } }) {
  const entry = await readDiaryEntryById(params.id)
  if (!entry) return notFound()

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--text-muted)]">{new Date(entry.occurredAt).toLocaleString()}</p>
          <h1 className="text-3xl font-semibold">{entry.title}</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/diary?edit=${entry.id}`} className="badge">
            ✏️ 编辑并调整
          </Link>
          <Link href="/diary" className="badge">
            ← 返回日记列表
          </Link>
        </div>
      </div>
      <DiaryDetailView entry={entry} />
    </div>
  )
}
