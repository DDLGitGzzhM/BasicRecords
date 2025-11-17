import { TrendWorkspace } from '@/components/trends/TrendWorkspace'
import { readDiaryEntries, readSheets } from '@/lib/server/fileStore'

export const dynamic = 'force-dynamic'

export default async function TrendsPage() {
  const [sheets, diaries] = await Promise.all([readSheets(), readDiaryEntries()])
  return <TrendWorkspace sheets={sheets} diaries={diaries} />
}
