import { ipcMain } from 'electron'
import type {
  LlmAddProviderInput,
  LlmThinkingLevel,
  LlmUpdateProviderInput
} from '../../shared/llm-settings'
import type { LlmSettingsService } from '../services/llm/llm-settings-service'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[settings-ipc]', message)
    throw new Error(message)
  })
}

/**
 * 多供应商 LLM 设置 IPC（网络搜索在 network-ipc）
 *
 * P1：任何模型 / Provider / Key / 思考档变更后调用 onChanged，
 * 使 HarnessManager / Models 缓存失效，避免旧 auth / model 继续使用。
 */
export function registerSettingsIpc(
  llm: LlmSettingsService,
  onChanged?: () => void
): void {
  const notify = (): void => {
    try {
      onChanged?.()
    } catch (error) {
      console.warn('[settings-ipc] 设置变更回调失败', error)
    }
  }

  ipcMain.handle('settings:getLlm', () => handle(() => llm.getPublic()))

  ipcMain.handle('settings:addProvider', (_e, input: LlmAddProviderInput) =>
    handle(async () => {
      const result = await llm.addProvider(input ?? { name: '', baseURL: '' })
      notify()
      return result
    })
  )

  ipcMain.handle(
    'settings:updateProvider',
    (_e, providerId: string, patch: LlmUpdateProviderInput) =>
      handle(async () => {
        const result = await llm.updateProvider(providerId, patch ?? {})
        notify()
        return result
      })
  )

  ipcMain.handle('settings:removeProvider', (_e, providerId: string) =>
    handle(async () => {
      const result = await llm.removeProvider(providerId)
      notify()
      return result
    })
  )

  ipcMain.handle(
    'settings:setDefaultModel',
    (_e, providerId: string, modelId: string) =>
      handle(async () => {
        const result = await llm.setDefaultModel(providerId, modelId)
        notify()
        return result
      })
  )

  ipcMain.handle('settings:setThinkingLevel', (_e, level: LlmThinkingLevel) =>
    handle(async () => {
      const result = await llm.setThinkingLevel(level)
      notify()
      return result
    })
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
