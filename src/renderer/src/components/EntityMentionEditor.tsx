import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import { CircleDot, Plus, Search, Users } from 'lucide-react'
import type { Beat, Entity } from '@shared/project-types'
import {
  contentToEditorHtml,
  filterBeatsByQuery,
  filterEntitiesByQuery,
  MENTION_CHIP_ATTR,
  MENTION_CHIP_CLASS,
  MENTION_CHIP_TYPE_ATTR,
  mentionColor,
  mentionColorClass,
  type MentionTargetType
} from '@shared/mentions'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/animated-tabs'
import { Input } from '@/components/ui/input'
import { editorDomToContent } from '@/lib/mention-dom'
import { mentionChipStyles } from '@/lib/mention-styles'
import { cn } from '@/lib/utils'
import {
  getOrderedBeats,
  getOrderedEntities,
  useProjectStore
} from '@/stores/project-store'

interface MentionState {
  range: Range
  query: string
}

interface MentionEditorProps {
  value: string
  onChange: (value: string) => void
  /** 当前编辑主体类型，决定芯片配色与可引用范围 */
  sourceType: MentionTargetType
  /** 排除自身 id */
  excludeId?: string
  placeholder?: string
  className?: string
  padClassName?: string
  onOpenBeat?: (beatId: string) => void
  onOpenEntity?: (entityId: string) => void
}

/**
 * 通用双链编辑器
 * - 存盘：[@名](entity:id) / [@名](beat:id)
 * - 界面：@名 色块（蓝/红/绿）
 * - @ 弹出：带动画 Tab 切换 实体 | 节点
 */
