'use client'

import { useCallback, useEffect, useState } from 'react'
import { browseDirectories } from '@/lib/api'
import type { DirectoryListing } from '@/lib/types'

type DirectoryBrowserProps = {
  initialPath: string
  disabled?: boolean
  onSelect: (path: string) => void | Promise<void>
}

export function DirectoryBrowser({ initialPath, disabled, onSelect }: DirectoryBrowserProps) {
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchListing = useCallback(async (target?: string) => {
    setLoading(true)
    setError('')
    try {
      const data = await browseDirectories(target)
      setListing(data)
      setSelectedEntry((prev) => {
        if (data.entries.length === 0) {
          return ''
        }
        const exists = data.entries.some((entry) => entry.path === prev)
        return exists ? prev : data.entries[0].path
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '无法读取目录结构')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchListing(initialPath)
  }, [fetchListing, initialPath])

  const handleEnter = () => {
    if (!selectedEntry) return
    fetchListing(selectedEntry)
  }

  const handleSelect = (path: string) => {
    if (disabled) return
    onSelect(path)
  }

  const handleGoParent = () => {
    if (!listing?.parent) return
    fetchListing(listing.parent)
  }

  const handleRefresh = () => {
    fetchListing(listing?.cwd ?? initialPath)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm text-[var(--text-muted)]">浏览位置</p>
          <p className="font-mono text-sm break-all">{listing?.cwd ?? '读取中...'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="badge" type="button" onClick={handleGoParent} disabled={!listing?.parent || loading}>
            返回上级
          </button>
          <button className="badge" type="button" onClick={() => fetchListing(initialPath)} disabled={loading}>
            回到当前根
          </button>
          <button className="badge" type="button" onClick={handleRefresh} disabled={loading}>
            刷新列表
          </button>
        </div>
      </div>
      <div>
        <label className="text-sm text-[var(--text-muted)] mb-2 block">子目录</label>
        <select
          className="unreset w-full font-mono text-sm"
          size={8}
          value={selectedEntry}
          onChange={(e) => setSelectedEntry(e.target.value)}
          disabled={loading || disabled}
        >
          {listing?.entries.map((entry) => (
            <option key={entry.path} value={entry.path}>
              {entry.name}
              {entry.hasContentPackage ? ' · 包含 content/' : ''}
            </option>
          ))}
        </select>
        {listing?.entries.length === 0 && !loading && (
          <p className="text-sm text-[var(--text-muted)] mt-2">该目录暂无子目录</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="action-button"
          type="button"
          onClick={() => listing && handleSelect(listing.cwd)}
          disabled={loading || disabled || !listing}
        >
          {loading ? '读取中...' : '使用当前目录'}
        </button>
        <button className="badge" type="button" onClick={handleEnter} disabled={!selectedEntry || loading}>
          进入所选
        </button>
        <button
          className="badge"
          type="button"
          onClick={() => selectedEntry && handleSelect(selectedEntry)}
          disabled={!selectedEntry || loading || disabled}
        >
          使用所选目录
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
