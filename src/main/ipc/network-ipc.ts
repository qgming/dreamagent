/**
 * 网络 IPC：cors-fetch / web-search / 搜索设置
 */
import { ipcMain } from 'electron'
import type {
  CorsFetchRequest,
  WebSearchRequest,
  WebSearchSettingsPatch
} from '../../shared/web-search'
import { getNetworkService } from '../services/network-service'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[network-ipc]', message)
    throw new Error(message)
  })
}

export function registerNetworkIpc(): void {
  const network = getNetworkService()

  ipcMain.handle('network:cors-fetch', (_e, request: CorsFetchRequest) =>
    handle(() => network.corsFetch(request ?? { url: '' }))
  )

  ipcMain.handle('network:web-search', (_e, request: WebSearchRequest) =>
    handle(() => network.webSearch(request))
  )

  ipcMain.handle('settings:getWebSearch', () =>
    handle(() => network.getPublicSettings())
  )

  ipcMain.handle('settings:setWebSearch', (_e, patch: WebSearchSettingsPatch) =>
    handle(() => network.setSettings(patch ?? {}))
  )
}
