import type {
  DiaryEntry,
  DiaryInput,
  DirectoryListing,
  SheetDefinition,
  SheetRow,
  SheetRowInput,
  ProfileConfig
} from '@/lib/types'

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || '请求失败')
  }
  const payload = await res.json()
  return payload.data as T
}

export async function createDiaryEntry(payload: DiaryInput): Promise<DiaryEntry> {
  const res = await fetch('/api/diary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return handleResponse<DiaryEntry>(res)
}

export async function updateDiaryEntryClient(id: string, payload: DiaryInput): Promise<DiaryEntry> {
  const res = await fetch('/api/diary', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, id })
  })
  return handleResponse<DiaryEntry>(res)
}

export async function deleteDiaryEntryClient(id: string): Promise<void> {
  const res = await fetch('/api/diary', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
  await handleResponse<null>(res)
}

export async function addSheetRowClient(sheetId: string, row: SheetRowInput): Promise<SheetRow> {
  const res = await fetch('/api/sheets/rows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetId, row })
  })
  return handleResponse<SheetRow>(res)
}

export async function updateSheetRowClient(sheetId: string, rowId: string, row: SheetRowInput): Promise<SheetRow> {
  const res = await fetch('/api/sheets/rows', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetId, rowId, row })
  })
  return handleResponse<SheetRow>(res)
}

export async function deleteSheetRowClient(sheetId: string, rowId: string): Promise<void> {
  const res = await fetch('/api/sheets/rows', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetId, rowId })
  })
  await handleResponse<null>(res)
}

export async function createSheetClient(payload: { name: string; description?: string }): Promise<SheetDefinition> {
  const res = await fetch('/api/sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return handleResponse<SheetDefinition>(res)
}

export async function updateSheetClient(
  sheetId: string,
  payload: { name?: string; description?: string }
): Promise<SheetDefinition> {
  const res = await fetch('/api/sheets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetId, ...payload })
  })
  return handleResponse<SheetDefinition>(res)
}

export async function deleteSheetClient(sheetId: string) {
  const res = await fetch('/api/sheets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sheetId })
  })
  await handleResponse<null>(res)
}

export async function updateRootPath(path: string): Promise<string> {
  const res = await fetch('/api/root', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  })
  const payload = await handleResponse<{ path: string }>(res)
  return payload.path
}

export async function pickRootPath(): Promise<string> {
  const res = await fetch('/api/root/pick', { method: 'POST' })
  const payload = await handleResponse<{ path: string }>(res)
  return payload.path
}

export async function browseDirectories(path?: string): Promise<DirectoryListing> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : ''
  const res = await fetch(`/api/root/browse${qs}`)
  return handleResponse<DirectoryListing>(res)
}

export async function uploadAsset(file: File, occurredAt?: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const qs = occurredAt ? `?occurredAt=${encodeURIComponent(occurredAt)}` : ''
  const res = await fetch(`/api/uploads${qs}`, {
    method: 'POST',
    body: form
  })
  const payload = await handleResponse<{ path: string }>(res)
  return payload.path
}

export async function exportDataPackage(): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch('/api/export')
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || '导出失败')
  }
  const disposition = res.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename="?([^"]+)"?/)
  const filename = match?.[1] ?? 'krecord-backup.zip'
  const blob = await res.blob()
  return { blob, filename }
}

// ----- Vision bubbles -----
export type Bubble = {
  id: string
  label: string
  content: string
  x: number
  y: number
  size: number
  color: string
  diaryIds: string[]
}

export async function readBubbles(index?: number): Promise<{
  bubbles: Bubble[]
  backgrounds: string[]
  currentBackgroundIndex: number
}> {
  const qs = typeof index === 'number' ? `?index=${index}` : ''
  const res = await fetch(`/api/vision${qs}`)
  return handleResponse(res)
}

export async function readAllBubbles(): Promise<{
  bubbles: Bubble[]
  backgrounds: string[]
  currentBackgroundIndex: number
  allBubblesByBackground: Record<string, Bubble[]>
}> {
  const res = await fetch('/api/vision?all=true')
  return handleResponse(res)
}

export async function saveBubbles(bubbles: Bubble[], currentBackgroundIndex: number, backgrounds: string[]): Promise<void> {
  const res = await fetch('/api/vision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bubbles, currentBackgroundIndex, backgrounds })
  })
  await handleResponse<null>(res)
}

export async function uploadVisionBackground(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/vision/background', {
    method: 'POST',
    body: form
  })
  const payload = await handleResponse<{ path: string }>(res)
  return payload.path
}

// ----- Profile -----
export async function fetchProfileConfig(): Promise<ProfileConfig> {
  const res = await fetch('/api/profile')
  return handleResponse(res)
}

export async function savePinnedDiaries(ids: string[]): Promise<ProfileConfig> {
  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinnedDiaryIds: ids })
  })
  return handleResponse(res)
}
