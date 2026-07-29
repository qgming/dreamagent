/**
 * assistant-ui ExternalStore runtime：接 create-store 消息与发送
 * 启用附件适配器（图片 + 文本）+ 重新生成 onReload
 */
import { type ReactNode, useCallback, useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useExternalStoreRuntime,
  type AppendMessage
} from '@assistant-ui/react'
import type { UiChatMessage } from '@shared/ui-chat'
import { useCreateStore } from '@/stores/create-store'
import { convertUiMessage } from './convert-message'

/** 稳定空数组，避免 session 为空时每次 render 新建 [] 导致 runtime 死循环 */
const EMPTY_MESSAGES: UiChatMessage[] = []

const attachmentAdapter = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter()
])

export function CreateRuntimeProvider({
  children
}: {
  children: ReactNode
}): React.JSX.Element {
  const sessionMessages = useCreateStore((s) => s.session?.messages)
  const messages = sessionMessages ?? EMPTY_MESSAGES
  const isRunning = useCreateStore((s) => s.sending)
  const sendMessage = useCreateStore((s) => s.sendMessage)
  const regenerateMessage = useCreateStore((s) => s.regenerateMessage)
  const cancelTurn = useCreateStore((s) => s.cancelTurn)
  const setMessages = useCreateStore((s) => s.setMessages)

  const onNew = useCallback(
    async (message: AppendMessage) => {
      // 文本 + 附件说明拼进一条用户消息
      const textParts = message.content
        .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
        .map((c) => c.text)
      const attachmentNotes = (message.attachments ?? [])
        .map((a) => {
          if (a.type === 'image') return `[附件:图片 ${a.name}]`
          return `[附件:文件 ${a.name}]`
        })
        .join(' ')
      const text = [...textParts, attachmentNotes].filter(Boolean).join('\n').trim()
      if (!text) return
      await sendMessage(text)
    },
    [sendMessage]
  )

  const onCancel = useCallback(async () => {
    await cancelTurn()
  }, [cancelTurn])

  /**
   * ActionBar.Reload → message.reload() → startRun({ parentId })
   * parentId 为该 assistant 前一条用户消息 id
   */
  const onReload = useCallback(
    async (parentId: string | null) => {
      if (!parentId) {
        console.warn('[CreateRuntimeProvider] reload 缺少 parentId')
        return
      }
      await regenerateMessage(parentId)
    },
    [regenerateMessage]
  )

  const setMessagesAdapter = useCallback(
    (next: readonly UiChatMessage[]) => {
      setMessages([...next])
    },
    [setMessages]
  )

  const convertMessage = useCallback(
    (message: UiChatMessage, _idx: number) => convertUiMessage(message),
    []
  )

  const adapter = useMemo(
    () => ({
      isRunning,
      messages,
      convertMessage,
      onNew,
      onCancel,
      onReload,
      setMessages: setMessagesAdapter,
      adapters: {
        attachments: attachmentAdapter
      },
      unstable_capabilities: {
        copy: true
      }
    }),
    [
      isRunning,
      messages,
      convertMessage,
      onNew,
      onCancel,
      onReload,
      setMessagesAdapter
    ]
  )

  const runtime = useExternalStoreRuntime(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
  )
}
