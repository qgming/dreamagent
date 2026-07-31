import { Bot, Globe, Info, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
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
        className="max-h-[calc(100vh-3rem)] overflow-y-auto"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>管理应用偏好、模型与网络服务。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <aside>
            <div>
              {navGroups.map((group, index) => (
                <div key={group.title} className={index > 0 ? 'mt-4' : undefined}>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {group.title}
                  </p>
                  <nav className="grid grid-cols-2 gap-2">
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

          <main className="min-w-0 border-t border-border pt-6">
            <div>
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
    <Button
      type="button"
      onClick={onClick}
      size="default"
      variant={active ? 'secondary' : 'ghost'}
      className={cn(
        'w-full justify-start',
        !active && 'text-muted-foreground'
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </Button>
  )
}
