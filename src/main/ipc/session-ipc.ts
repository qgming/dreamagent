import { ipcMain } from 'electron'
import type {
  CreateSessionInput,
  UpdateSessionInput
} from '../../shared/ui-chat'
import type { PiSessionService } from '../services/pi-session-service'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[session-ipc]', message)
    throw new Error(message)
  })
}

/**
 * Pi Session IPC（替代旧 conversation:*）
 */
export function registerSessionIpc(sessions: PiSessionService): void {
  ipcMain.handle('session:list', (_e, projectId: string) =>
    handle(() => sessions.list(projectId))
  )

  ipcMain.handle(
    'session:create',
    (_e, projectId: string, input?: CreateSessionInput) =>
      handle(() => sessions.create(projectId, input ?? {}))
  )

  ipcMain.handle(
    'session:open',
    (_e, projectId: string, sessionId: string) =>
      handle(() => sessions.open(projectId, sessionId))
  )

  ipcMain.handle(
    'session:update',
    (_e, projectId: string, sessionId: string, patch: UpdateSessionInput) =>
      handle(() => sessions.update(projectId, sessionId, patch ?? {}))
  )

  ipcMain.handle(
    'session:delete',
    (_e, projectId: string, sessionId: string) =>
      handle(() => sessions.delete(projectId, sessionId))
  )
}
