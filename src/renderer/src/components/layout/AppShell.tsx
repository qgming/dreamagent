import { useState } from 'react'
import { TitleBar } from '@/components/TitleBar'
import { AppSidebar } from '@/components/sidebar/AppSidebar'
import { SettingsModal } from '@/components/settings/SettingsModal'
import { useTheme } from '@/hooks/useTheme'
import type { PageId } from '@/lib/navigation'

/**
 * 应用外壳：标题栏 + 侧边栏 + 主内容区
 * 后续页面内容都挂载在这里
 */
export function AppShell(): React.JSX.Element {
  const [activePage, setActivePage] = useState<PageId>('home')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // 挂载主题同步
  useTheme()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
      />

      <div className="flex min-h-0 flex-1">
        {!sidebarCollapsed ? (
          <AppSidebar activePage={activePage} onOpenPage={setActivePage} />
        ) : null}

        <main className="min-w-0 flex-1 overflow-hidden bg-background">
          <PagePlaceholder page={activePage} />
        </main>
      </div>

      {/* 设置大模态窗 */}
      <SettingsModal />
    </div>
  )
}

/**
 * 页面占位内容（后续替换为真实页面）
 */
function PagePlaceholder({ page }: { page: PageId }): React.JSX.Element {
  const titles: Record<PageId, { title: string; desc: string }> = {
    home: { title: '首页', desc: '欢迎使用造梦师，从这里开始你的创作之旅。' },
    create: { title: '创作', desc: '创作工作台将在这里展开。' },
    projects: { title: '项目', desc: '管理你的全部造梦项目。' }
  }

  const current = titles[page]

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {current.title}
          </h1>
          <p className="max-w-md text-sm text-muted-foreground">{current.desc}</p>
        </div>
      </div>
    </div>
  )
}
