/**
 * Directive 胶囊 UI（输入区预览 / 用户消息共用）
 */
import type { FC } from 'react'
import {
  DIRECTIVE_ICON_MAP,
  directiveChipClassName,
  type DirectiveChipSurface
} from './directive-chip'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'

export type DirectiveChipProps = {
  type: string
  label: string
  id?: string
  surface?: DirectiveChipSurface
  className?: string
  onRemove?: () => void
}

/** 单个 directive 胶囊 */
export function DirectiveChip({
  type,
  label,
  id,
  surface = 'bubble',
  className,
  onRemove
}: DirectiveChipProps): React.JSX.Element {
  const Icon = DIRECTIVE_ICON_MAP[type] as FC<{ className?: string }> | undefined

  return (
    <TooltipHint label={id ? `${label} (${id})` : label}>
      <span
        className={directiveChipClassName(type, { surface, className })}
        data-slot="directive-text-chip"
        data-directive-type={type}
        data-directive-id={id}
        data-surface={surface}
        aria-label={`${type}: ${label}`}
      >
        {Icon ? <Icon /> : null}
        <span className="min-w-0 truncate">{label}</span>
        {onRemove ? (
          <button
            type="button"
            className={cn(
              'ml-0.5 rounded-full p-0.5 leading-none opacity-70 transition-opacity hover:opacity-100',
              'hover:bg-black/10 dark:hover:bg-white/15'
            )}
            aria-label={`移除 ${label}`}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onRemove()
            }}
          >
            ×
          </button>
        ) : null}
      </span>
    </TooltipHint>
  )
}
