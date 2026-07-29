import { useEffect, useRef, useState, type DragEvent } from 'react'
import {
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import type { Entity } from '@shared/project-types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { arrayMove } from '@/lib/project-utils'
import { getOrderedEntities, useProjectStore } from '@/stores/project-store'

/** 与节点页一致的顶栏高度 */
const TOOLBAR_CLASS =
  'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'

/**
 * 实体管理页：对齐节点页 — 拖拽排序 / 更多菜单 / 名称-uuid 文件 / 无类型
 */
export function EntitiesPage(): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const selectedEntityId = useProjectStore((s) => s.selectedEntityId)
  const setSelectedEntityId = useProjectStore((s) => s.setSelectedEntityId)
  const openCreateEntityModal = useProjectStore((s) => s.openCreateEntityModal)
  const openEditEntityModal = useProjectStore((s) => s.openEditEntityModal)
  const updateEntity = useProjectStore((s) => s.updateEntity)
  const deleteEntity = useProjectStore((s) => s.deleteEntity)
  const reorderEntities = useProjectStore((s) => s.reorderEntities)

  const entities = getOrderedEntities(snapshot)
  const selected =
    selectedEntityId && snapshot ? snapshot.entities[selectedEntityId] : null

  const handleReorder = (from: number, to: number): void => {
    if (!snapshot || from === to) return
    const next = arrayMove(snapshot.index.entities.order, from, to)
    void reorderEntities(next)
  }

  const handleDelete = (entity: Entity): void => {
    if (!window.confirm(`删除实体「${entity.name}」？`)) return
    void deleteEntity(entity.id)
  }

  if (!snapshot) {
    return <Empty hint="请先在侧栏打开或新建一个项目" />
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-72 shrink-0 flex-col border-r border-border bg-card/30">
        <div className={cn(TOOLBAR_CLASS, 'justify-between')}>
          <span className="text-sm font-medium">实体</span>
          <Button onClick={openCreateEntityModal} size="sm" type="button" variant="secondary">
            <Plus className="size-3.5" />
            新建
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 app-scrollbar">
          {entities.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              暂无实体。人物、地点、物品都可建在这里。
            </p>
          ) : (
            <ul className="space-y-0.5">
              {entities.map((entity, index) => (
                <EntityListRow
                  active={selectedEntityId === entity.id}
                  entity={entity}
                  index={index}
                  key={entity.id}
                  onDelete={() => handleDelete(entity)}
                  onEdit={() => openEditEntityModal(entity.id)}
                  onReorder={handleReorder}
                  onSelect={() => setSelectedEntityId(entity.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <EntityEditor
            entity={selected}
            onChange={(patch) => void updateEntity(selected.id, patch)}
          />
        ) : (
          <Empty hint="选择左侧实体进行编辑" />
        )}
      </div>
    </div>
  )
}

function EntityListRow({
  entity,
  index,
  active,
  onSelect,
  onEdit,
  onDelete,
  onReorder
}: {
  entity: Entity
  index: number
  active: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onReorder: (from: number, to: number) => void
}): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)

  return (
    <li
      className={cn(
        'group flex items-center gap-0.5 rounded-md px-1 py-1 text-sm transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        over && 'ring-1 ring-ring/50',
        dragging && 'opacity-50'
      )}
      draggable
      onDragEnd={() => {
        setDragging(false)
        setOver(false)
      }}
      onDragLeave={() => setOver(false)}
      onDragOver={(e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragStart={(e: DragEvent) => {
        setDragging(true)
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', String(index))
        e.dataTransfer.setData('application/x-dreamagent-entity', entity.id)
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault()
        setOver(false)
        const from = Number(e.dataTransfer.getData('text/plain'))
        if (Number.isNaN(from) || from === index) return
        onReorder(from, index)
      }}
    >
      <span className="flex size-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing">
        <GripVertical className="size-3.5" />
      </span>
      <button className="min-w-0 flex-1 truncate text-left" onClick={onSelect} type="button">
        {entity.name || '未命名实体'}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none',
            'opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100',
            'data-[state=open]:bg-muted data-[state=open]:text-foreground data-[state=open]:opacity-100'
          )}
          title="更多"
          type="button"
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="bottom">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil className="size-3.5" />
            编辑
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} variant="destructive">
            <Trash2 className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function EntityEditor({
  entity,
  onChange
}: {
  entity: Entity
  onChange: (patch: Partial<Pick<Entity, 'name' | 'content' | 'aliases'>>) => void
}): React.JSX.Element {
  const [name, setName] = useState(entity.name)
  const [content, setContent] = useState(entity.content)
  const [aliases, setAliases] = useState(entity.aliases.join('，'))
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setName(entity.name)
    setContent(entity.content)
    setAliases(entity.aliases.join('，'))
  }, [entity.id, entity.name, entity.content, entity.aliases])

  useEffect(() => {
    const parsedAliases = aliases
      .split(/[,，、]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const sameAliases =
      parsedAliases.length === entity.aliases.length &&
      parsedAliases.every((a, i) => a === entity.aliases[i])

    if (name === entity.name && content === entity.content && sameAliases) return

    const timer = window.setTimeout(() => {
      onChangeRef.current({
        name,
        content,
        aliases: parsedAliases
      })
    }, 400)
    return () => window.clearTimeout(timer)
  }, [name, content, aliases, entity.name, entity.content, entity.aliases])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={TOOLBAR_CLASS}>
        <input
          className="h-8 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
          onChange={(e) => setName(e.target.value)}
          placeholder="实体名称"
          value={name}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3 app-scrollbar">
        <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          别名（逗号分隔，用于 @ 匹配）
          <input
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-ring focus:ring-2"
            onChange={(e) => setAliases(e.target.value)}
            placeholder="魔藤，藤蔓，幼体"
            value={aliases}
          />
        </label>
        <label className="flex min-h-0 flex-1 flex-col gap-1.5 text-xs text-muted-foreground">
          设定 / 简介
          <textarea
            className="min-h-[200px] flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none ring-ring focus:ring-2"
            onChange={(e) => setContent(e.target.value)}
            placeholder="一句话或一段设定……"
            value={content}
          />
        </label>
      </div>
    </div>
  )
}

function Empty({ hint }: { hint: string }): React.JSX.Element {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {hint}
    </div>
  )
}
