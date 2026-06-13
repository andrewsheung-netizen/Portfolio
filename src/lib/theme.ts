export type Theme = 'dark' | 'light'

const KEY = 'theme'
const THEME_COLOR: Record<Theme, string> = { dark: '#0d1a20', light: '#eff3f5' }

/** The persisted theme, defaulting to the brand's dark. */
export function getTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/** Apply a theme to the document, persist it, and sync the PWA status-bar colour. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme])
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private mode — theme just won't persist */
  }
}
