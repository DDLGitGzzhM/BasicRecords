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

const CSV_HEADERS = ['id', 'date', 'open', 'high', 'low', 'close', 'note', 'diary_refs']

type PathBundle = {
  root: string
  contentDir: string
  tableDir: string
  relationsDir: string
  relationsFile: string
  sheetMetaFile: string
  visionDir: string
  visionImageDir: string
  visionContentDir: string
  visionFile: string
  visionLinksFile: string
  visionConfigFile: string
}

type DiaryFileInfo = { filePath: string; isChild: boolean }

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'])
const OTHER_ASSET_DIR = 'files'

async function getPaths(): Promise<PathBundle> {
  const root = await readDataRoot()
  const contentDir = path.join(root, 'content')
  const tableDir = path.join(root, 'table')
  const relationsDir = path.join(root, 'relations')
  const relationsFile = path.join(relationsDir, 'relations.json')
  const sheetMetaFile = path.join(relationsDir, 'meta.json')
  const visionDir = path.join(root, 'vision')
  const visionImageDir = path.join(visionDir, 'image')
  const visionContentDir = path.join(visionDir, 'content')
  const visionFile = path.join(relationsDir, 'bubbles.json')
  const visionLinksFile = path.join(relationsDir, 'vision-links.json')
  const visionConfigFile = path.join(relationsDir, 'vision-config.json')
  return { root, contentDir, tableDir, relationsDir, relationsFile, sheetMetaFile, visionDir, visionImageDir, visionContentDir, visionFile, visionLinksFile, visionConfigFile }
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
  const { contentDir, tableDir, relationsDir, relationsFile } = await getPaths()
  await fs.mkdir(contentDir, { recursive: true })
  await fs.mkdir(tableDir, { recursive: true })
  await fs.mkdir(relationsDir, { recursive: true })
  if (!(await pathExists(relationsFile))) {
    await fs.writeFile(relationsFile, JSON.stringify({ sheetRowsToDiaries: {}, diariesToSheets: {} }, null, 2), 'utf8')
  }
}

function titleToSlug(name: string | undefined) {
  const base = (name ?? '').trim()
  const cleaned = base
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'diary'
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
    await fs.writeFile(sheetMetaFile, JSON.stringify([], null, 2), 'utf8')
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
    const metas = metasRaw.map(normalizeSheetMeta)
    await ensureSheetFiles(metas)
    return metas
  } catch {
    const metas: SheetMeta[] = []
    await writeSheetMetas(metas)
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

function formatDateParts(raw?: string) {
  const date = raw ? new Date(raw) : new Date()
  if (Number.isNaN(date.getTime())) {
    return formatDateParts()
  }
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return { date, year, month, day }
}

function normalizeOccurredAt(raw?: string, fallbackPath?: string): string {
  const date = raw ? new Date(raw) : null
  if (date && !Number.isNaN(date.getTime())) {
    return date.toISOString()
  }
  if (fallbackPath) {
    const match = fallbackPath.match(/(\d{4})[-/]?(\d{2})[-/]?(\d{2})/)
    if (match) {
      const [_, y, m, d] = match
      return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString()
    }
  }
  return new Date().toISOString()
}

function deriveIdFromPath(filePath: string, parts: { year: string; month: string; day: string }) {
  const basename = path.basename(filePath, '.md')
  return `diary-${parts.year}${parts.month}${parts.day}-${basename}`
}

async function ensureDayStructure(dayDir: string) {
  await fs.mkdir(dayDir, { recursive: true })
  await fs.mkdir(path.join(dayDir, 'children'), { recursive: true })
  await fs.mkdir(path.join(dayDir, 'imgs'), { recursive: true })
  await fs.mkdir(path.join(dayDir, 'video'), { recursive: true })
  await fs.mkdir(path.join(dayDir, OTHER_ASSET_DIR), { recursive: true })
}

async function collectDiaryFiles(): Promise<DiaryFileInfo[]> {
  const { contentDir } = await getPaths()
  const files: DiaryFileInfo[] = []
  const yearDirs = await fs.readdir(contentDir, { withFileTypes: true }).catch(() => [])
  for (const year of yearDirs.filter((dir) => dir.isDirectory())) {
    const yearPath = path.join(contentDir, year.name)
    const monthDirs = await fs.readdir(yearPath, { withFileTypes: true }).catch(() => [])
    for (const month of monthDirs.filter((dir) => dir.isDirectory())) {
      const monthPath = path.join(yearPath, month.name)
      const dayDirs = await fs.readdir(monthPath, { withFileTypes: true }).catch(() => [])
      for (const day of dayDirs.filter((dir) => dir.isDirectory())) {
        const dayPath = path.join(monthPath, day.name)
        const entries = await fs.readdir(dayPath, { withFileTypes: true }).catch(() => [])
        for (const entry of entries) {
          if (entry.isFile() && entry.name.endsWith('.md')) {
            files.push({ filePath: path.join(dayPath, entry.name), isChild: false })
          }
        }
        const childPath = path.join(dayPath, 'children')
        const hasChildren = await pathExists(childPath)
        if (hasChildren) {
          const childEntries = await fs.readdir(childPath, { withFileTypes: true }).catch(() => [])
          for (const entry of childEntries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
              files.push({ filePath: path.join(childPath, entry.name), isChild: true })
            }
          }
        }
      }
    }
  }
  return files
}

