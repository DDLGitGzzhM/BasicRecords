'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { DiaryEntry } from '@/lib/types'
import { readBubbles, saveBubbles, uploadVisionBackground, readAllBubbles, type Bubble as BubbleType } from '@/lib/api'
import { resolveAssetUrl } from '@/lib/assets'

type Bubble = BubbleType

type Props = {
  diaries: DiaryEntry[]
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const presetBubbles: Bubble[] = [
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

export function CanvasDemo({ diaries }: Props) {
  const [backgrounds, setBackgrounds] = useState<string[]>([])
  const [currentBackgroundIndex, setCurrentBackgroundIndex] = useState<number>(0)
  const [bubbles, setBubbles] = useState<Bubble[]>(presetBubbles)
  const [selectedId, setSelectedId] = useState<string>('')
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false)
  const inspectorRef = useRef<HTMLDivElement | null>(null)
  const [inspectorDraft, setInspectorDraft] = useState<Bubble | null>(null)
  const [showAssociations, setShowAssociations] = useState<boolean>(false)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false)
  const [history, setHistory] = useState<Bubble[][]>([]) // 历史记录，用于撤销
  const [showImportDialog, setShowImportDialog] = useState<boolean>(false)
  const [allBubblesByBackground, setAllBubblesByBackground] = useState<Record<string, Bubble[]>>({})
  const [selectedBubblesForImport, setSelectedBubblesForImport] = useState<Set<string>>(new Set())
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const currentBackground = backgrounds[currentBackgroundIndex] || null

  const selected = useMemo(() => bubbles.find((b) => b.id === selectedId) ?? null, [bubbles, selectedId])
  const diaryMap = useMemo(() => new Map(diaries.map((d) => [d.id, d])), [diaries])
  const activeBubble = inspectorDraft ?? selected

  const closePreview = () => {
    // 如果是新建模式且未确认，删除临时小球
    if (isCreatingNew && previewId) {
      setBubbles((prev) => prev.filter((b) => b.id !== previewId))
      const remaining = bubbles.filter((b) => b.id !== previewId)
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id)
      } else {
        setSelectedId('')
      }
    }
    setPreviewId(null)
    setInspectorOpen(false)
    setInspectorDraft(null)
    setShowAssociations(false)
    setIsCreatingNew(false)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  // 加载小球数据
  useEffect(() => {
    let cancelled = false
    async function loadBubbles() {
      try {
        const { bubbles: loaded, backgrounds: loadedBackgrounds, currentBackgroundIndex: loadedIndex } = await readBubbles()
        if (!cancelled) {
          if (loadedBackgrounds.length > 0) {
            setBackgrounds(loadedBackgrounds)
            setCurrentBackgroundIndex(loadedIndex)
          }
          if (loaded.length > 0) {
            setBubbles(loaded)
            setSelectedId(loaded[0]?.id ?? '')
          } else {
            setBubbles(presetBubbles)
            setSelectedId(presetBubbles[0]?.id ?? '')
          }
        }
      } catch (err) {
        console.error('加载小球数据失败:', err)
        if (!cancelled) {
          setBubbles(presetBubbles)
          setSelectedId(presetBubbles[0]?.id ?? '')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }
    loadBubbles()
    return () => {
      cancelled = true
    }
  }, [])

  // 保存小球数据（防抖）
  const saveBubblesDebounced = useCallback(async (bubblesToSave: Bubble[]) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await saveBubbles(bubblesToSave, currentBackgroundIndex, backgrounds)
      } catch (err) {
        console.error('保存小球数据失败:', err)
      }
    }, 500)
  }, [currentBackgroundIndex, backgrounds])

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!draggingId) return
    const handleMove = (event: PointerEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = clamp01((event.clientX - rect.left) / rect.width)
      const y = clamp01((event.clientY - rect.top) / rect.height)
      setBubbles((prev) => {
        const updated = prev.map((b) => (b.id === draggingId ? { ...b, x, y } : b))
        saveBubblesDebounced(updated)
        return updated
      })
    }
    const handleUp = () => setDraggingId(null)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [draggingId, saveBubblesDebounced])

  const handleBackgroundUpload = async (file?: File | null) => {
    if (!file) return
    try {
      // 上传到服务器
      const path = await uploadVisionBackground(file)
      // 添加到背景列表
      const newBackgrounds = [...backgrounds, path]
      setBackgrounds(newBackgrounds)
      // 切换到新背景
      setCurrentBackgroundIndex(newBackgrounds.length - 1)
      // 新背景没有小球，清空小球列表
      setBubbles([])
      setSelectedId('')
      // 保存配置
      await saveBubbles([], newBackgrounds.length - 1, newBackgrounds)
      console.log('背景图片已保存到:', path)
    } catch (err) {
      console.error('上传背景图片失败:', err)
      alert('上传背景图片失败: ' + (err instanceof Error ? err.message : '未知错误'))
    }
  }

  const handlePreviousBackground = () => {
    if (backgrounds.length === 0) return
    const newIndex = currentBackgroundIndex > 0 ? currentBackgroundIndex - 1 : backgrounds.length - 1
    setCurrentBackgroundIndex(newIndex)
    // 加载对应背景的小球
    loadBubblesForBackground(newIndex)
  }

  const handleNextBackground = () => {
    if (backgrounds.length === 0) return
    const newIndex = currentBackgroundIndex < backgrounds.length - 1 ? currentBackgroundIndex + 1 : 0
    setCurrentBackgroundIndex(newIndex)
    // 加载对应背景的小球
    loadBubblesForBackground(newIndex)
  }

  const loadBubblesForBackground = async (index: number) => {
    try {
      const { bubbles: loaded, backgrounds: updatedBackgrounds } = await readBubbles(index)
      // 从服务器获取对应背景的小球
      if (updatedBackgrounds.length > 0) {
        setBackgrounds(updatedBackgrounds)
      }
      if (loaded.length > 0) {
        setBubbles(loaded)
        setSelectedId(loaded[0]?.id ?? '')
      } else {
        setBubbles([])
        setSelectedId('')
      }
    } catch (err) {
      console.error('加载背景小球失败:', err)
      setBubbles([])
      setSelectedId('')
    }
  }

  // 当背景切换时，重新加载数据
  useEffect(() => {
    if (!loading && backgrounds.length > 0 && currentBackgroundIndex >= 0) {
      loadBubblesForBackground(currentBackgroundIndex)
    }
  }, [currentBackgroundIndex])

  const handleAddBubble = () => {
    const id = `bubble-${Date.now().toString(36)}`
    const next: Bubble = {
      id,
      label: '新小球',
      content: '点击编辑内容',
      x: 0.5,
      y: 0.5,
      color: '#c87a24',
      size: 88,
      diaryIds: []
    }
    // 先添加到列表但不保存，进入创建模式
    setBubbles((prev) => [...prev, next])
    setSelectedId(id)
    setPreviewId(id)
    setIsCreatingNew(true)
    // 打开编辑器
    setInspectorDraft({ ...next, diaryIds: [] })
    setInspectorOpen(true)
    inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const openInspector = (bubble: Bubble) => {
    setInspectorDraft({ ...bubble, diaryIds: [...(bubble.diaryIds ?? [])] })
    setInspectorOpen(true)
    inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const applyInspector = () => {
    if (!inspectorDraft) return
    if (isCreatingNew) {
      // 新建模式：确认创建，保存到服务器
      setBubbles((prev) => {
        const updated = prev.map((b) => (b.id === inspectorDraft.id ? { ...b, ...inspectorDraft } : b))
        saveBubblesDebounced(updated)
        return updated
      })
      setIsCreatingNew(false)
    } else {
      // 编辑模式：更新现有小球
      setBubbles((prev) => {
        const updated = prev.map((b) => (b.id === inspectorDraft.id ? { ...b, ...inspectorDraft } : b))
        saveBubblesDebounced(updated)
        return updated
      })
    }
    setInspectorOpen(false)
    setInspectorDraft(null)
  }

  const cancelInspector = () => {
    // 如果是新建模式，取消时删除临时小球
    if (isCreatingNew && previewId) {
      setBubbles((prev) => prev.filter((b) => b.id !== previewId))
      const remaining = bubbles.filter((b) => b.id !== previewId)
      if (remaining.length > 0) {
        setSelectedId(remaining[0].id)
      } else {
        setSelectedId('')
      }
      setPreviewId(null)
      setIsCreatingNew(false)
    }
    setInspectorOpen(false)
    setInspectorDraft(null)
  }

  const updateAssociations = (bubbleId: string, nextIds: string[]) => {
    setBubbles((prev) => {
      const updated = prev.map((b) => (b.id === bubbleId ? { ...b, diaryIds: nextIds } : b))
      saveBubblesDebounced(updated)
      return updated
    })
    if (inspectorDraft && inspectorDraft.id === bubbleId) {
      setInspectorDraft({ ...inspectorDraft, diaryIds: nextIds })
    }
  }

  const handleDelete = () => {
    if (!selected || isCreatingNew) return
    // 保存当前状态到历史记录
    setHistory((prev) => [...prev, bubbles])
    setBubbles((prev) => {
      const next = prev.filter((b) => b.id !== selected.id)
      const nextSelectedId = selectedId === selected.id ? next[0]?.id ?? '' : selectedId
      if (nextSelectedId !== selectedId) {
        setSelectedId(nextSelectedId)
      }
      saveBubblesDebounced(next)
      return next
    })
    setInspectorOpen(false)
    setInspectorDraft(null)
    setPreviewId(null)
    setIsCreatingNew(false)
  }

  const handleUndo = () => {
    if (history.length === 0) return
    const previousBubbles = history[history.length - 1]
    setHistory((prev) => prev.slice(0, -1))
    setBubbles(previousBubbles)
    if (previousBubbles.length > 0) {
      setSelectedId(previousBubbles[0].id)
    } else {
      setSelectedId('')
    }
    saveBubblesDebounced(previousBubbles)
  }

  const handleOpenImportDialog = async () => {
    try {
      const { allBubblesByBackground: allBubbles } = await readAllBubbles()
      setAllBubblesByBackground(allBubbles)
      setSelectedBubblesForImport(new Set())
      setShowImportDialog(true)
    } catch (err) {
      console.error('加载所有小球数据失败:', err)
    }
  }

  const handleImportBubbles = (sourceBackground: string, selectedBubbleIds: string[]) => {
    const sourceBubbles = allBubblesByBackground[sourceBackground] || []
    const bubblesToImport = sourceBubbles.filter(b => selectedBubbleIds.includes(b.id))
    
    if (bubblesToImport.length === 0) return
    
    // 为导入的小球生成新的ID，但保持位置关系（x, y坐标）
    const importedBubbles = bubblesToImport.map(bubble => ({
      ...bubble,
      id: `bubble-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`,
      x: bubble.x, // 保持位置关系
      y: bubble.y, // 保持位置关系
      diaryIds: [] // 导入时不复制关联关系，用户需要重新关联
    }))
    
    // 保存当前状态到历史记录
    setHistory((prev) => [...prev, bubbles])
    
    // 添加到当前背景的小球列表
    setBubbles((prev) => {
      const updated = [...prev, ...importedBubbles]
      saveBubblesDebounced(updated)
      return updated
    })
    
    setShowImportDialog(false)
    setSelectedBubblesForImport(new Set())
  }

  const toggleBubbleSelection = (bubbleId: string) => {
    setSelectedBubblesForImport((prev) => {
      const next = new Set(prev)
      if (next.has(bubbleId)) {
        next.delete(bubbleId)
      } else {
        next.add(bubbleId)
      }
      return next
    })
  }

  const diaryOptions = diaries.map((d) => ({
    id: d.id,
    label: `${new Date(d.occurredAt).toLocaleDateString()} - ${d.title || d.id}`
  }))

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="page-heading">
          <div>
            <p className="stack-eyebrow">Vision Canvas</p>
            <h1 className="stack-title">Life Tools</h1>
            <p className="stack-description">加载中...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="stack-eyebrow">Vision Canvas</p>
          <h1 className="stack-title">Life Tools</h1>
          <p className="stack-description">
            上传一张图片，在其上放置可拖拽的小球，支持关联多篇日记、预览与更新。
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="badge" onClick={handleAddBubble} type="button">
            新建小球
          </button>
          <button className="badge" onClick={handleOpenImportDialog} type="button">
            加入已有小球
          </button>
          <label className="badge cursor-pointer">
            新建背景
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleBackgroundUpload(e.target.files?.[0])}
            />
          </label>
          {selected && !isCreatingNew && (
            <button className="badge" onClick={handleDelete} type="button">
              删除选中
            </button>
          )}
          {history.length > 0 && (
            <button className="badge" onClick={handleUndo} type="button">
              撤销
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4">
        <div className="section-card">
          <div
            ref={containerRef}
            className="relative overflow-hidden rounded-2xl border border-[var(--border)]"
            style={{
              minHeight: 640,
              background: currentBackground ? `url(${currentBackground.startsWith('blob:') || currentBackground.startsWith('http') ? currentBackground : resolveAssetUrl(currentBackground)}) center/cover no-repeat` : 'linear-gradient(135deg, #f5f5f5, #eae7df)'
            }}
          >
            {/* 左右切换按钮 */}
            {backgrounds.length > 1 && (
              <>
                <button
                  className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-full w-12 h-12 flex items-center justify-center transition-all"
                  onClick={handlePreviousBackground}
                  type="button"
                  aria-label="上一个背景"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-black/40 hover:bg-black/60 backdrop-blur-sm text-white rounded-full w-12 h-12 flex items-center justify-center transition-all"
                  onClick={handleNextBackground}
                  type="button"
                  aria-label="下一个背景"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            {/* 背景指示器 */}
            {backgrounds.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
                {backgrounds.map((_, index) => (
                  <button
                    key={index}
                    className={`w-2 h-2 rounded-full transition-all ${
                      index === currentBackgroundIndex ? 'bg-white' : 'bg-white/40'
                    }`}
                    onClick={() => {
                      setCurrentBackgroundIndex(index)
                      loadBubblesForBackground(index)
                    }}
                    type="button"
                    aria-label={`切换到背景 ${index + 1}`}
                  />
                ))}
              </div>
            )}
            <div className="absolute inset-0">
              {bubbles.map((bubble) => {
                const isActive = bubble.id === selectedId
                return (
                  <button
                    key={bubble.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                    style={{
                      left: `${bubble.x * 100}%`,
                      top: `${bubble.y * 100}%`,
                      width: bubble.size,
                      height: bubble.size,
                      borderRadius: 999,
                      background: bubble.color,
                      boxShadow: isActive ? '0 0 0 3px rgba(200,122,36,0.35)' : '0 12px 30px rgba(0,0,0,0.22)',
                      border: isActive ? '2px solid var(--surface)' : '1px solid rgba(255,255,255,0.25)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'grab',
                      fontWeight: 700,
                      letterSpacing: '0.02em',
                      transition: 'transform 120ms ease, box-shadow 120ms ease'
                    }}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      setSelectedId(bubble.id)
                      setPreviewId(null)
                      setDraggingId(bubble.id)
                    }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedId(bubble.id)
                    }}
                    onDoubleClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setSelectedId(bubble.id)
                      setPreviewId(bubble.id)
                      setInspectorOpen(false)
                    }}
                    type="button"
                  >
                    <span className="text-sm text-center px-2 leading-tight drop-shadow">{bubble.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            提示：拖拽即可移动位置（存为百分比坐标）；双击查看完整内容与编辑。
          </p>
        </div>
      </div>

      {previewId && selected && selected.id === previewId && mounted
        ? createPortal(
            <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[200] bg-black/90 backdrop-blur-md overflow-y-auto" style={{ margin: 0, padding: 0 }}>
          <div className="w-full max-w-7xl mx-auto py-6 px-4">
            <div
              className="relative bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden min-h-[calc(100vh-3rem)]"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-muted)]/60">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">预览</p>
                <h3 className="text-2xl font-semibold">{(inspectorDraft ?? selected).label}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="badge badge--compact"
                  type="button"
                  onClick={() => openInspector(selected)}
                  disabled={Boolean(inspectorDraft)}
                >
                  {inspectorDraft ? '编辑中' : '更新'}
                </button>
                <button
                  className="badge badge--compact"
                  type="button"
                  onClick={() => setShowAssociations(true)}
                >
                  关联日记
                </button>
                <button className="badge badge--compact" type="button" onClick={closePreview}>
                  关闭
                </button>
              </div>
            </div>
            <div className="grid gap-0 md:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] h-full">
              <div className="flex flex-col h-full overflow-hidden">
                <div className="prose prose-neutral max-w-none flex-1 overflow-y-auto p-6">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {(inspectorDraft ?? selected).content || '（暂无内容）'}
                  </ReactMarkdown>
                </div>
                {((inspectorDraft ?? selected)?.diaryIds ?? []).length > 0 && (
                  <div className="px-6 pb-6 flex flex-wrap gap-2">
                    {((inspectorDraft ?? selected)?.diaryIds ?? [])
                      .slice(0, 4)
                      .map((id) => (
                        <span key={id} className="badge badge--compact">
                          {diaryMap.get(id)?.title ?? id}
                        </span>
                      ))}
                    {((inspectorDraft ?? selected)?.diaryIds ?? []).length > 4 && (
                      <span className="badge badge--compact">+{((inspectorDraft ?? selected)?.diaryIds ?? []).length - 4}</span>
                    )}
                  </div>
                )}
              </div>
              <div className="border-l border-[var(--border)] bg-[var(--surface-muted)]/50 h-full overflow-y-auto">
                {inspectorOpen && inspectorDraft ? (
                  <div className="p-5 space-y-3" ref={inspectorRef}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">编辑</p>
                        <h4 className="text-lg font-semibold">小球编辑器</h4>
                      </div>
                      <button className="badge badge--compact" onClick={cancelInspector} type="button">
                        取消
                      </button>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      文案
                      <input
                        className="input"
                        value={inspectorDraft.label}
                        onChange={(e) => setInspectorDraft({ ...inspectorDraft, label: e.target.value })}
                        placeholder="例如：精神、品质、坚持"
                      />
                    </label>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>已关联日记</span>
                        <span className="text-xs text-[var(--text-muted)]">最多展示 4 条，更多请点“关联日记”</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(inspectorDraft.diaryIds ?? []).length === 0 && (
                          <span className="text-xs text-[var(--text-muted)]">暂无关联</span>
                        )}
                        {(inspectorDraft.diaryIds ?? []).slice(0, 4).map((id) => (
                          <div key={id} className="flex items-center gap-1 badge badge--compact">
                            <a href={`/diary/${id}`} className="underline" target="_blank" rel="noreferrer">
                              {diaryMap.get(id)?.title ?? id}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                setInspectorDraft({
                                  ...inspectorDraft,
                                  diaryIds: (inspectorDraft.diaryIds ?? []).filter((d) => d !== id)
                                })
                              }
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {(inspectorDraft.diaryIds ?? []).length > 4 && (
                          <button
                            type="button"
                            className="badge badge--compact"
                            onClick={() => setShowAssociations(true)}
                          >
                            +{(inspectorDraft.diaryIds ?? []).length - 4} 更多
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2 items-center">
                        <select
                          className="input flex-1"
                          value=""
                          onChange={(e) => {
                            const value = e.target.value
                            if (!value) return
                            const currentIds = inspectorDraft.diaryIds ?? []
                            if (currentIds.includes(value)) return
                            setInspectorDraft({ ...inspectorDraft, diaryIds: [...currentIds, value] })
                          }}
                        >
                          <option value="">选择日记添加</option>
                          {diaryOptions.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-[120px,minmax(0,1fr)] gap-3 text-sm items-center">
                      <label className="flex items-center gap-2">
                        <span>颜色</span>
                        <input
                          type="color"
                          className="h-10 w-12 rounded border border-[var(--border)] p-0"
                          value={inspectorDraft.color}
                          onChange={(e) => setInspectorDraft({ ...inspectorDraft, color: e.target.value })}
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        尺寸（px）
                        <input
                          type="range"
                          min={60}
                          max={140}
                          value={inspectorDraft.size}
                          onChange={(e) => setInspectorDraft({ ...inspectorDraft, size: Number(e.target.value) })}
                        />
                        <span className="text-xs text-[var(--text-muted)]">{Math.round(inspectorDraft.size)} px</span>
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-sm">
                      内容（Markdown，实时预览在左侧）
                      <textarea
                        className="input h-[220px]"
                        style={{ resize: 'none', maxHeight: '260px' }}
                        value={inspectorDraft.content}
                        onChange={(e) => setInspectorDraft({ ...inspectorDraft, content: e.target.value })}
                        placeholder="写下该标签的具体说明/目标/链接等"
                      />
                    </label>
                    <div className="flex gap-2 justify-end">
                      <button className="badge" onClick={applyInspector} type="button">
                        {isCreatingNew ? '确认新建' : '确认更新'}
                      </button>
                      {!isCreatingNew && (
                        <button className="badge badge--compact" onClick={handleDelete} type="button">
                          删除
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-sm text-[var(--text-muted)]">
                    点击上方“更新”进入编辑，编辑时左侧实时预览 Markdown。
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>,
            document.body
          )
        : null}

      {showAssociations && activeBubble && (
        <div
          className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-sm flex items-center justify-center px-4"
          onClick={() => setShowAssociations(false)}
        >
          <div
            className="w-full max-w-5xl bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">关联日记</p>
                <h4 className="text-lg font-semibold">{activeBubble.label}</h4>
              </div>
              <button className="badge badge--compact" onClick={() => setShowAssociations(false)} type="button">
                关闭
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-3">
                <p className="text-sm text-[var(--text-muted)]">已关联</p>
                <div className="flex flex-col gap-2 max-h-[320px] overflow-y-auto">
                  {activeBubble.diaryIds.length === 0 && (
                    <span className="text-xs text-[var(--text-muted)]">暂无关联</span>
                  )}
                  {activeBubble.diaryIds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-lg px-3 py-2"
                    >
                      <div className="flex flex-col">
                        <a href={`/diary/${id}`} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                          {diaryMap.get(id)?.title ?? id}
                        </a>
                        <span className="text-xs text-[var(--text-muted)]">
                          {diaryMap.get(id) ? new Date(diaryMap.get(id)!.occurredAt).toLocaleString() : '已关联'}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="badge badge--compact"
                        onClick={() => {
                          const nextIds = activeBubble.diaryIds.filter((d) => d !== id)
                          updateAssociations(activeBubble.id, nextIds)
                        }}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-[var(--text-muted)]">添加新的关联</p>
                <div className="border border-[var(--border)] rounded-lg max-h-[360px] overflow-y-auto divide-y divide-[var(--border)]">
                  {diaryOptions
                    .filter((d) => !activeBubble.diaryIds.includes(d.id))
                    .map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="flex flex-col">
                          <span className="font-medium">{d.label}</span>
                        </div>
                        <button
                          type="button"
                          className="badge badge--compact"
                          onClick={() => {
                            const nextIds = [...activeBubble.diaryIds, d.id]
                            updateAssociations(activeBubble.id, nextIds)
                          }}
                        >
                          添加
                        </button>
                      </div>
                    ))}
                  {diaryOptions.filter((d) => !activeBubble.diaryIds.includes(d.id)).length === 0 && (
                    <p className="text-xs text-[var(--text-muted)] px-3 py-2">暂无可添加的日记</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 导入小球对话框 */}
      {showImportDialog && mounted && createPortal(
        <div className="fixed top-0 left-0 right-0 bottom-0 w-screen h-screen z-[250] bg-black/80 backdrop-blur-sm overflow-y-auto" onClick={() => setShowImportDialog(false)}>
          <div className="w-full max-w-4xl mx-auto py-8 px-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-muted)]/60">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">导入小球</p>
                  <h3 className="text-2xl font-semibold">从其他背景导入小球</h3>
                </div>
                <button className="badge badge--compact" type="button" onClick={() => setShowImportDialog(false)}>
                  关闭
                </button>
              </div>
              <div className="p-6 space-y-4 max-h-[calc(100vh-12rem)] overflow-y-auto">
                {Object.entries(allBubblesByBackground)
                  .filter(([bg]) => bg !== currentBackground) // 排除当前背景
                  .map(([background, bgBubbles]) => {
                    if (bgBubbles.length === 0) return null
                    return (
                      <div key={background} className="border border-[var(--border)] rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <img 
                            src={resolveAssetUrl(background)} 
                            alt="背景预览" 
                            className="w-16 h-16 object-cover rounded"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{background.split('/').pop()}</p>
                            <p className="text-xs text-[var(--text-muted)]">{bgBubbles.length} 个小球</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {bgBubbles.map((bubble) => {
                            const bubbleKey = `${background}:${bubble.id}`
                            const isSelected = selectedBubblesForImport.has(bubbleKey)
                            return (
                              <label
                                key={bubble.id}
                                className={`flex items-center gap-2 p-2 border rounded hover:bg-[var(--surface-muted)] cursor-pointer ${
                                  isSelected ? 'border-[var(--accent)] bg-[var(--surface-muted)]' : 'border-[var(--border)]'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="rounded"
                                  checked={isSelected}
                                  onChange={() => toggleBubbleSelection(bubbleKey)}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="w-4 h-4 rounded-full flex-shrink-0"
                                      style={{ backgroundColor: bubble.color }}
                                    />
                                    <span className="font-medium text-sm truncate">{bubble.label}</span>
                                  </div>
                                  <p className="text-xs text-[var(--text-muted)] truncate mt-1">
                                    {bubble.content || '（无内容）'}
                                  </p>
                                  <p className="text-xs text-[var(--text-muted)] mt-1">
                                    位置: ({Math.round(bubble.x * 100)}%, {Math.round(bubble.y * 100)}%)
                                  </p>
                                </div>
                              </label>
                            )
                          })}
                        </div>
                        <button
                          className="badge badge--compact w-full"
                          type="button"
                          onClick={() => {
                            const selectedIds = bgBubbles
                              .filter(b => selectedBubblesForImport.has(`${background}:${b.id}`))
                              .map(b => b.id)
                            if (selectedIds.length > 0) {
                              handleImportBubbles(background, selectedIds)
                            }
                          }}
                          disabled={bgBubbles.filter(b => selectedBubblesForImport.has(`${background}:${b.id}`)).length === 0}
                        >
                          导入选中 ({bgBubbles.filter(b => selectedBubblesForImport.has(`${background}:${b.id}`)).length})
                        </button>
                      </div>
                    )
                  })}
                {Object.entries(allBubblesByBackground).filter(([bg]) => bg !== currentBackground).every(([, bubbles]) => bubbles.length === 0) && (
                  <div className="text-center py-8 text-[var(--text-muted)]">
                    <p>暂无其他背景的小球可导入</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
