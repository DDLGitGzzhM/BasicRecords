'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import clsx from 'clsx'
import { useThemeMode } from '@/components/providers/ThemeProvider'
import { updateRootPath } from '@/lib/api'
import type { Route } from 'next'

const NAV_ITEMS: Array<{ href: Route; label: string }> = [
  { href: '/diary' as Route, label: '日记' },
  { href: '/sheets' as Route, label: '表格' },
  { href: '/trends' as Route, label: '趋势' },
  { href: '/settings' as Route, label: '设置' }
]

export default function MainNav() {
  const pathname = usePathname()
  const router = useRouter()
  const { theme, toggleTheme, ready } = useThemeMode()
  const toggleLabel = ready ? (theme === 'dark' ? '切换白昼' : '切换黑夜') : '切换主题'
  const [demoPending, setDemoPending] = useState(false)

  const handleLoadDemo = async () => {
    if (demoPending) return
    try {
      setDemoPending(true)
      await updateRootPath('__DEFAULT__')
      router.refresh()
      window.location.reload()
    } catch (err) {
      console.error('[demo] unable to reset', err)
      setDemoPending(false)
    }
  }

  return (
    <header className="section-card">
      <div className="flex flex-col gap-2 mb-4">
        <p className="text-xs uppercase tracking-[0.35em] text-[var(--text-muted)]">K-Record</p>
        <h1 className="text-4xl font-semibold">事件 × 指标 × K 线</h1>
        <p className="text-[var(--text-muted)]">
          按页面拆分日记 / 表格 / 趋势 / 设置，确保本地事件、指标与 K 线可控并随时聚焦。
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 items-center">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link key={item.href} href={item.href} className={clsx('badge', isActive && 'is-active')}>
              {item.label}
            </Link>
          )
        })}
        <button className="badge" onClick={toggleTheme} type="button">
          {toggleLabel}
        </button>
        <button className="badge" onClick={handleLoadDemo} type="button" disabled={demoPending}>
          {demoPending ? '加载中…' : '加载 Demo 数据'}
        </button>
      </nav>
    </header>
  )
}
