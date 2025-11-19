export type ThemeMode = 'dark' | 'light'

export type DiaryEntry = {
  id: string
  title: string
  mood?: string | null
  tags: string[]
  occurredAt: string
  parentId: string | null
  attachments: string[]
  cover?: string
  content: string
}

export type DiaryInput = {
  id?: string
  title: string
  mood?: string | null
  tags?: string[]
  attachments?: string[]
  occurredAt?: string
  cover?: string
  parentId?: string | null
  content: string
}

export type MetricPoint = {
  id: string
  sheet: string
  name: string
  date: string
  open: number
  high: number
  low: number
  close: number
  events: string[]
}

export type SheetRow = {
  id: string
  date: string
  open: number
  high: number
  low: number
  close: number
  note: string
  diaryRefs: string[]
}

export type SheetRowInput = {
  id?: string
  date: string
  open: number
  high: number
  low: number
  close: number
  note?: string
  diaryRefs?: string[]
}

export type SheetDefinition = {
  id: string
  name: string
  description: string
  rows: SheetRow[]
}

export type SheetMeta = {
  id: string
  key: string
  name: string
  description: string
}

export type RelationsMap = {
  sheetRowsToDiaries: Record<string, string[]>
  diariesToSheets: Record<string, string[]>
}

export type DirectoryEntry = {
  name: string
  path: string
  hasContentPackage: boolean
}

export type DirectoryListing = {
  cwd: string
  parent: string | null
  entries: DirectoryEntry[]
}
