#!/usr/bin/env node
/**
 * One-off data normalizer to align diaries/media to Hugo-like layout:
 * content/<year>/<yyyymm>/<yyyymmdd>/[children]/title.md
 * and media under imgs/video/files with inline refs updated.
 */
const path = require('path')
const fs = require('fs/promises')
const matter = require('../app/node_modules/gray-matter')

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'])
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v', '.avi', '.mkv'])
const dayCounters = new Map()

async function pathExists(p) {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

function classifyAsset(name) {
  const ext = path.extname(name).toLowerCase()
  if (IMAGE_EXTS.has(ext)) return 'imgs'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return 'files'
}

function titleToSlug(name) {
  const cleaned = (name || '')
    .trim()
    .replace(/[^a-zA-Z0-9\u4e00-\u9fa5]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return cleaned || 'diary'
}

function formatDateParts(raw) {
  const date = raw ? new Date(raw) : new Date()
  if (Number.isNaN(date.getTime())) return formatDateParts()
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return { year, month, day }
}

function normalizeOccurredAt(raw, fallbackPath) {
  const date = raw ? new Date(raw) : null
  if (date && !Number.isNaN(date.getTime())) return date.toISOString()
  if (fallbackPath) {
    const match = fallbackPath.match(/(\d{4})[-/]?(\d{2})[-/]?(\d{2})/)
    if (match) {
      const [_, y, m, d] = match
      return new Date(`${y}-${m}-${d}T00:00:00Z`).toISOString()
    }
  }
  return new Date().toISOString()
}

async function findAssetAnywhere(name, contentDir, root) {
  const targets = [
    path.join(root, name),
    path.join(root, 'assets', name),
    path.join(contentDir, name)
  ]
  for (const cand of targets) {
    if (await pathExists(cand)) return cand
  }
  const stack = [contentDir]
  while (stack.length) {
    const current = stack.pop()
    let entries = []
    try {
      entries = await fs.readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && path.basename(entry.name) === name) return full
    }
  }
  return null
}

async function ensureDayDirs(contentDir, year, month, day) {
  const monthKey = `${year}${month}`
  const dayKey = `${year}${month}${day}`
  const base = path.join(contentDir, year, monthKey, dayKey)
  await fs.mkdir(path.join(base, 'children'), { recursive: true })
  await fs.mkdir(path.join(base, 'imgs'), { recursive: true })
  await fs.mkdir(path.join(base, 'video'), { recursive: true })
  await fs.mkdir(path.join(base, 'files'), { recursive: true })
  return base
}

async function collectMarkdown(contentDir) {
  const result = []
  const stack = [contentDir]
  while (stack.length) {
    const dir = stack.pop()
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && entry.name.endsWith('.md')) result.push(full)
    }
  }
  return result
}

function nextPrefixedName(targetDir, slug) {
  const key = path.resolve(targetDir)
  const current = dayCounters.get(key) ?? 0
  const next = current + 1
  dayCounters.set(key, next)
  const prefix = `0x${String(next).padStart(2, '0')}`
  return `${prefix}-${slug}`
}