function parseDateFromPath(contentDir: string, filePath: string) {
  const relative = path.relative(contentDir, filePath).split(path.sep)
  const [year, monthKey, dayKey] = relative
  const day = dayKey?.slice(-2) ?? '01'
  const month =
    monthKey && monthKey.length >= 6
      ? monthKey.slice(-2)
      : dayKey && dayKey.length >= 6
        ? dayKey.slice(4, 6)
        : '01'
  return { year: year ?? '1970', month, day }
}

const MARKDOWN_LINK_REGEX = /(!?\[[^\]]*]\()(\.{1,2}\/[^)]+)(\))/g
const HTML_SRC_REGEX = /(<(?:img|video|audio|source)[^>]*\ssrc=["'])(\.{1,2}\/[^"']+)(["'])/gi
const HTML_HREF_REGEX = /(<a[^>]*\shref=["'])(\.{1,2}\/[^"']+)(["'])/gi
const PATH_BOUNDARY = '[^A-Za-z0-9_/.-]'

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function rewriteInlineAssetPaths(content: string, fileDir: string, rootDir: string) {
  if (!/[.]{1,2}\//.test(content)) return content
  const resolveRelative = (rel: string) => {
    if (!rel.startsWith('./') && !rel.startsWith('../')) return rel
    try {
      const absolute = path.resolve(fileDir, rel)
      const normalized = path.relative(rootDir, absolute)
      if (!normalized || normalized.startsWith('..')) {
        return rel
      }
      return normalized.split(path.sep).join('/')
    } catch {
      return rel
    }
  }
  const replacer = (_match: string, prefix: string, rel: string, suffix: string) => `${prefix}${resolveRelative(rel)}${suffix}`
  return content.replace(MARKDOWN_LINK_REGEX, replacer).replace(HTML_SRC_REGEX, replacer).replace(HTML_HREF_REGEX, replacer)
}

async function readDiaryFile(file: DiaryFileInfo, contentDir: string, rootDir: string) {
  const raw = await fs.readFile(file.filePath, 'utf8')
  const parsed = matter(raw)
  const { year, month, day } = parseDateFromPath(contentDir, file.filePath)
  const occurredAtRaw = parsed.data.occurredAt as string | undefined
  const occurredAtValid = occurredAtRaw && !Number.isNaN(new Date(occurredAtRaw).getTime()) ? occurredAtRaw : undefined
  const occurredAt = occurredAtValid ?? new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString()
  const id = (parsed.data.id as string) || deriveIdFromPath(file.filePath, { year, month, day })
  const parentId =
    typeof parsed.data.parentId === 'string' && parsed.data.parentId.trim().length > 0 ? parsed.data.parentId : null
  const cover =
    typeof parsed.data.cover === 'string' && parsed.data.cover.trim().length > 0 ? parsed.data.cover : undefined
  const fileDir = path.dirname(file.filePath)
  const normalizedContent = rewriteInlineAssetPaths(parsed.content.trim() || '（空）', fileDir, rootDir)
  const moodValue =
    typeof parsed.data.mood === 'string' && parsed.data.mood.trim().length > 0 ? parsed.data.mood.trim() : null
  const entry: DiaryEntry = {
    id,
    title: (parsed.data.title as string) ?? path.basename(file.filePath, '.md'),
    tags: (parsed.data.tags as string[]) ?? [],
    attachments: ((parsed.data.attachments as string[]) ?? []).filter(Boolean),
    occurredAt,
    parentId,
    cover,
    content: normalizedContent
  }
  if (moodValue) {
    entry.mood = moodValue
  }
  return entry
}

async function findDiaryFileById(id: string) {
  await migrateLegacyData()
  const { contentDir, root } = await getPaths()
  const candidates = await collectDiaryFiles()
  for (const file of candidates) {
    const raw = await fs.readFile(file.filePath, 'utf8')
    const parsed = matter(raw)
    const fileId = (parsed.data.id as string) ?? ''
    if (fileId === id) {
      const entry = await readDiaryFile(file, contentDir, root)
      return { file, entry }
    }
  }
  return null
}

export async function readDiaryEntryById(id: string): Promise<DiaryEntry | null> {
  await migrateLegacyData()
  await normalizeDiaryPlacement()
  const found = await findDiaryFileById(id)
  return found?.entry ?? null
}

export async function readDiaryEntries(): Promise<DiaryEntry[]> {
  await ensureSheetMetaFile()
  await migrateLegacyData()
  await normalizeDiaryPlacement()
  const { contentDir, root } = await getPaths()
  const files = await collectDiaryFiles()
  const entries: DiaryEntry[] = []
  for (const file of files) {
    entries.push(await readDiaryFile(file, contentDir, root))
  }
  return entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
}

// Cache paths inside module scope to avoid repeated readDataRoot calls inside helpers that run synchronously
let pathCache: PathBundle | null = null
async function getCachedPaths() {
  if (!pathCache) {
    pathCache = await getPaths()
  }
  return pathCache
}

function buildSlug(title: string | undefined) {
  const prefix = `0x${Date.now().toString(16).slice(-6)}`
  const base = titleToSlug(title)
  return `${prefix}-${base}`
}

async function ensureDiaryPath(title: string | undefined, occurredAt?: string, isChild?: boolean, currentFilePath?: string) {
  const { contentDir } = await getCachedPaths()
  const { year, month, day } = formatDateParts(occurredAt)
  const monthKey = `${year}${month}`
  const dayKey = `${year}${month}${day}`
  const dayDir = path.join(contentDir, year, monthKey, dayKey)
  await ensureDayStructure(dayDir)
  const targetDir = isChild ? path.join(dayDir, 'children') : dayDir

  const currentBasename =
    currentFilePath && currentFilePath.startsWith(targetDir) ? path.basename(currentFilePath, '.md') : null
  let baseSlug = currentBasename || buildSlug(title)
  let filePath = path.join(targetDir, `${baseSlug}.md`)
  while ((await pathExists(filePath)) && path.resolve(filePath) !== path.resolve(currentFilePath ?? '')) {
    baseSlug = `${buildSlug(title)}-${Math.random().toString(36).slice(2, 4)}`
    filePath = path.join(targetDir, `${baseSlug}.md`)
  }
  const relative = path.relative((await getCachedPaths()).root, filePath).split(path.sep).join('/')
  return { filePath, relative, dayDir, year, month, day }
}

export async function appendDiaryEntry(input: DiaryInput): Promise<DiaryEntry> {
  await ensureSheetMetaFile()
  await migrateLegacyData()
  await normalizeDiaryPlacement()
  pathCache = await getPaths()
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const { filePath, year, month, day } = await ensureDiaryPath(input.title, occurredAt, Boolean(input.parentId))
  const id = input.id ?? `diary-${Date.now()}`
  const frontmatter: Record<string, unknown> = {
    id,
    title: input.title,
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
    occurredAt,
    parentId: input.parentId ?? null
  }
  if (input.mood && input.mood.trim().length > 0) {
    frontmatter.mood = input.mood.trim()
  }
  if (input.cover) {
    frontmatter.cover = input.cover
  }
  const payload = matter.stringify(input.content, frontmatter)
  await fs.writeFile(filePath, payload, 'utf8')
  const normalizedOccurredAt = Number.isNaN(new Date(occurredAt).getTime())
    ? new Date(`${year}-${month}-${day}`).toISOString()
    : occurredAt
  const nextEntry: DiaryEntry = {
    id,
    title: input.title,
    tags: input.tags ?? [],
    attachments: input.attachments ?? [],
    occurredAt: normalizedOccurredAt,
    cover: input.cover,
    parentId: input.parentId ?? null,
    content: input.content
  }
  if (input.mood && input.mood.trim().length > 0) {
    nextEntry.mood = input.mood.trim()
  }
  return nextEntry
}

export async function updateDiaryEntry(id: string, input: DiaryInput): Promise<DiaryEntry> {
  await ensureSheetMetaFile()
  await migrateLegacyData()
  await normalizeDiaryPlacement()
  pathCache = await getPaths()
  const found = await findDiaryFileById(id)
  if (!found) {
    throw new Error('未找到日记')
  }
  const current = found.entry
  const occurredAt = input.occurredAt ?? current.occurredAt
  const isChild = typeof (input.parentId ?? current.parentId) === 'string'
  const nextCover = input.cover === '' ? undefined : input.cover ?? current.cover
  const nextEntry: DiaryEntry = {
    ...current,
    title: input.title ?? current.title,
    tags: input.tags ?? current.tags,
    attachments: input.attachments ?? current.attachments,
    occurredAt,
    cover: nextCover,
    parentId: typeof input.parentId === 'string' ? input.parentId : input.parentId === null ? null : current.parentId,
    content: input.content ?? current.content
  }
  if (input.mood !== undefined) {
    const trimmed = input.mood && input.mood.trim().length > 0 ? input.mood.trim() : null
    if (trimmed) {
      nextEntry.mood = trimmed
    } else {
      delete nextEntry.mood
    }
  }
  const target = await ensureDiaryPath(nextEntry.title, occurredAt, isChild, found.file.filePath)

  const frontmatter: Record<string, unknown> = {
    id,
    title: nextEntry.title,
    tags: nextEntry.tags,
    attachments: nextEntry.attachments,
    occurredAt: nextEntry.occurredAt,
    parentId: nextEntry.parentId
  }
  if (nextEntry.mood) {
    frontmatter.mood = nextEntry.mood
  }
  if (nextEntry.cover) {
    frontmatter.cover = nextEntry.cover
  }
  const payload = matter.stringify(nextEntry.content, frontmatter)
  await fs.writeFile(target.filePath, payload, 'utf8')
  if (path.resolve(found.file.filePath) !== path.resolve(target.filePath)) {
    await fs.unlink(found.file.filePath).catch(() => {})
  }
  return nextEntry
}

export async function deleteDiaryEntry(id: string) {
  await ensureSheetMetaFile()
  await migrateLegacyData()
  await normalizeDiaryPlacement()
  const found = await findDiaryFileById(id)
  if (!found) {
    throw new Error('未找到日记')
  }
  await fs.unlink(found.file.filePath).catch(() => {})

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
  await migrateLegacyData()
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

function classifyAssetDir(filename: string) {
  const ext = path.extname(filename).toLowerCase()
  if (IMAGE_EXTS.has(ext)) return 'imgs'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return OTHER_ASSET_DIR
}

async function findAssetAnywhere(name: string, paths: PathBundle): Promise<string | null> {
  const targets = [
    path.join(paths.root, name),
    path.join(paths.root, 'assets', name),
    path.join(paths.contentDir, name)
  ]
  for (const cand of targets) {
    if (await pathExists(cand)) return cand
  }
  const stack = [paths.contentDir]
  while (stack.length) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile() && path.basename(entry.name) === name) {
        return full
      }
    }
  }
  return null
}

