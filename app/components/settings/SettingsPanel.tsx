'use client'

import { useState } from 'react'
import { updateRootPath } from '@/lib/api'

export function SettingsPanel({ initialRoot, defaultRoot }: { initialRoot: string; defaultRoot: string }) {
  const [rootPath, setRootPath] = useState(initialRoot)
  const [status, setStatus] = useState<string>('')
  const [pending, setPending] = useState(false)

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

  return (
    <div className="section-card">
      <div className="page-heading">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Control</p>
          <h2 className="text-3xl font-semibold">设置 / 备份</h2>
        </div>
        <button className="action-button" type="button">
          导出 .krecord
        </button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <article>
          <h3 className="text-xl font-semibold">数据根目录</h3>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            结构规范：<code>{'{ package: "dailyReport" }'}</code> 存储 Markdown 日记，<code>{'{ package: "table" }'}</code>{' '}
            存储 CSV 指标，根目录包含 <code>relations.json</code>，可通过右侧输入框切换自定义路径（如 NAS/外部磁盘）。
          </p>
        </article>
        <article>
          <h3 className="text-xl font-semibold">同步 / 插件</h3>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            已预留 NATS + gRPC 插件总线，M3 将接入 Temporal 工作流与可选云同步守护。
          </p>
        </article>
      </div>
      <div className="mt-6 space-y-3">
        <label className="text-sm text-[var(--text-muted)]">当前根目录</label>
        <input value={rootPath} onChange={(e) => setRootPath(e.target.value)} className="unreset" />
        <div className="flex flex-wrap gap-3">
          <button className="action-button" type="button" disabled={pending} onClick={() => persist(rootPath)}>
            保存路径
          </button>
          <button className="badge" type="button" disabled={pending} onClick={() => persist('__DEFAULT__')}>
            恢复示例数据
          </button>
        </div>
        {status && <p className="text-sm text-[var(--text-muted)]">{status}</p>}
      </div>
      <div className="callout">
        <p>示例 Demo 根目录：{defaultRoot}</p>
        <p>下一阶段：接入 SQLite + manifest 扫描 + Service Worker 备份，将多端同步与插件接口纳入同一鉴权体系。</p>
      </div>
    </div>
  )
}
