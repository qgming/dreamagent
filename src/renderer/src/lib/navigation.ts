import type { LucideIcon } from 'lucide-react'
import { FolderKanban, Home, Sparkles, Settings } from 'lucide-react'

/** 页面 ID（设置改为模态窗，不再作为页面） */
export type PageId = 'home' | 'create' | 'projects'

/** 导航项 */
export interface NavItem {
  id: PageId
  label: string
  icon: LucideIcon
}

/** 主导航 */
export const primaryNav: NavItem[] = [
  { id: 'home', label: '首页', icon: Home },
  { id: 'create', label: '创作', icon: Sparkles },
  { id: 'projects', label: '项目', icon: FolderKanban }
]

/** 底部次要操作（非页面） */
export const secondaryActions = [
  { id: 'settings' as const, label: '设置', icon: Settings }
]
