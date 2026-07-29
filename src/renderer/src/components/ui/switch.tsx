import { cn } from '@/lib/utils'

/**
 * 极简 Switch（无额外依赖）
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  className
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
  className?: string
}): React.JSX.Element {
  return (
    <button
      aria-checked={checked}
      aria-label={label}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-primary bg-primary' : 'border-border bg-muted',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
      disabled={disabled}
      role="switch"
      type="button"
      onClick={() => {
        if (!disabled) onCheckedChange(!checked)
      }}
    >
      <span
        className={cn(
          'pointer-events-none block size-3.5 rounded-full bg-background shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  )
}
