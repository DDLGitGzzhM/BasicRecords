import { DiaryTimeline } from '@/components/diary/DiaryTimeline'
import { readDiaryEntries } from '@/lib/server/fileStore'

export const dynamic = 'force-dynamic'

export default async function DiaryPage() {
  const diaries = await readDiaryEntries()
  return (
    <div className="grid gap-6">
      <DiaryTimeline entries={diaries} />
    </div>
  )
}
