/**
 * MCP IPC：列表 / 导入 / 探测 / 启停
 */
import { ipcMain } from 'electron'
import type { McpUpsertInput } from '../../shared/mcp'
import { getMcpService } from '../services/mcp/mcp-service'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[mcp-ipc]', message)
    throw new Error(message)
  })
}

export function registerMcpIpc(): void {
  const mcp = getMcpService()

  ipcMain.handle('mcp:list', () => handle(() => mcp.list()))

  ipcMain.handle('mcp:get', (_e, id: string) => handle(() => mcp.get(String(id || ''))))

  ipcMain.handle('mcp:upsert', (_e, input: McpUpsertInput) =>
    handle(() => mcp.upsert(input))
  )

  ipcMain.handle('mcp:importJson', (_e, jsonText: string, discover?: boolean) =>
    handle(() => mcp.importJson(String(jsonText || ''), discover !== false))
  )

  ipcMain.handle('mcp:remove', (_e, id: string) =>
    handle(() => mcp.remove(String(id || '')))
  )

  ipcMain.handle('mcp:setEnabled', (_e, id: string, enabled: boolean) =>
    handle(() => mcp.setEnabled(String(id || ''), Boolean(enabled)))
  )

  ipcMain.handle(
    'mcp:toggleRemoteTool',
    (_e, serverId: string, toolName: string, enabled: boolean) =>
      handle(() =>
        mcp.toggleRemoteTool(String(serverId || ''), String(toolName || ''), Boolean(enabled))
      )
  )

  ipcMain.handle('mcp:discover', (_e, id: string) =>
    handle(() => mcp.discover(String(id || '')))
  )
}
