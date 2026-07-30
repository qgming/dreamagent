import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleDot,
  FileText,
  GripVertical,
  ListTodo,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Sparkles,
  Trash2,
  Users,
  X
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BEAT_STATUS_LABELS,
  CHAPTER_STATUS_LABELS,
  ENTITY_STATUS_LABELS,
  type Chapter
} from '@shared/project-types'
import type { SessionSummary } from '@shared/ui-chat'
import type { TodoItem, TodoStatus } from '@shared/todos'
import { CreateRuntimeProvider } from './assistant/CreateRuntimeProvider'
import { CreateAssistantThread } from './assistant/CreateAssistantThread'
import { contentToEditorHtml } from '@shared/mentions'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/animated-tabs'
import {
  SortableHandle,
  SortableItem,
  SortableList
} from '@/components/ui/sortable-list'
import {
  flattenVisibleTree,
  TreeRowShell,
  TreeSortableSections,
  useExpandedSet
} from '@/components/ui/tree-list'
import { FolderPlus } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  arrayMove,
  BEAT_STATUS_DOT_CLASS,
  CHAPTER_STATUS_DOT_CLASS,
  ENTITY_STATUS_DOT_CLASS
} from '@/lib/project-utils'
import { mentionChipStyles } from '@/lib/mention-styles'
import { computeBacklinks } from '@/lib/backlinks'
import {
  getBeatChildren,
  getChapterFolderChildren,
  getChaptersInFolder,
  getEntityChildren,
  getOrderedBeats,
  getOrderedChapters,
  getOrderedEntities,
  useProjectStore
} from '@/stores/project-store'
import type { ChapterFolderMeta } from '@shared/project-types'
import { NamePromptModal } from '@/components/ui/name-prompt-modal'
import {
  isDetailTargetAvailable,
  useCreateStore,
  type DetailTarget
} from '@/stores/create-store'
import { ContextDisplay } from '@/components/assistant-ui/context-display'
import {
  RelatedLinksPopover,
  type RelatedLinkItem
} from '@/components/create/RelatedLinksPopover'

/** 右栏固定宽度，展开/收起带动中栏平滑变宽 */
const RIGHT_PANEL_WIDTH = 400

const PANEL_SPRING = { type: 'spring' as const, stiffness: 380, damping: 36 }

/** Tab 内容左右切换：缓动，无弹簧 */
const TAB_SLIDE_EASE = { duration: 0.2, ease: [0.25, 0.1, 0.25, 1] as const }

const TAB_ORDER = ['conversations', 'articles'] as const

/**
 * 创作工作台：左（资料+会话）· 中（对话）· 右（可收起详情）
 * 右栏：用户手动开关 → spring；进页/会话恢复 → 硬切
 */
export function CreateWorkspace(): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const ensureSession = useCreateStore((s) => s.ensureSession)
  const rightPanelOpen = useCreateStore((s) => s.rightPanelOpen)
  const rightPanelAnimate = useCreateStore((s) => s.rightPanelAnimate)
  const detailTarget = useCreateStore((s) => s.detailTarget)

  useEffect(() => {
    if (snapshot) void ensureSession()
  }, [snapshot?.meta.id, ensureSession])

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        请先在侧栏打开或新建一个项目
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0">
      <style>{mentionChipStyles}</style>
      <CreateLeftSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <ChatPane />
        </div>
        <RightPanelSlot
          animate={rightPanelAnimate}
          open={rightPanelOpen && isDetailTargetAvailable(snapshot, detailTarget)}
        />
      </div>
    </div>
  )
}

/** 右栏插槽：手动 → spring；进页/会话恢复 → DOM 硬切 */
function RightPanelSlot({
  open,
  animate
}: {
  open: boolean
  animate: boolean
}): React.JSX.Element {
  const panelInner = (
    <div className="flex h-full min-h-0 flex-col" style={{ width: RIGHT_PANEL_WIDTH }}>
      <RightDetailPanel />
    </div>
  )

  if (!animate) {
    if (!open) return <></>
    return (
      <aside
        className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-border"
        style={{ width: RIGHT_PANEL_WIDTH }}
      >
        {panelInner}
      </aside>
    )
  }

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          animate={{ width: RIGHT_PANEL_WIDTH, opacity: 1 }}
          className="flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-border"
          exit={{ width: 0, opacity: 0 }}
          initial={{ width: 0, opacity: 0 }}
          key="right-panel"
          transition={PANEL_SPRING}
        >
          {panelInner}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  )
}

// ── 左栏：节点/实体（默认可收起）+ 对话|文章 Tab ─────────