export async function saveAsset(filename: string, buffer: Buffer, occurredAt?: string) {
  await ensureSheetMetaFile()
  await migrateLegacyData()
  await normalizeDiaryPlacement()
  const paths = await getPaths()
  const { year, month, day } = formatDateParts(occurredAt)
  const monthKey = `${year}${month}`
  const dayKey = `${year}${month}${day}`
  const dayDir = path.join(paths.contentDir, year, monthKey, dayKey)
  await ensureDayStructure(dayDir)
  const subdir = classifyAssetDir(filename)
  const targetDir = path.join(dayDir, subdir)
  await fs.mkdir(targetDir, { recursive: true })
  const target = path.join(targetDir, filename)
  await fs.writeFile(target, buffer)
  const relative = path.relative(paths.root, target).split(path.sep).join('/')
  return { absolute: target, relative }
}

// ---------- Legacy migration (dailyReport/assets/relations.json -> content/post/... + relations/relations.json)
let migratedLegacy = false
async function migrateLegacyData() {
  // Always allow a normalization pass to fix misplaced files (even if already migrated)
  // but skip if we already normalized within this process lifecycle.
  if (migratedLegacy) return
  const paths = await getPaths()
  const legacyDiaries = path.join(paths.root, 'dailyReport')
  const legacyAssets = path.join(paths.root, 'assets')
  const legacyRelations = path.join(paths.root, 'relations.json')
  const legacyContentPost = path.join(paths.root, 'content', 'post')
  const legacyMeta = path.join(paths.root, 'table', 'meta.json')
  const rootEntries = await fs.readdir(paths.root, { withFileTypes: true }).catch(() => [])
  const hasLooseMedia = rootEntries.some((entry) => {
    if (!entry.isFile()) return false
    const ext = path.extname(entry.name).toLowerCase()
    return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext)
  })
  const hasLegacy =
    (await pathExists(legacyDiaries)) ||
    (await pathExists(legacyAssets)) ||
    (await pathExists(legacyRelations)) ||
    (await pathExists(legacyContentPost)) ||
    (await pathExists(legacyMeta)) ||
    hasLooseMedia
  if (!hasLegacy) {
    migratedLegacy = true
    return
  }

  await ensureBaseFiles()
  pathCache = paths

  // Move relations.json
  if (await pathExists(legacyRelations)) {
    await fs.mkdir(paths.relationsDir, { recursive: true })
    await fs.rename(legacyRelations, paths.relationsFile).catch(async () => {
      // fallback copy if rename across devices
      const raw = await fs.readFile(legacyRelations, 'utf8')
      await fs.writeFile(paths.relationsFile, raw, 'utf8')
      await fs.rm(legacyRelations, { force: true })
    })
  }

  // Move meta.json from table to relations
  if (await pathExists(legacyMeta)) {
    if (!(await pathExists(paths.sheetMetaFile))) {
      await fs.mkdir(paths.relationsDir, { recursive: true })
      await fs.rename(legacyMeta, paths.sheetMetaFile).catch(async () => {
        const raw = await fs.readFile(legacyMeta, 'utf8')
        await fs.writeFile(paths.sheetMetaFile, raw, 'utf8')
      })
    } else {
      await fs.rm(legacyMeta, { force: true }).catch(() => {})
    }
  }

  // Move diaries and attachments
  const migratedDates: string[] = []
  const migrateFiles = async (baseDir: string) => {
    const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const legacyPath = path.join(baseDir, entry.name)
        const raw = await fs.readFile(legacyPath, 'utf8')
        const parsed = matter(raw)
        const occurredAt = normalizeOccurredAt(parsed.data.occurredAt as string | undefined, legacyPath)
        const parentId =
          typeof parsed.data.parentId === 'string' && parsed.data.parentId.trim().length > 0 ? parsed.data.parentId : null
        const isChild = Boolean(parentId) || baseDir.includes(`${path.sep}children`)
        const { filePath } = await ensureDiaryPath(parsed.data.title as string, occurredAt, isChild)
        migratedDates.push(occurredAt)

        const moveAsset = async (assetPath: string | undefined) => {
          if (!assetPath) return assetPath
          const normalized = assetPath.replace(/^\/+/, '')
          const absLegacy = path.isAbsolute(normalized) ? normalized : path.join(paths.root, normalized)
          const exists = await pathExists(absLegacy)
          if (!exists) return assetPath
          const { year, month, day } = formatDateParts(occurredAt)
          const monthKey = `${year}${month}`
          const dayKey = `${year}${month}${day}`
          const dayDir = path.join(paths.contentDir, year, monthKey, dayKey)
          await ensureDayStructure(dayDir)
          const subdir = classifyAssetDir(normalized)
          const targetDir = path.join(dayDir, subdir)
          await fs.mkdir(targetDir, { recursive: true })
          const target = path.join(targetDir, path.basename(normalized))
          await fs.rename(absLegacy, target).catch(async () => {
            const buf = await fs.readFile(absLegacy)
            await fs.writeFile(target, buf)
          })
          return path.relative(paths.root, target).split(path.sep).join('/')
        }

        const attachments = Array.isArray(parsed.data.attachments) ? (parsed.data.attachments as string[]) : []
        const movedAttachments: string[] = []
        for (const item of attachments) {
          const moved = await moveAsset(item)
          if (moved) movedAttachments.push(moved)
        }
        const coverMoved = await moveAsset(typeof parsed.data.cover === 'string' ? parsed.data.cover : undefined)

        const frontmatter: Record<string, unknown> = { ...parsed.data, attachments: movedAttachments }
        if (coverMoved) {
          frontmatter.cover = coverMoved
        } else {
          delete frontmatter.cover
        }
        Object.keys(frontmatter).forEach((key) => {
          if (frontmatter[key] === undefined) {
            delete frontmatter[key]
          }
        })
        const nextPayload = matter.stringify(parsed.content, frontmatter)
        await fs.writeFile(filePath, nextPayload, 'utf8')
        await fs.rm(legacyPath, { force: true })
      } else if (entry.isDirectory()) {
        await migrateFiles(path.join(baseDir, entry.name))
      }
    }
  }

  await migrateFiles(legacyDiaries)
  await migrateFiles(legacyContentPost)

  // Normalize diaries that may have landed on wrong date folders
  await normalizeDiaryPlacement()

  // Move loose media under root (e.g., demo.mp4/demo.png)
  let fallbackDate = migratedDates.length > 0 ? migratedDates.sort()[0] : undefined
  if (!fallbackDate) {
    const existing = await collectDiaryFiles()
    if (existing.length > 0) {
      const first = existing[0]
      const { year, month, day } = parseDateFromPath(paths.contentDir, first.filePath)
      fallbackDate = new Date(`${year}-${month}-${day}`).toISOString()
    }
  }
  fallbackDate = fallbackDate ?? new Date().toISOString()
  const dealWithLooseMedia = async () => {
    const entries = await fs.readdir(paths.root, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (!entry.isFile()) continue
      const name = entry.name.toLowerCase()
      const ext = path.extname(name)
      if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) continue
      const absLegacy = path.join(paths.root, entry.name)
      const { year, month, day } = formatDateParts(fallbackDate)
      const monthKey = `${year}${month}`
      const dayKey = `${year}${month}${day}`
      const dayDir = path.join(paths.contentDir, year, monthKey, dayKey)
      await ensureDayStructure(dayDir)
      const subdir = classifyAssetDir(name)
      const targetDir = path.join(dayDir, subdir)
      await fs.mkdir(targetDir, { recursive: true })
      const target = path.join(targetDir, entry.name)
      await fs.rename(absLegacy, target).catch(async () => {
        const buf = await fs.readFile(absLegacy)
        await fs.writeFile(target, buf)
      })
    }
  }

  await dealWithLooseMedia()

  // Cleanup legacy folders
  await fs.rm(legacyDiaries, { recursive: true, force: true }).catch(() => {})
  await fs.rm(legacyAssets, { recursive: true, force: true }).catch(() => {})
  await fs.rm(legacyContentPost, { recursive: true, force: true }).catch(() => {})
  migratedLegacy = true
}

