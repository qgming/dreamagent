import { primaryNav, secondaryActions, type PageId } from '@/lib/navigation'
import { SidebarButton } from './SidebarButton'
import { useSettingsStore } from '@/stores/settings-store'

interface AppSidebarProps {
  /** 当前激活页面 */
  activePage: PageId
  /** 切换页面 */
  onOpenPage: (page: PageId) => void
}

/**
 * 左侧导航栏
 * 顶部：应用名称；中部：主导航；底部：设置等次要入口
 */
export function AppSidebar({
  activePage,
  onOpenPage
}: AppSidebarProps): React.JSX.Element {
  const openSettings = useSettingsStore((s) => s.openSettings)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      {/* 应用名称 */}
      <div className="px-4 pb-1 pt-4">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">造梦师</h1>
      </div>

      {/* 主导航 */}
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto p-3 app-scrollbar">
        <nav className="space-y-1">
          {primaryNav.map((item) => (
            <SidebarButton
              key={item.id}
              active={activePage === item.id}
              icon={item.icon}
              label={item.label}
              onClick={() => onOpenPage(item.id)}
            />
          ))}
        </nav>
      </div>

      {/* 底部次要操作 */}
      <div className="border-t border-border p-3">
        <nav className="space-y-1">
          {secondaryActions.map((item) => (
            <SidebarButton
              key={item.id}
              active={false}
              icon={item.icon}
              label={item.label}
              onClick={() => {
                if (item.id === 'settings') {
                  openSettings('preferences')
                }
              }}
            />
          ))}
        </nav>
      </div>
    </aside>
  )
}
