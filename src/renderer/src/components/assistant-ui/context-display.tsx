import { useEffect, useState, type CSSProperties } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type {
  ContextCompactionState,
  SessionContextUsage
} from '@shared/context-usage'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return Math.round(tokens).toString()
}

function formatPrice(value: number): string {
  if (value === 0) return '$0'
  if (value < 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function formatCost(value: number): string {
  if (value === 0) return '$0.0000'
  if (value < 0.0001) return '<$0.0001'
  return `$${value.toFixed(4)}`
}

function usageTone(percent: number): {
  stroke: string
  bar: string
  text: string
} {
  if (percent >= 80) {
    return {
      stroke: 'stroke-red-400',
      bar: 'bg-red-400',
      text: 'text-red-600 dark:text-red-400'
    }
  }
  if (percent >= 65) {
    return {
      stroke: 'stroke-amber-400',
      bar: 'bg-amber-400',
      text: 'text-amber-600 dark:text-amber-400'
    }
  }
  return {
    stroke: 'stroke-foreground',
    bar: 'bg-foreground',
    text: 'text-foreground'
  }
}

const RING_SIZE = 18
const RING_STROKE = 2.5
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function Ring({ percent, spinning }: { percent: number; spinning: boolean }): React.JSX.Element {
  if (spinning) {
    return <Loader2 aria-hidden className="size-[18px] animate-spin" />
  }
  const tone = usageTone(percent)
  return (
    <svg
      aria-hidden
      className="-rotate-90"
      height={RING_SIZE}
      viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
      width={RING_SIZE}
    >
      <circle
        className="stroke-muted-foreground/25"
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        fill="none"
        r={RING_RADIUS}
        strokeWidth={RING_STROKE}
      />
      <circle
        className={cn('transition-[stroke-dashoffset,stroke] duration-300', tone.stroke)}
        cx={RING_SIZE / 2}
        cy={RING_SIZE / 2}
        fill="none"
        r={RING_RADIUS}
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE}
        strokeLinecap="round"
        strokeWidth={RING_STROKE}
      />
    </svg>
  )
}

function MetricRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function ModelLogo({
  logoUrl,
  monochrome,
  name
}: {
  logoUrl?: string
  monochrome?: boolean
  name: string
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [logoUrl])

  return (
    <span className="flex size-7 shrink-0 items-center justify-center text-[10px] font-semibold text-muted-foreground">
      {logoUrl && !failed ? (
        <img
          alt=""
          className={cn('size-5 object-contain', monochrome && 'dark:invert')}
          onError={() => setFailed(true)}
          src={logoUrl}
        />
      ) : (
        <span aria-hidden>{name.trim().charAt(0).toUpperCase() || '?'}</span>
      )}
    </span>
  )
}

export function ContextDisplay({
  usage,
  compactionState,
  compactionError,
  className
}: {
  usage: SessionContextUsage
  compactionState: ContextCompactionState
  compactionError?: string | null
  className?: string
}): React.JSX.Element {
  const percent = Math.min(Math.max(usage.contextPercent, 0), 100)
  const tone = usageTone(percent)
  const { cumulative, model } = usage
  const thresholdPercent = Math.round(usage.autoCompactThreshold * 100)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          aria-label={`上下文占用 ${Math.round(percent)}%`}
          className={cn(
            'flex h-8 w-[62px] shrink-0 items-center justify-center gap-1.5 rounded-md px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            compactionState === 'error' && 'text-destructive',
            className
          )}
          type="button"
        >
          {compactionState === 'error' ? (
            <AlertTriangle aria-hidden className="size-[18px]" />
          ) : (
            <Ring percent={percent} spinning={compactionState === 'compacting'} />
          )}
          <span className="w-7 text-right font-mono tabular-nums">
            {Math.round(percent)}%
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        align="end"
        className="w-72 rounded-md border border-border bg-popover p-3 text-left text-popover-foreground shadow-lg shadow-black/5 dark:shadow-black/30"
        hideArrow
        side="bottom"
        sideOffset={7}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ModelLogo
            logoUrl={model.logoUrl}
            monochrome={model.logoMonochrome}
            name={model.name}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">{model.name}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {model.providerName}{model.matched ? '' : ' · 未匹配，使用默认上限'}
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-4 text-xs">
          <span className="font-medium">
            {compactionState === 'compacting' ? '正在压缩上下文' : '上下文占用'}
          </span>
          <span className={cn('font-mono tabular-nums', tone.text)}>
            {usage.estimated ? '约 ' : ''}{formatTokens(usage.contextTokens)} / {formatTokens(model.contextWindow)}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn('h-full rounded-full transition-[width] duration-300', tone.bar)}
            style={{ width: `${percent}%` } as CSSProperties}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          达到 {thresholdPercent}% 后自动压缩
          {usage.compactionCount > 0 ? ` · 已压缩 ${usage.compactionCount} 次` : ''}
        </p>

        {compactionState === 'error' && compactionError ? (
          <p className="mt-2 border-l-2 border-destructive pl-2 text-[10px] leading-4 text-destructive">
            {compactionError}
          </p>
        ) : null}

        <div className="mt-3 grid gap-1 border-t border-border pt-2.5 text-[11px]">
          <MetricRow label="输入" value={formatTokens(cumulative.input)} />
          <MetricRow label="缓存读取" value={formatTokens(cumulative.cacheRead)} />
          <MetricRow label="缓存写入" value={formatTokens(cumulative.cacheWrite)} />
          <MetricRow label="输出" value={formatTokens(cumulative.output)} />
          {cumulative.reasoning > 0 ? (
            <MetricRow label="推理" value={formatTokens(cumulative.reasoning)} />
          ) : null}
          <MetricRow label="累计费用" value={formatCost(cumulative.cost)} />
        </div>

        {model.matched ? (
          <p className="mt-2 border-t border-border pt-2 text-[10px] text-muted-foreground">
            每百万 token：输入 {formatPrice(model.price.input)} · 输出 {formatPrice(model.price.output)}
            {model.price.cacheRead > 0 ? ` · 缓存 ${formatPrice(model.price.cacheRead)}` : ''}
          </p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
