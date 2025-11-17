'use client'

import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import type { DiaryEntry } from '@/lib/types'

type Props = {
  entry: DiaryEntry
  onSelect?: (entry: DiaryEntry) => void
}

export function EventCard({ entry, onSelect }: Props) {
  const router = useRouter()
  const excerpt = entry.content.replace(/[#>*`-]/g, '').slice(0, 120)

  const handleOpen = () => {
    if (onSelect) {
      onSelect(entry)
    } else {
      router.push(`/diary/${entry.id}`)
    }
  }

  return (
    <article
      className="section-card cursor-pointer transition hover:-translate-y-1 focus:outline-none focus:ring"
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleOpen()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="flex items-center justify-between mb-1 text-sm text-[var(--text-muted)]">
        <span>{format(new Date(entry.occurredAt), 'MM月dd日 HH:mm')}</span>
        <span>{entry.mood}</span>
      </div>
      <h3 className="text-xl font-semibold">{entry.title}</h3>
      <p className="text-[var(--text-muted)] text-sm mt-1 leading-relaxed">{excerpt}...</p>
      {entry.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs mt-3 text-[var(--text-muted)]">
          {entry.tags.map((tag) => (
            <span key={tag} className="badge">
              #{tag}
            </span>
          ))}
        </div>
      )}
      {entry.attachments.length > 0 && (
        <div className="text-xs text-[var(--text-muted)] mt-2">{entry.attachments.length} 个附件</div>
      )}
    </article>
  )
}
