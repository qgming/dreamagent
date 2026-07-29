import { ipcMain } from 'electron'
import type { ConversationService } from '../services/conversation-service'
import type {
  ConversationMessage,
  CreateConversationInput,
  UpdateConversationInput
} from '../../shared/project-types'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[conversation-ipc]', message)
    throw new Error(message)
  })
}

/**
 * 会话 IPC
 */
export function registerConversationIpc(conversations: ConversationService): void {
  ipcMain.handle('conversation:list', (_e, projectId: string) =>
    handle(() => conversations.list(String(projectId)))
  )

  ipcMain.handle(
    'conversation:create',
    (_e, projectId: string, input?: CreateConversationInput) =>
      handle(() => conversations.create(String(projectId), input ?? {}))
  )

  ipcMain.handle('conversation:open', (_e, projectId: string, conversationId: string) =>
    handle(() => conversations.open(String(projectId), String(conversationId)))
  )

  ipcMain.handle(
    'conversation:appendMessages',
    (_e, projectId: string, conversationId: string, messages: ConversationMessage[]) =>
      handle(() =>
        conversations.appendMessages(String(projectId), String(conversationId), messages)
      )
  )

  ipcMain.handle(
    'conversation:update',
    (_e, projectId: string, conversationId: string, patch: UpdateConversationInput) =>
      handle(() => conversations.update(String(projectId), String(conversationId), patch))
  )

  ipcMain.handle('conversation:delete', (_e, projectId: string, conversationId: string) =>
    handle(() => conversations.delete(String(projectId), String(conversationId)))
  )
}
