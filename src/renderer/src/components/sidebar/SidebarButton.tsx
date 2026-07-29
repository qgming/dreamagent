import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarButtonProps {
  active: boolean
  icon: LucideIcon
  label: string
  onClick: () => void
}

/**
 * 侧边栏导航按钮
 */
export function SidebarButton({
  active,
  icon: Icon,
  label,
  onClick
}: SidebarButtonProps): React.JSX.Element {
  return (
    <button
      className={cn(
        'flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-sidebar-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  )
}
