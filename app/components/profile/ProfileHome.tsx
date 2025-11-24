'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { resolveAssetUrl } from '@/lib/assets'
import { savePinnedDiaries } from '@/lib/api'
import type { DiaryEntry, WeekBucket } from '@/lib/types'

type Props = {
  diaries: DiaryEntry[]
  pinnedIds: string[]
  weekBuckets?: Record<string, WeekBucket>
}

type ActivityDay = {
  date: string
  count: number
}

type ActivityData = {
  weeks: ActivityDay[][]
  stats: {
    total: number
    activeDays: number
    max: { date: string; count: number }
  }
  monthLabels: string[]
}

const WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', '', '']

function buildActivity(weekBuckets?: Record<string, WeekBucket>): ActivityData {
  const counts = new Map<string, number>()
  Object.values(weekBuckets ?? {}).forEach((bucket) => {
    Object.entries(bucket.days).forEach(([day, ids]) => {
      counts.set(day, (counts.get(day) ?? 0) + ids.length)
    })
  })
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const offset = (today.getDay() + 6) % 7 // Monday = 0
  const start = new Date(today)
  start.setDate(today.getDate() - (51 * 7 + offset))
  const days: ActivityDay[] = []
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, count: counts.get(key) ?? 0 })
  }
  const weeks: ActivityDay[][] = []
  for (let i = 0; i < days.length; i += 7) {
    const chunk = days.slice(i, i + 7)
    while (chunk.length < 7) {
      chunk.push({ date: '', count: 0 })
    }
    weeks.push(chunk)
  }
  const monthLabels: string[] = []
  let lastMonth = ''
  weeks.forEach((week, idx) => {
    const firstDay = week[0]
    const label = firstDay.date ? format(new Date(firstDay.date), 'MMM') : ''
    if (idx === 0 && label) {
      monthLabels.push(label)
      lastMonth = label
    } else if (label && label !== lastMonth) {
      monthLabels.push(label)
      lastMonth = label
    } else {
      monthLabels.push('')
    }
  })
  const stats = days.reduce(
    (acc, day) => {
      if (!day.date) return acc
      acc.total += day.count
      if (day.count > 0) acc.activeDays += 1
      if (day.count > acc.max.count) acc.max = { date: day.date, count: day.count }
      return acc
    },
    { total: 0, activeDays: 0, max: { date: '', count: 0 } }
  )
  return { weeks, stats, monthLabels }
}

function levelForCount(count: number) {
  if (count === 0) return 'level-0'
  if (count < 2) return 'level-1'
  if (count < 4) return 'level-2'
  if (count < 6) return 'level-3'
  return 'level-4'
}

