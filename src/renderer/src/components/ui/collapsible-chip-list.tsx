/**
 * 可折叠胶囊列表
 * - 默认最多约两行高度
 * - 溢出时显示「展开 / 收起」
 */
import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 约两行胶囊高度（含 gap） */
const COLLAPSED_MAX = '3.1rem'

export type CollapsibleChipListProps = {
  /** 区域标题，如「出链」「关联节点」 */
  label?: string
  /** 数量角标 */
  count?: number
  className?: string
  /** 胶囊容器 class */
  chipsClassName?: string
  children: React.ReactNode
}

/**
 * 把 children 包成最多两行的可折叠区域
 */
export function CollapsibleChipList({
  label,
  count,
  className,
  chipsClassName,
  children
}: CollapsibleChipListProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const measure = (): void => {
      // 测量时先取消折叠高度限制
      const prev = el.style.maxHeight
      el.style.maxHeight = 'none'
      const full = el.scrollHeight
      el.style.maxHeight = prev
      // 两行阈值 + 一点容差
      const limit = el.ownerDocument.defaultView
        ? Number.parseFloat(
            el.ownerDocument.defaultView.getComputedStyle(el).lineHeight || '20'
          ) * 2.4
        : 50
      // 用 scrollHeight vs 折叠高度更稳
      el.style.maxHeight = COLLAPSED_MAX
      const collapsed = el.clientHeight
      el.style.maxHeight = prev
      setOverflows(full > collapsed + 4 || full > limit)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <p className="mb-1 text-[10px] font-medium text-muted-foreground">
          {label}
          {typeof count === 'number' ? ` · ${count}` : null}
        </p>
      ) : null}
      <div
        ref={ref}
        className={cn(
          'flex flex-wrap content-start gap-1 overflow-hidden transition-[max-height] duration-200',
          chipsClassName
        )}
        style={expanded ? undefined : { maxHeight: COLLAPSED_MAX }}
      >
        {children}
      </div>
      {overflows ? (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              收起
              <ChevronUp className="size-3.5" />
            </>
          ) : (
            <>
              展开更多
              <ChevronDown className="size-3.5" />
            </>
          )}
        </button>
      ) : null}
    </div>
  )
}
