import { DiaryTimeline } from '@/components/diary/DiaryTimeline'
import { readDiaryEntries, readDiaryAggregates } from '@/lib/server/fileStore'

export const dynamic = 'force-dynamic'

export default async function DiaryPage() {
  const diaries = await readDiaryEntries()
  const aggregates = await readDiaryAggregates()
  return (
    <div className="grid gap-6">
      <DiaryTimeline entries={diaries} weekBuckets={aggregates.weekBuckets} monthBuckets={aggregates.monthBuckets} />
    </div>
  )
}
