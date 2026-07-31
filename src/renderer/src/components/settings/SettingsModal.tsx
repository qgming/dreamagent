import { Bot, Globe, Info, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle
} from '@/components/ui/dialog'
import { PreferencesPanel } from './PreferencesPanel'
import { ModelPanel } from './ModelPanel'
import { WebSearchPanel } from './WebSearchPanel'
import { AboutPanel } from './AboutPanel'
import {
  useSettingsStore,
  type SettingsSection
} from '@/stores/settings-store'
import { cn } from '@/lib/utils'

/** 导航项 */
const navItems: Array<{ id: SettingsSection; label: string; icon: LucideIcon }> = [
  { id: 'preferences', label: '偏好设置', icon: Settings2 },
  { id: 'models', label: '模型', icon: Bot },
  { id: 'web-search', label: '网络搜索', icon: Globe },
  { id: 'about', label: '关于', icon: Info }
]

/** 导航分组 */
const navGroups: Array<{ title: string; items: SettingsSection[] }> = [
  { title: '通用', items: ['preferences', 'models', 'web-search'] },
  { title: '关于', items: ['about'] }
]

/**
 * 设置大模态窗
 * 左：导航；右：对应面板
 */
export function SettingsModal(): React.JSX.Element {
  const open = useSettingsStore((s) => s.settingsOpen)
  const setOpen = useSettingsStore((s) => s.setSettingsOpen)
  const activeSection = useSettingsStore((s) => s.activeSection)
  const setActiveSection = useSettingsStore((s) => s.setActiveSection)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="h-[min(780px,calc(100vh-3rem))] w-[min(980px,calc(100vw-3rem))] max-w-none overflow-hidden p-0 sm:max-w-none"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">设置</DialogTitle>

        <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)]">
          <aside className="app-scrollbar min-h-0 overflow-y-auto border-r border-border bg-muted/25 p-4">
            <div className="px-2 pb-3 pr-8">
              <h2 className="text-2xl font-semibold tracking-tight">设置</h2>
            </div>
            <div className="mt-4">
              {navGroups.map((group, index) => (
                <div key={group.title} className={index > 0 ? 'mt-4' : undefined}>
                  <p className="mb-1 px-2 text-[11px] font-medium text-muted-foreground">
                    {group.title}
                  </p>
                  <nav className="space-y-1">
                    {group.items.map((itemId) => {
                      const item = navItems.find((n) => n.id === itemId)
                      if (!item) return null
                      return (
                        <SettingsNavButton
                          key={item.id}
                          active={activeSection === item.id}
                          icon={item.icon}
                          label={item.label}
                          onClick={() => setActiveSection(item.id)}
                        />
                      )
                    })}
                  </nav>
                </div>
              ))}
            </div>
          </aside>

          <main className="app-scrollbar min-h-0 min-w-0 overflow-y-auto px-8 py-7">
            <div className="mx-auto w-full max-w-2xl">
              {activeSection === 'preferences' ? <PreferencesPanel /> : null}
              {activeSection === 'models' ? <ModelPanel /> : null}
              {activeSection === 'web-search' ? <WebSearchPanel /> : null}
              {activeSection === 'about' ? <AboutPanel /> : null}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 设置左侧导航按钮
 */
function SettingsNavButton({
  active,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