async function normalizeDiaryPlacement() {
  const paths = await getPaths()
  const files = await collectDiaryFiles()
  for (const file of files) {
    const isChild = file.isChild || file.filePath.includes(`${path.sep}children${path.sep}`)
    const raw = await fs.readFile(file.filePath, 'utf8')
    const parsed = matter(raw)
    const occurredAt = normalizeOccurredAt(parsed.data.occurredAt as string | undefined, file.filePath)
    const { year, month, day } = formatDateParts(occurredAt)
    const monthKey = `${year}${month}`
    const dayKey = `${year}${month}${day}`
    const expectedDir = isChild
      ? path.join(paths.contentDir, year, monthKey, dayKey, 'children')
      : path.join(paths.contentDir, year, monthKey, dayKey)
    await ensureDayStructure(path.join(paths.contentDir, year, monthKey, dayKey))
    const basename = path.basename(file.filePath)
    let targetPath = path.join(expectedDir, basename)
    let counter = 1
    while ((await pathExists(targetPath)) && path.resolve(targetPath) !== path.resolve(file.filePath)) {
      const name = path.parse(basename).name
      const ext = path.parse(basename).ext
      targetPath = path.join(expectedDir, `${name}-${counter}${ext}`)
      counter += 1
    }

    const moveAsset = async (assetPath: string | undefined) => {
      if (!assetPath) return assetPath
      const normalized = assetPath.replace(/^\/+/, '')
      let abs = path.isAbsolute(normalized) ? normalized : path.join(paths.root, normalized)
      if (!(await pathExists(abs))) {
        const found = await findAssetAnywhere(path.basename(normalized), paths)
        if (!found) return assetPath
        abs = found
      }
      const subdir = classifyAssetDir(normalized)
      const targetDir = path.join(paths.contentDir, year, monthKey, dayKey, subdir)
      await fs.mkdir(targetDir, { recursive: true })
      const target = path.join(targetDir, path.basename(normalized))
      if (path.resolve(target) === path.resolve(abs)) return assetPath
      await fs.rename(abs, target).catch(async () => {
        const buf = await fs.readFile(abs)
        await fs.writeFile(target, buf)
        await fs.rm(abs, { force: true })
      })
      return path.relative(paths.root, target).split(path.sep).join('/')
    }

    const attachments = Array.isArray(parsed.data.attachments) ? (parsed.data.attachments as string[]) : []
    const movedAttachments: string[] = []
    for (const att of attachments) {
      const moved = await moveAsset(att)
      movedAttachments.push(moved ?? att)
    }
    const coverMoved = await moveAsset(typeof parsed.data.cover === 'string' ? parsed.data.cover : undefined)
    if (movedAttachments.length > 0 || coverMoved !== parsed.data.cover) {
      parsed.data.attachments = movedAttachments
      if (coverMoved) parsed.data.cover = coverMoved
      else delete parsed.data.cover
      const nextPayload = matter.stringify(parsed.content, parsed.data)
      await fs.writeFile(file.filePath, nextPayload, 'utf8')
    }

    // Fix inline media references without path (e.g., demo.png / demo.mp4)
    const inlineRegex =
      /([A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|gif|webp|svg|avif|mp4|mov|webm|m4v|avi|mkv))/gi
    let updatedContent = parsed.content
    let replaced = false
    const matches = Array.from(new Set([...parsed.content.matchAll(inlineRegex)].map((m) => m[1]))).filter(
      (p) => p && !p.includes('/')
    )
    for (const name of matches) {
      const destSubdir = classifyAssetDir(name)
      const targetDir = path.join(paths.contentDir, year, monthKey, dayKey, destSubdir)
      await fs.mkdir(targetDir, { recursive: true })
      const target = path.join(targetDir, name)

      let movedPath: string | null = null
      const found = await findAssetAnywhere(name, paths)
      if (found) {
        if (path.resolve(found) !== path.resolve(target)) {
          await fs.rename(found, target).catch(async () => {
            const buf = await fs.readFile(found)
            await fs.writeFile(target, buf)
            await fs.rm(found, { force: true })
          })
        }
        movedPath = target
      }
      if (movedPath) {
        const relativePath = path.relative(path.dirname(file.filePath), movedPath).split(path.sep).join('/')
        const nextPath = relativePath.startsWith('.') ? relativePath : `./${relativePath}`
        const namePattern = new RegExp(`(^|${PATH_BOUNDARY})${escapeRegExp(name)}(?=${PATH_BOUNDARY}|$)`, 'g')
        let localChanged = false
        updatedContent = updatedContent.replace(namePattern, (match, prefix) => {
          localChanged = true
          const normalizedPrefix = prefix === undefined ? '' : prefix
          return `${normalizedPrefix}${nextPath}`
        })
        if (localChanged) {
          replaced = true
        }
      }
    }
    if (replaced) {
      const nextPayload = matter.stringify(updatedContent, parsed.data)
      await fs.writeFile(file.filePath, nextPayload, 'utf8')
    }

    if (path.resolve(targetPath) !== path.resolve(file.filePath)) {
      await fs.rename(file.filePath, targetPath).catch(async () => {
        const buf = await fs.readFile(file.filePath)
        await fs.writeFile(targetPath, buf)
        await fs.rm(file.filePath, { force: true })
      })
    }
  }
  await cleanupEmptyDayDirectories()
}

