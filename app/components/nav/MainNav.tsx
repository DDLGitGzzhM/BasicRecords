'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import clsx from 'clsx'
import { useThemeMode } from '@/components/providers/ThemeProvider'
import type { Route } from 'next'

const NAV_ITEMS: Array<{ href: Route; label: string }> = [
  { href: '/diary' as Route, label: '日记' },
  { href: '/sheets' as Route, label: '表格' },
  { href: '/trends' as Route, label: '趋势' },
  { href: '/vision-canvas' as Route, label: '品质精神' },
  { href: '/settings' as Route, label: '设置' }
]

export default function MainNav() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useThemeMode()
  // 直接使用 theme，不依赖 ready，避免 hydration mismatch
  const toggleLabel = theme === 'dark' ? '切换白昼' : '切换黑夜'

  return (
    <div className="stack-nav-inner">
      <nav className="stack-nav-links stack-nav-links--compact">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link key={item.href} href={item.href} className={clsx('stack-nav-link', isActive && 'is-active')}>
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="stack-nav-actions stack-nav-links--compact">
        <button className="stack-nav-link" onClick={toggleTheme} type="button" suppressHydrationWarning>
          {toggleLabel}
        </button>
      </div>
    </div>
  )
}
