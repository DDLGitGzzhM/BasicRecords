import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import MainNav from '@/components/nav/MainNav'
import { ThemeProvider } from '@/components/providers/ThemeProvider'

export const metadata: Metadata = {
  title: 'K-Record — Personal indicators, tightly linked',
  description: '记录事件与指标的极简工作台，内置趋势可视化与离线优先的数据层。'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var stored=localStorage.getItem('krecord-theme');var theme=stored==="light"||stored==="dark"?stored:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme;}catch(e){}})();`
          }}
        />
        <ThemeProvider>
          <div className="app-shell">
            <MainNav />
            <main>{children}</main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
