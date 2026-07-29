import { useEffect, useState } from 'react'
import { useSettingsStore, type ThemeMode } from '@/stores/settings-store'

export type { ThemeMode }

/**
 * 根据主题模式计算是否应启用深色
 */
function resolveIsDark(theme: ThemeMode): boolean {
  if (theme === 'dark') return true
  if (theme === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * 将深色状态应用到 <html>
 */
function applyDarkClass(isDark: boolean): void {
  document.documentElement.classList.toggle('dark', isDark)
}

/**
 * 主题 hook：从 settings-store 读取主题，并同步到 DOM
 */
export function useTheme(): {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  isDark: boolean
} {
  const theme = useSettingsStore((s) => s.settings.appearance.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const [isDark, setIsDark] = useState(() => resolveIsDark(theme))

  useEffect(() => {
    const sync = (): void => {
      const dark = resolveIsDark(theme)
      setIsDark(dark)
      applyDarkClass(dark)
    }

    sync()

    // system 模式下监听系统偏好变化
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [theme])

  return { theme, setTheme, isDark }
}
