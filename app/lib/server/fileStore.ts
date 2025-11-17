import fs from 'fs/promises'
import path from 'path'
import matter from 'gray-matter'
import type {
  DiaryEntry,
  DiaryInput,
  RelationsMap,
  SheetDefinition,
  SheetMeta,
  SheetRow,
  SheetRowInput
} from '@/lib/types'
import { readDataRoot } from '@/lib/server/config'

const DEFAULT_SHEETS: SheetMeta[] = [
  {
    id: 'sheet-health',
    key: 'health',
    name: '健康体征',
    description: '追踪睡眠 / 训练 / 气功，映射活力指数 K 线'
  },
  {
    id: 'sheet-trade',
    key: 'trade',
    name: '交易胜率',
    description: '记录现金流与胜率，关联复盘日记'
  }
]

const CSV_HEADERS = ['id', 'date', 'open', 'high', 'low', 'close', 'note', 'diary_refs']

type PathBundle = {
  root: string
  diaryDir: string
  tableDir: string
  assetsDir: string
  relationsFile: string
  sheetMetaFile: string
}

async function getPaths(): Promise<PathBundle> {
  const root = await readDataRoot()
  const diaryDir = path.join(root, 'dailyReport')
  const tableDir = path.join(root, 'table')
  const assetsDir = path.join(root, 'assets')
  const relationsFile = path.join(root, 'relations.json')
  const sheetMetaFile = path.join(tableDir, 'meta.json')
  return { root, diaryDir, tableDir, assetsDir, relationsFile, sheetMetaFile }
}

async function pathExists(target: string) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

async function ensureBaseFiles() {
  const { diaryDir, tableDir, assetsDir, relationsFile } = await getPaths()
  await fs.mkdir(diaryDir, { recursive: true })
  await fs.mkdir(tableDir, { recursive: true })
  await fs.mkdir(assetsDir, { recursive: true })
  if (!(await pathExists(relationsFile))) {
    await fs.writeFile(relationsFile, JSON.stringify({ sheetRowsToDiaries: {}, diariesToSheets: {} }, null, 2), 'utf8')
  }
}

function slugifyName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function normalizeSheetMeta(meta: Partial<SheetMeta>, idx: number): SheetMeta {
  const fallbackKey = meta.id?.replace(/^sheet-/, '') || `sheet-${idx}`
  const key = meta.key && meta.key.trim().length > 0 ? meta.key : fallbackKey
  const name = meta.name && meta.name.trim().length > 0 ? meta.name : key
  return {
    id: meta.id ?? `sheet-${key}`,
    key,
    name,
    description: meta.description ?? ''
  }
}

async function ensureSheetMetaFile() {
  await ensureBaseFiles()
  const { sheetMetaFile } = await getPaths()
  if (!(await pathExists(sheetMetaFile))) {
    await fs.writeFile(sheetMetaFile, JSON.stringify(DEFAULT_SHEETS, null, 2), 'utf8')
  }
}

async function writeSheetMetas(metas: SheetMeta[]) {
  const { sheetMetaFile } = await getPaths()
  await fs.writeFile(sheetMetaFile, JSON.stringify(metas, null, 2), 'utf8')
}

async function ensureSheetFiles(metas: SheetMeta[]) {
  const { tableDir } = await getPaths()
  await Promise.all(
    metas.map(async (meta) => {
      const csvPath = path.join(tableDir, `${meta.key}.csv`)
      if (!(await pathExists(csvPath))) {
        await fs.writeFile(csvPath, stringifyCSV([], CSV_HEADERS), 'utf8')
      }
    })
  )
}

