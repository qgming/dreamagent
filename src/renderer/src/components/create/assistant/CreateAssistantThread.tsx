/**
 * 创作页中栏 Thread：assistant-ui 原语
 * - 流式 Markdown
 * - 思考/推理折叠块
 * - 工具调用卡片
 */
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef } from 'react'
import {
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState
} from '@assistant-ui/react'
import { Square, Send, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateStore } from '@/stores/create-store'
import { Button } from '@/components/ui/button'
import { MarkdownText } from './markdown-text'
import { ReasoningPart } from './reasoning'
import { ToolCallPart } from './tool-ui'

/** 助手消息 parts 组件映射 */
const assistantPartsComponents = {
  Text: MarkdownText,
  Reasoning: ReasoningPart,
  tools: { Fallback: ToolCallPart }
}

/** 用户气泡：纯文本，不走 Markdown */
function UserBubble(): React.JSX.Element {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts>
          {({ part }) =>
            part.type === 'text' ? (
              <p className="whitespace-pre-wrap leading-relaxed">{part.text}</p>
            ) : null
          }
        </MessagePrimitive.Parts>
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
          'min-w-0 rounded-2xl bg-muted/60 px-3.5 py-2',
          expandWidth ? 'w-full max-w-[min(100%,42rem)]' : 'max-w-[85%]'
        )}
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
          描述你想写的内容。可在左侧展开节点/实体，点选后于右侧查看详情。
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
  const sending = useCreateStore((s) => s.sending)
  const cancelTurn = useCreateStore((s) => s.cancelTurn)

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
          <div className="border-t border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <div className="border-t border-border px-3 py-3">
          <ComposerPrimitive.Root className="mx-auto flex w-full max-w-2xl items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
            <ComposerPrimitive.Input
              className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground"
              placeholder="描述你想写的内容…"
              rows={1}
            />
            {sending ? (
              <button
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  'bg-muted text-foreground hover:bg-muted/80'
                )}
                onClick={() => void cancelTurn()}
                title="停止"
                type="button"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <ComposerPrimitive.Send
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-full',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'disabled:opacity-40'
                )}
                title="发送"
              >
                <Send className="size-4" />
              </ComposerPrimitive.Send>
            )}
          </ComposerPrimitive.Root>
        </div>
      </ThreadPrimitive.Root>
    </ThreadErrorBoundary>
  )
}
