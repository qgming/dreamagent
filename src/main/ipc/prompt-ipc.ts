import { ipcMain } from 'electron'
import type { PromptService } from '../services/prompt/prompt-service'

function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[prompt-ipc]', message)
    throw new Error(message)
  })
}

export function registerPromptIpc(prompts: PromptService): void {
  ipcMain.handle('prompts:listBuiltin', () => handle(() => prompts.listBuiltinPrompts()))
}
