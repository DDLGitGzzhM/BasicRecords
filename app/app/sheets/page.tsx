import { SheetsBoard } from '@/components/sheets/SheetsBoard'
import { readDiaryEntries, readSheets } from '@/lib/server/fileStore'

export const dynamic = 'force-dynamic'

export default async function SheetsPage() {
  const [sheets, diaries] = await Promise.all([readSheets(), readDiaryEntries()])
  return <SheetsBoard initialSheets={sheets} diaries={diaries} />
}
