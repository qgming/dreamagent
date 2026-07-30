/**
 * 通用树形列表：展开/折叠 + 缩进 + 同级 Sortable 排序
 * 一期不做跨级拖拽 reparent
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import {
  SortableHandle,
  SortableItem,
  SortableList
} from '@/components/ui/sortable-list'
import { cn } from '@/lib/utils'
import { GripVertical } from 'lucide-react'

export interface TreeNodeBase {
  id: string
}

export interface FlatTreeRow<T extends TreeNodeBase> {
  item: T
  depth: number
  parentId: string | null
  hasChildren: boolean
  /** 同级排序用的兄弟 id 列表所属 parent */
  siblingParentId: string | null
}

/**
 * 将树展开为可见行（按 expanded 集合）
 */
export function flattenVisibleTree<T extends TreeNodeBase>(
  roots: T[],
  getChildren: (item: T) => T[],
  expanded: Set<string>,
  parentId: string | null = null,
  depth = 0
): FlatTreeRow<T>[] {
  const rows: FlatTreeRow<T>[] = []
  for (const item of roots) {
    const kids = getChildren(item)
    const hasChildren = kids.length > 0
    rows.push({
      item,
      depth,
      parentId,
      hasChildren,
      siblingParentId: parentId
    })
    if (hasChildren && expanded.has(item.id)) {
      rows.push(
        ...flattenVisibleTree(kids, getChildren, expanded, item.id, depth + 1)
      )
    }
  }
  return rows
}

/** 按 parent 分组的可见同级 id（用于分别套 SortableList） */
export function groupRowsByParent<T extends TreeNodeBase>(
  rows: FlatTreeRow<T>[]
): Array<{ parentId: string | null; rows: FlatTreeRow<T>[] }> {
  // 保持文档顺序：遇到新 parent 开一组，同 parent 连续行归一组
  const groups: Array<{ parentId: string | null; rows: FlatTreeRow<T>[] }> = []
  for (const row of rows) {
    const last = groups[groups.length - 1]
    if (last && last.parentId === row.siblingParentId) {
      last.rows.push(row)
    } else {
      groups.push({ parentId: row.siblingParentId, rows: [row] })
    }
  }
  return groups
}

export function useExpandedSet(
  storageKey: string | null,
  defaultExpanded = true
): {
  expanded: Set<string>
  toggle: (id: string) => void
  setExpanded: (id: string, open: boolean) => void
  expandAll: (ids: string[]) => void
} {
  const [expanded, setExpandedState] = useState<Set<string>>(() => {
    if (!storageKey || typeof localStorage === 'undefined') return new Set()
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      // 忽略
    }
    return new Set()
  })

  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify([...expanded]))
    } catch {
      // 忽略
    }
  }, [expanded, storageKey])

  const toggle = useCallback((id: string) => {
    setExpandedState((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const setExpanded = useCallback((id: string, open: boolean) => {
    setExpandedState((prev) => {
      const next = new Set(prev)
      if (open) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const expandAll = useCallback((ids: string[]) => {
    setExpandedState((prev) => {
      if (!defaultExpanded && prev.size === 0 && ids.length === 0) return prev
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
  }, [defaultExpanded])

  return { expanded, toggle, setExpanded, expandAll }
}

export function TreeExpandButton({
  open,
  visible,
  onToggle
}: {
  open: boolean
  visible: boolean
  onToggle: () => void
}): React.JSX.Element {
  if (!visible) {
    return <span className="size-5 shrink-0" />
  }
  return (
    <button
      aria-label={open ? '折叠' : '展开'}
      className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation()
        onToggle()
      }}
      type="button"
    >
      <ChevronRight
        className={cn('size-3.5 transition-transform', open && 'rotate-90')}
      />
    </button>
  )
}

/**
 * 同级可排序的树块：每个 parent 一组 SortableList
 */
export function TreeSortableSections<T extends TreeNodeBase>({
  rows,
  onReorderSiblings,
  renderRow,
  className
}: {
  rows: FlatTreeRow<T>[]
  onReorderSiblings: (parentId: string | null, from: number, to: number) => void
  renderRow: (row: FlatTreeRow<T>) => React.ReactNode
  className?: string
}): React.JSX.Element {
  const groups = useMemo(() => groupRowsByParent(rows), [rows])

  return (
    <div className={cn('space-y-0.5', className)}>
      {groups.map((g) => (
        <SortableList
          as="div"
          className="space-y-0.5"
          ids={g.rows.map((r) => r.item.id)}
          key={`p:${g.parentId ?? 'root'}:${g.rows.map((r) => r.item.id).join(',')}`}
          onReorder={(from, to) => onReorderSiblings(g.parentId, from, to)}
        >
          {g.rows.map((row) => renderRow(row))}
        </SortableList>
      ))}
    </div>
  )
}

export function TreeRowShell({
  id,
  depth,
  active,
  children,
  className
}: {
  id: string
  depth: number
  active?: boolean
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <SortableItem
      as="div"
      className={cn(
        // hover 与选中同级半透明：在 bg-sidebar（≈muted）上比 hover:bg-muted 更明显
        'group flex items-center gap-0.5 rounded-md py-1 pr-1 text-sm transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]',
        className
      )}
      id={id}
    >
      <span
        aria-hidden
        className="shrink-0"
        style={{ width: depth * 12 }}
      />
      <SortableHandle className="size-5 shrink-0 text-muted-foreground">
        <GripVertical className="size-3.5" />
      </SortableHandle>
      {children}
    </SortableItem>
  )
}
