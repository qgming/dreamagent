import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from 'lucide-react'
import {
  BEAT_STATUS_LABELS,
  BEAT_STATUSES,
  type Beat,
  type BeatStatus,
  type Entity
} from '@shared/project-types'
import { extractRefIds } from '@shared/mentions'
import { MentionEditor } from '@/components/EntityMentionEditor'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import {
  SortableHandle,
  SortableItem,
  SortableList
} from '@/components/ui/sortable-list'
import { BACKLINK_CHIP } from '@/lib/mention-styles'
import { CollapsibleChipList } from '@/components/ui/collapsible-chip-list'
import { cn } from '@/lib/utils'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import {
  arrayMove,
  BEAT_STATUS_DOT_CLASS,
  beatStatusTitle
} from '@/lib/project-utils'
import {
  getOrderedBeats,
  getOrderedEntities,
  useProjectStore
} from '@/stores/project-store'

const TOOLBAR_CLASS =
  'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'

export function BeatsPage(): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const selectedBeatId = useProjectStore((s) => s.selectedBeatId)
  const setSelectedBeatId = useProjectStore((s) => s.setSelectedBeatId)
  const openCreateBeatModal = useProjectStore((s) => s.openCreateBeatModal)
  const openEditBeatModal = useProjectStore((s) => s.openEditBeatModal)
  const updateBeat = useProjectStore((s) => s.updateBeat)
  const deleteBeat = useProjectStore((s) => s.deleteBeat)
  const reorderBeats = useProjectStore((s) => s.reorderBeats)

  const beats = getOrderedBeats(snapshot)
  const selected = selectedBeatId && snapshot ? snapshot.beats[selectedBeatId] : null

  const handleReorder = (from: number, to: number): void => {
    if (!snapshot || from === to) return
    void reorderBeats({ orderedIds: arrayMove(snapshot.index.beats.order, from, to) })
  }

  const handleDelete = (beat: Beat): void => {
    void (async () => {
      const ok = await confirmDelete({
        title: '删除节点',
        description: `确定删除节点「${beat.title || '未命名节点'}」？\n此操作不可恢复。`
      })
      if (!ok) return
      void deleteBeat(beat.id)
    })()
  }

  if (!snapshot) {
    return <Empty hint="请先在侧栏打开或新建一个项目" />
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-60 shrink-0 flex-col border-r border-border bg-card/30">
        <div className={cn(TOOLBAR_CLASS, 'justify-between')}>
          <span className="text-sm font-medium">节点</span>
          <Button onClick={openCreateBeatModal} size="sm" type="button" variant="secondary">
            <Plus className="size-3.5" />
            新建
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 app-scrollbar">
          {beats.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              暂无节点，点击上方新建
            </p>
          ) : (
            <SortableList
              className="space-y-0.5"
              ids={beats.map((b) => b.id)}
              onReorder={handleReorder}
            >
              {beats.map((beat) => (
                <BeatListRow
                  active={selectedBeatId === beat.id}
                  beat={beat}
                  key={beat.id}
                  onDelete={() => handleDelete(beat)}
                  onEdit={() => openEditBeatModal(beat.id)}
                  onSelect={() => setSelectedBeatId(beat.id)}
                />
              ))}
            </SortableList>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <BeatEditor
            beat={selected}
            onChange={(patch) => void updateBeat(selected.id, patch)}
          />
        ) : (
          <Empty hint="选择左侧节点进行编辑" />
        )}
      </div>
    </div>
  )
}