async function readSheetMetas(): Promise<SheetMeta[]> {
  await ensureSheetMetaFile()
  const { sheetMetaFile } = await getPaths()
  try {
    const raw = await fs.readFile(sheetMetaFile, 'utf8')
    const parsed = JSON.parse(raw)
    const metasRaw: Partial<SheetMeta>[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.sheets)
        ? parsed.sheets
        : []
    const metas = (metasRaw.length > 0 ? metasRaw : DEFAULT_SHEETS).map(normalizeSheetMeta)
    await ensureSheetFiles(metas)
    if (metasRaw.length === 0) {
      await writeSheetMetas(metas)
    }
    return metas
  } catch {
    const metas = DEFAULT_SHEETS.map(normalizeSheetMeta)
    await writeSheetMetas(metas)
    await ensureSheetFiles(metas)
    return metas
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result.map((value) => value.trim())
}

function stringifyCSV(rows: Array<Record<string, string>>, headers: string[]): string {
  const escape = (value: string) => {
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }
  const lines = [headers.join(',')]
  rows.forEach((row) => {
    lines.push(headers.map((header) => escape(row[header] ?? '')).join(','))
  })
  return `${lines.join('\n')}\n`
}

async function findDiaryFileById(id: string) {
  const { diaryDir } = await getPaths()
  const files = await fs.readdir(diaryDir)
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    const filePath = path.join(diaryDir, file)
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = matter(raw)
    const entryId = (parsed.data.id as string) ?? file.replace('.md', '')
    if (entryId === id) {
      const parentId =
        typeof parsed.data.parentId === 'string' && parsed.data.parentId.trim().length > 0
          ? parsed.data.parentId
          : null
      const cover =
        typeof parsed.data.cover === 'string' && parsed.data.cover.trim().length > 0 ? parsed.data.cover : undefined
      const entry: DiaryEntry = {
        id,
        title: (parsed.data.title as string) ?? id,
        mood: (parsed.data.mood as string) ?? 'Neutral',
        tags: (parsed.data.tags as string[]) ?? [],
        attachments: ((parsed.data.attachments as string[]) ?? []).filter(Boolean),
        occurredAt: (parsed.data.occurredAt as string) ?? new Date().toISOString(),
        parentId,
        cover,
        content: parsed.content.trim() || '（空）'
      }
      return { filePath, entry }
    }
  }
  return null
}

export async function readDiaryEntryById(id: string): Promise<DiaryEntry | null> {
  const found = await findDiaryFileById(id)
  return found?.entry ?? null
}

