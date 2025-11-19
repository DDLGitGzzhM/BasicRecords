'use client'

import { DirectoryBrowser } from './DirectoryBrowser'

import { useState } from 'react'
import { exportDataPackage, pickRootPath, updateRootPath } from '@/lib/api'

export function SettingsPanel({ initialRoot, defaultRoot }: { initialRoot: string; defaultRoot: string }) {
  const [rootPath, setRootPath] = useState(initialRoot)
  const [status, setStatus] = useState<string>('')
  const [pending, setPending] = useState(false)
  const [picking, setPicking] = useState(false)
  const [exporting, setExporting] = useState(false)

  const persist = async (path: string) => {
    setPending(true)
    setStatus('')
    try {
      const updated = await updateRootPath(path)
      setRootPath(updated)
      setStatus('数据目录已更新，页面将重新加载以应用最新内容。')
      window.location.reload()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '更新失败')
    } finally {
      setPending(false)
    }
  }

  const handlePick = async () => {
    setPicking(true)
    setStatus('')
    try {
      const updated = await pickRootPath()
      setRootPath(updated)
      setStatus('已通过系统文件管理器更新数据根目录，页面将重新加载。')
      window.location.reload()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '选择失败')
    } finally {
      setPicking(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setStatus('')
    try {
      const { blob, filename } = await exportDataPackage()
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setStatus('数据已打包为 ZIP，可备份到本地或同步磁盘。')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="section-card">
      <div className="page-heading">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Control</p>
          <h2 className="text-3xl font-semibold">设置 / 备份</h2>
        </div>
        <button className="action-button" type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? '正在打包...' : '导出 .krecord'}
        </button>
      </div>
      <div className="mt-6 space-y-4">
        <div>
          <p className="text-sm text-[var(--text-muted)]">当前根目录</p>
          <p className="font-mono text-sm break-all bg-[var(--surface-muted)] rounded px-3 py-2 mt-1">{rootPath}</p>
        </div>
        <DirectoryBrowser initialPath={rootPath} disabled={pending || picking} onSelect={persist} />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" type="button" disabled={pending || picking} onClick={handlePick}>
            {picking ? '等待系统选择...' : '打开系统文件管理器'}
          </button>
          <button className="badge" type="button" disabled={pending || picking} onClick={() => persist('__DEFAULT__')}>
            加载 Demo 数据
          </button>
        </div>
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </div>
      <div className="callout">
        <p>示例 Demo 根目录：{defaultRoot}</p>
      </div>
    </div>
  )
}