async function cleanupEmptyDayDirectories() {
  const paths = await getPaths()
  async function isDirEmpty(dir: string) {
    const items = await fs.readdir(dir).catch(() => [])
    if (items.length === 0) return true
    let nonEmpty = false
    for (const item of items) {
      const full = path.join(dir, item)
      const stat = await fs.lstat(full).catch(() => null)
      if (!stat) continue
      if (stat.isDirectory()) {
        const childEmpty = await isDirEmpty(full)
        if (childEmpty) {
          await fs.rm(full, { recursive: true, force: true }).catch(() => {})
        } else {
          nonEmpty = true
        }
      } else {
        nonEmpty = true
      }
    }
    const remaining = await fs.readdir(dir).catch(() => [])
    return !nonEmpty && remaining.length === 0
  }

  const yearDirs = await fs.readdir(paths.contentDir, { withFileTypes: true }).catch(() => [])
  for (const year of yearDirs.filter((d) => d.isDirectory())) {
    const yearPath = path.join(paths.contentDir, year.name)
    const monthDirs = await fs.readdir(yearPath, { withFileTypes: true }).catch(() => [])
    for (const month of monthDirs.filter((d) => d.isDirectory())) {
      const monthPath = path.join(yearPath, month.name)
      const dayDirs = await fs.readdir(monthPath, { withFileTypes: true }).catch(() => [])
      for (const day of dayDirs.filter((d) => d.isDirectory())) {
        const dayPath = path.join(monthPath, day.name)
        const empty = await isDirEmpty(dayPath)
        if (empty) {
          await fs.rm(dayPath, { recursive: true, force: true }).catch(() => {})
        }
      }
      const remainingDays = await fs.readdir(monthPath).catch(() => [])
      if (remainingDays.length === 0) {
        await fs.rm(monthPath, { recursive: true, force: true }).catch(() => {})
      }
    }
    const remainingMonths = await fs.readdir(yearPath).catch(() => [])
    if (remainingMonths.length === 0) {
      await fs.rm(yearPath, { recursive: true, force: true }).catch(() => {})
    }
  }
}

