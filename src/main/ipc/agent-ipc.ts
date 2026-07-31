import { ipcMain } from 'electron'
import { AGENT_TOOL_DEFINITIONS } from '../../shared/agent-tools'
import type {
  AgentCancelTurnInput,
  AgentFollowUpInput,
  AgentRegenerateTurnInput,
  AgentStartTurnInput,
  AgentSteerInput
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
 * Agent IPC：startTurn / regenerate / cancel / steer / followUp / listTools
 */
export function registerAgentIpc(runner: AgentRunner): void {
  ipcMain.handle('agent:startTurn', (_e, input: AgentStartTurnInput) =>
    handle(() => runner.startTurn(input))
  )

  ipcMain.handle('agent:regenerateTurn', (_e, input: AgentRegenerateTurnInput) =>
    handle(() => runner.regenerateTurn(input))
  )

  ipcMain.handle('agent:cancelTurn', (_e, input: AgentCancelTurnInput) =>
    handle(() => runner.cancelTurn(input))
  )

  ipcMain.handle('agent:steer', (_e, input: AgentSteerInput) =>
    handle(() => runner.steer(input))
  )

  ipcMain.handle('agent:followUp', (_e, input: AgentFollowUpInput) =>
    handle(() => runner.followUp(input))
  )

  ipcMain.handle(
    'agent:getRunning',
    (_e, input?: { projectId?: string; sessionId?: string }) =>
      runner.listRunningRuns(input)
  )

  ipcMain.handle('agent:listTools', () => AGENT_TOOL_DEFINITIONS)
}