async function cleanup(contentDir) {
  async function isDirEmpty(dir) {
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

  const yearDirs = await fs.readdir(contentDir, { withFileTypes: true }).catch(() => [])
  for (const year of yearDirs.filter((d) => d.isDirectory())) {
    const yearPath = path.join(contentDir, year.name)
    const monthDirs = await fs.readdir(yearPath, { withFileTypes: true }).catch(() => [])
    for (const month of monthDirs.filter((d) => d.isDirectory())) {
      const monthPath = path.join(yearPath, month.name)
      const dayDirs = await fs.readdir(monthPath, { withFileTypes: true }).catch(() => [])
      for (const day of dayDirs.filter((d) => d.isDirectory())) {
        const dayPath = path.join(monthPath, day.name)
        const empty = await isDirEmpty(dayPath)
        if (empty) await fs.rm(dayPath, { recursive: true, force: true }).catch(() => {})
      }
      const remainingDays = await fs.readdir(monthPath).catch(() => [])
      if (remainingDays.length === 0) await fs.rm(monthPath, { recursive: true, force: true }).catch(() => {})
    }
    const remainingMonths = await fs.readdir(yearPath).catch(() => [])
    if (remainingMonths.length === 0) await fs.rm(yearPath, { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..')
  const cfgCandidates = [path.join(repoRoot, 'krecord.config.json'), path.join(repoRoot, 'app', 'krecord.config.json')]
  let dataRoot = path.join(repoRoot, 'content-demo')
  for (const cfg of cfgCandidates) {
    if (await pathExists(cfg)) {
      try {
        const parsed = JSON.parse(await fs.readFile(cfg, 'utf8'))
        if (parsed.dataRoot) dataRoot = path.isAbsolute(parsed.dataRoot) ? parsed.dataRoot : path.resolve(path.dirname(cfg), parsed.dataRoot)
        break
      } catch {
        // ignore
      }
    }
  }
  const contentDir = path.join(dataRoot, 'content')
  console.log('Normalizing data root:', dataRoot)
  const files = await collectMarkdown(contentDir)
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8')
    const parsed = matter(raw)
    const occurredAt = normalizeOccurredAt(parsed.data.occurredAt, file)
    const { year, month, day } = formatDateParts(occurredAt)
    const monthKey = `${year}${month}`
    const dayKey = `${year}${month}${day}`
    const isChild = Boolean(parsed.data.parentId) || file.includes(`${path.sep}children${path.sep}`)
    const targetDir = isChild
      ? path.join(contentDir, year, monthKey, dayKey, 'children')
      : path.join(contentDir, year, monthKey, dayKey)
    await ensureDayDirs(contentDir, year, month, day)
    const slug = titleToSlug(parsed.data.title || path.parse(file).name)
    const pickName = (baseSlug) => `${nextPrefixedName(targetDir, baseSlug)}.md`
    let targetPath = path.join(targetDir, pickName(slug))
    let attempt = 1
    while ((await pathExists(targetPath)) && path.resolve(targetPath) !== path.resolve(file)) {
      const extraSlug = `${slug}-${String(attempt).padStart(2, '0')}`
      targetPath = path.join(targetDir, pickName(extraSlug))
      attempt++
    }

    const moveAsset = async (p) => {
      if (!p) return p
      const base = path.basename(p)
      let abs = path.isAbsolute(p) ? p : path.join(dataRoot, p)
      if (!(await pathExists(abs))) {
        const found = await findAssetAnywhere(base, contentDir, dataRoot)
        if (!found) return p
        abs = found
      }
      const subdir = classifyAsset(base)
      const target = path.join(contentDir, year, monthKey, dayKey, subdir, base)
      await fs.mkdir(path.dirname(target), { recursive: true })
      if (path.resolve(abs) !== path.resolve(target)) {
        await fs.rename(abs, target).catch(async () => {
          const buf = await fs.readFile(abs)
          await fs.writeFile(target, buf)
          await fs.rm(abs, { force: true })
        })
      }
      return path.relative(dataRoot, target).split(path.sep).join('/')
    }

    // attachments / cover
    const attachments = Array.isArray(parsed.data.attachments) ? parsed.data.attachments : []
    const movedAttachments = []
    for (const att of attachments) movedAttachments.push((await moveAsset(att)) ?? att)
    const movedCover = await moveAsset(parsed.data.cover)

    // inline replacements
    const inlineRegex = /([A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|gif|webp|svg|avif|mp4|mov|webm|m4v|avi|mkv))/gi
    let updatedContent = parsed.content
    let replaced = false
  const matches = Array.from(new Set([...parsed.content.matchAll(inlineRegex)].map((m) => m[1]))).filter(
    (p) => p && !p.includes('/')
  )
    for (const name of matches) {
      const found = await findAssetAnywhere(name, contentDir, dataRoot)
      if (!found) continue
      const subdir = classifyAsset(name)
      const target = path.join(contentDir, year, monthKey, dayKey, subdir, name)
      await fs.mkdir(path.dirname(target), { recursive: true })
      if (path.resolve(found) !== path.resolve(target)) {
        await fs.rename(found, target).catch(async () => {
          const buf = await fs.readFile(found)
          await fs.writeFile(target, buf)
          await fs.rm(found, { force: true })
        })
      }
      const relativePath = path.relative(path.dirname(file), target).split(path.sep).join('/')
      const next = relativePath.startsWith('.') ? relativePath : `./${relativePath}`
      updatedContent = updatedContent.split(name).join(next)
      replaced = true
    }

    const nextData = { ...parsed.data, occurredAt, attachments: movedAttachments }
    if (movedCover) nextData.cover = movedCover
    else delete nextData.cover

    const nextPayload = matter.stringify(replaced ? updatedContent : parsed.content, nextData)
    if (path.resolve(targetPath) !== path.resolve(file)) {
      console.log(`move`, path.relative(dataRoot, file), '->', path.relative(dataRoot, targetPath))
      await fs.writeFile(targetPath, nextPayload, 'utf8')
      await fs.rm(file, { force: true })
    } else {
      console.log(
        `stay`,
        path.relative(dataRoot, file),
        `occurredAt=${occurredAt}`,
        `target=${path.relative(dataRoot, targetPath)}`
      )
      await fs.writeFile(file, nextPayload, 'utf8')
    }
  }

  await cleanup(contentDir)
  console.log('Normalization done.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
