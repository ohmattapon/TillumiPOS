import { createContext, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'

export const themes = ['light', 'dark', 'midnight', 'forest', 'rose'] as const
export type Theme = (typeof themes)[number]

const STORAGE_KEY = 'pos.theme'
const isTheme = (value: unknown): value is Theme => themes.includes(value as Theme)

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('dark', theme === 'dark' || theme === 'midnight')
  root.style.colorScheme = theme === 'dark' || theme === 'midnight' ? 'dark' : 'light'
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Keep the current page usable when browser storage is unavailable.
  }
}

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme)

  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
