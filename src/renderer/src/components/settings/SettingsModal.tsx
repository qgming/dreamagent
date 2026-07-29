import { Globe, Info, Settings2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Modal, ModalContent, ModalTitle } from '@/components/ui/modal'
import { PreferencesPanel } from './PreferencesPanel'
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
  { id: 'web-search', label: '网络搜索', icon: Globe },
  { id: 'about', label: '关于', icon: Info }
]

/** 导航分组 */
const navGroups: Array<{ title: string; items: SettingsSection[] }> = [
  { title: '通用', items: ['preferences', 'web-search'] },
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
    <Modal open={open} onOpenChange={setOpen}>
      <ModalContent
        size="2xl"
        showCloseButton
        className="h-[620px] max-h-[min(620px,85vh)] p-0"
        aria-describedby={undefined}
      >
        {/* 无障碍标题（视觉隐藏，左侧已有可见标题） */}
        <ModalTitle className="sr-only">设置</ModalTitle>

        <div className="flex h-full min-h-0">
          {/* 左侧导航 */}
          <aside className="flex w-[220px] shrink-0 flex-col border-r border-border bg-background/60 px-3 py-5">
            <h2 className="mb-6 px-3 text-2xl font-semibold tracking-tight text-foreground">
              设置
            </h2>

            <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
              {navGroups.map((group, index) => (
                <div key={group.title} className={index > 0 ? 'mt-6' : undefined}>
                  <p className="mb-2 px-3 text-xs font-medium text-muted-foreground">
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

          {/* 右侧内容 */}
          <main className="app-scrollbar min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[980px] px-8 py-10">
              {activeSection === 'preferences' ? <PreferencesPanel /> : null}
              {activeSection === 'web-search' ? <WebSearchPanel /> : null}
              {activeSection === 'about' ? <AboutPanel /> : null}
            </div>
          </main>
        </div>
      </ModalContent>
    </Modal>
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
        'flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
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
