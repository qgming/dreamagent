/**
 * 工具调用卡片（assistant-ui ToolCallMessagePart）
 * - 单行：统一图标 + 英文工具名 + 摘要 + 状态点
 * - 点击整行打开模态窗查看完整输出 / 报错（内容可选中）
 */
import { useMemo, useState } from 'react'
import { CheckCircle2, Circle, CircleDot, FileText, ListTodo, Loader2, Minus, Users, Wrench } from 'lucide-react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { useCreateStore } from '@/stores/create-store'
import { cn } from '@/lib/utils'
import type { TodoItem, TodoStatus } from '@shared/todos'
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle
} from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

type ToolVisualStatus = 'running' | 'done' | 'error'

const STATUS_DOT: Record<ToolVisualStatus, string> = {
  running: 'bg-sky-500 animate-pulse',
  done: 'bg-emerald-500',
  error: 'bg-rose-500'
}

const STATUS_LABEL: Record<ToolVisualStatus, string> = {
  running: '执行中',
  done: '完成',
  error: '失败'
}

function extractId(details: unknown, prefixes: string[]): string | null {
  if (!details || typeof details !== 'object') return null
  const d = details as Record<string, unknown>
  const data =
    d.data && typeof d.data === 'object' ? (d.data as Record<string, unknown>) : d
  const id = data.id
  if (typeof id === 'string' && prefixes.some((p) => id.startsWith(p))) return id
  return null
}

/** 从 path 参数解析 id（新通用工具面） */
function idFromPathArg(args: unknown, prefixes: string[]): string | null {
  if (!args || typeof args !== 'object') return null
  const pathVal = (args as { path?: unknown }).path
  if (typeof pathVal !== 'string' || !pathVal.trim()) return null
  const raw = pathVal.trim().replace(/\\/g, '/')
  const seg = raw.includes(':')
    ? raw.split(':').pop()
    : raw.split('/').filter(Boolean).pop()
  if (!seg) return null
  if (prefixes.some((p) => seg.startsWith(p))) return seg
  return null
}