// ---------- Vision Canvas Bubbles
export type Bubble = {
  id: string
  label: string
  content: string
  diaryIds: string[]
  x: number
  y: number
  color: string
  size: number
}

export type VisionLinks = {
  links: Array<{ bubbleId: string; diaryId: string }>
  imageLinks?: Array<{ bubbleId: string; imageId: string }>
  note?: string
}

async function migrateLegacyVisionData() {
  const paths = await getPaths()
  const legacyVisionDir = path.join(paths.contentDir, 'vision')
  
  if (await pathExists(legacyVisionDir)) {
    try {
      // 确保新的 vision 目录存在
      await fs.mkdir(paths.visionDir, { recursive: true })
      await fs.mkdir(paths.visionImageDir, { recursive: true })
      await fs.mkdir(paths.visionContentDir, { recursive: true })
      
      // 迁移 content/vision/ 下的文件到 vision/content/
      const files = await fs.readdir(legacyVisionDir)
      let hasFiles = false
      for (const file of files) {
        const sourcePath = path.join(legacyVisionDir, file)
        const targetPath = path.join(paths.visionContentDir, file)
        const stats = await fs.stat(sourcePath).catch(() => null)
        if (stats && stats.isFile()) {
          hasFiles = true
          // 如果目标文件不存在，则迁移
          if (!(await pathExists(targetPath))) {
            await fs.copyFile(sourcePath, targetPath).catch(() => {})
          } else {
            // 如果目标文件已存在，也复制（覆盖）
            await fs.copyFile(sourcePath, targetPath).catch(() => {})
          }
        } else if (stats && stats.isDirectory()) {
          // 如果是目录，递归复制
          hasFiles = true
          await fs.mkdir(targetPath, { recursive: true }).catch(() => {})
          const subFiles = await fs.readdir(sourcePath).catch(() => [])
          for (const subFile of subFiles) {
            const subSource = path.join(sourcePath, subFile)
            const subTarget = path.join(targetPath, subFile)
            const subStats = await fs.stat(subSource).catch(() => null)
            if (subStats && subStats.isFile()) {
              await fs.copyFile(subSource, subTarget).catch(() => {})
            }
          }
        }
      }
      
      // 迁移完成后，删除 content/vision/ 目录
      if (hasFiles) {
        await fs.rm(legacyVisionDir, { recursive: true, force: true }).catch(() => {})
      }
    } catch (err) {
      console.error('迁移 vision 数据失败:', err)
    }
  }
}

