/**
 * UiChatMessage → assistant-ui ThreadMessageLike
 * 支持 text / reasoning / tool-call
 */
import type { ThreadMessageLike } from '@assistant-ui/react'
import type { UiChatMessage } from '@shared/ui-chat'

export function convertUiMessage(message: UiChatMessage): ThreadMessageLike {
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'reasoning'; text: string }
    | {
        type: 'tool-call'
        toolCallId: string
        toolName: string
        args: Record<string, string | number | boolean | null>
        argsText: string
        result?: unknown
        isError?: boolean
      }
  > = []

  for (const part of message.parts) {
    if (part.type === 'text') {
      content.push({ type: 'text', text: part.text })
    } else if (part.type === 'reasoning') {
      content.push({ type: 'reasoning', text: part.text })
    } else {
      content.push({
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        args: (part.args ?? {}) as Record<string, string | number | boolean | null>,
        argsText: JSON.stringify(part.args ?? {}),
        result: part.result,
        isError: part.isError
      })
    }
  }

  const safeContent =
    content.length > 0 ? content : ([{ type: 'text', text: '' }] as const)

  let status: ThreadMessageLike['status']
  if (message.role === 'assistant') {
    if (message.status === 'streaming') {
      status = { type: 'running' }
    } else if (message.status === 'error') {
      status = {
        type: 'incomplete',
        reason: 'error',
        error: '生成失败'
      }
    } else if (message.status === 'aborted') {
      status = { type: 'incomplete', reason: 'cancelled' }
    } else {
      status = { type: 'complete', reason: 'stop' }
    }
  }

  return {
    id: message.id,
    role: message.role,
    content: safeContent as ThreadMessageLike['content'],
    createdAt: new Date(message.createdAt),
    status
  }
}
