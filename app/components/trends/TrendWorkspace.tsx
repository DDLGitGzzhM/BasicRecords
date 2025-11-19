'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { DiaryEntry, SheetDefinition } from '@/lib/types'
import { Timeframe, sheetToMetricSeries } from '@/lib/sheets'
import { TradingKLine } from '@/components/charts/TradingKLine'
import { DiaryModal } from '@/components/diary/DiaryModal'

export function TrendWorkspace({ sheets, diaries }: { sheets: SheetDefinition[]; diaries: DiaryEntry[] }) {
  const router = useRouter()
  const [selectedSheets, setSelectedSheets] = useState<string[]>(sheets.map((sheet) => sheet.id))
  const [selection, setSelection] = useState<{ sheetId: string; date: string; diaryIds: string[] }>({ sheetId: '', date: '', diaryIds: [] })
  const [activeDiary, setActiveDiary] = useState<DiaryEntry | null>(null)
  const [timeframe, setTimeframe] = useState<Timeframe>('day')

  const diaryMap = useMemo(() => Object.fromEntries(diaries.map((entry) => [entry.id, entry])), [diaries])

  useEffect(() => {
    setSelection({ sheetId: '', date: '', diaryIds: [] })
  }, [timeframe])

  const cards = useMemo(() => {
    return sheets
      .filter((sheet) => selectedSheets.includes(sheet.id))
      .map((sheet) => {
        const series = sheetToMetricSeries(sheet, timeframe)
        const first = series[0]
        const last = series[series.length - 1]
        const change = first && last ? (((last.close - first.close) / first.close) * 100).toFixed(2) : '0.00'
        return { sheet, series, change }
      })
  }, [selectedSheets, sheets, timeframe])

  const relatedDiaries = (ids: string[]) => ids.map((id) => diaryMap[id]).filter(Boolean)

  return (
    <div className="grid gap-6">
      <section className="section-card">
        <div className="page-heading">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Trend Lab</p>
            <h2 className="text-3xl font-semibold">K 线趋势实验室</h2>
          </div>
          <div className="flex flex-col items-end gap-2 text-sm text-[var(--text-muted)]">
            <p>点击日级 K 线展开日记，周 / 月级聚合会跳转至对应视图。</p>
            <div className="flex items-center gap-2">
              <span className="text-xs">聚合</span>
              {(['day', 'week', 'month'] as const).map((tf) => (
                <button
                  key={tf}
                  type="button"
                  className={`badge ${timeframe === tf ? 'is-active' : ''}`}
                  onClick={() => setTimeframe(tf)}
                >
                  {tf === 'day' ? '日' : tf === 'week' ? '周' : '月'}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sheets.map((sheet) => (
            <button
              key={sheet.id}
              type="button"
              className={`badge ${selectedSheets.includes(sheet.id) ? 'is-active' : ''}`}
              onClick={() =>
                setSelectedSheets((prev) =>
                  prev.includes(sheet.id) ? prev.filter((id) => id !== sheet.id) : [...prev, sheet.id]
                )
              }
            >
              {sheet.name}
            </button>
          ))}
        </div>
      </section>
      {cards.map(({ sheet, series, change }) => {
        const isActive = timeframe === 'day' && selection.sheetId === sheet.id
        const rowRefIds = sheet.rows.find((r) => r.date === selection.date)?.diaryRefs ?? []
        const dateMatches = diaries
          .filter((entry) => {
            const occurred = typeof entry.occurredAt === 'string' ? entry.occurredAt : String(entry.occurredAt ?? '')
            return occurred.slice(0, 10) === selection.date
          })
          .map((entry) => entry.id)
        const mergedIds = isActive ? Array.from(new Set([...selection.diaryIds, ...rowRefIds, ...dateMatches])) : []
        const diariesForDate = isActive ? relatedDiaries(mergedIds) : []
        return (
          <section key={sheet.id} className="section-card">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-[var(--text-muted)]">{sheet.description}</p>
                <h3 className="text-2xl font-semibold">{sheet.name}</h3>
              </div>
              <div className="text-right">
                <p className={`text-lg font-semibold ${Number(change) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {Number(change) >= 0 ? '+' : ''}
                  {change}%
                </p>
                <p className="text-xs text-[var(--text-muted)]">相较首日</p>
              </div>
            </div>
            <TradingKLine
              data={series}
              timeframe={timeframe}
              onSelectDate={(date, events) => {
                if (timeframe === 'day') {
                  setSelection({ sheetId: sheet.id, date, diaryIds: events ?? [] })
                } else {
                  const layout = timeframe === 'week' ? 'week' : 'month'
                  router.push(`/diary?layout=${layout}&focus=${date}`)
                }
              }}
            />
            {isActive && (
              <div className="mt-4">
                <p className="text-sm text-[var(--text-muted)] mb-2">
                  {selection.date} · {diariesForDate.length} 条关联日记
                </p>
                <div className="grid gap-3">
                  {diariesForDate.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                      <span>暂无关联日记，点击右侧按钮或前往日记页创建。</span>
                      <a className="badge" href="/diary">
                        去日记页
                      </a>
                    </div>
                  )}
                  {diariesForDate.map((entry) => (
                    <article key={entry.id} className="section-card">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-lg font-semibold">{entry.title}</h4>
                          <p className="text-sm text-[var(--text-muted)]">
                            {entry.tags.length > 0 ? entry.tags.join(', ') : '未打标签'}
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
        )
      })}
      <DiaryModal entry={activeDiary} onClose={() => setActiveDiary(null)} />
    </div>
  )
}
