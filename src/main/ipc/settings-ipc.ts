import { ipcMain } from 'electron'
import type {
  LlmAddProviderInput,
  LlmThinkingLevel,
  LlmUpdateProviderInput
} from '../../shared/llm-settings'
import type { LlmSettingsService } from '../services/llm-settings-service'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[settings-ipc]', message)
    throw new Error(message)
  })
}

/**
 * 多供应商 LLM 设置 IPC（网络搜索在 network-ipc）
 */
export function registerSettingsIpc(llm: LlmSettingsService): void {
  ipcMain.handle('settings:getLlm', () => handle(() => llm.getPublic()))

  ipcMain.handle('settings:addProvider', (_e, input: LlmAddProviderInput) =>
    handle(() => llm.addProvider(input ?? { name: '', baseURL: '' }))
  )

  ipcMain.handle(
    'settings:updateProvider',
    (_e, providerId: string, patch: LlmUpdateProviderInput) =>
      handle(() => llm.updateProvider(providerId, patch ?? {}))
  )

  ipcMain.handle('settings:removeProvider', (_e, providerId: string) =>
    handle(() => llm.removeProvider(providerId))
  )

  ipcMain.handle(
    'settings:setDefaultModel',
    (_e, providerId: string, modelId: string) =>
      handle(() => llm.setDefaultModel(providerId, modelId))
  )

  ipcMain.handle('settings:setThinkingLevel', (_e, level: LlmThinkingLevel) =>
    handle(() => llm.setThinkingLevel(level))
  )

  ipcMain.handle('settings:listSelectableModels', () =>
    handle(() => llm.listSelectableModels())
  )

  ipcMain.handle(
    'settings:listRemoteModels',
    (
      _e,
      input: { providerId?: string; baseURL?: string; apiKey?: string }
    ) => handle(() => llm.listRemoteModels(input ?? {}))
  )
}