function excerpt(content: string) {
  return content.replace(/[#>*`]/g, '').slice(0, 90)
}

export default function ProfileHome({ diaries, pinnedIds, weekBuckets }: Props) {
  const [pins, setPins] = useState(pinnedIds)
  const [showSearch, setShowSearch] = useState(false)
  const [search, setSearch] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const [saving, setSaving] = useState(false)

  const diaryMap = useMemo(() => new Map(diaries.map((d) => [d.id, d])), [diaries])
  const pinnedEntries = useMemo(
    () => pins.map((id) => diaryMap.get(id)).filter((item): item is DiaryEntry => Boolean(item)),
    [pins, diaryMap]
  )
  const visiblePinned = pinnedEntries.slice(0, 10)
  const activity = useMemo(() => buildActivity(weekBuckets), [weekBuckets])
  const weekCount = activity.weeks.length
  const totalDiaries = diaries.length
  const latest = diaries[0]

  const searchResults = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return diaries.slice(0, 30)
    return diaries
      .filter((entry) => {
        const target = `${entry.title} ${entry.tags.join(' ')} ${entry.content}`.toLowerCase()
        return target.includes(term)
      })
      .slice(0, 50)
  }, [diaries, search])

  const persistPins = async (next: string[]) => {
    setSaving(true)
    try {
      const updated = await savePinnedDiaries(next)
      setPins(updated.pinnedDiaryIds)
    } catch (err) {
      console.error(err)
      alert('保存置顶文章失败，请稍后再试')
    } finally {
      setSaving(false)
    }
  }

  const handlePin = (id: string) => {
    const next = [id, ...pins.filter((pid) => pid !== id)]
    void persistPins(next)
  }

  const handleUnpin = (id: string) => {
    const next = pins.filter((pid) => pid !== id)
    void persistPins(next)
  }

  return (
    <div className="grid gap-6">
      <section className="section-card profile-hero">
        <div className="profile-avatar">KR</div>
        <div className="profile-meta">
          <p className="stack-eyebrow">Personal board</p>
          <h1 className="stack-title">GitHub 风格的个人主页</h1>
          <p className="stack-description">
            汇总文章、置顶精选，以及基于 relations 的年度活跃统计。左侧导航新增「主页」入口，方便快速回到这里。
          </p>
          <div className="profile-stats">
            <div className="profile-stat">
              <div className="profile-stat__label">文章总数</div>
              <div className="profile-stat__value">{totalDiaries}</div>
            </div>
            <div className="profile-stat">
              <div className="profile-stat__label">置顶中</div>
              <div className="profile-stat__value">{pinnedEntries.length}</div>
              <span className="profile-stat__hint">主页最多展示 10 条，Detail 可查看全部</span>
            </div>
            <div className="profile-stat">
              <div className="profile-stat__label">最近更新</div>
              <div className="profile-stat__value">
                {latest ? format(new Date(latest.occurredAt), 'MM月dd日 HH:mm') : '—'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-card">
        <div className="profile-section-head">
          <div>
            <p className="stack-eyebrow">Pinned</p>
            <h3 className="profile-section-title">置顶文章</h3>
            <p className="profile-section-desc">主页最多展示前 10 条，Detail 列出全部置顶内容，方便集中阅读。</p>
          </div>
          <div className="profile-actions">
            <button className="action-button" onClick={() => setShowSearch(true)} type="button" disabled={saving}>
              置顶/搜索文章
            </button>
            <button
              className="stack-nav-link"
              onClick={() => setShowDetail(true)}
              type="button"
              disabled={pinnedEntries.length === 0}
            >
              Detail（{pinnedEntries.length}）
            </button>
          </div>
        </div>
        {visiblePinned.length > 0 ? (
          <div className="pinned-grid">
            {visiblePinned.map((entry) => {
              const background = entry.cover
                ? `linear-gradient(270deg, rgba(250, 190, 120, 0.32) 0%, rgba(250, 190, 120, 0.26) 30%, rgba(250, 190, 120, 0.1) 60%, rgba(250, 190, 120, 0) 100%), url(${resolveAssetUrl(entry.cover)})`
                : 'linear-gradient(270deg, rgba(250, 190, 120, 0.3) 0%, rgba(250, 190, 120, 0.24) 30%, rgba(250, 190, 120, 0.08) 60%, rgba(250, 190, 120, 0) 100%)'
              return (
                <article
                  key={entry.id}
                  className="pinned-card"
                  style={{
                    backgroundImage: background,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  }}
                >
                  <div className="pinned-card__mask">
                    <Link href={`/diary/${entry.id}`} className="pinned-card__body">
                      <div className="pinned-card__meta">
                        <span>{format(new Date(entry.occurredAt), 'yyyy-MM-dd')}</span>
                        <span>{entry.tags.slice(0, 2).join(' · ') || '未打标签'}</span>
                      </div>
                      <h4 className="pinned-card__title">{entry.title}</h4>
                      <p className="pinned-card__excerpt">{excerpt(entry.content)}...</p>
                    </Link>
                    <div className="pinned-card__footer">
                      <span className="pinned-card__pill">置顶</span>
                      <div className="pinned-card__actions">
                        <Link href={`/diary/${entry.id}`} className="stack-nav-link">
                          查看
                        </Link>
                        <button
                          className="stack-nav-link"
                          onClick={() => handleUnpin(entry.id)}
                          type="button"
                          disabled={saving}
                        >
                          取消置顶
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p>还没有置顶文章，点击「置顶/搜索文章」从现有内容中选取。</p>
          </div>
        )}
      </section>

      <section className="section-card">
        <div className="profile-section-head">
          <div>
            <p className="stack-eyebrow">Annual</p>
            <h3 className="profile-section-title">年度统计</h3>
            <p className="profile-section-desc">
              直接读取 relations JSON，生成 GitHub 风格的年度热力图，展示过去 52 周的写作节奏。
            </p>
          </div>
          <div className="profile-actions">
            <div className="profile-stat__label">今年总计</div>
            <div className="profile-stat__value">{activity.stats.total}</div>
            <div className="profile-stat__hint">活跃 {activity.stats.activeDays} 天</div>
          </div>
        </div>
        <div className="activity-grid">
          <div className="activity-weekdays">
            {WEEKDAY_LABELS.map((label, idx) => (
              <span key={`${label}-${idx}`}>{label}</span>
            ))}
          </div>
          <div className="activity-board" style={{ ['--activity-weeks' as any]: weekCount }}>
            <div
              className="activity-months"
              style={{ gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))` }}
            >
              {activity.monthLabels.map((label, idx) => (
                <span key={idx} className="activity-month-label">
                  {label}
                </span>
              ))}
            </div>
            <div className="activity-weeks">
              {activity.weeks.map((week, idx) => (
                <div key={idx} className="activity-week-column">
                  {week.map((day, dayIdx) => (
                    <div
                      key={`${day.date}-${dayIdx}`}
                      className={`activity-cell activity-${levelForCount(day.count)}`}
                      title={day.date ? `${day.date} · ${day.count} 篇` : ''}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="activity-legend">
          {[0, 1, 2, 4, 6].map((count) => (
            <span key={count} className={`activity-cell activity-${levelForCount(count)}`} />
          ))}
          {activity.stats.max.date && (
            <span className="profile-stat__hint">
              峰值 {activity.stats.max.count} 篇：{activity.stats.max.date}
            </span>
          )}
        </div>
      </section>

      {showDetail && (
        <div className="diary-modal-backdrop" role="dialog" aria-modal="true">
          <div className="diary-modal">
            <div className="profile-section-head">
              <div>
                <p className="stack-eyebrow">Pinned detail</p>
                <h3 className="profile-section-title">置顶列表（{pinnedEntries.length}）</h3>
                <p className="profile-section-desc">完整列表可快速取消置顶或确认顺序（按保存顺序排列）。</p>
              </div>
              <button className="stack-nav-link" onClick={() => setShowDetail(false)} type="button">
                关闭
              </button>
            </div>
            <div className="pinned-detail-list">
              {pinnedEntries.length === 0 ? (
                <div className="empty-state">暂无置顶</div>
              ) : (
                pinnedEntries.map((entry, idx) => (
                  <div key={entry.id} className="pinned-detail-row">
                    <span className="pinned-detail-rank">#{idx + 1}</span>
                    <Link href={`/diary/${entry.id}`} className="pinned-detail-combo">
                      <div className="pinned-detail-main">
                        <div className="pinned-detail-title">{entry.title}</div>
                        <div className="pinned-card__meta">
                          <span>{format(new Date(entry.occurredAt), 'yyyy-MM-dd')}</span>
                          <span>{entry.tags.join(' · ') || '未打标签'}</span>
                        </div>
                      </div>
                      <div className="pinned-detail-preview">{excerpt(entry.content)}...</div>
                    </Link>
                    <button className="stack-nav-link" onClick={() => handleUnpin(entry.id)} type="button" disabled={saving}>
                      取消
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showSearch && (
        <div className="diary-modal-backdrop" role="dialog" aria-modal="true">
          <div className="diary-modal">
            <div className="profile-section-head">
              <div>
                <p className="stack-eyebrow">Search</p>
                <h3 className="profile-section-title">搜索文章进行置顶</h3>
                <p className="profile-section-desc">
                  支持全量检索标题、标签与正文。新增置顶会追加到列表首位，主页仍只展示前 10 条。
                </p>
              </div>
              <button className="stack-nav-link" onClick={() => setShowSearch(false)} type="button">
                关闭
              </button>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="输入关键字检索文章"
              autoFocus
            />
            <div className="search-results">
              {searchResults.map((entry) => {
                const isPinned = pins.includes(entry.id)
                return (
                  <div key={entry.id} className="search-result-row">
                    <Link href={`/diary/${entry.id}`} className="search-result-main">
                      <div className="search-result-title">{entry.title}</div>
                      <div className="pinned-card__meta">
                        <span>{format(new Date(entry.occurredAt), 'yyyy-MM-dd')}</span>
                        <span>{entry.tags.join(' · ') || '未打标签'}</span>
                      </div>
                      <div className="pinned-detail-excerpt">{excerpt(entry.content)}...</div>
                    </Link>
                    <button
                      className={isPinned ? 'stack-nav-link is-active' : 'action-button'}
                      type="button"
                      onClick={() => (isPinned ? handleUnpin(entry.id) : handlePin(entry.id))}
                      disabled={saving}
                    >
                      {isPinned ? '已置顶（点击取消）' : '置顶'}
                    </button>
                  </div>
                )
              })}
              {searchResults.length === 0 && <div className="empty-state">没有匹配的文章</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
