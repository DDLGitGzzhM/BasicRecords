import { CanvasDemo } from '@/components/vision/CanvasDemo'
import { readDiaryEntries } from '@/lib/server/fileStore'

export const dynamic = 'force-dynamic'

export default async function VisionCanvasPage() {
  const diaries = await readDiaryEntries().catch(() => [])
  return <CanvasDemo diaries={diaries} />
}