export function MentionEditor({
  value,
  onChange,
  sourceType,
  excludeId,
  placeholder,
  className,
  padClassName = 'px-4 py-3',
  onOpenBeat,
  onOpenEntity
}: MentionEditorProps): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const entities = useMemo(() => {
    const all = getOrderedEntities(snapshot)
    return excludeId && sourceType === 'entity'
      ? all.filter((e) => e.id !== excludeId)
      : all
  }, [snapshot, excludeId, sourceType])
  const beats = useMemo(() => {
    const all = getOrderedBeats(snapshot)
    return excludeId && sourceType === 'beat'
      ? all.filter((b) => b.id !== excludeId)
      : all
  }, [snapshot, excludeId, sourceType])

  const editorRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef(value)
  const [mention, setMention] = useState<MentionState | null>(null)
  const [tab, setTab] = useState<'entity' | 'beat'>('entity')
  const [highlight, setHighlight] = useState(0)
  const [creating, setCreating] = useState(false)
  const [empty, setEmpty] = useState(!value)

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (value === lastEmittedRef.current) return
    el.innerHTML = contentToEditorHtml(value, sourceType)
    lastEmittedRef.current = value
    setEmpty(!value)
    setMention(null)
  }, [value, sourceType])

  useLayoutEffect(() => {
    const el = editorRef.current
    if (!el) return
    el.innerHTML = contentToEditorHtml(value, sourceType)
    lastEmittedRef.current = value
    setEmpty(!value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  type Item =
    | { type: 'entity'; entity: Entity }
    | { type: 'beat'; beat: Beat }
    | { type: 'create'; name: string; target: 'entity' | 'beat' }

  const items: Item[] = useMemo(() => {
    if (!mention) return []
    const q = mention.query.trim()
    if (tab === 'entity') {
      const filtered = filterEntitiesByQuery(entities, mention.query)
      const list: Item[] = filtered.map((entity) => ({ type: 'entity', entity }))
      if (q && !entities.some((e) => e.name === q)) {
        list.push({ type: 'create', name: q, target: 'entity' })
      }
      return list
    }
    const filtered = filterBeatsByQuery(beats, mention.query)
    const list: Item[] = filtered.map((beat) => ({ type: 'beat', beat }))
    if (q && !beats.some((b) => b.title === q)) {
      list.push({ type: 'create', name: q, target: 'beat' })
    }
    return list
  }, [mention, tab, entities, beats])

  useEffect(() => {
    setHighlight(0)
  }, [mention?.query, tab, items.length])

  const emitFromDom = useCallback((): void => {
    const el = editorRef.current
    if (!el) return
    const next = editorDomToContent(el)
    lastEmittedRef.current = next
    setEmpty(next.length === 0)
    onChange(next)
  }, [onChange])

  const closeMention = useCallback((): void => {
    setMention(null)
    setHighlight(0)
  }, [])

  const detectMentionFromSelection = useCallback((): void => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || !editorRef.current) {
      setMention(null)
      return
    }
    const range = sel.getRangeAt(0)
    if (!editorRef.current.contains(range.startContainer)) {
      setMention(null)
      return
    }
    if (range.startContainer.nodeType !== Node.TEXT_NODE) {
      setMention(null)
      return
    }
    const textNode = range.startContainer as Text
    const full = textNode.textContent ?? ''
    const caret = range.startOffset
    const before = full.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at < 0) {
      setMention(null)
      return
    }
    if (at > 0 && /[\w一-鿿]/.test(before[at - 1]!)) {
      setMention(null)
      return
    }
    const frag = before.slice(at + 1)
    if (/[\s\n]/.test(frag)) {
      setMention(null)
      return
    }
    const r = document.createRange()
    r.setStart(textNode, at)
    r.setEnd(textNode, caret)
    setMention({ range: r, query: frag })
  }, [])

  const insertChip = useCallback(
    (label: string, targetType: MentionTargetType, targetId: string): void => {
      const el = editorRef.current
      if (!el || !mention) return

      const color = mentionColorClass(mentionColor(sourceType, targetType))
      const chip = document.createElement('span')
      chip.className = `${MENTION_CHIP_CLASS} ${color}`
      chip.setAttribute(MENTION_CHIP_ATTR, targetId)
      chip.setAttribute(MENTION_CHIP_TYPE_ATTR, targetType)
      chip.contentEditable = 'false'
      chip.textContent = `@${label.replace(/[\[\]]/g, '').trim() || '未命名'}`

      const r = mention.range
      r.deleteContents()
      r.insertNode(chip)

      const space = document.createTextNode(' ')
      chip.after(space)

      const sel = window.getSelection()
      const after = document.createRange()
      after.setStartAfter(space)
      after.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(after)

      closeMention()
      emitFromDom()
      el.focus()
    },
    [mention, sourceType, closeMention, emitFromDom]
  )

  const handleCreate = async (
    name: string,
    target: 'entity' | 'beat'
  ): Promise<void> => {
    if (!name.trim() || creating) return
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    setCreating(true)
    try {
      if (target === 'entity') {
        const { snapshot: snap, created } = await window.api.project.createEntity(
          projectId,
          {
            name: name.trim()
          }
        )
        useProjectStore.setState({
          snapshot: snap,
          selectedEntityId: created.id
        })
        void useProjectStore.getState().refreshLibrary()
        insertChip(created.name, 'entity', created.id)
      } else {
        const { snapshot: snap, created } = await window.api.project.createBeat(
          projectId,
          {
            title: name.trim()
          }
        )
        useProjectStore.setState({
          snapshot: snap,
          selectedBeatId: created.id
        })
        void useProjectStore.getState().refreshLibrary()
        insertChip(created.title, 'beat', created.id)
      }
    } finally {
      setCreating(false)
    }
  }

  const onInput = (): void => {
    emitFromDom()
    detectMentionFromSelection()
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (mention) {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMention()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (items.length) setHighlight((h) => (h + 1) % items.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (items.length) setHighlight((h) => (h - 1 + items.length) % items.length)
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && items.length) {
        e.preventDefault()
        const item = items[highlight]
        if (!item) return
        if (item.type === 'entity') insertChip(item.entity.name, 'entity', item.entity.id)
        else if (item.type === 'beat') insertChip(item.beat.title, 'beat', item.beat.id)
        else void handleCreate(item.name, item.target)
        return
      }
    }

    if (e.key === 'Backspace') {
      const sel = window.getSelection()
      if (!sel || !sel.isCollapsed || sel.rangeCount === 0) return
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      const offset = range.startOffset
      if (node.nodeType === Node.TEXT_NODE && offset === 0) {
        const prev = node.previousSibling as HTMLElement | null
        if (prev?.getAttribute?.(MENTION_CHIP_ATTR)) {
          e.preventDefault()
          prev.remove()
          emitFromDom()
        }
      } else if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
        const child = (node as HTMLElement).childNodes[offset - 1] as
          | HTMLElement
          | undefined
        if (child?.getAttribute?.(MENTION_CHIP_ATTR)) {
          e.preventDefault()
          child.remove()
          emitFromDom()
        }
      }
    }
  }

  const onClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    const target = e.target as HTMLElement
    const chip = target.closest?.(`.${MENTION_CHIP_CLASS}`) as HTMLElement | null
    if (chip?.getAttribute(MENTION_CHIP_ATTR)) {
      e.preventDefault()
      e.stopPropagation()
      const id = chip.getAttribute(MENTION_CHIP_ATTR)!
      const type = (chip.getAttribute(MENTION_CHIP_TYPE_ATTR) ?? 'entity') as MentionTargetType
      if (type === 'beat') onOpenBeat?.(id)
      else onOpenEntity?.(id)
      return
    }
    detectMentionFromSelection()
  }

  const popoverPos = useMentionPopoverPos(editorRef, mention)

  return (
    <div className={cn('relative min-h-0 flex-1', className)}>
      {empty && placeholder ? (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 text-sm leading-7 text-muted-foreground',
            padClassName
          )}
        >
          {placeholder}
        </div>
      ) : null}

      <div
        className={cn(
          'relative z-[1] h-full min-h-[120px] w-full overflow-auto outline-none app-scrollbar',
          'whitespace-pre-wrap break-words text-sm leading-7 text-foreground',
          padClassName
        )}
        contentEditable
        onClick={onClick}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onKeyUp={detectMentionFromSelection}
        ref={editorRef}
        role="textbox"
        spellCheck={false}
        suppressContentEditableWarning
      />

      {mention ? (
        <MentionPopover
          creating={creating}
          highlight={highlight}
          items={items}
          onClose={closeMention}
          onCreate={(n, t) => void handleCreate(n, t)}
          onHighlight={setHighlight}
          onSelectBeat={(b) => insertChip(b.title, 'beat', b.id)}
          onSelectEntity={(ent) => insertChip(ent.name, 'entity', ent.id)}
          onTabChange={setTab}
          position={popoverPos}
          query={mention.query}
          setQuery={(q) => setMention((m) => (m ? { ...m, query: q } : m))}
          tab={tab}
        />
      ) : null}

      <style>{mentionChipStyles}</style>
    </div>
  )
}

