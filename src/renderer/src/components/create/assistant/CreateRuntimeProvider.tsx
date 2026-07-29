/**
 * assistant-ui ExternalStore runtime：接 create-store 消息与发送
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
  const cancelTurn = useCreateStore((s) => s.cancelTurn)
  const setMessages = useCreateStore((s) => s.setMessages)

  const onNew = useCallback(
    async (message: AppendMessage) => {
      const textPart = message.content.find((c) => c.type === 'text')
      const text = textPart && textPart.type === 'text' ? textPart.text : ''
      if (!text.trim()) return
      await sendMessage(text)
    },
    [sendMessage]
  )

  const onCancel = useCallback(async () => {
    await cancelTurn()
  }, [cancelTurn])

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
      setMessages: setMessagesAdapter
    }),
    [isRunning, messages, convertMessage, onNew, onCancel, setMessagesAdapter]
  )

  const runtime = useExternalStoreRuntime(adapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
  )
}
