import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 主题模式 */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 设置分区 */
export type SettingsSection = 'preferences' | 'about'

/** 外观设置 */
export interface AppearanceSettings {
  theme: ThemeMode
}

/** 应用设置（可扩展） */
export interface AppSettings {
  appearance: AppearanceSettings
}

interface SettingsState {
  /** 设置内容 */
  settings: AppSettings
  /** 设置模态窗是否打开 */
  settingsOpen: boolean
  /** 当前设置分区 */
  activeSection: SettingsSection

  /** 打开设置模态窗 */
  openSettings: (section?: SettingsSection) => void
  /** 关闭设置模态窗 */
  closeSettings: () => void
  /** 切换模态窗开合 */
  setSettingsOpen: (open: boolean) => void
  /** 切换设置分区 */
  setActiveSection: (section: SettingsSection) => void
  /** 更新外观设置 */
  updateAppearance: (updates: Partial<AppearanceSettings>) => void
  /** 设置主题 */
  setTheme: (theme: ThemeMode) => void
}

const defaultSettings: AppSettings = {
  appearance: {
    theme: 'system'
  }
}

/** 旧版 localStorage 主题 key，用于迁移 */
const LEGACY_THEME_KEY = 'dreamagent.theme'

/**
 * 从旧 key 迁移主题偏好
 */
function readLegacyTheme(): ThemeMode | null {
  try {
    const value = localStorage.getItem(LEGACY_THEME_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') {
      return value
    }
  } catch {
    // 忽略
  }
  return null
}

/**
 * 设置 store：偏好持久化 + 设置模态窗 UI 状态
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      settingsOpen: false,
      activeSection: 'preferences',

      openSettings: (section = 'preferences') => {
        set({ settingsOpen: true, activeSection: section })
      },

      closeSettings: () => {
        set({ settingsOpen: false })
      },

      setSettingsOpen: (open) => {
        set({ settingsOpen: open })
      },

      setActiveSection: (section) => {
        set({ activeSection: section })
      },

      updateAppearance: (updates) => {
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: {
              ...state.settings.appearance,
              ...updates
            }
          }
        }))
      },

      setTheme: (theme) => {
        set((state) => ({
          settings: {
            ...state.settings,
            appearance: {
              ...state.settings.appearance,
              theme
            }
          }
        }))
      }
    }),
    {
      name: 'dreamagent.settings',
      // 只持久化设置内容，不持久化模态窗开合状态
      partialize: (state) => ({
        settings: state.settings
      }),
      // 首次水合：若无新存储，则从旧主题 key 迁移
      merge: (persisted, current) => {
        const legacy = readLegacyTheme()
        const persistedState = persisted as Partial<SettingsState> | undefined
        const hasPersistedTheme = Boolean(persistedState?.settings?.appearance?.theme)

        if (!hasPersistedTheme && legacy) {
          try {
            localStorage.removeItem(LEGACY_THEME_KEY)
          } catch {
            // 忽略
          }
          return {
            ...current,
            ...persistedState,
            settings: {
              ...current.settings,
              appearance: {
                ...current.settings.appearance,
                theme: legacy
              }
            }
          }
        }

        if (legacy) {
          try {
            localStorage.removeItem(LEGACY_THEME_KEY)
          } catch {
            // 忽略
          }
        }

        return {
          ...current,
          ...persistedState,
          settings: {
            ...current.settings,
            ...(persistedState?.settings ?? {}),
            appearance: {
              ...current.settings.appearance,
              ...(persistedState?.settings?.appearance ?? {})
            }
          }
        }
      }
    }
  )
)
