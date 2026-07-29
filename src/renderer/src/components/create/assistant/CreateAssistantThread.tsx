/**
 * 创作页中栏 Thread（参考 @assistant-ui/thread 布局）
 * - 新对话：欢迎语 + Composer 垂直居中
 * - 有消息：消息列表 + 底部 sticky 悬浮 Composer
 * - Streamdown / Reasoning / ToolGroup / Sources / 操作栏
 */
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useMemo
} from 'react'
import {
  ActionBarPrimitive,
  AuiIf,
  MessagePrimitive,
  ThreadPrimitive,
  groupPartByType,
  useAuiState,
  type AssistantState
} from '@assistant-ui/react'
import {
  ArrowDownIcon,
  CheckIcon,
  CopyIcon,
  RefreshCwIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateStore } from '@/stores/create-store'
import { Button } from '@/components/ui/button'
import { DirectiveText } from '@/components/assistant-ui/directive-text'
import { StreamdownText } from '@/components/assistant-ui/streamdown-text'
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger
} from '@/components/assistant-ui/reasoning'
import { ToolFallback } from '@/components/assistant-ui/tool-fallback'
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger
} from '@/components/assistant-ui/tool-group'
import { Sources } from '@/components/assistant-ui/sources'
import { MessageTiming } from '@/components/assistant-ui/message-timing'
import { DotMatrix } from '@/components/assistant-ui/dot-matrix'
import { UserMessageAttachments } from '@/components/assistant-ui/attachment'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { CreateComposer } from './CreateComposer'

/** 分组：连续 reasoning / tool-call */
const assistantGroupBy = groupPartByType({
  reasoning: ['group-reasoning'],
  'tool-call': ['group-tool']
})

/**
 * 新对话视图：无消息（加载中也当新对话，避免闪一下底部 dock）
 * 对齐官方 thread 的 isNewChatView
 */
function isNewChatView(s: AssistantState): boolean {
  return s.thread.messages.length === 0
}

/** 用户气泡：浅灰/灰黑底 + 对应前景字 */
function UserBubble(): React.JSX.Element {
  return (
    <MessagePrimitive.Root className="flex flex-col items-end gap-1">
      <UserMessageAttachments />
      <div
        className="max-w-[85%] rounded-2xl bg-user-bubble px-3.5 py-2 text-sm text-user-bubble-foreground select-text"
        data-message-selectable
      >
        <MessagePrimitive.Parts
          components={{
            Text: DirectiveText
          }}
        />
      </div>
    </MessagePrimitive.Root>
  )
}

/** 助手操作栏：复制 + 重新生成 + 耗时（默认永久显示） */
function AssistantActionBar(): React.JSX.Element {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="never"
      className="mt-1.5 flex items-center gap-0.5 text-muted-foreground"
    >
      <ActionBarPrimitive.Copy
        className="group/copy flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground data-[copied]:text-emerald-600"
        title="复制"
        aria-label="复制消息"
      >
        <CopyIcon className="size-3.5 group-data-[copied]/copy:hidden" />
        <CheckIcon className="hidden size-3.5 group-data-[copied]/copy:inline" />
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload
        className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40"
        title="重新生成"
        aria-label="重新生成消息"
      >
        <RefreshCwIcon className="size-3.5" />
      </ActionBarPrimitive.Reload>
      <MessageTiming side="top" />
    </ActionBarPrimitive.Root>
  )
}

/** 流式指示：DotMatrix */
function StreamingIndicator(): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 py-1 text-muted-foreground">
      <DotMatrix state="thinking" label="思考中" className="size-4" />
      <span className="text-xs">思考中…</span>
    </div>
  )
}

