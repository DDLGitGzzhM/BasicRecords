'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  addSheetRowClient,
  createSheetClient,
  deleteSheetClient,
  deleteSheetRowClient,
  updateSheetClient,
  updateSheetRowClient
} from '@/lib/api'
import { Timeframe, sheetToMetricSeries } from '@/lib/sheets'
import type { DiaryEntry, SheetDefinition, SheetRow } from '@/lib/types'
import { TradingKLine } from '@/components/charts/TradingKLine'
import { DiaryModal } from '@/components/diary/DiaryModal'

const numberFields: Array<{ key: 'open' | 'high' | 'low' | 'close'; label: string }> = [
  { key: 'open', label: '开盘' },
  { key: 'high', label: '最高' },
  { key: 'low', label: '最低' },
  { key: 'close', label: '收盘' }
]

const createDefaultRow = () => ({
  date: new Date().toISOString().slice(0, 10),
  open: '0',
  high: '0',
  low: '0',
  close: '0',
  note: '',
  diaryRefs: ''
})

export function SheetsBoard({ initialSheets, diaries }: { initialSheets: SheetDefinition[]; diaries: DiaryEntry[] }) {
  const router = useRouter()
  const [sheets, setSheets] = useState(initialSheets)
  const [activeId, setActiveId] = useState(initialSheets[0]?.id ?? '')
  const [form, setForm] = useState(createDefaultRow)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [sheetMetaForm, setSheetMetaForm] = useState({
    name: initialSheets[0]?.name ?? '',
    description: initialSheets[0]?.description ?? ''
  })
  const [newSheetForm, setNewSheetForm] = useState({ name: '', description: '' })
  const [refInput, setRefInput] = useState('')
  const [klineTimeframe, setKlineTimeframe] = useState<Timeframe>('day')
  const [klineSelection, setKlineSelection] = useState<{ date: string; diaryIds: string[] } | null>(null)
  const [activeDiary, setActiveDiary] = useState<DiaryEntry | null>(null)
  const [sheetModalOpen, setSheetModalOpen] = useState(false)
  const [rowModalOpen, setRowModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeSheet = sheets.find((sheet) => sheet.id === activeId) ?? sheets[0]

  useEffect(() => {
    if (activeSheet) {
      setSheetMetaForm({ name: activeSheet.name, description: activeSheet.description })
      setForm(createDefaultRow())
      setEditingRowId(null)
      setRefInput('')
      setKlineSelection(null)
      setActiveDiary(null)
    }
  }, [activeSheet])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleMetaChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setSheetMetaForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const refsList = useMemo(
    () => form.diaryRefs.split(',').map((id) => id.trim()).filter(Boolean),
    [form.diaryRefs]
  )

  const addRef = (value: string) => {
    const next = Array.from(new Set([...refsList, value].filter(Boolean)))
    setForm((prev) => ({ ...prev, diaryRefs: next.join(',') }))
    setRefInput('')
  }

  const removeRef = (value: string) => {
    const next = refsList.filter((id) => id !== value)
    setForm((prev) => ({ ...prev, diaryRefs: next.join(',') }))
  }

  const handleCreateSheet = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSheetForm.name.trim()) return
    setError(null)
    try {
      const created = await createSheetClient({ name: newSheetForm.name, description: newSheetForm.description })
      setSheets((prev) => [...prev, created])
      setActiveId(created.id)
      setNewSheetForm({ name: '', description: '' })
      setSheetModalOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建表格失败')
    }
  }

  const handleUpdateSheetMeta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSheet) return
    setError(null)
    try {
      const updated = await updateSheetClient(activeSheet.id, {
        name: sheetMetaForm.name,
        description: sheetMetaForm.description
      })
      setSheets((prev) => prev.map((sheet) => (sheet.id === activeSheet.id ? updated : sheet)))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新表格信息失败')
    }
  }

  const handleDeleteSheet = async () => {
    if (!activeSheet) return
    if (!confirm(`确定删除「${activeSheet.name}」？关联的行将一并移除。`)) return
    setError(null)
    try {
      await deleteSheetClient(activeSheet.id)
      setSheets((prev) => {
        const filtered = prev.filter((sheet) => sheet.id !== activeSheet.id)
        setActiveId(filtered[0]?.id ?? '')
        return filtered
      })
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除表格失败')
    }
  }

  const handleAddRow = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSheet) return
    setError(null)
    try {
      const row = {
        date: form.date,
        open: Number(form.open),
        high: Number(form.high),
        low: Number(form.low),
        close: Number(form.close),
        note: form.note,
        diaryRefs: form.diaryRefs.split(',').map((id) => id.trim()).filter(Boolean)
      }
      if (editingRowId) {
        const updated = await updateSheetRowClient(activeSheet.id, editingRowId, row)
        setSheets((prev) =>
          prev.map((sheet) =>
            sheet.id === activeSheet.id
              ? { ...sheet, rows: sheet.rows.map((r) => (r.id === editingRowId ? updated : r)) }
              : sheet
          )
        )
        setEditingRowId(null)
      } else {
        const created = await addSheetRowClient(activeSheet.id, row)
        setSheets((prev) =>
          prev.map((sheet) => (sheet.id === activeSheet.id ? { ...sheet, rows: [created, ...sheet.rows] } : sheet))
        )
      }
      setForm(createDefaultRow())
      setRowModalOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '新增失败')
    }
  }

  const handleDelete = async (rowId: string) => {
    if (!activeSheet) return
    try {
      await deleteSheetRowClient(activeSheet.id, rowId)
      setSheets((prev) =>
        prev.map((sheet) =>
          sheet.id === activeSheet.id ? { ...sheet, rows: sheet.rows.filter((row) => row.id !== rowId) } : sheet
        )
      )
      if (editingRowId === rowId) {
        setEditingRowId(null)
        setForm(createDefaultRow())
        setRefInput('')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败')
    }
  }

  const startEditRow = (row: SheetRow) => {
    setEditingRowId(row.id)
    setForm({
      date: row.date,
      open: String(row.open),
      high: String(row.high),
      low: String(row.low),
      close: String(row.close),
      note: row.note,
      diaryRefs: row.diaryRefs.join(',')
    })
    setRefInput('')
    setRowModalOpen(true)
  }

  const diaryMap = useMemo(() => {
    return Object.fromEntries(diaries.map((diary) => [diary.id, diary]))
  }, [diaries])

  const metricSeries = useMemo(
    () => (activeSheet ? sheetToMetricSeries(activeSheet, klineTimeframe) : []),
    [activeSheet, klineTimeframe]
  )
  const mergedSelectionRefs = useMemo(() => {
    if (!activeSheet || !klineSelection) return []
    const rowRefs = activeSheet.rows.find((r) => r.date === klineSelection.date)?.diaryRefs ?? []
    const dateMatches = diaries
      .filter((entry) => {
        const occurred = typeof entry.occurredAt === 'string' ? entry.occurredAt : String(entry.occurredAt ?? '')
        return occurred.slice(0, 10) === klineSelection.date
      })
      .map((entry) => entry.id)
    return Array.from(new Set([...(klineSelection.diaryIds ?? []), ...rowRefs, ...dateMatches]))
  }, [activeSheet, diaries, klineSelection])
  const diariesForSelection = useMemo(
    () => mergedSelectionRefs.map((id) => diaryMap[id]).filter(Boolean),
    [mergedSelectionRefs, diaryMap]
  )

  useEffect(() => {
    setKlineSelection(null)
  }, [klineTimeframe])

  return (
    <div className="grid gap-6">
      <section className="section-card">
        <div className="page-heading">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">CSV Sheets</p>
            <h2 className="text-3xl font-semibold">本地 CSV 表格</h2>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
          数据落在 `package: table/*.csv`，关系写入 `relations.json`，可通过设置页切换根目录。
        </p>
      </div>
      <div className="mb-4">
        <button className="badge" type="button" onClick={() => setSheetModalOpen(true)}>
          + 创建新表格
        </button>
      </div>
      {sheetModalOpen && (
        <div className="diary-modal-backdrop" onClick={() => setSheetModalOpen(false)}>
          <div className="diary-modal max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <form className="grid gap-3" onSubmit={handleCreateSheet}>
              <div className="grid md:grid-cols-2 gap-3">
                <input
                  name="name"
                  placeholder="新表名"
                  value={newSheetForm.name}
                  onChange={(e) => setNewSheetForm((prev) => ({ ...prev, name: e.target.value }))}
                  required
                />
                <input
                  name="description"
                  placeholder="描述（可选）"
                  value={newSheetForm.description}
                  onChange={(e) => setNewSheetForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>
              <div className="section-card">
                <p className="text-sm text-[var(--text-muted)] mb-2">预览</p>
                <h4 className="text-xl font-semibold">{newSheetForm.name || '新表格'}</h4>
                <p className="text-sm text-[var(--text-muted)]">{newSheetForm.description || '描述将显示在此处'}</p>
              </div>
              <div className="flex gap-2">
                <button className="action-button" type="submit">
                  创建
                </button>
                <button className="badge" type="button" onClick={() => setSheetModalOpen(false)}>
                  取消
                </button>
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
            </form>
          </div>
        </div>
      )}
        <div className="flex flex-wrap gap-3 mb-6">
          {sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              className={`badge ${sheet.id === activeSheet?.id ? 'is-active' : ''}`}
              onClick={() => setActiveId(sheet.id)}
            >
              {sheet.name}
            </button>
          ))}
        </div>
        {activeSheet ? (
          <>
            <form className="grid gap-3 mb-4" onSubmit={handleUpdateSheetMeta}>
              <div className="grid md:grid-cols-2 gap-3">
                <input name="name" placeholder="表格名称" value={sheetMetaForm.name} onChange={handleMetaChange} />
                <input
                  name="description"
                  placeholder="表格描述"
                  value={sheetMetaForm.description}
                  onChange={handleMetaChange}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="badge" type="submit">
                  保存表信息
                </button>
                <button className="badge" type="button" onClick={handleDeleteSheet}>
                  删除当前表
                </button>
              </div>
            </form>
            <div className="mb-4">
              <button className="action-button" type="button" onClick={() => setRowModalOpen(true)}>
                {editingRowId ? '继续编辑行' : '+ 写入 CSV 行'}
              </button>
            </div>
            <div className="table-wrapper">
              <table className="sheet-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    {numberFields.map((field) => (
                      <th key={field.key}>{field.label}</th>
                    ))}
                    <th>备注</th>
                    <th>关联日记</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {activeSheet.rows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.date}</td>
                      <td>{row.open}</td>
                      <td>{row.high}</td>
                      <td>{row.low}</td>
                      <td>{row.close}</td>
                      <td>{row.note}</td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          {row.diaryRefs.map((id) => (
                            <span key={id} className="badge text-xs">
                              {diaryMap[id]?.title ?? id}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button className="badge" type="button" onClick={() => handleDelete(row.id)}>
                          删除
                        </button>
                        <button className="badge ml-2" type="button" onClick={() => startEditRow(row)}>
                          编辑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p>暂无表格，请在 content/sheets 中添加 CSV。</p>
        )}
      </section>
      {activeSheet && (
        <section className="section-card">
          <div className="page-heading">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">K Line</p>
              <h2 className="text-3xl font-semibold">{activeSheet.name} · K 线</h2>
            </div>
            <div className="flex flex-col items-end gap-2 text-sm text-[var(--text-muted)]">
              <p>蜡烛无间隔，支持日 / 周 / 月聚合。周/月点击将跳转对应日记视图。</p>
              <div className="flex items-center gap-2">
                <span className="text-xs">聚合</span>
                {(['day', 'week', 'month'] as const).map((tf) => (
                  <button
                    key={tf}
                    type="button"
                    className={`badge ${klineTimeframe === tf ? 'is-active' : ''}`}
                    onClick={() => setKlineTimeframe(tf)}
                  >
                    {tf === 'day' ? '日' : tf === 'week' ? '周' : '月'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <TradingKLine
            data={metricSeries}
            compact
            timeframe={klineTimeframe}
            onSelectDate={(date, events) => {
              if (klineTimeframe === 'day') {
                setKlineSelection({ date, diaryIds: events ?? [] })
              } else {
                const layout = klineTimeframe === 'week' ? 'week' : 'month'
                router.push(`/diary?layout=${layout}&focus=${date}`)
              }
            }}
          />
          {klineTimeframe === 'day' && klineSelection && (
            <div className="mt-3">
              <p className="text-sm text-[var(--text-muted)] mb-2">
                {klineSelection.date} · {diariesForSelection.length} 条关联日记
              </p>
              <div className="grid gap-3">
                {diariesForSelection.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <span>暂无关联日记，前往日记页创建或为行关联。</span>
                    <a className="badge" href="/diary">
                      去日记页
                    </a>
                  </div>
                )}
                {diariesForSelection.map((entry) => (
                  <article key={entry.id} className="section-card">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h4 className="text-lg font-semibold">{entry.title}</h4>
                        <p className="text-sm text-[var(--text-muted)]">
                          {entry.mood} · {entry.tags.join(', ')}
                        </p>
                      </div>
                      <button className="badge" type="button" onClick={() => setActiveDiary(entry)}>
                        查看日记
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
      <DiaryModal entry={activeDiary} onClose={() => setActiveDiary(null)} />
      <RowModal
        open={rowModalOpen}
        onClose={() => {
          setRowModalOpen(false)
          setEditingRowId(null)
          setForm(createDefaultRow())
          setRefInput('')
        }}
        onSubmit={handleAddRow}
        form={form}
        onChange={handleChange}
        refInput={refInput}
        setRefInput={setRefInput}
        refsList={refsList}
        addRef={addRef}
        removeRef={removeRef}
        diaries={diaries}
        numberFields={numberFields}
        editingRowId={editingRowId}
        error={error}
      />
    </div>
  )
}

function RowModal({
  open,
  onClose,
  onSubmit,
  form,
  onChange,
  refInput,
  setRefInput,
  refsList,
  addRef,
  removeRef,
  diaries,
  numberFields,
  editingRowId,
  error
}: {
  open: boolean
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
  form: ReturnType<typeof createDefaultRow>
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  refInput: string
  setRefInput: (v: string) => void
  refsList: string[]
  addRef: (v: string) => void
  removeRef: (v: string) => void
  diaries: DiaryEntry[]
  numberFields: Array<{ key: 'open' | 'high' | 'low' | 'close'; label: string }>
  editingRowId: string | null
  error: string | null
}) {
  if (!open) return null
  return (
    <div className="diary-modal-backdrop" onClick={onClose}>
      <div className="diary-modal max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <div className="grid md:grid-cols-2 gap-3">
            <input type="date" name="date" value={form.date} onChange={onChange} required />
            <div className="flex gap-2">
              <input
                name="diaryRefs"
                placeholder="直接编辑 / 粘贴多个 ID，用逗号隔开"
                value={form.diaryRefs}
                onChange={onChange}
                className="flex-1"
                list="diary-options"
              />
            </div>
          </div>
          <datalist id="diary-options">
            {diaries.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </datalist>
          <div className="grid md:grid-cols-2 gap-3 items-start">
            <div className="flex gap-2">
              <input
                placeholder="选择或输入日记 ID"
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                list="diary-options"
                className="flex-1"
              />
              <button className="badge" type="button" onClick={() => addRef(refInput.trim())} disabled={!refInput.trim()}>
                添加关联
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {refsList.length === 0 && <span className="text-xs text-[var(--text-muted)]">暂无关联日记</span>}
              {refsList.map((id) => (
                <span key={id} className="badge text-xs">
                  {id}
                  <button type="button" className="ml-1" onClick={() => removeRef(id)} aria-label="移除关联">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            {numberFields.map((field) => (
              <input
                key={field.key}
                name={field.key}
                type="number"
                step="0.1"
                value={(form as Record<string, string>)[field.key]}
                onChange={onChange}
                placeholder={field.label}
                required
              />
            ))}
          </div>
          <textarea name="note" placeholder="备注" value={form.note} onChange={onChange} rows={2} />
          <div className="flex items-center gap-3">
            <button className="action-button" type="submit">
              {editingRowId ? '更新行' : '+ 写入 CSV 行'}
            </button>
            <button className="badge" type="button" onClick={onClose}>
              关闭
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      </div>
    </div>
  )
}
