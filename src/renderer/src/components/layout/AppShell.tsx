import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { TitleBar } from '@/components/TitleBar'
import { AppSidebar } from '@/components/sidebar/AppSidebar'
import { NameFormModals } from '@/components/NameFormModals'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useTheme } from '@/hooks/useTheme'
import { BeatsPage } from '@/pages/BeatsPage'
import { CreatePage } from '@/pages/CreatePage'
import { EntitiesPage } from '@/pages/EntitiesPage'
import { HomePage, useBootstrapLibrary } from '@/pages/HomePage'
import { OverviewPage } from '@/pages/OverviewPage'
import { useProjectStore } from '@/stores/project-store'

/**
 * 应用外壳：标题栏 + 侧边栏（带动画） + 主内容区
 * 进入「创作」时沉浸式自动收起侧栏，离开时恢复
 */
export function AppShell(): React.JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const collapsedBeforeCreate = useRef(false)
  const wasCreate = useRef(false)
  useTheme()
  useBootstrapLibrary()

  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const projectView = useProjectStore((s) => s.projectView)
  const snapshot = useProjectStore((s) => s.snapshot)
  const error = useProjectStore((s) => s.error)

  const isCreate = Boolean(activeProjectId && snapshot && projectView === 'create')

  useEffect(() => {
    if (isCreate && !wasCreate.current) {
      // 进入创作：记下当前开合，强制收起
      setSidebarCollapsed((prev) => {
        collapsedBeforeCreate.current = prev
        return true
      })
      wasCreate.current = true
    } else if (!isCreate && wasCreate.current) {
      setSidebarCollapsed(collapsedBeforeCreate.current)
      wasCreate.current = false
    }
  }, [isCreate])

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
        <AnimatePresence initial={false}>
          {!sidebarCollapsed ? (
            <motion.div
              animate={{ width: 240, opacity: 1 }}
              className="h-full shrink-0 overflow-hidden"
              exit={{ width: 0, opacity: 0 }}
              initial={{ width: 0, opacity: 0 }}
              key="sidebar"
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <div className="h-full w-60">
                <AppSidebar />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <main className="relative min-w-0 flex-1 overflow-hidden bg-background">
          {error ? (
            <div className="absolute inset-x-0 top-0 z-10 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          {activeProjectId && snapshot ? (
            projectView === 'overview' ? (
              <OverviewPage />
            ) : projectView === 'beats' ? (
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
      <ConfirmDialog />
    </div>
  )
}
