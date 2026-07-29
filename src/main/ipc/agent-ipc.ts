import { ipcMain } from 'electron'
import { AGENT_TOOL_DEFINITIONS } from '../../shared/agent-tools'
import type { AgentRunTurnInput } from '../../shared/project-types'
import type { AgentPlaceholderRunner } from '../services/agent-placeholder-runner'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[agent-ipc]', message)
    throw new Error(message)
  })
}

/**
 * Agent IPC：占位 runTurn + 工具列表
 */
export function registerAgentIpc(runner: AgentPlaceholderRunner): void {
  ipcMain.handle('agent:runTurn', (_e, input: AgentRunTurnInput) =>
    handle(() => runner.runTurn(input))
  )

  ipcMain.handle('agent:listTools', () => AGENT_TOOL_DEFINITIONS)
}