async function ensureVisionFiles() {
  const { visionDir, visionImageDir, visionContentDir, visionFile, visionLinksFile, visionConfigFile, relationsDir } = await getPaths()
  await migrateLegacyVisionData()
  await fs.mkdir(visionDir, { recursive: true })
  await fs.mkdir(visionImageDir, { recursive: true })
  await fs.mkdir(visionContentDir, { recursive: true })
  await fs.mkdir(relationsDir, { recursive: true })
  
  // 迁移旧的 bubbles.json（如果存在）
  const oldVisionFile = path.join(visionContentDir, 'bubbles.json')
  if (await pathExists(oldVisionFile)) {
    try {
      // 如果新位置没有文件，迁移数据
      if (!(await pathExists(visionFile))) {
        const oldData = await fs.readFile(oldVisionFile, 'utf8')
        await fs.writeFile(visionFile, oldData, 'utf8')
      }
      // 删除旧文件（无论是否迁移，都要删除旧位置的文件）
      await fs.rm(oldVisionFile, { force: true })
    } catch (err) {
      console.error('迁移 bubbles.json 失败:', err)
    }
  }
  
  if (!(await pathExists(visionFile))) {
    await fs.writeFile(visionFile, JSON.stringify([], null, 2), 'utf8')
  }
  if (!(await pathExists(visionLinksFile))) {
    await fs.writeFile(visionLinksFile, JSON.stringify({ links: [], imageLinks: [] }, null, 2), 'utf8')
  }
  if (!(await pathExists(visionConfigFile))) {
    // 初始化demo数据：下载默认背景并创建配置
    const defaultBgs = await downloadDefaultBackgrounds()
    const defaultBubbles: Bubble[] = [
      {
        id: 'bubble-spirit',
        label: '品质精神',
        content: '保持专注，做当下最重要的事。',
        x: 0.27,
        y: 0.32,
        size: 86,
        color: '#c87a24',
        diaryIds: []
      },
      {
        id: 'bubble-quality',
        label: '品质精神',
        content: '写完即改，保证交付含金量。',
        x: 0.58,
        y: 0.24,
        size: 92,
        color: '#3b82f6',
        diaryIds: []
      },
      {
        id: 'bubble-persist',
        label: '坚持',
        content: '每天复盘 + 一点点前进。',
        x: 0.52,
        y: 0.62,
        size: 96,
        color: '#16a34a',
        diaryIds: []
      }
    ]
    
    const bubblesByBackground: Record<string, Bubble[]> = {}
    if (defaultBgs.length > 0) {
      // 第一个背景有小球，其他背景为空
      bubblesByBackground[defaultBgs[0]] = defaultBubbles
      for (let i = 1; i < defaultBgs.length; i++) {
        bubblesByBackground[defaultBgs[i]] = []
      }
    }
    
    const defaultConfig: VisionConfig = {
      backgrounds: defaultBgs,
      currentBackgroundIndex: 0,
      bubblesByBackground
    }
    await fs.writeFile(visionConfigFile, JSON.stringify(defaultConfig, null, 2), 'utf8')
  }
}

