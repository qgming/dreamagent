import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FileText,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  Users,
  Wrench,
  X
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import {
  BEAT_STATUS_LABELS,
  CHAPTER_STATUS_LABELS,
  ENTITY_STATUS_LABELS,
  type Chapter,
  type ConversationMessage,
  type ConversationSummary,
  type ToolCallRecord,
  type ToolResultRecord
} from '@shared/project-types'
import { contentToEditorHtml } from '@shared/mentions'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/animated-tabs'
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
  BEAT_STATUS_DOT_CLASS,
  ENTITY_STATUS_DOT_CLASS,
  formatUpdatedAt
} from '@/lib/project-utils'
import { mentionChipStyles } from '@/lib/mention-styles'
import { computeBacklinks } from '@/lib/backlinks'
import {
  getOrderedBeats,
  getOrderedChapters,
  getOrderedEntities,
  useProjectStore
} from '@/stores/project-store'
import { useCreateStore, type DetailTarget } from '@/stores/create-store'

/**
 * 创作工作台：左（资料+会话）· 中（对话）· 右（可收起详情）
 */
export function CreateWorkspace(): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const ensureSession = useCreateStore((s) => s.ensureSession)
  const rightPanelOpen = useCreateStore((s) => s.rightPanelOpen)

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
      {/* 中栏 + 右栏：展开时 flex-1 + basis-0 等分剩余宽度 */}
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden">
          <ChatPane />
        </div>
        <AnimatePresence initial={false}>
          {rightPanelOpen ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden border-l border-border"
              exit={{ opacity: 0, x: 12 }}
              initial={{ opacity: 0, x: 12 }}
              key="right-panel"
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            >
              <RightDetailPanel />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
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
  const summaries =
    useProjectStore((s) => s.snapshot?.conversationSummaries) ?? ([] as ConversationSummary[])
  const activeId = useCreateStore((s) => s.activeConversationId)
  const openConversation = useCreateStore((s) => s.openConversation)
  const newConversation = useCreateStore((s) => s.newConversation)
  const sending = useCreateStore((s) => s.sending)

  const beats = getOrderedBeats(snapshot)
  const entities = getOrderedEntities(snapshot)
  const articles = getOrderedChapters(snapshot)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      {/* 上：节点 / 实体（可折叠，默认收起） */}
      <div className="shrink-0 px-3 pt-3">
        <SectionLabel>资料</SectionLabel>
        <CollapsibleSection
          count={beats.length}
          icon={CircleDot}
          label="节点"
          onToggle={() => setLeftBeatsOpen(!leftBeatsOpen)}
          open={leftBeatsOpen}
        >
          {beats.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">暂无节点</p>
          ) : (
            beats.map((b) => (
              <SourceRow
                active={detailTarget?.type === 'beat' && detailTarget.id === b.id}
                dotClass={BEAT_STATUS_DOT_CLASS[b.status]}
                key={b.id}
                label={b.title || '未命名节点'}
                onClick={() => openDetail({ type: 'beat', id: b.id })}
                statusTitle={BEAT_STATUS_LABELS[b.status]}
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
          {entities.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">暂无实体</p>
          ) : (
            entities.map((e) => (
              <SourceRow
                active={detailTarget?.type === 'entity' && detailTarget.id === e.id}
                dotClass={ENTITY_STATUS_DOT_CLASS[e.status]}
                key={e.id}
                label={e.name}
                onClick={() => openDetail({ type: 'entity', id: e.id })}
                statusTitle={ENTITY_STATUS_LABELS[e.status]}
              />
            ))
          )}
        </CollapsibleSection>
      </div>

      {/* 下：对话 | 文章（动画 Tab） */}
      <div className="mt-2 flex min-h-0 flex-1 flex-col border-t border-border px-3 pt-3">
        <Tabs
          className="mb-2"
          onValueChange={(v) => setLeftListTab(v as 'conversations' | 'articles')}
          value={leftListTab}
        >
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

        {leftListTab === 'conversations' ? (
          <>
            <div className="mb-1 flex items-center justify-between gap-2 px-1">
              <span className="text-[11px] text-muted-foreground">
                {summaries.length} 个会话
              </span>
              <button
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                disabled={sending}
                onClick={() => void newConversation()}
                title="新对话"
                type="button"
              >
                <PlusIcon />
              </button>
            </div>
            <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto app-scrollbar">
              {summaries.length === 0 ? (
                <p className="px-2 py-4 text-xs text-muted-foreground">还没有对话</p>
              ) : (
                summaries.map((s) => (
                  <ConversationListRow
                    active={activeId === s.id}
                    key={s.id}
                    onOpen={() => void openConversation(s.id)}
                    summary={s}
                  />
                ))
              )}
            </div>
            <div className="border-t border-border py-3">
              <button
                className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-dashed border-border text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                disabled={sending}
                onClick={() => void newConversation()}
                type="button"
              >
                <MessageSquarePlus className="size-3.5" />
                新对话
              </button>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto app-scrollbar">
            {articles.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">
                还没有文章。在对话里生成后会出现在这里。
              </p>
            ) : (
              articles.map((a, i) => (
                <ArticleListRow
                  active={detailTarget?.type === 'chapter' && detailTarget.id === a.id}
                  article={a}
                  index={i}
                  key={a.id}
                  onOpen={() => openDetail({ type: 'chapter', id: a.id })}
                />
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function ConversationListRow({
  summary,
  active,
  onOpen
}: {
  summary: ConversationSummary
  active: boolean
  onOpen: () => void
}): React.JSX.Element {
  const deleteConversation = useCreateStore((s) => s.deleteConversation)

  const handleDelete = (): void => {
    void (async () => {
      const ok = await confirmDelete({
        title: '删除对话',
        description: `确定删除对话「${summary.title || '新对话'}」？\n此操作不可恢复。`
      })
      if (!ok) return
      await deleteConversation(summary.id)
    })()
  }

  return (
    <div
      className={cn(
        'group flex items-start gap-1 rounded-md px-1 py-1 text-xs transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-sidebar-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-start rounded-md px-1 py-0.5 text-left"
        onClick={onOpen}
        type="button"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{summary.title}</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {formatUpdatedAt(summary.updatedAt)}
            {summary.messageCount > 0 ? ` · ${summary.messageCount} 条` : ''}
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none',
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

function ArticleListRow({
  article,
  index,
  active,
  onOpen
}: {
  article: Chapter
  index: number
  active: boolean
  onOpen: () => void
}): React.JSX.Element {
  const updateChapter = useProjectStore((s) => s.updateChapter)
  const deleteChapter = useProjectStore((s) => s.deleteChapter)
  const detailTarget = useCreateStore((s) => s.detailTarget)
  const setDetailTarget = useCreateStore((s) => s.setDetailTarget)
  const setRightPanelOpen = useCreateStore((s) => s.setRightPanelOpen)

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
      if (detailTarget?.type === 'chapter' && detailTarget.id === article.id) {
        setDetailTarget(null)
        setRightPanelOpen(false)
      }
    })()
  }

  return (
    <div
      className={cn(
        'group flex items-start gap-1 rounded-md px-1 py-1 text-xs transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-sidebar-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1 py-0.5 text-left"
        onClick={onOpen}
        type="button"
      >
        <span className="mt-0.5 w-4 shrink-0 text-right tabular-nums text-muted-foreground">
          {index + 1}.
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{article.title}</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            {CHAPTER_STATUS_LABELS[article.status]} · {article.content.length} 字
          </span>
        </span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none',
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
    </div>
  )
}

function PlusIcon(): React.JSX.Element {
  return (
    <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function SectionLabel({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'mb-1 px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80',
        className
      )}
    >
      {children}
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
        className="group flex h-9 w-full items-center gap-1.5 rounded-md px-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={onToggle}
        type="button"
      >
        <motion.span
          animate={{ rotate: open ? 90 : 0 }}
          className="inline-flex"
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        >
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </motion.span>
        <Icon className="size-3.5 shrink-0 opacity-70" />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
        <span className="tabular-nums text-[10px] text-muted-foreground">{count}</span>
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
  statusTitle
}: {
  label: string
  active: boolean
  onClick: () => void
  dotClass: string
  statusTitle: string
}): React.JSX.Element {
  return (
    <button
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs transition-colors',
        active
          ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
          : 'text-sidebar-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      <span className={cn('size-1.5 shrink-0 rounded-full', dotClass)} title={statusTitle} />
    </button>
  )
}

// ── 中栏：对话 ──────────────────────────────────────────

function ChatPane(): React.JSX.Element {
  const conv = useCreateStore((s) => s.activeConversation)
  const sending = useCreateStore((s) => s.sending)
  const error = useCreateStore((s) => s.error)
  const messages = conv?.messages ?? []

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col bg-background">
      <ChatHeader />
      <div className="min-h-0 flex-1 overflow-y-auto app-scrollbar">
        {messages.length === 0 ? <CreateEmptyState /> : <MessageList messages={messages} />}
      </div>
      {error ? (
        <div className="border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}
      <PinnedChips />
      <ChatComposer disabled={sending} />
    </div>
  )
}

function ChatHeader(): React.JSX.Element {
  const active = useCreateStore((s) => s.activeConversation)
  const rightPanelOpen = useCreateStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useCreateStore((s) => s.toggleRightPanel)
  const detailTarget = useCreateStore((s) => s.detailTarget)

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
      <Sparkles className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold">{active?.title || '新对话'}</h1>
      </div>
      {/* 原「新对话」位置：右侧详情面板开合 */}
      <button
        className={cn(
          'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          rightPanelOpen && 'bg-muted text-foreground'
        )}
        onClick={toggleRightPanel}
        title={rightPanelOpen ? '收起详情' : '展开详情'}
        type="button"
      >
        {rightPanelOpen ? (
          <PanelRightClose className="size-4" />
        ) : (
          <PanelRightOpen className="size-4" />
        )}
      </button>
      {!rightPanelOpen && detailTarget ? (
        <span className="size-1.5 rounded-full bg-primary" title="有详情可查看" />
      ) : null}
    </div>
  )
}

function CreateEmptyState(): React.JSX.Element {
  const sendMessage = useCreateStore((s) => s.sendMessage)
  const runDemoTurn = useCreateStore((s) => s.runDemoTurn)
  const sending = useCreateStore((s) => s.sending)
  const setLeftBeatsOpen = useCreateStore((s) => s.setLeftBeatsOpen)

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
        <Sparkles className="size-6 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-base font-semibold">开始一次创作</h2>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          描述你想写的内容。可在左侧展开节点/实体，点选后于右侧查看详情。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          disabled={sending}
          onClick={() => void sendMessage('按大纲写一篇文章')}
          size="sm"
          type="button"
          variant="secondary"
        >
          写一篇：开场
        </Button>
        <Button
          disabled={sending}
          onClick={() => void runDemoTurn()}
          size="sm"
          type="button"
          variant="secondary"
        >
          <Play className="size-3.5" />
          演示一轮
        </Button>
        <Button
          onClick={() => setLeftBeatsOpen(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <CircleDot className="size-3.5" />
          展开节点
        </Button>
      </div>
    </div>
  )
}

function MessageList({ messages }: { messages: ConversationMessage[] }): React.JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 px-4 py-4">
      {messages.map((m) => (
        <MessageBubble key={m.id} message={m} />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

function MessageBubble({ message }: { message: ConversationMessage }): React.JSX.Element {
  const isUser = message.role === 'user'
  const openDetail = useCreateStore((s) => s.openDetail)

  return (
    <div className={cn('flex flex-col gap-1.5', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted/70 text-foreground'
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
      </div>

      {message.toolCalls?.map((call, i) => (
        <ToolCallCard call={call} key={call.id} result={message.toolResults?.[i]} />
      ))}

      {message.chapterIds?.map((id) => (
        <button
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left text-xs hover:bg-muted"
          key={id}
          onClick={() => openDetail({ type: 'chapter', id })}
          type="button"
        >
          <FileText className="size-3.5 text-amber-600" />
          <span>在右侧查看文章</span>
        </button>
      ))}

      {message.beatStatusUpdates?.map((u) => (
        <div
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground"
          key={`${u.beatId}-${u.to}`}
        >
          <Check className="size-3.5 text-emerald-500" />
          节点状态 {u.from} → {u.to}
        </div>
      ))}
    </div>
  )
}

function ToolCallCard({
  call,
  result
}: {
  call: ToolCallRecord
  result?: ToolResultRecord
}): React.JSX.Element {
  const done = call.status === 'done' || result?.ok
  const err = call.status === 'error' || result?.ok === false
  return (
    <div
      className={cn(
        'w-full max-w-[92%] rounded-lg border px-3 py-2 text-xs',
        err ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-card/80'
      )}
    >
      <div className="flex items-center gap-2 font-medium">
        <Wrench className="size-3.5 text-muted-foreground" />
        <span className="font-mono">{call.name}</span>
        <span
          className={cn(
            'ml-auto rounded px-1.5 py-0.5 text-[10px]',
            done && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
            err && 'bg-destructive/15 text-destructive',
            !done && !err && 'bg-muted text-muted-foreground'
          )}
        >
          {call.status}
        </span>
      </div>
      {result?.summary ? <p className="mt-1 text-muted-foreground">{result.summary}</p> : null}
    </div>
  )
}

function PinnedChips(): React.JSX.Element {
  const conv = useCreateStore((s) => s.activeConversation)
  const snapshot = useProjectStore((s) => s.snapshot)
  const unpinBeat = useCreateStore((s) => s.unpinBeat)
  const unpinEntity = useCreateStore((s) => s.unpinEntity)
  const openDetail = useCreateStore((s) => s.openDetail)

  const pins = useMemo(() => {
    if (!conv || !snapshot) {
      return [] as Array<{ type: 'beat' | 'entity'; id: string; label: string }>
    }
    const list: Array<{ type: 'beat' | 'entity'; id: string; label: string }> = []
    for (const id of conv.pinnedBeatIds) {
      const b = snapshot.beats[id]
      if (b) list.push({ type: 'beat', id, label: b.title || '未命名' })
    }
    for (const id of conv.pinnedEntityIds) {
      const e = snapshot.entities[id]
      if (e) list.push({ type: 'entity', id, label: e.name || '未命名' })
    }
    return list
  }, [conv, snapshot])

  if (pins.length === 0) return <></>

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
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

function ChatComposer({ disabled }: { disabled: boolean }): React.JSX.Element {
  const [text, setText] = useState('')
  const sendMessage = useCreateStore((s) => s.sendMessage)

  const submit = (): void => {
    const v = text.trim()
    if (!v || disabled) return
    setText('')
    void sendMessage(v)
  }

  return (
    <div className="border-t border-border p-3">
      <div className="mx-auto flex max-w-2xl items-end gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <textarea
          className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="描述本章目标…（Enter 发送，Shift+Enter 换行）"
          rows={2}
          value={text}
        />
        <Button disabled={disabled || !text.trim()} onClick={submit} size="sm" type="button">
          {disabled ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </Button>
      </div>
    </div>
  )
}

// ── 右栏：详情（文章 / 节点 / 实体）──────────────────────

function RightDetailPanel(): React.JSX.Element {
  const target = useCreateStore((s) => s.detailTarget)
  const setRightPanelOpen = useCreateStore((s) => s.setRightPanelOpen)
  const openDetail = useCreateStore((s) => s.openDetail)
  const snapshot = useProjectStore((s) => s.snapshot)
  const setProjectView = useProjectStore((s) => s.setProjectView)
  const setSelectedBeatId = useProjectStore((s) => s.setSelectedBeatId)
  const setSelectedEntityId = useProjectStore((s) => s.setSelectedEntityId)
  const chapters = getOrderedChapters(snapshot)

  if (!target || !snapshot) {
    return (
      <div className="flex h-full flex-col bg-card/10">
        <RightPanelHeader onClose={() => setRightPanelOpen(false)} title="详情" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
          <BookOpen className="size-8 opacity-40" />
          <p>从左侧点选节点/实体/文章</p>
          <p className="text-xs">或等待 Agent 写出文章后在此预览</p>
          {chapters.length > 0 ? (
            <div className="mt-4 w-full space-y-1">
              <p className="text-[11px] font-medium text-foreground">已有文章</p>
              {chapters.map((c) => (
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
                  key={c.id}
                  onClick={() => openDetail({ type: 'chapter', id: c.id })}
                  type="button"
                >
                  <FileText className="size-3.5 shrink-0" />
                  <span className="truncate">{c.title}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <DetailContent
      onClose={() => setRightPanelOpen(false)}
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
  onClose,
  extra,
  titleSlot
}: {
  title: string
  badge?: string
  onClose: () => void
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
      <button
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onClose}
        title="收起详情"
        type="button"
      >
        <PanelRightClose className="size-4" />
      </button>
    </div>
  )
}

/**
 * 文章可编辑预览：标题 + 纯正文，400ms 防抖自动保存
 */
function ArticleEditor({
  chapter,
  snapshot,
  onClose,
  onOpenRelated
}: {
  chapter: Chapter
  snapshot: NonNullable<ReturnType<typeof useProjectStore.getState>['snapshot']>
  onClose: () => void
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

  return (
    <div className="flex h-full flex-col bg-card/10">
      <RightPanelHeader
        badge={CHAPTER_STATUS_LABELS[chapter.status]}
        extra={
          saveHint ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">{saveHint}</span>
          ) : null
        }
        onClose={onClose}
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
      {(chapter.sourceBeatIds.length > 0 ||
        chapter.entityRefs.length > 0 ||
        chapter.beatRefs.length > 0) && (
        <div className="space-y-1.5 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
          {chapter.sourceBeatIds.length > 0 || chapter.beatRefs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="shrink-0">关联节点</span>
              {[...new Set([...chapter.sourceBeatIds, ...chapter.beatRefs])].map((id) => {
                const b = snapshot.beats[id]
                if (!b) return null
                return (
                  <button
                    className="rounded bg-[color-mix(in_oklab,#3b82f6_18%,transparent)] px-1.5 py-0.5 font-medium text-[#1d4ed8] dark:text-[#93c5fd]"
                    key={id}
                    onClick={() => onOpenRelated({ type: 'beat', id })}
                    type="button"
                  >
                    {b.title || '未命名'}
                  </button>
                )
              })}
            </div>
          ) : null}
          {chapter.entityRefs.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="shrink-0">关联实体</span>
              {chapter.entityRefs.map((id) => {
                const e = snapshot.entities[id]
                if (!e) return null
                return (
                  <button
                    className="rounded bg-[color-mix(in_oklab,#ef4444_16%,transparent)] px-1.5 py-0.5 font-medium text-[#b91c1c] dark:text-[#fca5a5]"
                    key={id}
                    onClick={() => onOpenRelated({ type: 'entity', id })}
                    type="button"
                  >
                    {e.name}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      )}
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

function DetailContent({
  target,
  snapshot,
  onClose,
  onOpenInPage,
  onOpenRelated
}: {
  target: DetailTarget
  snapshot: NonNullable<ReturnType<typeof useProjectStore.getState>['snapshot']>
  onClose: () => void
  onOpenInPage: (t: DetailTarget) => void
  onOpenRelated: (t: DetailTarget) => void
}): React.JSX.Element {
  if (target.type === 'chapter') {
    const chapter = snapshot.chapters[target.id]
    if (!chapter) {
      return (
        <div className="flex h-full flex-col">
          <RightPanelHeader onClose={onClose} title="文章不存在" />
        </div>
      )
    }
    return (
      <ArticleEditor
        chapter={chapter}
        onClose={onClose}
        onOpenRelated={onOpenRelated}
        snapshot={snapshot}
      />
    )
  }

  if (target.type === 'beat') {
    const beat = snapshot.beats[target.id]
    if (!beat) {
      return (
        <div className="flex h-full flex-col">
          <RightPanelHeader onClose={onClose} title="节点不存在" />
        </div>
      )
    }
    const back = computeBacklinks(snapshot, 'beat', beat.id)
    const html = contentToEditorHtml(beat.content, 'beat')
    return (
      <div className="flex h-full flex-col bg-card/10">
        <RightPanelHeader
          badge={BEAT_STATUS_LABELS[beat.status]}
          onClose={onClose}
          title={beat.title || '未命名节点'}
        />
        <MetaLinks
          inbound={back}
          onOpen={onOpenRelated}
          outboundBeats={beat.beatRefs
            .map((id) => snapshot.beats[id])
            .filter(Boolean)
            .map((b) => ({ id: b.id, label: b.title || '未命名', type: 'beat' as const }))}
          outboundEntities={beat.entityRefs
            .map((id) => snapshot.entities[id])
            .filter(Boolean)
            .map((e) => ({ id: e.id, label: e.name, type: 'entity' as const }))}
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
    return (
      <div className="flex h-full flex-col">
        <RightPanelHeader onClose={onClose} title="实体不存在" />
      </div>
    )
  }
  const back = computeBacklinks(snapshot, 'entity', entity.id)
  const html = contentToEditorHtml(entity.content, 'entity')
  return (
    <div className="flex h-full flex-col bg-card/10">
      <RightPanelHeader
        badge={ENTITY_STATUS_LABELS[entity.status]}
        onClose={onClose}
        title={entity.name}
      />
      <MetaLinks
        inbound={back}
        onOpen={onOpenRelated}
        outboundBeats={entity.beatRefs
          .map((id) => snapshot.beats[id])
          .filter(Boolean)
          .map((b) => ({ id: b.id, label: b.title || '未命名', type: 'beat' as const }))}
        outboundEntities={entity.entityRefs
          .map((id) => snapshot.entities[id])
          .filter(Boolean)
          .map((e) => ({ id: e.id, label: e.name, type: 'entity' as const }))}
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

function MetaLinks({
  outboundBeats,
  outboundEntities,
  inbound,
  onOpen
}: {
  outboundBeats: Array<{ id: string; label: string; type: 'beat' }>
  outboundEntities: Array<{ id: string; label: string; type: 'entity' }>
  inbound: ReturnType<typeof computeBacklinks>
  onOpen: (t: DetailTarget) => void
}): React.JSX.Element {
  const hasOut = outboundBeats.length + outboundEntities.length > 0
  const hasIn =
    inbound.beats.length + inbound.entities.length + inbound.chapters.length > 0
  if (!hasOut && !hasIn) return <></>

  return (
    <div className="space-y-1.5 border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
      {hasOut ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0">出链</span>
          {[...outboundBeats, ...outboundEntities].map((r) => (
            <button
              className={cn(
                'rounded px-1.5 py-0.5 font-medium',
                r.type === 'beat'
                  ? 'bg-[color-mix(in_oklab,#3b82f6_18%,transparent)] text-[#1d4ed8] dark:text-[#93c5fd]'
                  : 'bg-[color-mix(in_oklab,#ef4444_16%,transparent)] text-[#b91c1c] dark:text-[#fca5a5]'
              )}
              key={`${r.type}-${r.id}`}
              onClick={() => onOpen({ type: r.type, id: r.id })}
              type="button"
            >
              @{r.label}
            </button>
          ))}
        </div>
      ) : null}
      {hasIn ? (
        <div className="flex flex-wrap items-center gap-1">
          <span className="shrink-0">入链</span>
          {inbound.beats.map((r) => (
            <button
              className="rounded bg-[color-mix(in_oklab,#3b82f6_18%,transparent)] px-1.5 py-0.5 font-medium text-[#1d4ed8] dark:text-[#93c5fd]"
              key={`ib-${r.id}`}
              onClick={() => onOpen({ type: 'beat', id: r.id })}
              type="button"
            >
              @{r.label}
            </button>
          ))}
          {inbound.entities.map((r) => (
            <button
              className="rounded bg-[color-mix(in_oklab,#ef4444_16%,transparent)] px-1.5 py-0.5 font-medium text-[#b91c1c] dark:text-[#fca5a5]"
              key={`ie-${r.id}`}
              onClick={() => onOpen({ type: 'entity', id: r.id })}
              type="button"
            >
              @{r.label}
            </button>
          ))}
          {inbound.chapters.map((r) => (
            <button
              className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground"
              key={`ic-${r.id}`}
              onClick={() => onOpen({ type: 'chapter', id: r.id })}
              type="button"
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
