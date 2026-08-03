/**
 * assistant-ui ExternalStore runtime：接 create-store 消息与发送
 * 启用附件适配器（图片 + 文本）+ 重新生成 onReload
 */
import { type ReactNode, useCallback, useMemo } from 'react'
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage
} from '@assistant-ui/react'
import type { UiChatMessage } from '@shared/ui-chat'
import { useCreateStore } from '@/stores/create-store'
import { convertUiMessage } from './convert-message'
import { createAttachmentAdapter } from '@/components/assistant-ui/attachment-capabilities'
import { prepareComposerMessage } from '@/components/assistant-ui/attachment-payload'

/** 稳定空数组，避免 session 为空时每次 render 新建 [] 导致 runtime 死循环 */
const EMPTY_MESSAGES: UiChatMessage[] = []

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
  const selectedModelKey = useCreateStore((s) => s.selectedModelKey)
  const selectableModels = useCreateStore((s) => s.selectableModels)
  const selectedModel = selectableModels.find((model) => model.key === selectedModelKey)
  const attachmentAdapter = useMemo(
    () => createAttachmentAdapter(selectedModel),
    [selectedModel]
  )

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const prepared = prepareComposerMessage(message.content, message.attachments)
      const text = prepared.text
      if (!text) return
      await sendMessage(text, prepared.images)
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
      adapters: attachmentAdapter ? { attachments: attachmentAdapter } : undefined,
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
      setMessagesAdapter,
      attachmentAdapter
    ]
  )

  const runtime = useExternalStoreRuntime(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
  )
}
