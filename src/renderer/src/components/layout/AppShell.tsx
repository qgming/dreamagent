import { useEffect, useState } from 'react'
import { TitleBar } from '@/components/TitleBar'
import { AppSidebar } from '@/components/sidebar/AppSidebar'
import { NameFormModals } from '@/components/NameFormModals'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { useTheme } from '@/hooks/useTheme'
import { BeatsPage } from '@/pages/BeatsPage'
import { CreatePage } from '@/pages/CreatePage'
import { EntitiesPage } from '@/pages/EntitiesPage'
import { HomePage, useBootstrapLibrary } from '@/pages/HomePage'
import { useProjectStore } from '@/stores/project-store'

/**
 * 应用外壳：标题栏 + 侧边栏 + 主内容区
 */
export function AppShell(): React.JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useTheme()
  useBootstrapLibrary()

  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projectView = useProjectStore((s) => s.projectView)
  const snapshot = useProjectStore((s) => s.snapshot)
  const error = useProjectStore((s) => s.error)

  // 窗口标题跟随当前项目
  useEffect(() => {
    const title = snapshot?.meta.title ? `${snapshot.meta.title} - 造梦师` : '造梦师'
    void window.api?.window?.setTitle?.(title)
  }, [snapshot?.meta.title])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      />

      <div className="flex min-h-0 flex-1">
        {!sidebarCollapsed ? <AppSidebar /> : null}

        <main className="relative min-w-0 flex-1 overflow-hidden bg-background">
          {error ? (
            <div className="absolute inset-x-0 top-0 z-10 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {activeProjectId && snapshot ? (
            projectView === 'beats' ? (
              <BeatsPage />
            ) : projectView === 'entities' ? (
              <EntitiesPage />
            ) : (
              <CreatePage />
            )
          ) : (
            <HomePage />
          )}
        </main>
      </div>

      <SettingsModal />
      <NameFormModals />
    </div>
  )
}
