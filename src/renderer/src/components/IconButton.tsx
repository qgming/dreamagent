import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * 通用图标按钮（带 title 提示）
 */
export function IconButton({
  children,
  className,
  disabled,
  label,
  onClick
}: {
  children: ReactNode
  className?: string
  disabled?: boolean
  label: string
  onClick?: () => void
}): React.JSX.Element {
  return (
    <Button
      className={cn('text-muted-foreground hover:text-foreground', className)}
      disabled={disabled}
      onClick={onClick}
      size="icon-sm"
      title={label}
      type="button"
      variant="ghost"
    >
      {children}
      <span className="sr-only">{label}</span>
    </Button>
  )
}
