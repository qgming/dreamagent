import {
  BookOpen,
  ChevronRight,
  CircleDot,
  Home,
  LayoutDashboard,
  MoreHorizontal,
  Pencil,
  Plug,
  Plus,
  Settings,
  Sparkles,
  Trash2,
  Users
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { SidebarButton } from './SidebarButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import { useSettingsStore } from '@/stores/settings-store'
import { useProjectStore, type ProjectView } from '@/stores/project-store'

/**
 * 左侧导航：上（通用） / 中（项目，展开带动画） / 下（设置）
 */
export function AppSidebar(): React.JSX.Element {
  const openSettings = useSettingsStore((s) => s.openSettings)

  const library = useProjectStore((s) => s.library)
  const expandedProjectIds = useProjectStore((s) => s.expandedProjectIds)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const appSurface = useProjectStore((s) => s.appSurface)
  const projectView = useProjectStore((s) => s.projectView)
  const snapshot = useProjectStore((s) => s.snapshot)

  const toggleProjectExpanded = useProjectStore((s) => s.toggleProjectExpanded)
  const openProject = useProjectStore((s) => s.openProject)
  const openSkills = useProjectStore((s) => s.openSkills)
  const openMcp = useProjectStore((s) => s.openMcp)
  const openCreateProjectModal = useProjectStore((s) => s.openCreateProjectModal)
  const openEditProjectModal = useProjectStore((s) => s.openEditProjectModal)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const closeProject = useProjectStore((s) => s.closeProject)

  const openView = (projectId: string, view: ProjectView): void => {
    // 同步切换：进创作立刻满宽，不排队 transition
    if (snapshot?.meta.id === projectId) {
      useProjectStore.setState({
        activeProjectId: projectId,
        appSurface: 'project',
        projectView: view
      })
      return
    }
    void openProject(projectId, view)
  }

  const handleDeleteProject = (projectId: string, title: string): void => {
    void (async () => {
      const ok = await confirmDelete({
        title: '删除项目',
        description: `确定删除项目「${title}」？\n将移除整个项目文件夹且不可恢复。`
      })
      if (!ok) return
      void deleteProject(projectId)
    })()
  }

  const isAppHome = appSurface === 'home'
  const isSkills = appSurface === 'skills'
  const isMcp = appSurface === 'mcp'

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="px-4 pb-1 pt-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">造梦师</h1>
      </div>

      <div className="px-3 pt-2">
        <SectionLabel>通用</SectionLabel>
        <nav className="space-y-1">
          <SidebarButton active={isAppHome} icon={Home} label="首页" onClick={closeProject} />
          <SidebarButton active={isSkills} icon={Sparkles} label="技能" onClick={openSkills} />
          <SidebarButton active={isMcp} icon={Plug} label="MCP" onClick={openMcp} />
        </nav>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col px-3">
        <div className="mb-1 flex items-center justify-between gap-2">
          <SectionLabel className="mb-0">项目</SectionLabel>
          <TooltipHint label="新建项目">
            <button
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={openCreateProjectModal}
              type="button"
            >
              <Plus className="size-4" />
            </button>
          </TooltipHint>
        </div>

        <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto app-scrollbar">
          {library.length === 0 ? (
            <p className="px-2 py-4 text-xs text-muted-foreground">还没有项目</p>
          ) : (
            library.map((project) => {
              const expanded = expandedProjectIds.includes(project.id)
              const isActiveProject =
                appSurface === 'project' && activeProjectId === project.id

              return (
                <div key={project.id}>
                  <div
                    className={cn(
                      'group flex h-9 items-center gap-0.5 rounded-md px-1.5 text-sm transition-colors',
                      isActiveProject
                        ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
                        : 'text-sidebar-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    <button
                      className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-muted"
                      onClick={() => toggleProjectExpanded(project.id)}
                      type="button"
                    >
                      <motion.span
                        animate={{ rotate: expanded ? 90 : 0 }}
                        className="inline-flex"
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                      >
                        <ChevronRight className="size-3.5" />
                      </motion.span>
                    </button>
                    <TooltipHint label={project.title} side="right">
                      <button
                        className="min-w-0 flex-1 truncate text-left font-medium"
                        onClick={() => toggleProjectExpanded(project.id)}
                        type="button"
                      >
                        {project.title}
                      </button>
                    </TooltipHint>

                    <DropdownMenu>
                      <TooltipHint label="更多">
                        <DropdownMenuTrigger
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none',
                            'opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100',
                            'data-[state=open]:bg-muted data-[state=open]:text-foreground data-[state=open]:opacity-100'
                          )}
                          type="button"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </DropdownMenuTrigger>
                      </TooltipHint>
                      <DropdownMenuContent align="end" side="bottom">
                        <DropdownMenuItem onSelect={() => openEditProjectModal(project.id)}>
                          <Pencil className="size-3.5" />
                          编辑
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => handleDeleteProject(project.id, project.title)}
                          variant="destructive"
                        >
                          <Trash2 className="size-3.5" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <AnimatePresence initial={false}>
                    {expanded ? (
                      <motion.div
                        animate={{ height: 'auto', opacity: 1 }}
                        className="overflow-hidden"
                        exit={{ height: 0, opacity: 0 }}
                        initial={{ height: 0, opacity: 0 }}
                        key={`${project.id}-sub`}
                        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                      >
                        <div className="mb-1 ml-3 space-y-0.5 border-l border-border pl-2">
                          <SubNavButton
                            active={isActiveProject && projectView === 'overview'}
                            icon={LayoutDashboard}
                            label="概览"
                            onClick={() => openView(project.id, 'overview')}
                          />
                          <SubNavButton
                            active={isActiveProject && projectView === 'beats'}
                            icon={CircleDot}
                            label="节点"
                            onClick={() => openView(project.id, 'beats')}
                          />
                          <SubNavButton
                            active={isActiveProject && projectView === 'entities'}
                            icon={Users}
                            label="实体"
                            onClick={() => openView(project.id, 'entities')}
                          />
                          <SubNavButton
                            active={isActiveProject && projectView === 'create'}
                            icon={BookOpen}
                            label="创作"
                            onClick={() => openView(project.id, 'create')}
                          />
                          <p className="px-2 py-1 text-[10px] text-muted-foreground">
                            {project.beatCount} 节点 · {project.entityCount} 实体 ·{' '}
                            {project.chapterCount} 文章
                          </p>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )
            })
          )}
        </div>
      </div>

      <div className="border-t border-border p-3">
        <nav className="space-y-1">
          <SidebarButton
            active={false}
            icon={Settings}
            label="设置"
            onClick={() => openSettings('preferences')}
          />
        </nav>
      </div>
    </aside>
  )
}

function SectionLabel({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80',
        className
      )}
    >
      {children}
    </div>
  )
}

function SubNavButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs font-medium transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-sidebar-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