function formatJson(value: unknown): string {
  if (value === undefined) return '（无）'
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function resolveVisualStatus(
  statusType: string | undefined,
  details: { ok?: boolean } | undefined
): ToolVisualStatus {
  if (statusType === 'running') return 'running'
  if (statusType === 'incomplete' || details?.ok === false) return 'error'
  return 'done'
}

function extractTodos(details: unknown): TodoItem[] | null {
  if (!details || typeof details !== 'object') return null
  const d = details as Record<string, unknown>
  const data = (d.data && typeof d.data === 'object' ? d.data : d) as Record<string, unknown>
  if (!Array.isArray(data.todos)) return null
  return data.todos.filter(
    (t): t is TodoItem =>
      Boolean(t) &&
      typeof t === 'object' &&
      typeof (t as TodoItem).id === 'string' &&
      typeof (t as TodoItem).content === 'string' &&
      typeof (t as TodoItem).status === 'string'
  )
}

function TodoStatusIcon({ status }: { status: TodoStatus }): React.JSX.Element {
  const cls = 'size-3.5 shrink-0'
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

function TodoListView({ todos }: { todos: TodoItem[] }): React.JSX.Element {
  if (todos.length === 0) {
    return <p className="text-sm text-muted-foreground">（空清单）</p>
  }
  return (
    <ul className="space-y-1.5">
      {todos.map((t) => (
        <li
          key={t.id}
          className={cn(
            'flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-sm',
            t.status === 'completed' && 'opacity-70',
            t.status === 'cancelled' && 'opacity-50 line-through'
          )}
        >
          <TodoStatusIcon status={t.status} />
          <div className="min-w-0 flex-1">
            <p className="leading-snug">{t.content}</p>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {t.id} · {t.status}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

export function ToolCallPart(props: ToolCallMessagePartProps): React.JSX.Element {
  const openDetail = useCreateStore((s) => s.openDetail)
  const { toolName, result, status, args, toolCallId } = props
  const [open, setOpen] = useState(false)

  const details = result as
    | { ok?: boolean; summary?: string; data?: unknown; error?: string }
    | undefined

  const visual = resolveVisualStatus(status?.type, details)

  const summary =
    details && typeof details === 'object' && typeof details.summary === 'string'
      ? details.summary
      : visual === 'error'
        ? typeof details?.error === 'string'
          ? details.error
          : '执行失败'
        : visual === 'running'
          ? '执行中…'
          : '完成'

  const errorText =
    visual === 'error'
      ? typeof details?.error === 'string'
        ? details.error
        : typeof details?.summary === 'string'
          ? details.summary
          : '工具执行失败'
      : null

  const chapterId =
    extractId(details, ['chap_']) ||
    idFromPathArg(args, ['chap_']) ||
    (typeof (args as { chapterId?: string })?.chapterId === 'string'
      ? (args as { chapterId: string }).chapterId
      : null)

  const beatId =
    extractId(details, ['beat_']) ||
    idFromPathArg(args, ['beat_']) ||
    (typeof (args as { beatId?: string })?.beatId === 'string'
      ? (args as { beatId: string }).beatId
      : null)

  const entityId =
    extractId(details, ['ent_']) ||
    idFromPathArg(args, ['ent_']) ||
    (typeof (args as { entityId?: string })?.entityId === 'string'
      ? (args as { entityId: string }).entityId
      : null)

  const isDelete =
    toolName === 'delete' || toolName.startsWith('delete_') || toolName.includes('delete')

  const canOpenChapter = Boolean(chapterId && !isDelete)
  const canOpenBeat = Boolean(beatId && !isDelete)
  const canOpenEntity = Boolean(entityId && !isDelete)
  const hasActions = Boolean(canOpenChapter || canOpenBeat || canOpenEntity)

  // 直接显示英文工具名
  const label = toolName
  const todoItems = toolName === 'todo' ? extractTodos(details) : null
  const icon =
    toolName === 'todo' ? (
      <ListTodo className="size-3 shrink-0 text-foreground" />
    ) : (
      <Wrench className="size-3 shrink-0 text-foreground" />
    )

  const resultPreview = useMemo(() => {
    if (visual === 'running') return null
    if (errorText) return errorText
    if (details?.data !== undefined) return formatJson(details.data)
    if (result !== undefined) return formatJson(result)
    return summary
  }, [visual, errorText, details, result, summary])

  return (
    <>
      <div className="my-1.5 w-full">
        <button
          className={cn(
            'flex w-full items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-left text-[11px]',
            'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35',
            todoItems && todoItems.length > 0 && 'rounded-b-none border-b-0'
          )}
          onClick={() => setOpen(true)}
          title="点击查看工具输出"
          type="button"
        >
          {icon}
          <span className="shrink-0 font-mono text-[11px] font-medium text-foreground">
            {label}
          </span>
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
            {summary}
          </span>
          <span
            className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[visual])}
            title={STATUS_LABEL[visual]}
          />
        </button>
        {todoItems && todoItems.length > 0 ? (
          <div className="rounded-b-lg border border-border/70 border-t-border/40 bg-muted/20 px-3 py-2">
            <TodoListView todos={todoItems} />
          </div>
        ) : null}
      </div>

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent className="select-text" size="lg" showCloseButton>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{icon}</span>
              <ModalTitle className="select-text font-mono text-base">{label}</ModalTitle>
              <span
                className={cn('size-2 rounded-full', STATUS_DOT[visual])}
                title={STATUS_LABEL[visual]}
              />
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {STATUS_LABEL[visual]}
              </span>
            </div>
            <ModalDescription className="select-text font-mono text-[11px]">
              {toolName}
              {toolCallId ? ` · ${toolCallId}` : ''}
            </ModalDescription>
          </ModalHeader>

          <ModalBody className="space-y-4 select-text">
            <section className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                {visual === 'error' ? '错误信息' : '摘要'}
              </h3>
              <div
                className={cn(
                  'rounded-xl border px-3 py-2 text-sm whitespace-pre-wrap break-words select-text',
                  visual === 'error'
                    ? 'border-rose-500/30 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                    : 'border-border bg-muted/40 text-foreground'
                )}
              >
                {visual === 'error' ? errorText || summary : summary}
              </div>
            </section>

            {todoItems ? (
              <section className="space-y-1.5">
                <h3 className="text-xs font-medium text-muted-foreground">待办清单</h3>
                <div className="rounded-xl border border-border bg-muted/30 p-3">
                  <TodoListView todos={todoItems} />
                </div>
              </section>
            ) : null}

            <section className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">输入参数</h3>
              <pre className="app-scrollbar max-h-48 overflow-auto rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground select-text">
                {formatJson(args ?? {})}
              </pre>
            </section>

            <section className="space-y-1.5">
              <h3 className="text-xs font-medium text-muted-foreground">
                {visual === 'running' ? '输出（执行中）' : '完整输出'}
              </h3>
              {visual === 'running' ? (
                <p className="select-text text-sm text-muted-foreground">
                  工具仍在执行，完成后可查看结果。
                </p>
              ) : (
                <pre className="app-scrollbar max-h-72 overflow-auto rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-foreground select-text">
                  {resultPreview ?? '（无输出）'}
                </pre>
              )}
            </section>

            {hasActions ? (
              <section className="flex flex-wrap gap-2 pt-1">
                {canOpenChapter && chapterId ? (
                  <Button
                    onClick={() => {
                      setOpen(false)
                      openDetail({ type: 'chapter', id: chapterId })
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <FileText className="size-3.5" />
                    打开文章
                  </Button>
                ) : null}
                {canOpenBeat && beatId ? (
                  <Button
                    onClick={() => {
                      setOpen(false)
                      openDetail({ type: 'beat', id: beatId })
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <CircleDot className="size-3.5" />
                    查看节点
                  </Button>
                ) : null}
                {canOpenEntity && entityId ? (
                  <Button
                    onClick={() => {
                      setOpen(false)
                      openDetail({ type: 'entity', id: entityId })
                    }}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Users className="size-3.5" />
                    查看实体
                  </Button>
                ) : null}
              </section>
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  )
}