function BeatListRow({
  beat,
  active,
  onSelect,
  onEdit,
  onDelete
}: {
  beat: Beat
  active: boolean
  onSelect: () => void
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element {
  return (
    <SortableItem
      className={cn(
        'group flex items-center gap-0.5 rounded-md px-1 py-1 text-sm transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      id={beat.id}
    >
      <SortableHandle className="size-5 shrink-0 text-muted-foreground">
        <GripVertical className="size-3.5" />
      </SortableHandle>
      <button className="min-w-0 flex-1 truncate text-left" onClick={onSelect} type="button">
        {beat.title || '未命名节点'}
      </button>
      <span className="relative flex size-6 shrink-0 items-center justify-center">
        <span
          className={cn(
            'size-2 rounded-full transition-opacity group-hover:opacity-0 group-focus-within:opacity-0',
            BEAT_STATUS_DOT_CLASS[beat.status]
          )}
          title={beatStatusTitle(beat.status)}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'absolute inset-0 flex size-6 items-center justify-center rounded-md text-muted-foreground outline-none',
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
      </span>
    </SortableItem>
  )
}

function BeatEditor({
  beat,
  onChange
}: {
  beat: Beat
  onChange: (patch: Partial<Pick<Beat, 'title' | 'content' | 'status'>>) => void
}): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const setSelectedEntityId = useProjectStore((s) => s.setSelectedEntityId)
  const setSelectedBeatId = useProjectStore((s) => s.setSelectedBeatId)
  const setProjectView = useProjectStore((s) => s.setProjectView)

  const [title, setTitle] = useState(beat.title)
  const [content, setContent] = useState(beat.content)
  const [status, setStatus] = useState<BeatStatus>(beat.status)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setTitle(beat.title)
    setContent(beat.content)
    setStatus(beat.status)
  }, [beat.id, beat.title, beat.content, beat.status])

  useEffect(() => {
    if (title === beat.title && content === beat.content && status === beat.status) return
    const timer = window.setTimeout(() => {
      const patch: Partial<Pick<Beat, 'title' | 'content' | 'status'>> = {}
      if (title !== beat.title) patch.title = title
      if (content !== beat.content) patch.content = content
      if (status !== beat.status) patch.status = status
      if (Object.keys(patch).length > 0) onChangeRef.current(patch)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [title, content, status, beat.title, beat.content, beat.status])

  /** 关联节点：正文引用 + 被其他节点引用 */
  const linkedBeats = useMemo((): Beat[] => {
    if (!snapshot) return []
    const map = new Map<string, Beat>()
    for (const id of extractRefIds(content, 'beat', beat.id)) {
      const b = snapshot.beats[id]
      if (b) map.set(id, b)
    }
    for (const b of getOrderedBeats(snapshot)) {
      if (b.id === beat.id) continue
      if (extractRefIds(b.content ?? '', 'beat').includes(beat.id)) map.set(b.id, b)
    }
    return [...map.values()]
  }, [snapshot, content, beat.id])

  /** 关联实体：正文引用 + 被实体引用 */
  const linkedEntities = useMemo((): Entity[] => {
    if (!snapshot) return []
    const map = new Map<string, Entity>()
    for (const id of extractRefIds(content, 'entity')) {
      const e = snapshot.entities[id]
      if (e) map.set(id, e)
    }
    for (const e of getOrderedEntities(snapshot)) {
      if (extractRefIds(e.content ?? '', 'beat').includes(beat.id)) map.set(e.id, e)
    }
    return [...map.values()]
  }, [snapshot, content, beat.id])

  const hasLinks = linkedBeats.length > 0 || linkedEntities.length > 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={TOOLBAR_CLASS}>
        <input
          className="h-8 min-w-0 flex-1 bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="节点标题"
          value={title}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs outline-none hover:bg-muted'
            )}
            type="button"
          >
            <span className={cn('size-2 shrink-0 rounded-full', BEAT_STATUS_DOT_CLASS[status])} />
            {BEAT_STATUS_LABELS[status]}
            <ChevronDown className="size-3.5 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              onValueChange={(v) => setStatus(v as BeatStatus)}
              value={status}
            >
              {BEAT_STATUSES.map((s) => (
                <DropdownMenuRadioItem key={s} value={s}>
                  <span className={cn('mr-1 size-2 rounded-full', BEAT_STATUS_DOT_CLASS[s])} />
                  {BEAT_STATUS_LABELS[s]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MentionEditor
        excludeId={beat.id}
        onChange={setContent}
        onOpenBeat={(id) => {
          setSelectedBeatId(id)
          setProjectView('beats')
        }}
        onOpenEntity={(id) => {
          setSelectedEntityId(id)
          setProjectView('entities')
        }}
        placeholder="写下节点内容……输入 @ 可关联实体或节点"
        sourceType="beat"
        value={content}
      />

      {hasLinks ? (
        <div className="shrink-0 space-y-2 border-t border-border px-4 py-2">
          {linkedBeats.length > 0 ? (
            <CollapsibleChipList count={linkedBeats.length} label="关联节点">
              {linkedBeats.map((b) => (
                <button
                  className={BACKLINK_CHIP.beat}
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
                  className={BACKLINK_CHIP.cross}
                  key={e.id}
                  onClick={() => {
                    setSelectedEntityId(e.id)
                    setProjectView('entities')
                  }}
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
