'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { DiaryEntry } from '@/lib/types'
import { resolveAssetUrl } from '@/lib/assets'

const renderAttachment = (path: string) => {
  if (path.startsWith('file://')) {
    return (
      <div className="text-sm text-[var(--text-muted)] break-all">
        <code>{path}</code>
      </div>
    )
  }
  const url = resolveAssetUrl(path)
  const lower = path.toLowerCase()
  if (lower.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
    return <img src={url} alt={path} className="rounded-lg w-full object-cover" loading="lazy" />
  }
  if (lower.match(/\.(mp4|mov|webm)$/)) {
    return <video src={url} controls className="w-full rounded-lg" />
  }
  if (lower.match(/\.(mp3|wav|m4a)$/)) {
    return (
      <audio controls className="w-full">
        <source src={url} />
      </audio>
    )
  }
  return (
    <a href={url} className="text-[var(--accent)]" target="_blank" rel="noreferrer">
      {path}
    </a>
  )
}

type Props = {
  entry: DiaryEntry | null
  onClose?: () => void
  onEdit?: (entry: DiaryEntry) => void
  onDelete?: (id: string) => void
  renderOnly?: boolean
}

const normalizeSrc = (src?: string) => {
  if (!src) return ''
  if (/^(https?:|data:|file:)/.test(src)) return src
  return resolveAssetUrl(src)
}

const mediaStyles: React.CSSProperties = {
  maxWidth: '560px',
  maxHeight: '420px',
  width: '100%',
  height: 'auto',
  borderRadius: 12,
  objectFit: 'contain'
}

const markdownComponents = {
  img: ({ src, alt, width, height }: { src?: string; alt?: string; width?: string; height?: string }) => {
    if (!src) return null
    const resolved = normalizeSrc(src)
    return (
      <img
        src={resolved}
        alt={alt ?? ''}
        loading="lazy"
        style={{
          ...mediaStyles,
          width: width ? `${width}` : mediaStyles.width,
          height: height ? `${height}` : mediaStyles.height
        }}
      />
    )
  },
  a: ({ href, children }: { href?: string; children: React.ReactNode }) => {
    if (!href) return null
    const lower = href.toLowerCase()
    if (lower.match(/\.(mp4|mov|webm)$/)) {
      return (
        <video src={resolveAssetUrl(href)} controls className="w-full rounded-lg" playsInline preload="metadata">
          <track kind="captions" />
        </video>
      )
    }
    return (
      <a href={resolveAssetUrl(href)} className="text-[var(--accent)]" target="_blank" rel="noreferrer">
        {children}
      </a>
    )
  },
  video: ({ src, children }: { src?: string; children?: React.ReactNode }) => {
    if (!src) return null
    return (
      <video src={normalizeSrc(src)} controls style={mediaStyles} playsInline preload="metadata">
        {children}
      </video>
    )
  },
  source: ({ src, type }: { src?: string; type?: string }) => {
    if (!src) return null
    return <source src={normalizeSrc(src)} type={type} />
  }
}

export function DiaryModal({ entry, onClose, onEdit, onDelete, renderOnly }: Props) {
  if (!entry) return null
  const closeHandler = onClose ?? (() => {})

  const content = (
    <>
      {entry.cover && (
        <div className="mb-4 flex justify-center">
          <img src={resolveAssetUrl(entry.cover)} alt={entry.title} className="w-full max-w-3xl rounded-xl object-cover" />
        </div>
      )}
      <header className="flex items-center justify-between mb-4 gap-3">
        <div>
          <p className="text-xs text-[var(--text-muted)]">{new Date(entry.occurredAt).toLocaleString()}</p>
          <h3 className="text-2xl font-semibold">{entry.title}</h3>
        </div>
        {!renderOnly && (
          <div className="flex flex-wrap gap-2">
            {onEdit && (
              <button
                className="badge"
                onClick={() => {
                  onEdit(entry)
                  closeHandler()
                }}
                type="button"
              >
                编辑
              </button>
            )}
            {onDelete && (
              <button
                className="badge"
                onClick={() => {
                  onDelete(entry.id)
                  closeHandler()
                }}
                type="button"
              >
                删除
              </button>
            )}
            <button className="badge" onClick={closeHandler} type="button">
              关闭
            </button>
          </div>
        )}
      </header>
      <article className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} components={markdownComponents}>
          {entry.content}
        </ReactMarkdown>
      </article>
      {entry.attachments.length > 0 && (
        <section className="mt-6 space-y-3">
          <p className="text-sm text-[var(--text-muted)]">附件</p>
          {entry.attachments.map((attachment) => (
            <div key={attachment} className="attachment">
              {renderAttachment(attachment)}
            </div>
          ))}
        </section>
      )}
    </>
  )

  return (
    <>
      {renderOnly ? (
        <div className="section-card">{content}</div>
      ) : (
        <div className="diary-modal-backdrop" onClick={closeHandler}>
          <div className="diary-modal" onClick={(e) => e.stopPropagation()}>
            {content}
          </div>
        </div>
      )}
    </>
  )
}
