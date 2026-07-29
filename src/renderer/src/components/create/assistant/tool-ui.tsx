/**
 * 工具调用卡片（assistant-ui ToolCallMessagePart）
 * - 单行：类型图标 + 名称 + 摘要 + 快捷操作 + 状态点
 * - 点击整行打开模态窗查看完整输出 / 报错（内容可选中）
 */
import { useMemo, useState } from 'react'
import {
  FileText,
  CircleDot,
  Users,
  Trash2,
  Plus,
  Pencil,
  Wrench
} from 'lucide-react'
import type { ToolCallMessagePartProps } from '@assistant-ui/react'
import { useCreateStore } from '@/stores/create-store'
import { cn } from '@/lib/utils'
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalHeader,
  ModalTitle
} from '@/components/ui/modal'
import { Button } from '@/components/ui/button'

const TOOL_LABELS: Record<string, string> = {
  list_beats: '列出节点',
  read_beat: '读取节点',
  create_beat: '创建节点',
  update_beat: '更新节点',
  delete_beat: '删除节点',
  list_entities: '列出实体',
  read_entity: '读取实体',
  create_entity: '创建实体',
  update_entity: '更新实体',
  delete_entity: '删除实体',
  update_beat_status: '更新节点状态',
  write_chapter: '写文章',
  list_chapters: '列出文章',
  read_chapter: '读取文章',
  update_chapter: '更新文章',
  delete_chapter: '删除文章',
  get_project_outline: '项目节点'
}

type ToolVisualStatus = 'running' | 'done' | 'error'

/** 状态点颜色：统一用小圆点 */
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

function toolIcon(name: string): React.ReactNode {
  // 比思考过程卡片小一号；图标用前景黑/深色
  const cls = 'size-3 shrink-0 text-foreground'
  if (name.includes('delete')) return <Trash2 className={cls} />
  if (name.includes('create') || name === 'write_chapter') return <Plus className={cls} />
  if (name.includes('update')) return <Pencil className={cls} />
  if (name.includes('entity')) return <Users className={cls} />
  if (name.includes('beat') || name.includes('outline')) return <CircleDot className={cls} />
  if (name.includes('chapter')) return <FileText className={cls} />
  return <Wrench className={cls} />
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
    toolName === 'write_chapter' ||
    toolName === 'update_chapter' ||
    toolName === 'read_chapter'
      ? extractId(details, ['chap_'])
      : null
  const beatId =
    toolName.includes('beat') && !toolName.startsWith('list')
      ? extractId(details, ['beat_']) ||
        (typeof (args as { beatId?: string })?.beatId === 'string'
          ? (args as { beatId: string }).beatId
          : null)
      : null
  const entityId =
    toolName.includes('entity') && !toolName.startsWith('list')
      ? extractId(details, ['ent_']) ||
        (typeof (args as { entityId?: string })?.entityId === 'string'
          ? (args as { entityId: string }).entityId
          : null)
      : null

  const label = TOOL_LABELS[toolName] ?? toolName
  const canOpenBeat = Boolean(beatId && !toolName.startsWith('delete'))
  const canOpenEntity = Boolean(entityId && !toolName.startsWith('delete'))
  const hasActions = Boolean(chapterId || canOpenBeat || canOpenEntity)

  const resultPreview = useMemo(() => {
    if (visual === 'running') return null
    if (errorText) return errorText
    if (details?.data !== undefined) return formatJson(details.data)
    if (result !== undefined) return formatJson(result)
    return summary
  }, [visual, errorText, details, result, summary])

  return (
    <>
      {/*
        比思考过程卡片再小一号：text-[11px] + size-3 图标
      */}
      <button
        className={cn(
          'my-1.5 flex w-full items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-3 py-1.5 text-left text-[11px]',
          'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35'
        )}
        onClick={() => setOpen(true)}
        title="点击查看工具输出"
        type="button"
      >
        {/* 左侧：类型图标 */}
        {toolIcon(toolName)}

        {/* 名称：黑色/前景色 */}
        <span className="shrink-0 text-[11px] font-medium text-foreground">{label}</span>

        {/* 摘要 */}
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {summary}
        </span>

        {/* 最右侧：状态点（快捷操作仅在模态窗） */}
        <span
          className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[visual])}
          title={STATUS_LABEL[visual]}
        />
      </button>

      <Modal open={open} onOpenChange={setOpen}>
        {/* select-text 覆盖 body 的 user-select:none，允许复制 */}
        <ModalContent className="select-text" size="lg" showCloseButton>
          <ModalHeader>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{toolIcon(toolName)}</span>
              <ModalTitle className="select-text">{label}</ModalTitle>
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
                {chapterId ? (
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