/** @deprecated 旧名兼容导出 */
export const EntityMentionEditor = MentionEditor

function MentionPopover({
  query,
  setQuery,
  tab,
  onTabChange,
  items,
  highlight,
  onHighlight,
  onSelectEntity,
  onSelectBeat,
  onCreate,
  onClose,
  creating,
  position
}: {
  query: string
  setQuery: (q: string) => void
  tab: 'entity' | 'beat'
  onTabChange: (t: 'entity' | 'beat') => void
  items: Array<
    | { type: 'entity'; entity: Entity }
    | { type: 'beat'; beat: Beat }
    | { type: 'create'; name: string; target: 'entity' | 'beat' }
  >
  highlight: number
  onHighlight: (i: number) => void
  onSelectEntity: (entity: Entity) => void
  onSelectBeat: (beat: Beat) => void
  onCreate: (name: string, target: 'entity' | 'beat') => void
  onClose: () => void
  creating: boolean
  position: { top: number; left: number } | null
}): React.JSX.Element {
  return (
    <div
      className="absolute z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg"
      style={{
        top: position?.top ?? 40,
        left: position?.left ?? 16
      }}
    >
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          className="h-7 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
            }
          }}
          placeholder="搜索…"
          value={query}
        />
      </div>

      <div className="border-b border-border px-2 py-1.5">
        <Tabs
          onValueChange={(v) => onTabChange(v as 'entity' | 'beat')}
          value={tab}
        >
          <TabsList className="w-full">
            <TabsTrigger value="entity">
              <Users className="mr-1 size-3" />
              实体
            </TabsTrigger>
            <TabsTrigger value="beat">
              <CircleDot className="mr-1 size-3" />
              节点
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ul className="max-h-52 overflow-y-auto p-1 app-scrollbar">
        {items.length === 0 ? (
          <li className="px-2 py-3 text-center text-xs text-muted-foreground">
            输入名称搜索或创建
          </li>
        ) : (
          items.map((item, i) => {
            const active = i === highlight
            if (item.type === 'create') {
              return (
                <li key={`c-${item.target}-${item.name}`}>
                  <button
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                      active ? 'bg-muted' : 'hover:bg-muted/70'
                    )}
                    disabled={creating}
                    onClick={() => onCreate(item.name, item.target)}
                    onMouseEnter={() => onHighlight(i)}
                    type="button"
                  >
                    <Plus className="size-3.5 text-muted-foreground" />
                    创建{item.target === 'entity' ? '实体' : '节点'}「{item.name}」
                  </button>
                </li>
              )
            }
            if (item.type === 'entity') {
              return (
                <li key={item.entity.id}>
                  <button
                    className={cn(
                      'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm',
                      active ? 'bg-muted' : 'hover:bg-muted/70'
                    )}
                    onClick={() => onSelectEntity(item.entity)}
                    onMouseEnter={() => onHighlight(i)}
                    type="button"
                  >
                    <span className="truncate font-medium">{item.entity.name}</span>
                  </button>
                </li>
              )
            }
            return (
              <li key={item.beat.id}>
                <button
                  className={cn(
                    'flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm',
                    active ? 'bg-muted' : 'hover:bg-muted/70'
                  )}
                  onClick={() => onSelectBeat(item.beat)}
                  onMouseEnter={() => onHighlight(i)}
                  type="button"
                >
                  <span className="truncate font-medium">
                    {item.beat.title || '未命名节点'}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}

function useMentionPopoverPos(
  editorRef: React.RefObject<HTMLDivElement | null>,
  mention: MentionState | null
): { top: number; left: number } | null {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!mention || !editorRef.current) {
      setPos(null)
      return
    }
    try {
      const rect = mention.range.getBoundingClientRect()
      const root = editorRef.current.getBoundingClientRect()
      setPos({
        top: Math.min(
          Math.max(rect.bottom - root.top + editorRef.current.scrollTop + 4, 8),
          editorRef.current.clientHeight - 8
        ),
        left: Math.min(
          Math.max(rect.left - root.left + editorRef.current.scrollLeft, 8),
          Math.max(8, editorRef.current.clientWidth - 300)
        )
      })
    } catch {
      setPos({ top: 40, left: 16 })
    }
  }, [mention, editorRef])

  return pos
}