export async function readDiaryEntries(): Promise<DiaryEntry[]> {
  await ensureSheetMetaFile()
  const { diaryDir } = await getPaths()
  const files = await fs.readdir(diaryDir)
  const entries: DiaryEntry[] = []
  await Promise.all(
    files
      .filter((file) => file.endsWith('.md'))
      .map(async (file) => {
        const raw = await fs.readFile(path.join(diaryDir, file), 'utf8')
        const parsed = matter(raw)
        const id = (parsed.data.id as string) ?? file.replace('.md', '')
        const parentId =
          typeof parsed.data.parentId === 'string' && parsed.data.parentId.trim().length > 0
            ? parsed.data.parentId
            : null
        const cover = typeof parsed.data.cover === 'string' && parsed.data.cover.trim().length > 0 ? parsed.data.cover : undefined
        entries.push({
          id,
          title: (parsed.data.title as string) ?? id,
          mood: (parsed.data.mood as string) ?? 'Neutral',
          tags: (parsed.data.tags as string[]) ?? [],
          occurredAt: (parsed.data.occurredAt as string) ?? new Date().toISOString(),
          parentId,
          attachments: ((parsed.data.attachments as string[]) ?? []).filter(Boolean),
          cover,
          content: parsed.content.trim() || '（空）'
        })
      })
  )
  return entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

export async function appendDiaryEntry(input: DiaryInput): Promise<DiaryEntry> {
  await ensureSheetMetaFile()
  const { diaryDir } = await getPaths()
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const id = input.id ?? `diary-${Date.now()}`
  const filename = `${id}.md`
  const frontmatter: Record<string, unknown> = {
    id,
    title: input.title,
    mood: input.mood ?? 'Neutral',
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
    occurredAt,
    parentId: input.parentId ?? null
  }
  if (input.cover) {
    frontmatter.cover = input.cover
  }
  const payload = matter.stringify(input.content, frontmatter)
  await fs.writeFile(path.join(diaryDir, filename), payload, 'utf8')
  return {
    id,
    title: input.title,
    mood: input.mood ?? 'Neutral',
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
    occurredAt,
    cover: input.cover,
    parentId: input.parentId ?? null,
    content: input.content
  }
}

export async function updateDiaryEntry(id: string, input: DiaryInput): Promise<DiaryEntry> {
  await ensureSheetMetaFile()
  const found = await findDiaryFileById(id)
  if (!found) {
    throw new Error('未找到日记')
  }
  const occurredAt = input.occurredAt ?? found.entry.occurredAt
  const nextEntry: DiaryEntry = {
    ...found.entry,
    title: input.title ?? found.entry.title,
    mood: input.mood ?? found.entry.mood,
    tags: input.tags ?? found.entry.tags,
    attachments: input.attachments ?? found.entry.attachments,
    occurredAt,
    cover: input.cover ?? found.entry.cover,
    parentId: typeof input.parentId === 'string' ? input.parentId : input.parentId === null ? null : found.entry.parentId,
    content: input.content ?? found.entry.content
  }
  const frontmatter: Record<string, unknown> = {
    id,
    title: nextEntry.title,
    mood: nextEntry.mood,
    tags: nextEntry.tags,
    attachments: nextEntry.attachments,
    occurredAt: nextEntry.occurredAt,
    parentId: nextEntry.parentId
  }
  if (nextEntry.cover) {
    frontmatter.cover = nextEntry.cover
  }
  const payload = matter.stringify(nextEntry.content, frontmatter)
  await fs.writeFile(found.filePath, payload, 'utf8')
  return nextEntry
}

export async function deleteDiaryEntry(id: string) {
  await ensureSheetMetaFile()
  const found = await findDiaryFileById(id)
  if (!found) {
    throw new Error('未找到日记')
  }
  await fs.unlink(found.filePath)

  const relations = await readRelations()
  const relatedRows = relations.diariesToSheets[id] ?? []
  delete relations.diariesToSheets[id]
  relatedRows.forEach((rowId) => {
    const nextRefs = (relations.sheetRowsToDiaries[rowId] ?? []).filter((ref) => ref !== id)
    relations.sheetRowsToDiaries[rowId] = nextRefs
    if (relations.sheetRowsToDiaries[rowId]?.length === 0) {
      relations.sheetRowsToDiaries[rowId] = []
    }
  })
  await writeRelations(relations)
}

export async function readRelations(): Promise<RelationsMap> {
  await ensureSheetMetaFile()
  const { relationsFile } = await getPaths()
  const raw = await fs.readFile(relationsFile, 'utf8')
  const parsed = JSON.parse(raw) as RelationsMap
  return {
    sheetRowsToDiaries: parsed.sheetRowsToDiaries ?? {},
    diariesToSheets: parsed.diariesToSheets ?? {}
  }
}

async function writeRelations(rel: RelationsMap) {
  const { relationsFile } = await getPaths()
  await fs.writeFile(relationsFile, JSON.stringify(rel, null, 2), 'utf8')
}

function parseRowWithHeaders(line: string, headers: string[]) {
  const cells = parseCSVLine(line)
  const record: Record<string, string> = {}
  headers.forEach((header, idx) => {
    record[header] = cells[idx] ?? ''
  })
  return record
}

async function resolveSheetMeta(sheetId: string) {
  const metas = await readSheetMetas()
  const meta = metas.find((item) => item.id === sheetId)
  if (!meta) {
    throw new Error(`Sheet ${sheetId} 不存在`)
  }
  const { tableDir } = await getPaths()
  const csvPath = path.join(tableDir, `${meta.key}.csv`)
  return { meta, csvPath }
}

async function saveRowRelations(rowId: string, nextRefs: string[]) {
  const relations = await readRelations()
  const prevRefs = relations.sheetRowsToDiaries[rowId] ?? []
  const normalized = Array.from(new Set(nextRefs.filter(Boolean)))
  relations.sheetRowsToDiaries[rowId] = normalized

  prevRefs.forEach((diaryId) => {
    if (!normalized.includes(diaryId)) {
      relations.diariesToSheets[diaryId] = (relations.diariesToSheets[diaryId] ?? []).filter((id) => id !== rowId)
      if (relations.diariesToSheets[diaryId]?.length === 0) {
        delete relations.diariesToSheets[diaryId]
      }
    }
  })

  normalized.forEach((diaryId) => {
    if (!relations.diariesToSheets[diaryId]) {
      relations.diariesToSheets[diaryId] = []
    }
    if (!relations.diariesToSheets[diaryId].includes(rowId)) {
      relations.diariesToSheets[diaryId].push(rowId)
    }
  })

  await writeRelations(relations)
}

async function readSheetDefinition(meta: SheetMeta, relations: RelationsMap): Promise<SheetDefinition> {
  const { tableDir } = await getPaths()
  const csvPath = path.join(tableDir, `${meta.key}.csv`)
  let raw = ''
  try {
    raw = await fs.readFile(csvPath, 'utf8')
  } catch {
    raw = ''
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const headers = lines.length > 0 ? parseCSVLine(lines[0]) : CSV_HEADERS
  const rows: SheetRow[] = lines.slice(1).map((line) => {
    const record = parseRowWithHeaders(line, headers)
    const rowId = record.id || `${meta.id}-row-${Math.random().toString(36).slice(2, 6)}`
    const diaryRefs =
      relations.sheetRowsToDiaries[rowId] ?? (record.diary_refs ? record.diary_refs.split(/\s*,\s*/).filter(Boolean) : [])
    return {
      id: rowId,
      date: record.date,
      open: Number(record.open ?? 0),
      high: Number(record.high ?? record.open ?? 0),
      low: Number(record.low ?? record.open ?? 0),
      close: Number(record.close ?? record.open ?? 0),
      note: record.note ?? '',
      diaryRefs
    }
  })
  return { ...meta, rows }
}

export async function readSheets(): Promise<SheetDefinition[]> {
  const relations = await readRelations()
  const metas = await readSheetMetas()
  const sheets: SheetDefinition[] = []
  for (const meta of metas) {
    const sheet = await readSheetDefinition(meta, relations)
    sheets.push(sheet)
  }
  return sheets
}

export async function addSheetRow(sheetId: string, input: SheetRowInput): Promise<SheetRow> {
  const { meta, csvPath } = await resolveSheetMeta(sheetId)
  const raw = await fs.readFile(csvPath, 'utf8').catch(() => '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const headers = lines.length > 0 ? parseCSVLine(lines[0]) : CSV_HEADERS
  const id = input.id ?? `${sheetId}-row-${Date.now()}`
  const record = {
    id,
    date: input.date,
    open: String(input.open),
    high: String(input.high),
    low: String(input.low),
    close: String(input.close),
    note: input.note ?? '',
    diary_refs: (input.diaryRefs ?? []).join(',')
  }
  const rowsMap = lines.slice(1).map((line) => parseRowWithHeaders(line, headers))
  rowsMap.push(record)
  const csv = stringifyCSV(rowsMap, headers)
  await fs.writeFile(csvPath, csv, 'utf8')
  await saveRowRelations(id, input.diaryRefs ?? [])

  return {
    id,
    date: input.date,
    open: input.open,
    high: input.high,
    low: input.low,
    close: input.close,
    note: input.note ?? '',
    diaryRefs: input.diaryRefs ?? []
  }
}

export async function updateSheetRow(sheetId: string, rowId: string, input: SheetRowInput): Promise<SheetRow> {
  const { csvPath } = await resolveSheetMeta(sheetId)
  const raw = await fs.readFile(csvPath, 'utf8').catch(() => '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const headers = lines.length > 0 ? parseCSVLine(lines[0]) : CSV_HEADERS
  const rowsMap = lines.slice(1).map((line) => parseRowWithHeaders(line, headers))
  const idx = rowsMap.findIndex((row) => row.id === rowId)
  if (idx === -1) {
    throw new Error('未找到行')
  }
  const merged = {
    ...rowsMap[idx],
    date: input.date,
    open: String(input.open),
    high: String(input.high),
    low: String(input.low),
    close: String(input.close),
    note: input.note ?? ''
  }
  merged.diary_refs = (input.diaryRefs ?? []).join(',')
  rowsMap[idx] = merged
  const csv = stringifyCSV(rowsMap, headers)
  await fs.writeFile(csvPath, csv, 'utf8')
  await saveRowRelations(rowId, input.diaryRefs ?? [])

  return {
    id: rowId,
    date: input.date,
    open: input.open,
    high: input.high,
    low: input.low,
    close: input.close,
    note: input.note ?? '',
    diaryRefs: input.diaryRefs ?? []
  }
}

export async function deleteSheetRow(sheetId: string, rowId: string) {
  const { csvPath } = await resolveSheetMeta(sheetId)
  const raw = await fs.readFile(csvPath, 'utf8').catch(() => '')
  const lines = raw.split(/\r?\n/).filter(Boolean)
  if (lines.length === 0) return
  const headers = parseCSVLine(lines[0])
  const rows = lines.slice(1)
  const kept: Record<string, string>[] = []
  rows.forEach((line) => {
    const record = parseRowWithHeaders(line, headers)
    if (record.id !== rowId) {
      kept.push(record)
    }
  })
  const csv = stringifyCSV(kept, headers)
  await fs.writeFile(csvPath, csv, 'utf8')
  await saveRowRelations(rowId, [])
}

export async function createSheet(name: string, description?: string): Promise<SheetDefinition> {
  const metas = await readSheetMetas()
  const baseKey = slugifyName(name) || `sheet-${Date.now().toString(36)}`
  let key = baseKey
  const existingKeys = new Set(metas.map((item) => item.key))
  while (existingKeys.has(key)) {
    key = `${baseKey}-${Math.random().toString(36).slice(2, 4)}`
  }
  const meta: SheetMeta = {
    id: key.startsWith('sheet-') ? key : `sheet-${key}`,
    key,
    name: name.trim() || '新表格',
    description: description?.trim() ?? ''
  }
  const nextMetas = [...metas, meta]
  await writeSheetMetas(nextMetas)
  await ensureSheetFiles([meta])
  return { ...meta, rows: [] }
}

export async function updateSheet(sheetId: string, payload: { name?: string; description?: string }) {
  const metas = await readSheetMetas()
  const idx = metas.findIndex((meta) => meta.id === sheetId)
  if (idx === -1) {
    throw new Error('未找到表格')
  }
  metas[idx] = {
    ...metas[idx],
    name: payload.name?.trim() ?? metas[idx].name,
    description: payload.description?.trim() ?? metas[idx].description
  }
  await writeSheetMetas(metas)
  const relations = await readRelations()
  return readSheetDefinition(metas[idx], relations)
}

export async function deleteSheet(sheetId: string) {
  const metas = await readSheetMetas()
  const idx = metas.findIndex((meta) => meta.id === sheetId)
  if (idx === -1) {
    throw new Error('未找到表格')
  }
  const meta = metas[idx]
  const { tableDir } = await getPaths()
  const csvPath = path.join(tableDir, `${meta.key}.csv`)

  let raw = ''
  try {
    raw = await fs.readFile(csvPath, 'utf8')
  } catch {
    raw = ''
  }
  const lines = raw.split(/\r?\n/).filter(Boolean)
  const headers = lines.length > 0 ? parseCSVLine(lines[0]) : CSV_HEADERS
  const records = lines.slice(1).map((line) => parseRowWithHeaders(line, headers))
  const rowIds = records.map((row) => row.id).filter(Boolean)

  await fs.rm(csvPath, { force: true })
  metas.splice(idx, 1)
  await writeSheetMetas(metas)

  const relations = await readRelations()
  rowIds.forEach((rowId) => {
    const diaries = relations.sheetRowsToDiaries[rowId] ?? []
    delete relations.sheetRowsToDiaries[rowId]
    diaries.forEach((diaryId) => {
      relations.diariesToSheets[diaryId] = (relations.diariesToSheets[diaryId] ?? []).filter((id) => id !== rowId)
      if (relations.diariesToSheets[diaryId]?.length === 0) {
        delete relations.diariesToSheets[diaryId]
      }
    })
  })
  await writeRelations(relations)
}

export async function saveAsset(filename: string, buffer: Buffer) {
  await ensureSheetMetaFile()
  const { assetsDir, root } = await getPaths()
  const target = path.join(assetsDir, filename)
  await fs.writeFile(target, buffer)
  const relative = path.relative(root, target).split(path.sep).join('/')
  return { absolute: target, relative }
}
