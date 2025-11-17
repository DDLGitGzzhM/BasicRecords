'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ThemeMode } from '@/lib/types'

const ThemeContext = createContext<{
  theme: ThemeMode
  setTheme: (mode: ThemeMode) => void
  toggleTheme: () => void
  ready: boolean
}>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
  ready: false
})

const STORAGE_KEY = 'krecord-theme'

function getInitialTheme(): ThemeMode {
  if (typeof document !== 'undefined') {
    const datasetTheme = document.documentElement.dataset.theme
    if (datasetTheme === 'dark' || datasetTheme === 'light') {
      return datasetTheme
    }
  }
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null
    if (stored === 'dark' || stored === 'light') {
      return stored
    }
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
    return prefersDark ? 'dark' : 'light'
  }
  return 'dark'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => getInitialTheme())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch (err) {
      console.warn('[theme] persist failed', err)
    }
  }, [theme])

  useEffect(() => {
    setReady(true)
  }, [])

  const value = useMemo(
    () => ({
      theme,
      setTheme: (mode: ThemeMode) => setThemeState(mode),
      toggleTheme: () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark')),
      ready
    }),
    [ready, theme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeMode() {
  return useContext(ThemeContext)
}
