/**
 * 云端 MCP 配置 store
 */
import { create } from 'zustand'
import type { McpServerConfig, McpUpsertInput } from '@shared/mcp'

interface McpState {
  servers: McpServerConfig[]
  status: 'idle' | 'loading' | 'ready' | 'error'
  errorMessage: string | null
  busyId: string | null

  load: () => Promise<void>
  reload: () => Promise<void>
  upsert: (input: McpUpsertInput) => Promise<McpServerConfig>
  importJson: (jsonText: string) => Promise<McpServerConfig[]>
  remove: (id: string) => Promise<void>
  setEnabled: (id: string, enabled: boolean) => Promise<void>
  toggleRemoteTool: (serverId: string, toolName: string, enabled: boolean) => Promise<void>
  discover: (id: string) => Promise<void>
}

export const useMcpStore = create<McpState>((set, get) => ({
  servers: [],
  status: 'idle',
  errorMessage: null,
  busyId: null,

  load: async () => {
    if (get().status === 'loading') return
    set({ status: 'loading', errorMessage: null })
    try {
      const servers = await window.api.mcp.list()
      set({ servers, status: 'ready' })
    } catch (error) {
      set({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    }
  },

  reload: async () => {
    set({ status: 'loading', errorMessage: null })
    try {
      const servers = await window.api.mcp.list()
      set({ servers, status: 'ready' })
    } catch (error) {
      set({
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error)
      })
    }
  },

  upsert: async (input) => {
    const saved = await window.api.mcp.upsert(input)
    await get().reload()
    return saved
  },

  importJson: async (jsonText) => {
    const saved = await window.api.mcp.importJson(jsonText, true)
    await get().reload()
    return saved
  },

  remove: async (id) => {
    set({ busyId: id })
    try {
      await window.api.mcp.remove(id)
      await get().reload()
    } finally {
      set({ busyId: null })
    }
  },

  setEnabled: async (id, enabled) => {
    set({ busyId: id })
    try {
      await window.api.mcp.setEnabled(id, enabled)
      await get().reload()
    } finally {
      set({ busyId: null })
    }
  },

  toggleRemoteTool: async (serverId, toolName, enabled) => {
    set({ busyId: serverId })
    try {
      await window.api.mcp.toggleRemoteTool(serverId, toolName, enabled)
      await get().reload()
    } finally {
      set({ busyId: null })
    }
  },

  discover: async (id) => {
    set({ busyId: id })
    try {
      await window.api.mcp.discover(id)
      await get().reload()
    } finally {
      set({ busyId: null })
    }
  }
}))
