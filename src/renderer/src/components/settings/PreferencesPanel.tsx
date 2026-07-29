import { PageTitle, SettingDropdown, SettingRow } from './settings-shared'
import { useSettingsStore, type ThemeMode } from '@/stores/settings-store'

/**
 * 偏好设置面板
 */
export function PreferencesPanel(): React.JSX.Element {
  const theme = useSettingsStore((s) => s.settings.appearance.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  return (
    <section>
      <PageTitle title="偏好设置" description="管理外观与基础偏好。" />

      <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
        <SettingRow
          title="主题亮暗"
          description="选择浅色、深色或跟随系统。"
          control={
            <SettingDropdown
              value={theme}
              onChange={(value) => setTheme(value as ThemeMode)}
              options={[
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
                { value: 'system', label: '跟随系统' }
              ]}
            />
          }
        />
      </div>
    </section>
  )
}
