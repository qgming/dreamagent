/**
 * 胶囊色板（directive / 双链共用）
 * - 无边框，纯背景
 * - 背景深、文字/图标同色更浅（非纯白）
 * - 高度对齐外侧正文字号与行高
 * - 内置：工具蓝 · 技能紫 · 节点绿 · 实体红 · 文章橙
 * - 双链：节点↔节点蓝 · 实体↔实体红 · 跨类型绿
 */
import { type FC } from 'react'
import { CircleDot, FileText, Users, Wrench, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

export type DirectiveChipSurface = 'surface' | 'bubble'

/** 语义色 token */
export type ChipTone =
  | 'tool'
  | 'skill'
  | 'beat'
  | 'entity'
  | 'article'
  | 'link-beat'
  | 'link-entity'
  | 'link-cross'
  | 'default'

/** 类型 → 图标 */
export const DIRECTIVE_ICON_MAP: Record<string, FC<{ className?: string }>> = {
  skill: Zap,
  beat: CircleDot,
  entity: Users,
  tool: Wrench,
  article: FileText,
  chapter: FileText
}

/** directive type → 色板 */
export function toneFromDirectiveType(type: string): ChipTone {
  switch (type) {
    case 'tool':
      return 'tool'
    case 'skill':
      return 'skill'
    case 'beat':
      return 'beat'
    case 'entity':
      return 'entity'
    case 'article':
    case 'chapter':
      return 'article'
    default:
      return 'default'
  }
}

/** 中性灰阶通过明度区分类型，保持全局黑灰白视觉。 */
function toneClasses(tone: ChipTone, _surface: DirectiveChipSurface): string {
  void _surface
  switch (tone) {
    case 'tool':
      return 'bg-neutral-900 text-neutral-100 dark:bg-neutral-200 dark:text-neutral-900'
    case 'skill':
      return 'bg-neutral-800 text-neutral-100 dark:bg-neutral-300 dark:text-neutral-900'
    case 'beat':
      return 'bg-neutral-700 text-neutral-100 dark:bg-neutral-400 dark:text-neutral-950'
    case 'entity':
      return 'bg-neutral-600 text-neutral-100 dark:bg-neutral-500 dark:text-white'
    case 'article':
      return 'bg-neutral-500 text-white dark:bg-neutral-600 dark:text-white'
    case 'link-beat':
      return 'bg-neutral-700 text-neutral-100 dark:bg-neutral-400 dark:text-neutral-950'
    case 'link-entity':
      return 'bg-neutral-600 text-neutral-100 dark:bg-neutral-500 dark:text-white'
    case 'link-cross':
      return 'bg-neutral-800 text-neutral-100 dark:bg-neutral-300 dark:text-neutral-900'
    default:
      return 'bg-neutral-600 text-neutral-200 dark:bg-neutral-500 dark:text-neutral-100'
  }
}

/** 按 directive type 取色 */
export function directiveChipTone(
  type: string,
  surface: DirectiveChipSurface = 'bubble'
): string {
  return toneClasses(toneFromDirectiveType(type), surface)
}

/** 按语义 tone 取色（双链 / 反链用） */
export function chipToneClass(
  tone: ChipTone,
  surface: DirectiveChipSurface = 'surface'
): string {
  return toneClasses(tone, surface)
}

/**
 * 胶囊公共 class
 * - 无边框
 * - 继承外侧字号/行高
 * - 图标与文字同色
 */
export function directiveChipClassName(
  type: string,
  options?: {
    surface?: DirectiveChipSurface
    className?: string
  }
): string {
  const surface = options?.surface ?? 'bubble'
  return cn(
    'aui-directive-chip',
    'inline-flex max-w-full items-center gap-0.5 rounded-[0.3em] px-[0.35em]',
    'align-baseline text-[length:inherit] font-medium leading-[inherit]',
    'border-0 shadow-none',
    '[&_svg]:size-[0.85em] [&_svg]:shrink-0 [&_svg]:stroke-[2.25] [&_svg]:text-current',
    directiveChipTone(type, surface),
    options?.className
  )
}

/** 通用胶囊 class（指定 tone） */
export function chipClassName(
  tone: ChipTone,
  options?: {
    surface?: DirectiveChipSurface
    className?: string
  }
): string {
  const surface = options?.surface ?? 'surface'
  return cn(
    'aui-directive-chip',
    'inline-flex max-w-full items-center gap-0.5 rounded-[0.3em] px-[0.35em]',
    'align-baseline text-[length:inherit] font-medium leading-[inherit]',
    'border-0 shadow-none',
    '[&_svg]:size-[0.85em] [&_svg]:shrink-0 [&_svg]:stroke-[2.25] [&_svg]:text-current',
    chipToneClass(tone, surface),
    options?.className
  )
}
