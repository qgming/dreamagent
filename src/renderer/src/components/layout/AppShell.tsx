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
import { SkillsPage } from '@/pages/SkillsPage'
import { useCreateStore } from '@/stores/create-store'
import { useProjectStore, type ProjectView } from '@/stores/project-store'
import { useSettingsStore } from '@/stores/settings-store'

const SIDEBAR_SPRING = { type: 'spring' as const, stiffness: 380, damping: 36 }

/**
 * 应用外壳：标题栏 + 侧边栏 + 主内容区
 * - 进/出「创作」：侧栏硬切（无动画），创作页立刻占满
 * - 标题栏手动折叠：保留弹簧动画
 */
export function AppShell(): React.JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  /** true = 手动折叠可用 spring；false = 进/出创作硬切，不走 motion */
  const [animateSidebar, setAnimateSidebar] = useState(true)
  const collapsedBeforeCreate = useRef(false)
  const wasCreate = useRef(false)
  useTheme()
  useBootstrapLibrary()

  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const appSurface = useProjectStore((s) => s.appSurface)
  const projectView = useProjectStore((s) => s.projectView)
  const snapshot = useProjectStore((s) => s.snapshot)
  const error = useProjectStore((s) => s.error)
  const openSettings = useSettingsStore((s) => s.openSettings)
  const createSidebarOpen = useCreateStore((s) => s.rightPanelOpen)
  const toggleCreateSidebar = useCreateStore((s) => s.toggleRightPanel)

  const isCreate = Boolean(
    appSurface === 'project' && activeProjectId && snapshot && projectView === 'create'
  )

  // 进/出创作：同帧硬切侧栏，不排队 spring
  if (isCreate !== wasCreate.current) {
    if (isCreate) {
      collapsedBeforeCreate.current = sidebarCollapsed
      wasCreate.current = true
      setAnimateSidebar(false)
      if (!sidebarCollapsed) setSidebarCollapsed(true)
    } else {
      wasCreate.current = false
      setAnimateSidebar(false)
      const restore = collapsedBeforeCreate.current
      if (sidebarCollapsed !== restore) setSidebarCollapsed(restore)
    }
  }

  useEffect(() => {
    const title = snapshot?.meta.title ? `${snapshot.meta.title} - 造梦师` : '造梦师'
    void window.api?.window?.setTitle?.(title)
  }, [snapshot?.meta.title])

  const handleToggleSidebar = (): void => {
    setAnimateSidebar(true)
    setSidebarCollapsed((value) => !value)
  }

  const showSidebar = !sidebarCollapsed

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        createSidebarOpen={createSidebarOpen}
        onOpenSettings={() => openSettings('preferences')}
        onToggleCreateSidebar={toggleCreateSidebar}
        onToggleSidebar={handleToggleSidebar}
        showCreateSidebarToggle={isCreate}
        sidebarCollapsed={sidebarCollapsed}
      />

      <div className="flex min-h-0 flex-1">
        {/* 进/出创作：DOM 硬切，创作区立刻最大宽度 */}
        {!animateSidebar ? (
          showSidebar ? (
            <div className="h-full w-60 shrink-0 overflow-hidden">
              <AppSidebar />
            </div>
          ) : null
        ) : (
          <AnimatePresence initial={false}>
            {showSidebar ? (
              <motion.div
                animate={{ width: 240, opacity: 1 }}
                className="h-full shrink-0 overflow-hidden"
                exit={{ width: 0, opacity: 0 }}
                initial={{ width: 0, opacity: 0 }}
                key="sidebar"
                transition={SIDEBAR_SPRING}
              >
                <div className="h-full w-60">
                  <AppSidebar />
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}

        <main className="relative min-w-0 flex-1 overflow-hidden bg-background">
          {error ? (
            <div className="absolute inset-x-0 top-0 z-10 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <MainView
            activeProjectId={activeProjectId}
            appSurface={appSurface}
            hasSnapshot={Boolean(snapshot)}
            projectView={projectView}
          />
        </main>
      </div>

      <SettingsModal />
      <NameFormModals />
      <ConfirmDialog />
    </div>
  )
}

function MainView({
  activeProjectId,
  appSurface,
  projectView,
  hasSnapshot
}: {
  activeProjectId: string | null
  appSurface: 'home' | 'skills' | 'project'
  projectView: ProjectView
  hasSnapshot: boolean
}): React.JSX.Element {
  if (appSurface === 'skills') return <SkillsPage />
  if (appSurface === 'project' && activeProjectId && hasSnapshot) {
    if (projectView === 'overview') return <OverviewPage />
    if (projectView === 'beats') return <BeatsPage />
    if (projectView === 'entities') return <EntitiesPage />
    return <CreatePage />
  }
  return <HomePage />
}
