import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { AGENT_TOOL_DEFINITIONS } from '../../shared/agent-tools'
import type {
  AgentCancelTurnInput,
  AgentRegenerateTurnInput,
  AgentStartTurnInput
} from '../../shared/ui-chat'
import type { AgentRunner } from '../services/agent-runner'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[agent-ipc]', message)
    throw new Error(message)
  })
}

/**
 * Agent IPC：startTurn / regenerateTurn / cancelTurn / listTools
 */
export function registerAgentIpc(runner: AgentRunner): void {
  ipcMain.handle('agent:startTurn', (event: IpcMainInvokeEvent, input: AgentStartTurnInput) =>
    handle(() => runner.startTurn(input, event.sender))
  )

  ipcMain.handle(
    'agent:regenerateTurn',
    (event: IpcMainInvokeEvent, input: AgentRegenerateTurnInput) =>
      handle(() => runner.regenerateTurn(input, event.sender))
  )

  ipcMain.handle('agent:cancelTurn', (_e, input: AgentCancelTurnInput) =>
    handle(() => runner.cancelTurn(input))
  )

  ipcMain.handle('agent:listTools', () => AGENT_TOOL_DEFINITIONS)
}