export async function readBubbles(): Promise<Bubble[]> {
  await ensureVisionFiles()
  const { visionFile } = await getPaths()
  try {
    const raw = await fs.readFile(visionFile, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function saveBubbles(bubbles: Bubble[]): Promise<void> {
  await ensureVisionFiles()
  const { visionFile } = await getPaths()
  await fs.writeFile(visionFile, JSON.stringify(bubbles, null, 2), 'utf8')
}

export async function readVisionConfig(): Promise<VisionConfig> {
  await ensureVisionFiles()
  const { visionConfigFile } = await getPaths()
  try {
    const raw = await fs.readFile(visionConfigFile, 'utf8')
    const parsed = JSON.parse(raw) as VisionConfig
    return {
      backgrounds: Array.isArray(parsed.backgrounds) ? parsed.backgrounds : [],
      currentBackgroundIndex: typeof parsed.currentBackgroundIndex === 'number' ? parsed.currentBackgroundIndex : 0,
      bubblesByBackground: typeof parsed.bubblesByBackground === 'object' && parsed.bubblesByBackground !== null ? parsed.bubblesByBackground : {}
    }
  } catch {
    return {
      backgrounds: [],
      currentBackgroundIndex: 0,
      bubblesByBackground: {}
    }
  }
}

export async function saveVisionConfig(config: VisionConfig): Promise<void> {
  await ensureVisionFiles()
  const { visionConfigFile } = await getPaths()
  await fs.writeFile(visionConfigFile, JSON.stringify(config, null, 2), 'utf8')
}

export async function readVisionLinks(): Promise<VisionLinks> {
  await ensureVisionFiles()
  const { visionLinksFile } = await getPaths()
  try {
    const raw = await fs.readFile(visionLinksFile, 'utf8')
    const parsed = JSON.parse(raw) as VisionLinks
    return {
      links: Array.isArray(parsed.links) ? parsed.links : [],
      imageLinks: Array.isArray(parsed.imageLinks) ? parsed.imageLinks : [],
      note: parsed.note
    }
  } catch {
    return { links: [], imageLinks: [] }
  }
}

export async function saveVisionLinks(links: VisionLinks): Promise<void> {
  await ensureVisionFiles()
  const { visionLinksFile } = await getPaths()
  await fs.writeFile(visionLinksFile, JSON.stringify(links, null, 2), 'utf8')
}

async function downloadDefaultBackgrounds(): Promise<string[]> {
  const { visionImageDir, root } = await getPaths()
  const defaultImages = [
    { url: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1500&q=80&sat=-20', filename: 'default-background-1.jpg' },
    { url: 'https://images.unsplash.com/photo-1519681393784-dbf267915e0e?auto=format&fit=crop&w=1500&q=80&sat=-20', filename: 'default-background-2.jpg' },
    { url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1500&q=80&sat=-20', filename: 'default-background-3.jpg' }
  ]
  
  const downloaded: string[] = []
  
  for (const img of defaultImages) {
    const targetPath = path.join(visionImageDir, img.filename)
    try {
      // 如果图片已存在，直接使用
      if (await pathExists(targetPath)) {
        const relative = path.relative(root, targetPath).split(path.sep).join('/')
        downloaded.push(relative)
        continue
      }
      
      // 下载图片
      const response = await fetch(img.url)
      if (!response.ok) {
        console.error(`下载背景图片失败: ${img.filename}`, response.statusText)
        continue
      }
      
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      await fs.writeFile(targetPath, buffer)
      
      const relative = path.relative(root, targetPath).split(path.sep).join('/')
      downloaded.push(relative)
    } catch (err) {
      console.error(`下载背景图片失败: ${img.filename}`, err)
    }
  }
  
  return downloaded
}

async function downloadDefaultBackground(): Promise<string | null> {
  const downloaded = await downloadDefaultBackgrounds()
  return downloaded.length > 0 ? downloaded[0] : null
}

export async function readVisionBackgrounds(): Promise<string[]> {
  await ensureVisionFiles()
  const { visionImageDir, root } = await getPaths()
  try {
    const files = await fs.readdir(visionImageDir)
    const imageFiles = files.filter(f => {
      const ext = path.extname(f).toLowerCase()
      return IMAGE_EXTS.has(ext)
    })
    
    if (imageFiles.length > 0) {
      // 返回所有图片的相对路径，按文件名排序
      const sorted = imageFiles.sort()
      return sorted.map(f => {
        const absolute = path.join(visionImageDir, f)
        return path.relative(root, absolute).split(path.sep).join('/')
      })
    }
    
    // 如果没有本地图片，下载多个默认图片用于demo
    const defaultBgs = await downloadDefaultBackgrounds()
    return defaultBgs
  } catch (err) {
    console.error('读取背景图片失败:', err)
    // 如果读取失败，尝试下载默认图片
    const defaultBgs = await downloadDefaultBackgrounds()
    return defaultBgs
  }
}

// 保持向后兼容
export async function readVisionBackground(): Promise<string | null> {
  const backgrounds = await readVisionBackgrounds()
  return backgrounds.length > 0 ? backgrounds[0] : null
}

export async function saveVisionBackground(filename: string, buffer: Buffer): Promise<{ absolute: string; relative: string }> {
  await ensureVisionFiles()
  const { visionImageDir, root } = await getPaths()
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '-')
  const target = path.join(visionImageDir, sanitized)
  await fs.writeFile(target, buffer)
  const relative = path.relative(root, target).split(path.sep).join('/')
  return { absolute: target, relative }
}
