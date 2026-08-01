import brandStarUrl from '@/assets/brand/dreamagent-star.png'
import { cn } from '@/lib/utils'

interface BrandStarProps {
  className?: string
  decorative?: boolean
}

/** 造梦师应用内品牌标记：简洁纸星。 */
export function BrandStar({
  className,
  decorative = false
}: BrandStarProps): React.JSX.Element {
  return (
    <img
      alt={decorative ? '' : '造梦师'}
      aria-hidden={decorative || undefined}
      className={cn('shrink-0', className)}
      draggable={false}
      src={brandStarUrl}
    />
  )
}

export function BrandLogo({ className }: { className?: string }): React.JSX.Element {
  return (
    <div className={cn('flex min-w-0 items-center gap-1.5', className)}>
      <BrandStar className="size-4" decorative />
      <div className="min-w-0 leading-none">
        <div className="truncate text-base font-semibold text-foreground">造梦师</div>
        <div className="mt-1 truncate text-[10px] font-medium uppercase text-muted-foreground">
          Dream Agent
        </div>
      </div>
    </div>
  )
}
