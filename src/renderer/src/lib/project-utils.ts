import type { BeatStatus } from '@shared/project-types'
import { BEAT_STATUS_LABELS } from '@shared/project-types'

/**
 * 数组重排工具：把 fromIndex 项移到 toIndex
 */
export function arrayMove<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return [...list]
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= list.length || toIndex >= list.length) {
    return [...list]
  }
  const next = [...list]
  const [item] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, item)
  return next
}

/**
 * 格式化相对时间（极简）
 */
export function formatUpdatedAt(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  return new Date(iso).toLocaleDateString()
}

/** 节点状态 → 圆点颜色 */
export const BEAT_STATUS_DOT_CLASS: Record<BeatStatus, string> = {
  draft: 'bg-muted-foreground/45',
  outlined: 'bg-sky-500',
  expanded: 'bg-amber-500',
  polished: 'bg-emerald-500'
}

/** 状态圆点 title */
export function beatStatusTitle(status: BeatStatus): string {
  return BEAT_STATUS_LABELS[status]
}
