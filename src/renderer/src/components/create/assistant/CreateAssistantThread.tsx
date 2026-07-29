/**
 * 创作页中栏 Thread：assistant-ui 原语
 * - 流式 Markdown
 * - 思考/推理折叠块
 * - 工具调用卡片
 * - 新 Composer：技能/节点/实体上下文
 */
import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useRef } from 'react'
import {
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useMessagePartText
} from '@assistant-ui/react'
import { CircleDot, Sparkles, Users, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateStore } from '@/stores/create-store'
import { Button } from '@/components/ui/button'
import { MarkdownText } from './markdown-text'
import { ReasoningPart } from './reasoning'
import { ToolCallPart } from './tool-ui'
import { CreateComposer } from './CreateComposer'
import {
  contextKindLabel,
  parseUserMessage,
  type ComposerContextKind
} from './composer-context'

/** 助手消息 parts 组件映射 */
const assistantPartsComponents = {
  Text: MarkdownText,
  Reasoning: ReasoningPart,
  tools: { Fallback: ToolCallPart }
}

function chipTone(kind: ComposerContextKind): string {
  switch (kind) {
    case 'skill':
      return 'border-violet-500/30 bg-violet-500/15 text-violet-100'
    case 'beat':
      return 'border-sky-500/30 bg-sky-500/15 text-sky-100'
    case 'entity':
      return 'border-rose-500/30 bg-rose-500/15 text-rose-100'
  }
}

function ChipGlyph({ kind }: { kind: ComposerContextKind }): React.JSX.Element {
  const cls = 'size-3 shrink-0 opacity-90'
  if (kind === 'skill') return <Zap className={cls} />
  if (kind === 'beat') return <CircleDot className={cls} />
  return <Users className={cls} />
}

/** 用户文本 part：解析上下文 chip + 可选中正文 */
function UserTextPart(): React.JSX.Element | null {
  const { text } = useMessagePartText()
  const parsed = useMemo(() => parseUserMessage(text ?? ''), [text])

  if (!text) return null

  return (
    <div className="select-text space-y-2" data-message-selectable>
      {parsed.items.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {parsed.items.map((item) => (
            <span
              key={`${item.kind}:${item.id}`}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                chipTone(item.kind)
              )}
              title={`${contextKindLabel(item.kind)} ${item.label} (${item.id})`}
            >
              <ChipGlyph kind={item.kind} />
              <span className="min-w-0 truncate">{item.label}</span>
            </span>
          ))}
        </div>
      ) : null}
      <p className="whitespace-pre-wrap leading-relaxed select-text">{parsed.body}</p>
    </div>
  )
}

/** 用户气泡：可选择文本；展示上下文 chip */
function UserBubble(): React.JSX.Element {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div
        className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground select-text"
        data-message-selectable
      >
        <MessagePrimitive.Parts
          components={{
            Text: UserTextPart
          }}
        />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantBubble(): React.JSX.Element {
  // 有思考 / 工具卡片时撑满最大宽度，避免窄气泡挤压卡片
  const expandWidth = useAuiState((s) => {
    const parts = s.message.parts ?? s.message.content ?? []
    return parts.some(
      (p: { type?: string }) => p.type === 'tool-call' || p.type === 'reasoning'
    )
  })

  return (
    <MessagePrimitive.Root className="flex w-full justify-start gap-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Sparkles className="size-3.5 text-muted-foreground" />
      </div>
      <div
        className={cn(
          'min-w-0 rounded-2xl bg-muted/60 px-3.5 py-2 select-text',
          expandWidth ? 'w-full max-w-[min(100%,42rem)]' : 'max-w-[85%]'
        )}
        data-message-selectable
      >
        <MessagePrimitive.Parts components={assistantPartsComponents} />
      </div>
    </MessagePrimitive.Root>
  )
}

function EmptyState(): React.JSX.Element {
  const sendMessage = useCreateStore((s) => s.sendMessage)
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
          描述你想写的内容。可用 + 附加技能 / 节点 / 实体；左侧可展开节点与实体。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          disabled={sending}
          onClick={() => void sendMessage('按节点写一篇文章')}
          size="sm"
          type="button"
          variant="secondary"
        >
          写一篇：开场
        </Button>
        <Button
          disabled={sending}
          onClick={() => void sendMessage('查看项目节点，并列出主要节点与实体')}
          size="sm"
          type="button"
          variant="secondary"
        >
          查看节点
        </Button>
        <Button
          onClick={() => setLeftBeatsOpen(true)}
          size="sm"
          type="button"
          variant="ghost"
        >
          展开节点
        </Button>
      </div>
    </div>
  )
}

function ScrollToBottom(): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const messages = useCreateStore((s) => s.session?.messages)
  const sending = useCreateStore((s) => s.sending)

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  return <div ref={ref} />
}

/** 捕获 assistant-ui 运行时错误，避免整页白屏 */
class ThreadErrorBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message || String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[CreateAssistantThread]', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
          <p className="font-medium text-destructive">对话界面加载失败</p>
          <p className="max-w-md text-xs text-muted-foreground">{this.state.error}</p>
          <Button
            onClick={() => this.setState({ error: null })}
            size="sm"
            type="button"
            variant="secondary"
          >
            重试
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * 完整中栏：消息列表 + Composer
 */
export function CreateAssistantThread(): React.JSX.Element {
  const error = useCreateStore((s) => s.error)

  return (
    <ThreadErrorBoundary>
      <ThreadPrimitive.Root className="flex h-full min-h-0 flex-1 flex-col bg-background">
        <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto app-scrollbar px-4 py-4">
          <ThreadPrimitive.Empty>
            <EmptyState />
          </ThreadPrimitive.Empty>
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
            <ThreadPrimitive.Messages>
              {({ message }) =>
                message.role === 'user' ? (
                  <UserBubble key={message.id} />
                ) : (
                  <AssistantBubble key={message.id} />
                )
              }
            </ThreadPrimitive.Messages>
            <ScrollToBottom />
          </div>
        </ThreadPrimitive.Viewport>

        {error ? (
          <div className="border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive select-text">
            {error}
          </div>
        ) : null}

        <CreateComposer />
      </ThreadPrimitive.Root>
    </ThreadErrorBoundary>
  )
}
