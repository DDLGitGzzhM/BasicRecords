'use client'

import { DiaryModal } from '@/components/diary/DiaryModal'
import type { DiaryEntry } from '@/lib/types'

export function DiaryDetailView({ entry }: { entry: DiaryEntry }) {
  return <DiaryModal entry={entry} renderOnly />
}
