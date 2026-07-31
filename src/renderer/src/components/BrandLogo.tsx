import brandMarkUrl from '@/assets/brand/dreamagent-mark.svg'
import { cn } from '@/lib/utils'

interface BrandMarkProps {
  className?: string
  decorative?: boolean
}

/** 造梦师品牌标记：展开的书页托起灵感星芒。 */
export function BrandMark({
  className,
  decorative = false
}: BrandMarkProps): React.JSX.Element {
  return (
    <img
      alt={decorative ? '' : '造梦师'}
      aria-hidden={decorative || undefined}
      className={cn('shrink-0', className)}
      draggable={false}
      src={brandMarkUrl}
    />
  )
}

export function BrandLogo({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <BrandMark className="size-8" decorative />
      <div className="min-w-0 leading-none">
        <div className="truncate text-base font-semibold text-foreground">造梦师</div>
        <div className="mt-1 truncate text-[10px] font-medium uppercase text-muted-foreground">
          Dream Agent
        </div>
      </div>
    </div>
  )
}
