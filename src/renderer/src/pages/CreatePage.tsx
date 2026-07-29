import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ChevronDown, ChevronRight, GripVertical, MessageSquarePlus } from 'lucide-react'
import type { Beat } from '@shared/project-types'
import { cn } from '@/lib/utils'
import { arrayMove } from '@/lib/project-utils'
import {
  getOrderedBeats,
  getOrderedEntities,
  useProjectStore
} from '@/stores/project-store'

/**
 * 创作页：主编辑区 + 右侧栏（上：节点/实体可拖拽；下：新对话占位）
 */
export function CreatePage(): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const selectedBeatId = useProjectStore((s) => s.selectedBeatId)
  const setSelectedBeatId = useProjectStore((s) => s.setSelectedBeatId)
  const updateBeat = useProjectStore((s) => s.updateBeat)
  const createBeatsOpen = useProjectStore((s) => s.createBeatsOpen)
  const createEntitiesOpen = useProjectStore((s) => s.createEntitiesOpen)
  const setCreateBeatsOpen = useProjectStore((s) => s.setCreateBeatsOpen)
  const setCreateEntitiesOpen = useProjectStore((s) => s.setCreateEntitiesOpen)
  const reorderBeats = useProjectStore((s) => s.reorderBeats)
  const reorderEntities = useProjectStore((s) => s.reorderEntities)

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        请先在侧栏打开或新建一个项目
      </div>
    )
  }

  const selected = selectedBeatId ? snapshot.beats[selectedBeatId] : null
  const beats = getOrderedBeats(snapshot)
  const entities = getOrderedEntities(snapshot)

  const handleBeatReorder = (from: number, to: number): void => {
    const ids = snapshot.index.beats.order
    const next = arrayMove(ids, from, to)
    void reorderBeats({ orderedIds: next })
  }

  const handleEntityReorder = (from: number, to: number): void => {
    const ids = snapshot.index.entities.order
    const next = arrayMove(ids, from, to)
    void reorderEntities(next)
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-border px-5 py-3">
          <h1 className="text-base font-semibold tracking-tight">{snapshot.meta.title}</h1>
          <p className="text-xs text-muted-foreground">
            创作工作台 · 右侧点选节点编辑；拖拽名称会写入 index.json 顺序
          </p>
        </div>

        {selected ? (
          <CreateBeatEditor
            beat={selected}
            key={selected.id}
            onChange={(patch) => void updateBeat(selected.id, patch)}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            {beats.length === 0
              ? '还没有节点。请到「节点」页创建。'
              : '从右侧选择一个节点开始创作'}
          </div>
        )}
      </div>

      <aside className="flex w-64 shrink-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <SectionHeader
            count={beats.length}
            label="节点"
            onToggle={() => setCreateBeatsOpen(!createBeatsOpen)}
            open={createBeatsOpen}
          />
          {createBeatsOpen ? (
            <div className="max-h-[45%] overflow-y-auto border-b border-border px-1 pb-2 app-scrollbar">
              {beats.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">暂无节点</p>
              ) : (
                <ul className="space-y-0.5">
                  {beats.map((beat, index) => (
                    <li key={beat.id}>
                      <DraggableNameRow
                        active={selectedBeatId === beat.id}
                        id={beat.id}
                        index={index}
                        label={beat.title || '未命名节点'}
                        onReorder={handleBeatReorder}
                        onSelect={() => setSelectedBeatId(beat.id)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <SectionHeader
            count={entities.length}
            label="实体"
            onToggle={() => setCreateEntitiesOpen(!createEntitiesOpen)}
            open={createEntitiesOpen}
          />
          {createEntitiesOpen ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2 app-scrollbar">
              {entities.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">暂无实体</p>
              ) : (
                <ul className="space-y-0.5">
                  {entities.map((entity, index) => (
                    <DraggableNameRow
                      active={false}
                      id={entity.id}
                      index={index}
                      key={entity.id}
                      label={entity.name}
                      onReorder={handleEntityReorder}
                      onSelect={() =>
                        useProjectStore.getState().setSelectedEntityId(entity.id)
                      }
                    />
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        <div className="border-t border-border p-3">
          <button
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground"
            disabled
            title="后续接入 Agent 对话"
            type="button"
          >
            <MessageSquarePlus className="size-3.5" />
            新对话（即将推出）
          </button>
        </div>
      </aside>
    </div>
  )
}

function CreateBeatEditor({
  beat,
  onChange
}: {
  beat: Beat
  onChange: (patch: Partial<Pick<Beat, 'title' | 'content'>>) => void
}): React.JSX.Element {
  const [title, setTitle] = useState(beat.title)
  const [content, setContent] = useState(beat.content)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    setTitle(beat.title)
    setContent(beat.content)
  }, [beat.id, beat.title, beat.content])

  useEffect(() => {
    if (title === beat.title && content === beat.content) return
    const timer = window.setTimeout(() => {
      const patch: Partial<Pick<Beat, 'title' | 'content'>> = {}
      if (title !== beat.title) patch.title = title
      if (content !== beat.content) patch.content = content
      if (Object.keys(patch).length > 0) onChangeRef.current(patch)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [title, content, beat.title, beat.content])

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 py-4">
      <input
        className="mb-3 h-10 bg-transparent text-lg font-medium outline-none"
        onChange={(e) => setTitle(e.target.value)}
        value={title}
      />
      <textarea
        className="min-h-0 flex-1 resize-none bg-transparent text-sm leading-7 outline-none placeholder:text-muted-foreground app-scrollbar"
        onChange={(e) => setContent(e.target.value)}
        placeholder="在此书写当前节点……"
        value={content}
      />
    </div>
  )
}

function SectionHeader({
  label,
  open,
  onToggle,
  count
}: {
  label: string
  open: boolean
  onToggle: () => void
  count: number
}): React.JSX.Element {
  return (
    <button
      className="flex h-9 w-full items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={onToggle}
      type="button"
    >
      {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      <span className="flex-1 text-left">{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  )
}

function DraggableNameRow({
  id,
  index,
  label,
  active,
  onSelect,
  onReorder
}: {
  id: string
  index: number
  label: string
  active: boolean
  onSelect: () => void
  onReorder: (from: number, to: number) => void
}): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const [over, setOver] = useState(false)

  const onDragStart = (e: DragEvent): void => {
    setDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    e.dataTransfer.setData('application/x-dreamagent-id', id)
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-md px-1 py-1 text-sm transition-colors',
        active && 'bg-black/[0.06] dark:bg-white/[0.08]',
        over && 'ring-1 ring-ring/50',
        dragging && 'opacity-50'
      )}
      draggable
      onDragEnd={() => {
        setDragging(false)
        setOver(false)
      }}
      onDragLeave={() => setOver(false)}
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragStart={onDragStart}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const from = Number(e.dataTransfer.getData('text/plain'))
        if (Number.isNaN(from) || from === index) return
        onReorder(from, index)
      }}
    >
      <span className="flex size-5 cursor-grab items-center justify-center text-muted-foreground active:cursor-grabbing">
        <GripVertical className="size-3.5" />
      </span>
      <button
        className="min-w-0 flex-1 truncate text-left text-sidebar-foreground hover:text-foreground"
        onClick={onSelect}
        type="button"
      >
        {label}
      </button>
    </div>
  )
}
