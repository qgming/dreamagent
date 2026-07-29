import { ipcMain } from 'electron'
import type { LlmSettingsPatch } from '../../shared/llm-settings'
import type { LlmSettingsService } from '../services/llm-settings-service'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[settings-ipc]', message)
    throw new Error(message)
  })
}

/**
 * LLM / 设置 IPC
 */
export function registerSettingsIpc(llm: LlmSettingsService): void {
  ipcMain.handle('settings:getLlm', () => handle(() => llm.getPublic()))

  ipcMain.handle('settings:setLlm', (_e, patch: LlmSettingsPatch) =>
    handle(() => llm.set(patch ?? {}))
  )
}