function CreateLeftSidebar(): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const leftBeatsOpen = useCreateStore((s) => s.leftBeatsOpen)
  const leftEntitiesOpen = useCreateStore((s) => s.leftEntitiesOpen)
  const setLeftBeatsOpen = useCreateStore((s) => s.setLeftBeatsOpen)
  const setLeftEntitiesOpen = useCreateStore((s) => s.setLeftEntitiesOpen)
  const leftListTab = useCreateStore((s) => s.leftListTab)
  const setLeftListTab = useCreateStore((s) => s.setLeftListTab)
  const openDetail = useCreateStore((s) => s.openDetail)
  const detailTarget = useCreateStore((s) => s.detailTarget)
  const summaries = useCreateStore((s) => s.sessionSummaries)
  const activeId = useCreateStore((s) => s.activeSessionId)
  const openSession = useCreateStore((s) => s.openSession)
  const newSession = useCreateStore((s) => s.newSession)
  const sending = useCreateStore((s) => s.sending)
  const todos = useCreateStore((s) => s.todos)
  // 1 = 向右（后一个 tab），-1 = 向左
  const [tabDirection, setTabDirection] = useState(0)
  const prevTabRef = useRef(leftListTab)

  const beats = getOrderedBeats(snapshot)
  const entities = getOrderedEntities(snapshot)
  const articles = getOrderedChapters(snapshot)
  const createChapterFolder = useProjectStore((s) => s.createChapterFolder)
  const deleteChapterFolder = useProjectStore((s) => s.deleteChapterFolder)
  const reorderChaptersInFolder = useProjectStore((s) => s.reorderChaptersInFolder)
  const reorderChapterFolders = useProjectStore((s) => s.reorderChapterFolders)
  const [folderPrompt, setFolderPrompt] = useState<{
    open: boolean
    parentId: string | null
  }>({ open: false, parentId: null })

  const projectId = snapshot?.meta.id ?? null
  const expandKey = projectId
    ? `dreamagent:article-folders-expanded:${projectId}`
    : null
  const { expanded, toggle, expandAll } = useExpandedSet(expandKey)

  // 资料区节点/实体树展开状态
  const beatExpandKey = projectId ? `dreamagent:create-beats-expanded:${projectId}` : null
  const entityExpandKey = projectId
    ? `dreamagent:create-entities-expanded:${projectId}`
    : null
  const {
    expanded: beatExpanded,
    toggle: toggleBeat,
    expandAll: expandAllBeats
  } = useExpandedSet(beatExpandKey)
  const {
    expanded: entityExpanded,
    toggle: toggleEntity,
    expandAll: expandAllEntities
  } = useExpandedSet(entityExpandKey)

  const rootBeats = useMemo(() => {
    if (!snapshot) return []
    return (snapshot.index.beats.roots ?? [])
      .map((id) => snapshot.beats[id])
      .filter(Boolean)
  }, [snapshot])

  const rootEntities = useMemo(() => {
    if (!snapshot) return []
    return (snapshot.index.entities.roots ?? [])
      .map((id) => snapshot.entities[id])
      .filter(Boolean)
  }, [snapshot])

  const beatRows = useMemo(() => {
    if (!snapshot) return []
    return flattenVisibleTree(rootBeats, (b) => getBeatChildren(snapshot, b.id), beatExpanded)
  }, [snapshot, rootBeats, beatExpanded])

  const entityRows = useMemo(() => {
    if (!snapshot) return []
    return flattenVisibleTree(
      rootEntities,
      (e) => getEntityChildren(snapshot, e.id),
      entityExpanded
    )
  }, [snapshot, rootEntities, entityExpanded])

  useEffect(() => {
    if (!snapshot) return
    const withKids = Object.keys(snapshot.index.chapterFolders?.children ?? {})
    // 也展开有文章的文件夹
    const withArts = Object.keys(snapshot.index.chapters?.byFolder ?? {})
    expandAll([...withKids, ...withArts])
    // 资料树：默认展开已有子项的父节点
    expandAllBeats(Object.keys(snapshot.index.beats.children ?? {}))
    expandAllEntities(Object.keys(snapshot.index.entities.children ?? {}))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.meta.id])

  const handleListTabChange = (v: string): void => {
    const next = v as 'conversations' | 'articles'
    const from = TAB_ORDER.indexOf(prevTabRef.current)
    const to = TAB_ORDER.indexOf(next)
    setTabDirection(to >= from ? 1 : -1)
    prevTabRef.current = next
    setLeftListTab(next)
  }

  const handleArticlesReorder = (from: number, to: number): void => {
    if (!snapshot || from === to) return
    // 兼容：根级文章重排
    void reorderChaptersInFolder({
      folderId: null,
      orderedIds: arrayMove(snapshot.index.chapters.roots ?? [], from, to)
    })
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      {/* 上：节点 / 实体（可折叠，默认收起） */}
      <div className="shrink-0 px-3 pt-3">
        <CollapsibleSection
          count={beats.length}
          icon={CircleDot}
          label="节点"
          onToggle={() => setLeftBeatsOpen(!leftBeatsOpen)}
          open={leftBeatsOpen}
        >
          {rootBeats.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">暂无节点</p>
          ) : (
            beatRows.map((row) => (
              <SourceRow
                active={detailTarget?.type === 'beat' && detailTarget.id === row.item.id}
                depth={row.depth}
                dotClass={BEAT_STATUS_DOT_CLASS[row.item.status]}
                hasChildren={row.hasChildren}
                key={row.item.id}
                label={row.item.title || '未命名节点'}
                onClick={() => {
                  openDetail({ type: 'beat', id: row.item.id })
                  if (row.hasChildren) toggleBeat(row.item.id)
                }}
                statusTitle={BEAT_STATUS_LABELS[row.item.status]}
              />
            ))
          )}
        </CollapsibleSection>

        <CollapsibleSection
          count={entities.length}
          icon={Users}
          label="实体"
          onToggle={() => setLeftEntitiesOpen(!leftEntitiesOpen)}
          open={leftEntitiesOpen}
        >
          {rootEntities.length === 0 ? (
            <p className="px-2 py-2 text-xs text-muted-foreground">暂无实体</p>
          ) : (
            entityRows.map((row) => (
              <SourceRow
                active={detailTarget?.type === 'entity' && detailTarget.id === row.item.id}
                depth={row.depth}
                dotClass={ENTITY_STATUS_DOT_CLASS[row.item.status]}
                hasChildren={row.hasChildren}
                key={row.item.id}
                label={row.item.name}
                onClick={() => {
                  openDetail({ type: 'entity', id: row.item.id })
                  if (row.hasChildren) toggleEntity(row.item.id)
                }}
                statusTitle={ENTITY_STATUS_LABELS[row.item.status]}
              />
            ))
          )}
        </CollapsibleSection>
      </div>

      {todos.length > 0 ? (
        <div className="shrink-0 border-t border-border px-3 pt-2">
          <SessionTodoPanel todos={todos} />
        </div>
      ) : null}

      {/* 下：对话 | 文章（指示条 + 内容左右滑） */}
      <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-border px-3 pt-3">
        <Tabs className="mb-2 shrink-0" onValueChange={handleListTabChange} value={leftListTab}>
          <TabsList className="w-full">
            <TabsTrigger value="conversations">
              <MessageSquare className="mr-1 size-3.5 shrink-0" />
              对话
            </TabsTrigger>
            <TabsTrigger value="articles">
              <FileText className="mr-1 size-3.5 shrink-0" />
              文章
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 按切换方向左右滑入/滑出 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence custom={tabDirection} initial={false} mode="wait">
            {leftListTab === 'conversations' ? (
              <motion.div
                animate={{ x: 0, opacity: 1 }}
                className="absolute inset-0 flex flex-col"
                exit={{ x: tabDirection >= 0 ? -20 : 20, opacity: 0 }}
                initial={{ x: tabDirection >= 0 ? 20 : -20, opacity: 0 }}
                key="conversations"
                transition={TAB_SLIDE_EASE}
              >
                <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto app-scrollbar">
                  {summaries.length === 0 ? (
                    <p className="px-2 py-4 text-xs text-muted-foreground">还没有对话</p>
                  ) : (
                    summaries.map((s) => (
                      <ConversationListRow
                        active={activeId === s.id}
                        key={s.id}
                        onOpen={() => void openSession(s.id)}
                        summary={s}
                      />
                    ))
                  )}
                </div>
                <div className="shrink-0 border-t border-border py-3">
                  <button
                    className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                    disabled={sending}
                    onClick={() => void newSession()}
                    type="button"
                  >
                    <MessageSquarePlus className="size-3.5" />
                    新对话
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                animate={{ x: 0, opacity: 1 }}
                className="absolute inset-0 flex flex-col overflow-hidden"
                exit={{ x: tabDirection >= 0 ? -20 : 20, opacity: 0 }}
                initial={{ x: tabDirection >= 0 ? 20 : -20, opacity: 0 }}
                key="articles"
                transition={TAB_SLIDE_EASE}
              >
                <div className="min-h-0 flex-1 overflow-y-auto app-scrollbar">
                  {!snapshot ||
                  (articles.length === 0 &&
                    Object.keys(snapshot.chapterFolders ?? {}).length === 0) ? (
                    <p className="px-2 py-4 text-xs text-muted-foreground">
                      还没有文章。在对话里生成后会出现在这里。
                    </p>
                  ) : (
                    <ArticlesTree
                      detailTarget={detailTarget}
                      expanded={expanded}
                      onOpenChapter={(id) => openDetail({ type: 'chapter', id })}
                      onReorderChapters={(folderId, from, to) => {
                        if (!snapshot) return
                        const ids = !folderId
                          ? [...(snapshot.index.chapters.roots ?? [])]
                          : [...(snapshot.index.chapters.byFolder[folderId] ?? [])]
                        void reorderChaptersInFolder({
                          folderId,
                          orderedIds: arrayMove(ids, from, to)
                        })
                      }}
                      onReorderFolders={(parentId, from, to) => {
                        if (!snapshot) return
                        const ids =
                          parentId === null
                            ? [...snapshot.index.chapterFolders.roots]
                            : [
                                ...(snapshot.index.chapterFolders.children[parentId] ??
                                  [])
                              ]
                        void reorderChapterFolders({
                          parentId,
                          orderedIds: arrayMove(ids, from, to)
                        })
                      }}
                      onToggle={toggle}
                      snapshot={snapshot}
                    />
                  )}
                </div>
                <div className="shrink-0 border-t border-border py-2">
                  <button
                    className="flex h-8 w-full items-center justify-center gap-2 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => setFolderPrompt({ open: true, parentId: null })}
                    type="button"
                  >
                    <FolderPlus className="size-3.5" />
                    新建文件夹
                  </button>
                </div>
                <NamePromptModal
                  confirmLabel="创建"
                  initialValue=""
                  label="文件夹名称"
                  onOpenChange={(open) => {
                    if (!open) setFolderPrompt({ open: false, parentId: null })
                  }}
                  onSubmit={async (name) => {
                    await createChapterFolder({
                      name,
                      parentId: folderPrompt.parentId
                    })
                    setFolderPrompt({ open: false, parentId: null })
                  }}
                  open={folderPrompt.open}
                  placeholder="例如：卷一"
                  submittingLabel="创建中…"
                  title="新建文章文件夹"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  )
}

