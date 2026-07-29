import { createContext, useContext, useId, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  value: string
  setValue: (v: string) => void
  layoutId: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs(): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('Tabs 子组件必须在 Tabs 内使用')
  return ctx
}

/**
 * Animate UI 风格 Tabs：指示条用 layoutId 弹簧滑动
 * 参考 https://animate-ui.com 的 TabsHighlight 思路
 */
export function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  children,
  className
}: {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  children: ReactNode
  className?: string
}): React.JSX.Element {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? '')
  const value = controlled ?? uncontrolled
  const layoutId = useId()

  const setValue = (v: string): void => {
    if (controlled === undefined) setUncontrolled(v)
    onValueChange?.(v)
  }

  return (
    <TabsContext.Provider value={{ value, setValue, layoutId }}>
      <div className={className} data-slot="tabs">
        {children}
      </div>
    </TabsContext.Provider>
  )
}

export function TabsList({
  children,
  className
}: {
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'relative flex h-8 items-center gap-0.5 rounded-md bg-muted/60 p-0.5',
        className
      )}
      data-slot="tabs-list"
      role="tablist"
    >
      {children}
    </div>
  )
}

export function TabsTrigger({
  value,
  children,
  className
}: {
  value: string
  children: ReactNode
  className?: string
}): React.JSX.Element {
  const { value: active, setValue, layoutId } = useTabs()
  const isActive = active === value

  return (
    <button
      className={cn(
        'relative z-[1] flex h-7 flex-1 items-center justify-center rounded-sm px-2 text-xs font-medium outline-none transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        className
      )}
      data-slot="tabs-trigger"
      data-state={isActive ? 'active' : 'inactive'}
      onClick={() => setValue(value)}
      role="tab"
      type="button"
    >
      {isActive ? (
        <motion.span
          className="absolute inset-0 -z-[1] rounded-sm bg-background shadow-sm"
          layoutId={`tabs-highlight-${layoutId}`}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      ) : null}
      {children}
    </button>
  )
}
