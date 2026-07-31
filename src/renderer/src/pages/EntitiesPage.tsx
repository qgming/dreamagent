import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  CornerDownRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Unlink
} from 'lucide-react'
import {
  ENTITY_STATUS_LABELS,
  ENTITY_STATUSES,
  type Beat,
  type Entity,
  type EntityStatus
} from '@shared/project-types'
import { extractRefIds } from '@shared/mentions'
import { MentionEditor } from '@/components/EntityMentionEditor'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  flattenVisibleTree,
  TreeExpandButton,
  TreeRowShell,
  TreeSortableSections,
  useExpandedSet
} from '@/components/ui/tree-list'
import { BACKLINK_CHIP } from '@/lib/mention-styles'
import { CollapsibleChipList } from '@/components/ui/collapsible-chip-list'
import { cn } from '@/lib/utils'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import {
  arrayMove,
  ENTITY_STATUS_DOT_CLASS,
  entityStatusTitle
} from '@/lib/project-utils'
import {
  getEntityChildren,
  getOrderedBeats,
  getOrderedEntities,
  useProjectStore
} from '@/stores/project-store'

const TOOLBAR_CLASS =
  'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'

export function EntitiesPage(): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const selectedEntityId = useProjectStore((s) => s.selectedEntityId)
  const setSelectedEntityId = useProjectStore((s) => s.setSelectedEntityId)
  const openCreateEntityModal = useProjectStore((s) => s.openCreateEntityModal)
  const openEditEntityModal = useProjectStore((s) => s.openEditEntityModal)
  const updateEntity = useProjectStore((s) => s.updateEntity)
  const deleteEntity = useProjectStore((s) => s.deleteEntity)
  const reorderEntitySiblings = useProjectStore((s) => s.reorderEntitySiblings)
  const reparentEntity = useProjectStore((s) => s.reparentEntity)

  const rootEntities = useMemo(() => {
    if (!snapshot) return []
    return (snapshot.index.entities.roots ?? [])
      .map((id) => snapshot.entities[id])
      .filter(Boolean)
  }, [snapshot])
  const selected =
    selectedEntityId && snapshot ? snapshot.entities[selectedEntityId] : null
  const expandKey = snapshot ? `dreamagent:entities-expanded:${snapshot.meta.id}` : null
  const { expanded, toggle, expandAll } = useExpandedSet(expandKey)

  useEffect(() => {
    if (!snapshot) return
    const withKids = Object.keys(snapshot.index.entities.children ?? {})
    if (withKids.length) expandAll(withKids)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.meta.id])

  const rows = useMemo(() => {
    if (!snapshot) return []
    return flattenVisibleTree(
      rootEntities,
      (e) => getEntityChildren(snapshot, e.id),
      expanded
    )
  }, [snapshot, rootEntities, expanded])

  const handleDelete = (entity: Entity): void => {
    void (async () => {
      const kids = snapshot ? getEntityChildren(snapshot, entity.id) : []
      const ok = await confirmDelete({
        title: '删除实体',
        description: kids.length
          ? `确定删除实体「${entity.name || '未命名实体'}」？\n其 ${kids.length} 个子实体将提升到上一级；双链将断为普通 @ 文本。`
          : `确定删除实体「${entity.name || '未命名实体'}」？\n正文中的双链将断为普通 @ 文本，此操作不可恢复。`
      })
      if (!ok) return
      void deleteEntity(entity.id)
    })()
  }

  if (!snapshot) {
    return <Empty hint="请先在侧栏打开或新建一个项目" />
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card/30">
        <div className={cn(TOOLBAR_CLASS, 'justify-between')}>
          <span className="text-sm font-medium">实体</span>
          <Button
            onClick={() => openCreateEntityModal()}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Plus className="size-3.5" />
            新建
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 app-scrollbar">
          {rootEntities.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              暂无实体。人物、地点、物品都可建在这里。
            </p>
          ) : (
            <TreeSortableSections
              onReorderSiblings={(parentId, from, to) => {
                const ids =
                  parentId === null
                    ? [...snapshot.index.entities.roots]
                    : [...(snapshot.index.entities.children[parentId] ?? [])]
                void reorderEntitySiblings({
                  parentId,
                  orderedIds: arrayMove(ids, from, to)
                })
              }}
              renderRow={(row) => (
                <EntityListRow
                  active={selectedEntityId === row.item.id}
                  depth={row.depth}
                  entity={row.item}
                  expanded={expanded.has(row.item.id)}
                  hasChildren={row.hasChildren}
                  key={row.item.id}
                  onAddChild={() => openCreateEntityModal(row.item.id)}
                  onDelete={() => handleDelete(row.item)}
                  onEdit={() => openEditEntityModal(row.item.id)}
                  onSelect={() => setSelectedEntityId(row.item.id)}
                  onToggle={() => toggle(row.item.id)}
                  onUnparent={
                    row.parentId
                      ? () => void reparentEntity(row.item.id, { parentId: null })
                      : undefined
                  }
                />
              )}
              rows={rows}
            />
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
  active,
  depth,
  hasChildren,
  expanded,
  onSelect,
  onEdit,
  onDelete,
  onAddChild,
  onToggle,
  onUnparent
}: {
  entity: Entity
  active: boolean
  depth: number
  hasChildren: boolean
  expanded: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onAddChild: () => void
  onToggle: () => void
  onUnparent?: () => void
}): React.JSX.Element {
  const archived = entity.status === 'archived'

  // 布局：拖动手柄 · 标题(有子则同时展开/收起) · 状态点(hover 换成更多)
  const handleTitleClick = (): void => {
    onSelect()
    if (hasChildren) onToggle()
  }

  return (
    <TreeRowShell
      active={active}
      className={archived && !active ? 'opacity-55' : undefined}
      depth={depth}
      id={entity.id}
    >
      <button
        className="min-w-0 flex-1 truncate text-left"
        onClick={handleTitleClick}
        type="button"
      >
        {entity.name || '未命名实体'}
      </button>
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        <span
          className={cn(
            'size-2 rounded-full transition-opacity',
            'group-hover:opacity-0 group-focus-within:opacity-0',
            ENTITY_STATUS_DOT_CLASS[entity.status]
          )}
          title={entityStatusTitle(entity.status)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'absolute inset-0 flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none',
              'opacity-0 hover:bg-muted hover:text-foreground',
              'group-hover:opacity-100 group-focus-within:opacity-100',
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
            <DropdownMenuItem onSelect={onAddChild}>
              <CornerDownRight className="size-3.5" />
              新建子实体
            </DropdownMenuItem>
            {onUnparent ? (
              <DropdownMenuItem onSelect={onUnparent}>
                <Unlink className="size-3.5" />
                移到根级
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} variant="destructive">
              <Trash2 className="size-3.5" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    </TreeRowShell>
  )
}

function EntityEditor({
  entity,
  onChange
}: {
  entity: Entity
  onChange: (patch: Partial<Pick<Entity, 'name' | 'content' | 'status'>>) => void
}): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const setSelectedBeatId = useProjectStore((s) => s.setSelectedBeatId)
  const setSelectedEntityId = useProjectStore((s) => s.setSelectedEntityId)
  const setProjectView = useProjectStore((s) => s.setProjectView)

  const [name, setName] = useState(entity.name)
  const [content, setContent] = useState(entity.content)
  const [status, setStatus] = useState<EntityStatus>(entity.status)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setName(entity.name)
    setContent(entity.content)
    setStatus(entity.status)
  }, [entity.id, entity.name, entity.content, entity.status])

  useEffect(() => {
    if (name === entity.name && content === entity.content && status === entity.status) return
    const timer = window.setTimeout(() => {
      const patch: Partial<Pick<Entity, 'name' | 'content' | 'status'>> = {}
      if (name !== entity.name) patch.name = name
      if (content !== entity.content) patch.content = content
      if (status !== entity.status) patch.status = status
      if (Object.keys(patch).length > 0) onChangeRef.current(patch)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [name, content, status, entity.name, entity.content, entity.status])

  const linkedBeats = useMemo((): Beat[] => {
    if (!snapshot) return []
    const map = new Map<string, Beat>()
    for (const id of extractRefIds(content, 'beat')) {
      const b = snapshot.beats[id]
      if (b) map.set(id, b)
    }
    for (const b of getOrderedBeats(snapshot)) {
      if (extractRefIds(b.content ?? '', 'entity').includes(entity.id)) map.set(b.id, b)
    }
    return [...map.values()]
  }, [snapshot, content, entity.id])

  const linkedEntities = useMemo((): Entity[] => {
    if (!snapshot) return []
    const map = new Map<string, Entity>()
    for (const id of extractRefIds(content, 'entity', entity.id)) {
      const e = snapshot.entities[id]
      if (e) map.set(id, e)
    }
    for (const e of getOrderedEntities(snapshot)) {
      if (e.id === entity.id) continue
      if (extractRefIds(e.content ?? '', 'entity').includes(entity.id)) map.set(e.id, e)
    }
    return [...map.values()]
  }, [snapshot, content, entity.id])

  const hasLinks = linkedBeats.length > 0 || linkedEntities.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={TOOLBAR_CLASS}>
        <input
          className="h-8 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
          onChange={(e) => setName(e.target.value)}
          placeholder="实体名称"
          value={name}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs outline-none hover:bg-muted"
            type="button"
          >
            <span className={cn('size-2 shrink-0 rounded-full', ENTITY_STATUS_DOT_CLASS[status])} />
            {ENTITY_STATUS_LABELS[status]}
            <ChevronDown className="size-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ENTITY_STATUSES.map((s) => (
              <DropdownMenuItem
                className={cn(
                  status === s &&
                    'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
                )}
                key={s}
                onSelect={() => setStatus(s)}
              >
                <span className={cn('size-2 rounded-full', ENTITY_STATUS_DOT_CLASS[s])} />
                {ENTITY_STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MentionEditor
        excludeId={entity.id}
        onChange={setContent}
        onOpenBeat={(id) => {
          setSelectedBeatId(id)
          setProjectView('beats')
        }}
        onOpenEntity={(id) => {
          setSelectedEntityId(id)
          setProjectView('entities')
        }}
        placeholder="写下实体设定……输入 @ 可关联实体或节点"
        sourceType="entity"
        value={content}
      />

      {hasLinks ? (
        <div className="shrink-0 space-y-2 border-t border-border px-4 py-2">
          {linkedBeats.length > 0 ? (
            <CollapsibleChipList count={linkedBeats.length} label="关联节点">
              {linkedBeats.map((b) => (
                <button
                  className={BACKLINK_CHIP.cross}
                  key={b.id}
                  onClick={() => {
                    setSelectedBeatId(b.id)
                    setProjectView('beats')
                  }}
                  type="button"
                >
                  <span className="truncate">@{b.title || '未命名节点'}</span>
                </button>
              ))}
            </CollapsibleChipList>
          ) : null}
          {linkedEntities.length > 0 ? (
            <CollapsibleChipList count={linkedEntities.length} label="关联实体">
              {linkedEntities.map((e) => (
                <button
                  className={BACKLINK_CHIP.entity}
                  key={e.id}
                  onClick={() => setSelectedEntityId(e.id)}
                  type="button"
                >
                  <span className="truncate">@{e.name}</span>
                </button>
              ))}
            </CollapsibleChipList>
          ) : null}
        </div>
      ) : null}
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