function ConversationListRow({
  summary,
  active,
  onOpen
}: {
  summary: SessionSummary
  active: boolean
  onOpen: () => void
}): React.JSX.Element {
  const deleteSession = useCreateStore((s) => s.deleteSession)

  const handleDelete = (): void => {
    void (async () => {
      const ok = await confirmDelete({
        title: '删除对话',
        description: `确定删除对话「${summary.title || '新对话'}」？\n此操作不可恢复。`
      })
      if (!ok) return
      await deleteSession(summary.id)
    })()
  }

  return (
    <div
      className={cn(
        // 单行：只保留对话名称，与节点/文章行高一致
        // hover 用黑/白半透明：侧栏 bg-sidebar≈muted，hover:bg-muted 几乎不可见
        'group flex items-center gap-0.5 rounded-md px-1 py-1 text-sm transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]'
      )}
    >
      <button
        className="min-w-0 flex-1 truncate text-left"
        onClick={onOpen}
        type="button"
      >
        {summary.title || '新对话'}
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
          <DropdownMenuItem onSelect={handleDelete} variant="destructive">
            <Trash2 className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** 文章树：文件夹 + 文章，同级可排序 */
function ArticlesTree({
  snapshot,
  expanded,
  onToggle,
  onOpenChapter,
  onReorderChapters,
  onReorderFolders,
  detailTarget
}: {
  snapshot: NonNullable<ReturnType<typeof useProjectStore.getState>['snapshot']>
  expanded: Set<string>
  onToggle: (id: string) => void
  onOpenChapter: (id: string) => void
  onReorderChapters: (folderId: string | null, from: number, to: number) => void
  onReorderFolders: (parentId: string | null, from: number, to: number) => void
  detailTarget: DetailTarget | null
}): React.JSX.Element {
  const deleteChapterFolder = useProjectStore((s) => s.deleteChapterFolder)
  const createChapterFolder = useProjectStore((s) => s.createChapterFolder)
  const updateChapterFolder = useProjectStore((s) => s.updateChapterFolder)
  const [subFolderPrompt, setSubFolderPrompt] = useState<string | null>(null)
  const [renameFolder, setRenameFolder] = useState<{
    id: string
    name: string
  } | null>(null)

  type Mixed =
    | { kind: 'folder'; id: string; folder: ChapterFolderMeta }
    | { kind: 'chapter'; id: string; chapter: Chapter }

  const rootFolders = getChapterFolderChildren(snapshot, null)
  const rootChapters = getChaptersInFolder(snapshot, null)

  const rootItems: Mixed[] = [
    ...rootFolders.map((f) => ({ kind: 'folder' as const, id: f.id, folder: f })),
    ...rootChapters.map((c) => ({ kind: 'chapter' as const, id: c.id, chapter: c }))
  ]

  const getChildren = (item: Mixed): Mixed[] => {
    if (item.kind !== 'folder') return []
    if (!expanded.has(item.id)) return []
    const subs = getChapterFolderChildren(snapshot, item.id).map((f) => ({
      kind: 'folder' as const,
      id: f.id,
      folder: f
    }))
    const chaps = getChaptersInFolder(snapshot, item.id).map((c) => ({
      kind: 'chapter' as const,
      id: c.id,
      chapter: c
    }))
    return [...subs, ...chaps]
  }

  // 手动渲染：文件夹与文章混排时，同级排序分两类 API，简化为分组渲染
  const renderFolderBranch = (folderId: string | null, depth: number): React.ReactNode => {
    const folders = getChapterFolderChildren(snapshot, folderId)
    const chapters = getChaptersInFolder(snapshot, folderId)
    return (
      <div className="space-y-0.5">
        {folders.length > 0 ? (
          <SortableList
            as="div"
            className="space-y-0.5"
            ids={folders.map((f) => f.id)}
            onReorder={(from, to) => onReorderFolders(folderId, from, to)}
          >
            {folders.map((f) => {
              const open = expanded.has(f.id)
              const childFolders = getChapterFolderChildren(snapshot, f.id)
              const childChaps = getChaptersInFolder(snapshot, f.id)
              const hasChildren = childFolders.length > 0 || childChaps.length > 0
              return (
                <div key={f.id}>
                  <TreeRowShell depth={depth} id={f.id}>
                    <button
                      className="min-w-0 flex-1 truncate text-left text-xs font-medium"
                      onClick={() => {
                        if (hasChildren) onToggle(f.id)
                      }}
                      type="button"
                    >
                      {f.name}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none',
                          'opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100',
                          'data-[state=open]:bg-muted data-[state=open]:opacity-100'
                        )}
                        type="button"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() =>
                            setRenameFolder({ id: f.id, name: f.name })
                          }
                        >
                          <Pencil className="size-3.5" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setSubFolderPrompt(f.id)}
                        >
                          <FolderPlus className="size-3.5" />
                          新建子文件夹
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => {
                            void (async () => {
                              const ok = await confirmDelete({
                                title: '删除文件夹',
                                description: `删除「${f.name}」后，内含文章与子文件夹将提升到上一级。`
                              })
                              if (!ok) return
                              await deleteChapterFolder(f.id)
                            })()
                          }}
                          variant="destructive"
                        >
                          <Trash2 className="size-3.5" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TreeRowShell>
                  {open ? renderFolderBranch(f.id, depth + 1) : null}
                </div>
              )
            })}
          </SortableList>
        ) : null}
        {chapters.length > 0 ? (
          <SortableList
            as="div"
            className="space-y-0.5"
            ids={chapters.map((c) => c.id)}
            onReorder={(from, to) => onReorderChapters(folderId, from, to)}
          >
            {chapters.map((c) => (
              <ArticleListRow
                active={detailTarget?.type === 'chapter' && detailTarget.id === c.id}
                article={c}
                depth={depth}
                key={c.id}
                onOpen={() => onOpenChapter(c.id)}
              />
            ))}
          </SortableList>
        ) : null}
      </div>
    )
  }

  return (
    <>
      {renderFolderBranch(null, 0)}
      <NamePromptModal
        confirmLabel="创建"
        initialValue=""
        label="文件夹名称"
        onOpenChange={(open) => {
          if (!open) setSubFolderPrompt(null)
        }}
        onSubmit={async (name) => {
          if (!subFolderPrompt) return
          await createChapterFolder({ name, parentId: subFolderPrompt })
          setSubFolderPrompt(null)
        }}
        open={subFolderPrompt !== null}
        placeholder="例如：上"
        submittingLabel="创建中…"
        title="新建子文件夹"
      />
      <NamePromptModal
        confirmLabel="保存"
        initialValue={renameFolder?.name ?? ''}
        label="文件夹名称"
        onOpenChange={(open) => {
          if (!open) setRenameFolder(null)
        }}
        onSubmit={async (name) => {
          if (!renameFolder) return
          await updateChapterFolder(renameFolder.id, { name })
          setRenameFolder(null)
        }}
        open={renameFolder !== null}
        placeholder="例如：卷一"
        submittingLabel="保存中…"
        title="重命名文件夹"
      />
    </>
  )
}

