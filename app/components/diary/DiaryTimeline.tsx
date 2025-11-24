'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { EventCard } from '@/components/cards/EventCard'
import { createDiaryEntry, deleteDiaryEntryClient, updateDiaryEntryClient, uploadAsset } from '@/lib/api'
import type { DiaryEntry, WeekBucket, MonthBucket } from '@/lib/types'
import { resolveAssetUrl } from '@/lib/assets'
import { format } from 'date-fns'

const createDefaultForm = () => ({
  title: '',
  tags: '',
  occurredAt: '',
  parentId: '',
  content: '',
  attachments: [] as string[],
  cover: ''
})

const toDateInputValue = (value: string) => {
  if (!value) return ''
  const date = new Date(value)
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const normalizeSrc = (src?: string) => (src ? resolveAssetUrl(src) : '')

const toDateKey = (value: string | Date) => {
  if (typeof value === 'string') return value.slice(0, 10)
  return format(value, 'yyyy-MM-dd')
}

const previewComponents = {
  img: ({ src, alt }: { src?: string; alt?: string }) =>
    src ? <img src={normalizeSrc(src)} alt={alt ?? ''} className="rounded-lg w-full max-w-2xl max-h-96 object-contain" /> : null,
  video: ({ src, children }: { src?: string; children?: React.ReactNode }) =>
    src ? (
      <video
        src={normalizeSrc(src)}
        controls
        className="w-full max-w-2xl max-h-96 rounded-lg"
        style={{ objectFit: 'contain' }}
        playsInline
        preload="metadata"
      >
        {children}
      </video>
    ) : null,
  source: ({ src, type }: { src?: string; type?: string }) =>
    src ? <source src={normalizeSrc(src)} type={type} /> : null,
  a: ({ href, children }: { href?: string; children: React.ReactNode }) =>
    href ? (
      <a href={normalizeSrc(href)} className="text-[var(--accent)]" target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : null
}

type DiaryTimelineProps = {
  entries: DiaryEntry[]
  weekBuckets?: Record<string, WeekBucket>
  monthBuckets?: Record<string, MonthBucket>
}

export function DiaryTimeline({ entries, weekBuckets, monthBuckets }: DiaryTimelineProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const layoutFromQuery = useMemo(() => {
    const layoutParam = searchParams.get('layout')
    return layoutParam === 'week' || layoutParam === 'month' || layoutParam === 'list' ? layoutParam : 'list'
  }, [searchParams])
  const focusFromQuery = useMemo(() => {
    const focusParam = searchParams.get('focus')
    if (focusParam) {
      const parsed = new Date(focusParam)
      if (!Number.isNaN(parsed.getTime())) return parsed
    }
    return new Date()
  }, [searchParams])
  const [items, setItems] = useState(entries)
  const [form, setForm] = useState(createDefaultForm)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [isUploading, setUploading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedParentId, setExpandedParentId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [layout, setLayout] = useState<'list' | 'week' | 'month'>(layoutFromQuery)
  const [referenceDate, setReferenceDate] = useState<Date>(focusFromQuery)
  const [page, setPage] = useState(0)
  const [filterTag, setFilterTag] = useState<string | null>(null)
  const [monthModal, setMonthModal] = useState<{ date: string; entries: DiaryEntry[] } | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement>(null)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const weekdayHeaders = ['一', '二', '三', '四', '五', '六', '日']
  const diaryById = useMemo(() => new Map(entries.map((d) => [d.id, d])), [entries])

  const weekKeyForDate = useCallback((date: Date) => {
    const d = new Date(date)
    const day = (d.getDay() + 6) % 7 // Monday = 0
    const monday = new Date(d)
    monday.setDate(d.getDate() - day)
    return toDateKey(monday)
  }, [])

  const monthKeyForDate = useCallback((date: Date) => format(date, 'yyyy-MM'), [])

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach((entry) => {
      entry.tags.forEach((tag) => {
        map.set(tag, (map.get(tag) ?? 0) + 1)
      })
    })
    return map
  }, [items])

  const viewItems = useMemo(() => {
    if (!filterTag) return items
    return items.filter((entry) => entry.tags.includes(filterTag))
  }, [filterTag, items])

  const entriesById = useMemo(() => Object.fromEntries(viewItems.map((entry) => [entry.id, entry])), [viewItems])
  const childrenMap = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>()
    viewItems.forEach((entry) => {
      if (entry.parentId && entriesById[entry.parentId]) {
        const bucket = map.get(entry.parentId) ?? []
        bucket.push(entry)
        map.set(entry.parentId, bucket)
      }
    })
    map.forEach((bucket) => bucket.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()))
    return map
  }, [entriesById, viewItems])

  const rootEntries = useMemo(
    () => viewItems.filter((entry) => !entry.parentId || !entriesById[entry.parentId]),
    [entriesById, viewItems]
  )
  const sortedRoots = useMemo(
    () => [...rootEntries].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()),
    [rootEntries]
  )
  const pageSize = 10
  const pagedRoots = useMemo(() => {
    const start = page * pageSize
    return sortedRoots.slice(start, start + pageSize)
  }, [page, sortedRoots])

  const groupedByDate = useMemo(() => {
    const map = new Map<string, DiaryEntry[]>()
    viewItems.forEach((entry) => {
      const dateKey = toDateKey(entry.occurredAt)
      const list = map.get(dateKey) ?? []
      list.push(entry)
      map.set(dateKey, list)
    })
    const sorted = Array.from(map.entries()).map(([key, entries]) => [
      key,
      entries.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    ])
    sorted.sort((a, b) => (a[0] < b[0] ? 1 : -1))
    return sorted
  }, [viewItems])
  const groupedMap = useMemo(() => Object.fromEntries(groupedByDate), [groupedByDate])
  const todayKey = useMemo(() => toDateKey(new Date()), [])

  const latestDateFromData = useMemo(() => {
    const top = sortedRoots[0]?.occurredAt
    return top ? new Date(top) : new Date()
  }, [sortedRoots])

  const showSidebar = layout === 'list'

  useEffect(() => {
    setLayout(layoutFromQuery)
    setReferenceDate(focusFromQuery)
  }, [focusFromQuery, layoutFromQuery])

  const syncQuery = (next: Partial<{ layout: 'list' | 'week' | 'month'; focus: string }>) => {
    const params = new URLSearchParams(searchParams.toString())
    if (next.layout) params.set('layout', next.layout)
    if (next.focus) params.set('focus', next.focus)
    router.replace(`?${params.toString()}`)
  }

  const weekDates = useMemo(() => {
    const day = (referenceDate.getDay() + 6) % 7 // Monday = 0
    const monday = new Date(referenceDate)
    monday.setDate(referenceDate.getDate() - day)
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(monday)
      d.setDate(monday.getDate() + idx)
      return d
    })
  }, [referenceDate])

  const monthGrid = useMemo(() => {
    const firstDay = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1)
    const startOffset = (firstDay.getDay() + 6) % 7
    const gridStart = new Date(firstDay)
    gridStart.setDate(firstDay.getDate() - startOffset)
    return Array.from({ length: 42 }).map((_, idx) => {
      const d = new Date(gridStart)
      d.setDate(gridStart.getDate() + idx)
      return d
    })
  }, [referenceDate])

  const jumpWeek = (delta: number) => {
    setReferenceDate((prev) => {
      const next = new Date(prev)
      next.setDate(prev.getDate() + delta * 7)
      syncQuery({ layout, focus: toDateKey(next) })
      return next
    })
  }

  const jumpMonth = (delta: number) => {
    setReferenceDate((prev) => {
      const next = new Date(prev)
      next.setMonth(prev.getMonth() + delta)
      syncQuery({ layout, focus: toDateKey(next) })
      return next
    })
  }

  const resetToLatest = () => {
    const today = new Date()
    setReferenceDate(today)
    syncQuery({ layout, focus: toDateKey(today) })
  }

  const openMonthModal = (dateKey: string, entries: DiaryEntry[]) => {
    setMonthModal({ date: dateKey, entries })
  }

  const weekLabel = useMemo(() => {
    if (weekDates.length === 0) return ''
    const start = weekDates[0]
    const end = weekDates[6]
    return `${format(start, 'yyyy/MM.dd')} - ${format(end, 'MM.dd')}`
  }, [weekDates])

  const monthLabel = useMemo(() => format(referenceDate, 'yyyy/MM'), [referenceDate])
  const goToDiary = useCallback((id: string) => router.push(`/diary/${id}`), [router])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const insertAtCursor = (snippet: string) => {
    setForm((prev) => {
      const target = editorRef.current
      if (!target) {
        return { ...prev, content: `${prev.content}\n${snippet}\n` }
      }
      const start = target.selectionStart ?? prev.content.length
      const end = target.selectionEnd ?? prev.content.length
      const nextText = prev.content.slice(0, start) + snippet + prev.content.slice(end)
      requestAnimationFrame(() => {
        target.focus()
        const pos = start + snippet.length
        target.setSelectionRange(pos, pos)
      })
      return { ...prev, content: nextText }
    })
  }

  const handleFileUpload = async (files: FileList | null, target: 'attachments' | 'cover') => {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const uploaded: string[] = []
      const occurredAt = form.occurredAt || new Date().toISOString()
      for (const file of Array.from(files)) {
        const path = await uploadAsset(file, occurredAt)
        uploaded.push(path)
        if (target === 'attachments') {
          const isVideo = file.name.toLowerCase().match(/\.(mp4|mov|webm)$/)
          const snippet = isVideo
            ? `<video controls src="${resolveAssetUrl(path)}"></video>\n`
            : `![${file.name}](${path})`
          insertAtCursor(`\n${snippet}\n`)
        }
      }
      if (target === 'cover') {
        setForm((prev) => ({ ...prev, cover: uploaded[0] ?? '' }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传附件失败')
    } finally {
      setUploading(false)
      if (attachmentInputRef.current) attachmentInputRef.current.value = ''
      if (coverInputRef.current) coverInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setError('标题必填')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const occurredAt = form.occurredAt ? new Date(form.occurredAt).toISOString() : new Date().toISOString()
      const payload = {
        title: form.title,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        attachments: form.attachments,
        occurredAt,
        cover: form.cover === '' ? '' : form.cover,
        parentId: form.parentId || null,
        content: form.content || '（空）'
      }
      if (editingId) {
        const updated = await updateDiaryEntryClient(editingId, payload)
        setItems((prev) => prev.map((entry) => (entry.id === editingId ? updated : entry)))
        setEditingId(null)
        setForm(createDefaultForm())
      } else {
        const created = await createDiaryEntry(payload)
        setItems((prev) => [created, ...prev])
        setForm(createDefaultForm())
      }
      setFormOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '写入失败')
    } finally {
      setSubmitting(false)
    }
  }

  const startEdit = (entry: DiaryEntry) => {
    setEditingId(entry.id)
    setForm({
      title: entry.title,
      tags: entry.tags.join(','),
      occurredAt: toDateInputValue(entry.occurredAt),
      parentId: entry.parentId ?? '',
        content: entry.content,
      attachments: entry.attachments,
      cover: entry.cover ?? ''
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setFormOpen(true)
  }

  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId) return
    const target = items.find((item) => item.id === editId)
    if (target) {
      startEdit(target)
      setFormOpen(true)
    }
  }, [items, searchParams])

  const handleDeleteDiary = async (id: string) => {
    if (!confirm('确定删除这条日记吗？操作不可撤销。')) return
    setError(null)
    try {
      await deleteDiaryEntryClient(id)
      setItems((prev) => prev.filter((entry) => entry.id !== id))
      if (editingId === id) {
        setEditingId(null)
        setForm(createDefaultForm())
      }
      const nextRoots = sortedRoots.length - 1
      if (page > 0 && page * pageSize >= nextRoots) {
        setPage(Math.max(0, Math.floor((nextRoots - 1) / pageSize)))
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const handleCloseForm = () => {
    setFormOpen(false)
    setError(null)
    if (!editingId) {
      setForm(createDefaultForm())
    }
  }

  const totalEntries = items.length

  return (
    <div className="stack-layout">
      <aside className="stack-meta">
        <p className="stack-eyebrow">Daily Stack</p>
        <h1 className="stack-title">Life Notes</h1>
        <p className="stack-description">让我们记录传奇的一生。</p>
        <div className="stack-stats">
          <span>共 {totalEntries} 条记录</span>
          <span>母日记 {rootEntries.length}</span>
        </div>
      </aside>
      <div className="stack-content">
        <div className="stack-toolbar">
          <button className="action-button" type="button" onClick={() => setFormOpen(true)}>
            {editingId ? '继续编辑日记' : '新建日记'}
          </button>
          <div className="stack-toolbar__actions">
            <div className="stack-layout-switch">
              {(['list', 'week', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  className={`badge ${layout === mode ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => {
                    setLayout(mode)
                    syncQuery({ layout: mode, focus: toDateKey(referenceDate) })
                  }}
                >
                  {mode === 'list' ? '列表视图' : mode === 'week' ? '周缩略' : '月缩略'}
                </button>
              ))}
            </div>
            {(layout === 'week' || layout === 'month') && (
              <div className="calendar-nav">
                <button className="badge badge--compact" type="button" onClick={() => (layout === 'week' ? jumpWeek(-1) : jumpMonth(-1))}>
                  ← 上一{layout === 'week' ? '周' : '月'}
                </button>
                <span className="calendar-nav__label">{layout === 'week' ? weekLabel : monthLabel}</span>
                <button className="badge badge--compact" type="button" onClick={() => (layout === 'week' ? jumpWeek(1) : jumpMonth(1))}>
                  下一{layout === 'week' ? '周' : '月'} →
                </button>
                <button className="badge badge--compact" type="button" onClick={resetToLatest}>
                  回到最新
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={`relative ${showSidebar ? 'lg:flex lg:items-start lg:gap-2' : ''}`}>
          <div className="space-y-3 lg:flex-1 lg:min-w-0">
            {filterTag && (
              <div className="flex items-center gap-2 text-sm">
                <span className="badge">筛选标签：#{filterTag}</span>
                <button className="badge" type="button" onClick={() => setFilterTag(null)}>
                  清除筛选
                </button>
              </div>
            )}
            {formOpen && (
              <div className="diary-modal-backdrop is-fullscreen" onClick={handleCloseForm}>
                <div className="diary-modal diary-editor-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="workspace-shell">
                    <div className="workspace-header">
                      <div className="workspace-heading">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Markdown Workbench</p>
                        <h3 className="text-2xl font-semibold">
                          {editingId ? '更新日记' : '新建日记'}
                          {form.title ? ` · ${form.title}` : ''}
                        </h3>
                      </div>
                      <div className="flex flex-wrap gap-2 items-center">
                        {editingId && <span className="badge text-xs">ID: {editingId}</span>}
                        <button className="badge" type="button" onClick={handleCloseForm}>
                          关闭
                        </button>
                        {editingId && (
                          <button
                            className="badge"
                            type="button"
                            onClick={() => {
                              setEditingId(null)
                              setForm(createDefaultForm())
                            }}
                          >
                            切换为新建
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="workspace-body">
                      <form className="workspace-panel workspace-panel--form grid gap-4" onSubmit={handleSubmit}>
                        <div className="grid lg:grid-cols-2 gap-3">
                          <input name="title" placeholder="标题" value={form.title} onChange={handleChange} required />
                          <input name="tags" placeholder="标签（用逗号分隔）" value={form.tags} onChange={handleChange} />
                        </div>
                        <div className="grid lg:grid-cols-2 gap-3">
                          <input
                            name="occurredAt"
                            type="datetime-local"
                            placeholder="发生时间"
                            value={form.occurredAt}
                            onChange={handleChange}
                          />
                          <select name="parentId" value={form.parentId} onChange={handleChange}>
                            <option value="">无母日记（独立记录）</option>
                            {sortedRoots.map((entry) => (
                              <option key={entry.id} value={entry.id}>
                                {entry.title} · {new Date(entry.occurredAt).toLocaleDateString()}
                              </option>
                            ))}
                          </select>
                        </div>
                        <textarea
                          ref={editorRef}
                          name="content"
                          placeholder="Markdown 正文（支持 # 标题、- 列表、``` 代码等）"
                          value={form.content}
                          onChange={handleChange}
                          rows={16}
                          className="markdown-editor"
                        />
                        <div className="editor-toolbar">
                          <button type="button" onClick={() => attachmentInputRef.current?.click()} disabled={isUploading}>
                            🖇️ 上传并插入媒体
                          </button>
                          <button type="button" onClick={() => coverInputRef.current?.click()} disabled={isUploading}>
                            🖼️ 选择封面
                          </button>
                          {form.cover && (
                            <button
                              type="button"
                              className="badge"
                              onClick={() => {
                                setForm((prev) => ({ ...prev, cover: '' }))
                                if (coverInputRef.current) coverInputRef.current.value = ''
                              }}
                            >
                              删除封面
                            </button>
                          )}
                          {isUploading && <span className="text-xs text-[var(--text-muted)]">上传中...</span>}
                        </div>
                        <input
                          ref={attachmentInputRef}
                          type="file"
                          hidden
                          multiple
                          onChange={(e) => handleFileUpload(e.target.files, 'attachments')}
                        />
                        <input ref={coverInputRef} type="file" hidden onChange={(e) => handleFileUpload(e.target.files, 'cover')} />
                        {form.cover && (
                          <div className="cover-preview">
                            <p className="text-xs text-[var(--text-muted)] mb-2">封面预览</p>
                            <div className="relative overflow-hidden rounded-xl h-48">
                              <img
                                src={resolveAssetUrl(form.cover)}
                                alt="封面"
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/20 to-transparent" />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center gap-3 flex-wrap">
                          <button className="action-button" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? '写入中...' : editingId ? '更新日记' : '写入 Markdown 文件'}
                          </button>
                          {editingId && (
                            <button
                              className="badge"
                              type="button"
                              onClick={() => {
                                setEditingId(null)
                                setForm(createDefaultForm())
                              }}
                            >
                              取消编辑
                            </button>
                          )}
                        </div>
                        {error && <p className="text-sm text-red-400">{error}</p>}
                      </form>
                      <div className="workspace-panel workspace-panel--preview">
                        <p className="text-sm text-[var(--text-muted)] mb-2">实时预览（左侧编辑 Markdown，右侧同步渲染）</p>
                        <div className="markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={previewComponents}>
                            {form.content || '（输入正文以查看预览）'}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {layout === 'list' && (
              <div className="space-y-3">
                {pagedRoots.map((entry) => (
                  <div key={entry.id} className="space-y-3">
                <div className="flex flex-col gap-2">
                  <EventCard entry={entry} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="badge"
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, parentId: entry.id }))}
                    >
                          以此为母日记创建子卡片
                        </button>
                        <button className="badge" type="button" onClick={() => startEdit(entry)}>
                          编辑
                        </button>
                        <button className="badge" type="button" onClick={() => handleDeleteDiary(entry.id)}>
                          删除
                        </button>
                        <button
                          className="badge"
                          type="button"
                      onClick={() => setExpandedParentId((prev) => (prev === entry.id ? null : entry.id))}
                    >
                      {expandedParentId === entry.id ? '收起子日记' : `展开子日记 (${(childrenMap.get(entry.id) ?? []).length})`}
                    </button>
                  </div>
                </div>
                {expandedParentId === entry.id &&
                  (childrenMap.get(entry.id) ?? []).map((child) => (
                    <div key={child.id} className="diary-child">
                      <div className="flex flex-col gap-2">
                        <EventCard entry={child} />
                            <div className="flex gap-2">
                              <button className="badge" type="button" onClick={() => startEdit(child)}>
                                编辑
                              </button>
                              <button className="badge" type="button" onClick={() => handleDeleteDiary(child.id)}>
                                删除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm text-[var(--text-muted)]">
                    第 {page + 1} 页 / 共 {Math.max(1, Math.ceil(sortedRoots.length / pageSize))} 页
                  </span>
                  <div className="flex gap-2">
                    <button className="badge" type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>
                      上一页
                    </button>
                    <button
                      className="badge"
                      type="button"
                      onClick={() => setPage((p) => (p + 1) * pageSize < sortedRoots.length ? p + 1 : p)}
                      disabled={(page + 1) * pageSize >= sortedRoots.length}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              </div>
            )}

            {layout === 'week' && (
              <div className="space-y-2">
                <div className="week-weekdays">
                  {weekDates.map((_, idx) => (
                    <span key={idx} className="week-weekday">
                      周{weekdayHeaders[idx]}
                    </span>
                  ))}
                </div>
                <div className="week-grid">
                  {weekDates.map((day) => {
                    const dayKey = toDateKey(day)
                    const weekKey = weekKeyForDate(day)
                    const bucket = weekBuckets?.[weekKey]
                    const dayEntries =
                      (bucket?.days?.[dayKey] ?? []).map((id) => diaryById.get(id)).filter(Boolean) ||
                      groupedMap[dayKey] ||
                      []
                    const isToday = dayKey === todayKey
                    return (
                      <div key={day.toISOString()} className={`week-cell ${isToday ? 'is-today' : ''}`}>
                        <div className="week-cell__header">
                          <div className={`week-date ${isToday ? 'is-today' : ''}`}>
                            <span className="week-date__day">{format(day, 'd')}</span>
                          </div>
                        </div>
                        {dayEntries.length === 0 ? (
                          <p className="text-xs text-[var(--text-muted)]">无记录</p>
                        ) : (
                          <ul className="week-entries">
                            {dayEntries.map((entry) => (
                              <li key={entry.id}>
                                <button className="link week-entry" type="button" onClick={() => goToDiary(entry.id)}>
                                  {entry.title}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {layout === 'month' && (
              <div className="space-y-2">
                <div className="month-weekdays">
                  {weekdayHeaders.map((label) => (
                    <span key={label} className="month-weekday">
                      周{label}
                    </span>
                  ))}
                </div>
                <div className="month-grid">
                  {monthGrid.map((day) => {
                    const dayKey = toDateKey(day)
                    const monthKey = monthKeyForDate(day)
                    const bucket = monthBuckets?.[monthKey]
                    const dayEntries =
                      (bucket?.days?.[dayKey] ?? []).map((id) => diaryById.get(id)).filter(Boolean) ||
                      groupedMap[dayKey] ||
                      []
                    const isToday = dayKey === todayKey
                    const isCurrentMonth = day.getMonth() === referenceDate.getMonth()
                    const cellClass = `month-cell${isCurrentMonth ? '' : ' is-out-month'}${isToday ? ' is-today' : ''}${
                      dayEntries.length > 0 ? ' is-clickable' : ''
                    }`
                    const showMore = dayEntries.length > 4
                    const hasEntries = dayEntries.length > 0
                    return (
                      <div
                        key={day.toISOString()}
                        className={cellClass}
                        onClick={() => {
                          if (hasEntries) openMonthModal(dayKey, dayEntries)
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            if (hasEntries) openMonthModal(dayKey, dayEntries)
                          }
                        }}
                      >
                        <div className="month-cell__header">
                          <p className={`month-date ${isToday ? 'is-today' : ''}`}>{day.getDate()}</p>
                        </div>
                        {dayEntries.slice(0, 4).map((entry) => (
                          <button
                            key={entry.id}
                            className="link block text-left month-entry"
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              goToDiary(entry.id)
                            }}
                          >
                            {entry.title}
                          </button>
                        ))}
                        {showMore && (
                          <button
                            type="button"
                            className="link text-left text-[var(--accent)] month-entry"
                            onClick={(e) => {
                              e.stopPropagation()
                              openMonthModal(dayKey, dayEntries)
                            }}
                          >
                            +{dayEntries.length - 4} 更多
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {showSidebar && (
            <aside className="mt-4 space-y-3 lg:mt-0 lg:sticky lg:top-24 lg:w-36 lg:max-w-[9rem] lg:flex-shrink-0">
              <div className="section-card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">标签汇总</h3>
                  {filterTag && (
                    <button className="badge badge--compact" type="button" onClick={() => setFilterTag(null)}>
                      清除
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {Array.from(tagCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([tag, count]) => (
                      <button
                        key={tag}
                        type="button"
                        className={`badge badge--compact ${filterTag === tag ? 'is-active' : ''}`}
                        onClick={() => {
                          setFilterTag((prev) => (prev === tag ? null : tag))
                          setPage(0)
                        }}
                      >
                        #{tag} · {count}
                      </button>
                    ))}
                  {tagCounts.size === 0 && <p className="text-xs text-[var(--text-muted)]">暂无标签</p>}
                </div>
              </div>
              <div className="section-card">
                <h3 className="text-lg font-semibold mb-2">标签词云</h3>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const entries = Array.from(tagCounts.entries())
                    if (entries.length === 0) return <p className="text-xs text-[var(--text-muted)]">暂无标签</p>
                    const max = Math.max(...entries.map(([, c]) => c))
                    const min = Math.min(...entries.map(([, c]) => c))
                    const spread = Math.max(1, max - min)
                    return entries.map(([tag, count]) => {
                      const weight = (count - min) / spread
                      const size = 12 + weight * 14
                      const opacity = 0.6 + weight * 0.4
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            setFilterTag((prev) => (prev === tag ? null : tag))
                            setPage(0)
                          }}
                          style={{ fontSize: `${size}px`, opacity }}
                          className={`transition hover:-translate-y-0.5 ${filterTag === tag ? 'text-[var(--accent)]' : ''}`}
                        >
                          #{tag}
                        </button>
                      )
                    })
                  })()}
                </div>
              </div>
            </aside>
          )}
        </div>
      </div>

      {monthModal && (
        <div className="diary-modal-backdrop is-fullscreen" onClick={() => setMonthModal(null)}>
          <div className="diary-modal table-editor-modal" onClick={(e) => e.stopPropagation()}>
            <div className="workspace-shell">
              <div className="workspace-header">
                <div className="workspace-heading">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Monthly Overview</p>
                  <h3 className="text-2xl font-semibold">日记总览 · {monthModal.date}</h3>
                </div>
                <button className="badge" type="button" onClick={() => setMonthModal(null)}>
                  关闭
                </button>
              </div>
              <div className="workspace-body">
                <div className="workspace-panel space-y-2">
                  {monthModal.entries.map((entry) => (
                        <div key={entry.id} className="preview-note">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="badge badge--compact">{toDateKey(entry.occurredAt)}</span>
                          <button className="link" type="button" onClick={() => goToDiary(entry.id)}>
                            {entry.title}
                          </button>
                        </div>
                        <button className="badge badge--compact" type="button" onClick={() => goToDiary(entry.id)}>
                          查看
                        </button>
                      </div>
                      <p className="text-sm text-[var(--text-muted)] line-clamp-2">{entry.content.slice(0, 120)}</p>
                    </div>
                  ))}
                  {monthModal.entries.length === 0 && <p className="text-sm text-[var(--text-muted)]">该日期暂无日记</p>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
