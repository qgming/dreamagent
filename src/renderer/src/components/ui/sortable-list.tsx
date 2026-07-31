/**
 * 基于 @dnd-kit 的纵向可排序列表
 * - SortableList：容器 + DndContext
 * - SortableItem：可拖行
 * - SortableHandle：仅手柄激活拖动（避免点选误拖）
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  createContext,
  useContext,
  type CSSProperties,
  type ReactNode
} from 'react'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'

type SortableItemContextValue = {
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners
  setActivatorNodeRef: (element: HTMLElement | null) => void
}

const SortableItemContext = createContext<SortableItemContextValue | null>(null)

export function SortableList({
  ids,
  onReorder,
  children,
  className,
  as: Tag = 'ul'
}: {
  ids: string[]
  /** from/to 均为当前 ids 中的下标 */
  onReorder: (from: number, to: number) => void
  children: ReactNode
  className?: string
  as?: 'ul' | 'div'
}): React.JSX.Element {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      // 轻微移动才激活，避免单击误拖
      activationConstraint: { distance: 4 }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0 || from === to) return
    onReorder(from, to)
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <Tag className={className}>{children}</Tag>
      </SortableContext>
    </DndContext>
  )
}

export function SortableItem({
  id,
  children,
  className,
  as: Tag = 'li'
}: {
  id: string
  children: ReactNode
  className?: string
  as?: 'li' | 'div'
}): React.JSX.Element {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative'
  }

  return (
    <SortableItemContext.Provider
      value={{ attributes, listeners, setActivatorNodeRef }}
    >
      <Tag
        className={cn(className, isDragging && 'opacity-50')}
        ref={setNodeRef}
        style={style}
      >
        {children}
      </Tag>
    </SortableItemContext.Provider>
  )
}

/** 拖动手柄：把 listeners 绑在手柄上，行内按钮可正常点击 */
export function SortableHandle({
  className,
  children,
  title = '拖动排序'
}: {
  className?: string
  children: ReactNode
  title?: string
}): React.JSX.Element {
  const ctx = useContext(SortableItemContext)
  if (!ctx) throw new Error('SortableHandle 必须在 SortableItem 内使用')

  return (
    <TooltipHint label={title}>
      <span
        className={cn(
          'flex touch-none cursor-grab items-center justify-center active:cursor-grabbing',
          className
        )}
        ref={ctx.setActivatorNodeRef}
        {...ctx.attributes}
        {...ctx.listeners}
      >
        {children}
      </span>
    </TooltipHint>
  )
}