function ArticleListRow({
  article,
  active,
  onOpen,
  depth = 0
}: {
  article: Chapter
  active: boolean
  onOpen: () => void
  depth?: number
}): React.JSX.Element {
  const updateChapter = useProjectStore((s) => s.updateChapter)
  const deleteChapter = useProjectStore((s) => s.deleteChapter)

  const handleToggleStatus = (): void => {
    const next = article.status === 'final' ? 'draft' : 'final'
    void updateChapter(article.id, { status: next })
  }

  const handleDelete = (): void => {
    void (async () => {
      const ok = await confirmDelete({
        title: '删除文章',
        description: `确定删除文章「${article.title || '未命名文章'}」？\n此操作不可恢复。`
      })
      if (!ok) return
      await deleteChapter(article.id)
    })()
  }

  return (
    <TreeRowShell active={active} depth={depth} id={article.id}>
      <span className="size-5 shrink-0" />
      <button
        className="min-w-0 flex-1 truncate text-left"
        onClick={onOpen}
        type="button"
      >
        {article.title || '未命名文章'}
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
          <DropdownMenuItem onSelect={handleToggleStatus}>
            {article.status === 'final' ? (
              <>
                <RotateCcw className="size-3.5" />
                标为草稿
              </>
            ) : (
              <>
                <CheckCircle2 className="size-3.5" />
                定稿
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleDelete} variant="destructive">
            <Trash2 className="size-3.5" />
            删除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* 最右侧状态点，与节点/实体一致 */}
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          CHAPTER_STATUS_DOT_CLASS[article.status]
        )}
        title={CHAPTER_STATUS_LABELS[article.status]}
      />
    </TreeRowShell>
  )
}