/** AI 消息：无背景卡片、无头像 */
function AssistantBubble(): React.JSX.Element {
  return (
    <MessagePrimitive.Root className="flex w-full flex-col items-start">
      <div
        className="flex w-full max-w-[min(100%,42rem)] min-w-0 flex-col gap-2 select-text"
        data-message-selectable
      >
        <MessagePrimitive.GroupedParts groupBy={assistantGroupBy} indicator="empty">
          {({ part, children }) => {
            switch (part.type) {
              case 'group-reasoning': {
                const running = part.status?.type === 'running'
                return (
                  <ReasoningRoot variant="ghost" streaming={running} className="mb-0">
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                )
              }
              case 'group-tool': {
                const running = part.status?.type === 'running'
                const count = part.indices?.length ?? 1
                return (
                  <ToolGroupRoot variant="ghost" defaultOpen={running}>
                    <ToolGroupTrigger count={count} active={running} />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                )
              }
              case 'text':
                return <StreamdownText />
              case 'reasoning':
                return <Reasoning {...part} />
              case 'tool-call':
                return part.toolUI ?? <ToolFallback {...part} />
              case 'source':
                return (
                  <div className="flex flex-wrap items-center gap-1">
                    <Sources {...part} />
                  </div>
                )
              case 'indicator':
                return <StreamingIndicator />
              default:
                return null
            }
          }}
        </MessagePrimitive.GroupedParts>
      </div>
      <AssistantActionBar />
    </MessagePrimitive.Root>
  )
}

/** 空对话欢迎：仅一句问候（对齐官方 How can I help you today?） */
function ThreadWelcome(): React.JSX.Element {
  return (
    <div className="aui-thread-welcome mb-6 flex flex-col items-center px-4 text-center">
      <h1 className="fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-semibold tracking-tight duration-200">
        今天想写点什么？
      </h1>
    </div>
  )
}

/** 回到底部 */
function ThreadScrollToBottom(): React.JSX.Element {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="回到底部"
        variant="outline"
        className="absolute -top-12 z-10 self-center rounded-full border bg-background/90 p-3 shadow-sm backdrop-blur disabled:invisible dark:bg-background/80"
      >
        <ArrowDownIcon className="size-4" />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  )
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
 * 完整中栏：消息列表 + 居中/沉底 Composer
 */
export function CreateAssistantThread(): React.JSX.Element {
  const error = useCreateStore((s) => s.error)
  // 用 aui 状态驱动布局，避免和 store 消息不同步
  const isEmpty = useAuiState(isNewChatView)

  const rootStyle = useMemo(
    () =>
      ({
        ['--thread-max-width' as string]: '42rem',
        ['--composer-radius' as string]: '1.25rem',
        ['--composer-padding' as string]: '8px'
      }) as React.CSSProperties,
    []
  )

  return (
    <ThreadErrorBoundary>
      <ThreadPrimitive.Root
        className="aui-root aui-thread-root flex h-full min-h-0 flex-1 flex-col bg-background"
        style={rootStyle}
      >
        <ThreadPrimitive.Viewport
          turnAnchor="top"
          className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto app-scrollbar scroll-smooth"
        >
          <div
            className={cn(
              'mx-auto flex w-full max-w-[var(--thread-max-width)] flex-1 flex-col px-4 pt-4',
              isEmpty && 'justify-center'
            )}
          >
            {/* 新对话欢迎 */}
            <AuiIf condition={isNewChatView}>
              <ThreadWelcome />
            </AuiIf>

            {/* 消息列表（空时 empty:hidden） */}
            <div
              data-slot="aui_message-group"
              className={cn(
                'mb-4 flex flex-col gap-y-6 empty:hidden',
                !isEmpty && 'pb-2'
              )}
            >
              <ThreadPrimitive.Messages>
                {({ message }) =>
                  message.role === 'user' ? (
                    <UserBubble key={message.id} />
                  ) : (
                    <AssistantBubble key={message.id} />
                  )
                }
              </ThreadPrimitive.Messages>
            </div>

            {error ? (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive select-text">
                {error}
              </div>
            ) : null}

            {/*
              官方 thread 模式：
              - 空对话：footer 在 justify-center 列内，Composer 居中
              - 有消息：footer sticky bottom + mt-auto，悬浮在视口底部
            */}
            <ThreadPrimitive.ViewportFooter
              className={cn(
                'aui-thread-viewport-footer relative flex flex-col gap-3 overflow-visible pb-4 md:pb-5',
                !isEmpty &&
                  'sticky bottom-0 z-20 mt-auto bg-gradient-to-t from-background via-background/95 to-background/0 pt-6'
              )}
            >
              {!isEmpty ? <ThreadScrollToBottom /> : null}
              <CreateComposer centered={isEmpty} />
            </ThreadPrimitive.ViewportFooter>
          </div>
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </ThreadErrorBoundary>
  )
}