function sessionTodoIcon(status: TodoStatus): React.JSX.Element {
  const cls = 'size-3 shrink-0'
  switch (status) {
    case 'completed':
      return <CheckCircle2 className={cn(cls, 'text-emerald-500')} />
    case 'in_progress':
      return <Loader2 className={cn(cls, 'animate-spin text-sky-500')} />
    case 'cancelled':
      return <Minus className={cn(cls, 'text-muted-foreground')} />
    default:
      return <Circle className={cn(cls, 'text-muted-foreground')} />
  }
}

/** 左栏：当前会话 Agent 待办 */
function SessionTodoPanel({ todos }: { todos: TodoItem[] }): React.JSX.Element {
  const done = todos.filter((t) => t.status === 'completed').length
  return (
    <div className="pb-1">
      <div className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
        <ListTodo className="size-3" />
        待办
        <span className="ml-auto normal-case tracking-normal text-muted-foreground">
          {done}/{todos.length}
        </span>
      </div>
      <ul className="max-h-36 space-y-0.5 overflow-y-auto app-scrollbar">
        {todos.map((t) => (
          <li
            key={t.id}
            className={cn(
              'flex items-start gap-1.5 rounded-md px-2 py-1 text-[11px] leading-snug',
              t.status === 'completed' && 'opacity-60',
              t.status === 'cancelled' && 'opacity-40 line-through'
            )}
            title={`${t.id} · ${t.status}`}
          >
            {sessionTodoIcon(t.status)}
            <span className="min-w-0 flex-1 truncate">{t.content}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CollapsibleSection({
  label,
  icon: Icon,
  open,
  onToggle,
  count,
  children
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  open: boolean
  onToggle: () => void
  count: number
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="mb-0.5">
      <button
        className="group flex h-9 w-full items-center gap-1.5 rounded-md px-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]"
        onClick={onToggle}
        type="button"
      >
        <Icon className="size-3.5 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
        {/* 右侧：数字固定；hover / 展开时箭头叠在数字上 */}
        <span className="relative flex size-5 shrink-0 items-center justify-center">
          <span
            className={cn(
              'tabular-nums text-[10px] text-muted-foreground transition-opacity',
              'group-hover:opacity-0',
              open && 'opacity-0'
            )}
          >
            {count}
          </span>
          <motion.span
            animate={{ rotate: open ? 90 : 0 }}
            className={cn(
              'absolute inset-0 inline-flex items-center justify-center transition-opacity',
              open || 'opacity-0 group-hover:opacity-100'
            )}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          >
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </motion.span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            animate={{ height: 'auto', opacity: 1 }}
            className="overflow-hidden"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="mb-1 ml-3 max-h-40 space-y-0.5 overflow-y-auto border-l border-border pl-2 app-scrollbar">
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function SourceRow({
  label,
  active,
  onClick,
  dotClass,
  statusTitle,
  depth = 0,
  hasChildren = false
}: {
  label: string
  active: boolean
  onClick: () => void
  dotClass: string
  statusTitle: string
  depth?: number
  hasChildren?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        // 字号放在容器上（与实体/节点页 li 一致），避免历史 button font 继承坑
        // hover 用黑/白半透明：侧栏 bg-sidebar≈muted，hover:bg-muted 几乎不可见
        'group flex items-center gap-0.5 rounded-md py-1 pr-1 text-sm transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]'
      )}
      style={{ paddingLeft: 4 + depth * 12 }}
    >
      <button
        className="min-w-0 flex-1 truncate text-left"
        onClick={onClick}
        type="button"
      >
        {label}
      </button>
      <span
        className={cn('size-2 shrink-0 rounded-full', dotClass)}
        title={
          hasChildren ? `${statusTitle} · 点击标题可展开/收起子项` : statusTitle
        }
      />
    </div>
  )
}

// ── 中栏：assistant-ui 对话 ─────────────────────────────

function ChatPane(): React.JSX.Element {
  const sessionId = useCreateStore((s) => s.activeSessionId)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <ChatHeader />
      <PinnedChips />
      <div className="flex min-h-0 flex-1 flex-col">
        <CreateRuntimeProvider key={sessionId ?? 'none'}>
          <CreateAssistantThread />
        </CreateRuntimeProvider>
      </div>
    </div>
  )
}

function ChatHeader(): React.JSX.Element {
  const active = useCreateStore((s) => s.session)
  const compactionState = useCreateStore((s) => s.compactionState)
  const compactionError = useCreateStore((s) => s.compactionError)

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <Sparkles className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold">{active?.title || '新对话'}</h1>
      </div>
      {active?.usage ? (
        <ContextDisplay
          compactionError={compactionError}
          compactionState={compactionState}
          usage={active.usage}
        />
      ) : null}
    </div>
  )
}

function PinnedChips(): React.JSX.Element {
  const sess = useCreateStore((s) => s.session)
  const snapshot = useProjectStore((s) => s.snapshot)
  const unpinBeat = useCreateStore((s) => s.unpinBeat)
  const unpinEntity = useCreateStore((s) => s.unpinEntity)
  const openDetail = useCreateStore((s) => s.openDetail)

  const pins = useMemo(() => {
    if (!sess || !snapshot) {
      return [] as Array<{ type: 'beat' | 'entity'; id: string; label: string }>
    }
    const list: Array<{ type: 'beat' | 'entity'; id: string; label: string }> = []
    for (const id of sess.pinnedBeatIds) {
      const b = snapshot.beats[id]
      if (b) list.push({ type: 'beat', id, label: b.title || '未命名' })
    }
    for (const id of sess.pinnedEntityIds) {
      const e = snapshot.entities[id]
      if (e) list.push({ type: 'entity', id, label: e.name || '未命名' })
    }
    return list
  }, [sess, snapshot])

  if (pins.length === 0) return <></>

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
      <span className="text-[11px] text-muted-foreground">钉住</span>
      {pins.map((p) => (
        <span
          className={cn(
            'inline-flex max-w-[140px] items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
            p.type === 'beat'
              ? 'bg-[color-mix(in_oklab,#3b82f6_18%,transparent)] text-[#1d4ed8] dark:text-[#93c5fd]'
              : 'bg-[color-mix(in_oklab,#ef4444_16%,transparent)] text-[#b91c1c] dark:text-[#fca5a5]'
          )}
          key={`${p.type}-${p.id}`}
        >
          <button
            className="truncate"
            onClick={() => openDetail({ type: p.type, id: p.id })}
            type="button"
          >
            @{p.label}
          </button>
          <button
            className="opacity-60 hover:opacity-100"
            onClick={() => void (p.type === 'beat' ? unpinBeat(p.id) : unpinEntity(p.id))}
            title="取消钉住"
            type="button"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

// ── 右栏：详情（文章 / 节点 / 实体）──────────────────────

function RightDetailPanel(): React.JSX.Element {
  const target = useCreateStore((s) => s.detailTarget)
  const openDetail = useCreateStore((s) => s.openDetail)
  const snapshot = useProjectStore((s) => s.snapshot)
  const setProjectView = useProjectStore((s) => s.setProjectView)
  const setSelectedBeatId = useProjectStore((s) => s.setSelectedBeatId)
  const setSelectedEntityId = useProjectStore((s) => s.setSelectedEntityId)
  if (!target || !snapshot) {
    return <></>
  }

  return (
    <DetailContent
      onOpenInPage={(t) => {
        if (t.type === 'beat') {
          setSelectedBeatId(t.id)
          setProjectView('beats')
        } else if (t.type === 'entity') {
          setSelectedEntityId(t.id)
          setProjectView('entities')
        }
      }}
      onOpenRelated={openDetail}
      snapshot={snapshot}
      target={target}
    />
  )
}

function RightPanelHeader({
  title,
  badge,
  extra,
  titleSlot
}: {
  title: string
  badge?: string
  extra?: React.ReactNode
  /** 自定义标题区（可编辑标题） */
  titleSlot?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      {titleSlot ?? (
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h2>
      )}
      {badge ? (
        <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {badge}
        </span>
      ) : null}
      {extra}
    </div>
  )
}

/**
 * 文章可编辑预览：标题 + 纯正文，400ms 防抖自动保存
 */
function ArticleEditor({
  chapter,
  snapshot,
  onOpenRelated
}: {
  chapter: Chapter
  snapshot: NonNullable<ReturnType<typeof useProjectStore.getState>['snapshot']>
  onOpenRelated: (t: DetailTarget) => void
}): React.JSX.Element {
  const updateChapter = useProjectStore((s) => s.updateChapter)
  const [title, setTitle] = useState(chapter.title)
  const [content, setContent] = useState(chapter.content)
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle')
  const chapterRef = useRef(chapter)
  chapterRef.current = chapter

  // 切换文章或外部写入时同步本地（不覆盖正在编辑且未保存的同 id 输入由下方 dirty 逻辑兜底）
  useEffect(() => {
    setTitle(chapter.title)
    setContent(chapter.content)
    setSaveState('idle')
  }, [chapter.id])

  // 外部 snapshot 更新（如同 id 被 agent 改写）且本地未脏时跟进
  useEffect(() => {
    if (saveState === 'dirty' || saveState === 'saving') return
    if (title !== chapter.title) setTitle(chapter.title)
    if (content !== chapter.content) setContent(chapter.content)
    // 仅在非编辑脏状态下跟随磁盘
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.title, chapter.content, chapter.updatedAt])

  useEffect(() => {
    const cur = chapterRef.current
    if (title === cur.title && content === cur.content) {
      return
    }
    setSaveState('dirty')
    const timer = window.setTimeout(() => {
      const latest = chapterRef.current
      const patch: { title?: string; content?: string } = {}
      if (title !== latest.title) patch.title = title.trim() || latest.title
      if (content !== latest.content) patch.content = content
      if (Object.keys(patch).length === 0) {
        setSaveState('idle')
        return
      }
      setSaveState('saving')
      void updateChapter(latest.id, patch)
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('dirty'))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [title, content, updateChapter])

  const saveHint =
    saveState === 'saving'
      ? '保存中…'
      : saveState === 'saved'
        ? '已保存'
        : saveState === 'dirty'
          ? '未保存'
          : null

  const relatedItems: RelatedLinkItem[] = [
    ...[...new Set([...chapter.sourceBeatIds, ...chapter.beatRefs])].flatMap((id) => {
      const beat = snapshot.beats[id]
      return beat
        ? [{ id, label: beat.title || '未命名节点', type: 'beat' as const }]
        : []
    }),
    ...[...new Set(chapter.entityRefs)].flatMap((id) => {
      const entity = snapshot.entities[id]
      return entity
        ? [{ id, label: entity.name || '未命名实体', type: 'entity' as const }]
        : []
    })
  ]

  return (
    <div className="flex h-full flex-col bg-card/10">
      <RightPanelHeader
        badge={CHAPTER_STATUS_LABELS[chapter.status]}
        extra={
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span>{content.length} 字</span>
              {saveHint ? <span>{saveHint}</span> : null}
            </span>
            <RelatedLinksPopover
              onOpen={onOpenRelated}
              outgoing={relatedItems}
            />
          </div>
        }
        title={title || '未命名文章'}
        titleSlot={
          <input
            className="h-8 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted-foreground"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="文章标题"
            value={title}
          />
        }
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
        <textarea
          className="h-full min-h-0 w-full flex-1 resize-none bg-transparent text-[14px] leading-7 text-foreground outline-none placeholder:text-muted-foreground app-scrollbar"
          onChange={(e) => setContent(e.target.value)}
          placeholder="在此编写文章正文…"
          value={content}
        />
      </div>
    </div>
  )
}

function backlinkItems(
  backlinks: ReturnType<typeof computeBacklinks>
): RelatedLinkItem[] {
  return [
    ...backlinks.beats.map((item) => ({ ...item, type: 'beat' as const })),
    ...backlinks.entities.map((item) => ({ ...item, type: 'entity' as const })),
    ...backlinks.chapters.map((item) => ({ ...item, type: 'chapter' as const }))
  ]
}

function DetailContent({
  target,
  snapshot,
  onOpenInPage,
  onOpenRelated
}: {
  target: DetailTarget
  snapshot: NonNullable<ReturnType<typeof useProjectStore.getState>['snapshot']>
  onOpenInPage: (t: DetailTarget) => void
  onOpenRelated: (t: DetailTarget) => void
}): React.JSX.Element {
  if (target.type === 'chapter') {
    const chapter = snapshot.chapters[target.id]
    if (!chapter) {
      return <></>
    }
    return (
      <ArticleEditor
        chapter={chapter}
        onOpenRelated={onOpenRelated}
        snapshot={snapshot}
      />
    )
  }

  if (target.type === 'beat') {
    const beat = snapshot.beats[target.id]
    if (!beat) {
      return <></>
    }
    const back = computeBacklinks(snapshot, 'beat', beat.id)
    const html = contentToEditorHtml(beat.content, 'beat')
    const outgoing: RelatedLinkItem[] = [
      ...beat.beatRefs
        .map((id) => snapshot.beats[id])
        .filter(Boolean)
        .map((item) => ({
          id: item.id,
          label: item.title || '未命名节点',
          type: 'beat' as const
        })),
      ...beat.entityRefs
        .map((id) => snapshot.entities[id])
        .filter(Boolean)
        .map((item) => ({
          id: item.id,
          label: item.name || '未命名实体',
          type: 'entity' as const
        }))
    ]
    return (
      <div className="flex h-full flex-col bg-card/10">
        <RightPanelHeader
          badge={BEAT_STATUS_LABELS[beat.status]}
          extra={
            <RelatedLinksPopover
              incoming={backlinkItems(back)}
              onOpen={onOpenRelated}
              outgoing={outgoing}
            />
          }
          title={beat.title || '未命名节点'}
        />
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 app-scrollbar">
          <div
            className="text-[14px] leading-7 text-foreground"
            dangerouslySetInnerHTML={{ __html: html || '<p class="text-muted-foreground">（无正文）</p>' }}
            onClick={(e) => {
              const el = (e.target as HTMLElement).closest(
                '[data-mention-id]'
              ) as HTMLElement | null
              if (!el) return
              const id = el.getAttribute('data-mention-id')
              const type = el.getAttribute('data-mention-type') as 'beat' | 'entity' | null
              if (id && type) onOpenRelated({ type, id })
            }}
          />
        </div>
        <div className="border-t border-border p-3">
          <Button
            className="w-full"
            onClick={() => onOpenInPage(target)}
            size="sm"
            type="button"
            variant="secondary"
          >
            在节点页打开
          </Button>
        </div>
      </div>
    )
  }

  // entity
  const entity = snapshot.entities[target.id]
  if (!entity) {
    return <></>
  }
  const back = computeBacklinks(snapshot, 'entity', entity.id)
  const html = contentToEditorHtml(entity.content, 'entity')
  const outgoing: RelatedLinkItem[] = [
    ...entity.beatRefs
      .map((id) => snapshot.beats[id])
      .filter(Boolean)
      .map((item) => ({
        id: item.id,
        label: item.title || '未命名节点',
        type: 'beat' as const
      })),
    ...entity.entityRefs
      .map((id) => snapshot.entities[id])
      .filter(Boolean)
      .map((item) => ({
        id: item.id,
        label: item.name || '未命名实体',
        type: 'entity' as const
      }))
  ]
  return (
    <div className="flex h-full flex-col bg-card/10">
      <RightPanelHeader
        badge={ENTITY_STATUS_LABELS[entity.status]}
        extra={
          <RelatedLinksPopover
            incoming={backlinkItems(back)}
            onOpen={onOpenRelated}
            outgoing={outgoing}
          />
        }
        title={entity.name}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 app-scrollbar">
        <div
          className="text-[14px] leading-7 text-foreground"
          dangerouslySetInnerHTML={{
            __html: html || '<p class="text-muted-foreground">（无正文）</p>'
          }}
          onClick={(e) => {
            const el = (e.target as HTMLElement).closest(
              '[data-mention-id]'
            ) as HTMLElement | null
            if (!el) return
            const id = el.getAttribute('data-mention-id')
            const type = el.getAttribute('data-mention-type') as 'beat' | 'entity' | null
            if (id && type) onOpenRelated({ type, id })
          }}
        />
      </div>
      <div className="border-t border-border p-3">
        <Button
          className="w-full"
          onClick={() => onOpenInPage(target)}
          size="sm"
          type="button"
          variant="secondary"
        >
          在实体页打开
        </Button>
      </div>
    </div>
  )
}
