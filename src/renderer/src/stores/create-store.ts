import { create } from 'zustand'
import type { Conversation } from '@shared/project-types'
import { useProjectStore } from './project-store'

/** 右侧详情目标 */
export type DetailTarget = { type: 'beat' | 'entity' | 'chapter'; id: string }

/** 左侧下方：对话 / 文章 Tab */
export type LeftListTab = 'conversations' | 'articles'

interface CreateState {
  activeConversationId: string | null
  activeConversation: Conversation | null
  rightPanelOpen: boolean
  detailTarget: DetailTarget | null
  leftBeatsOpen: boolean
  leftEntitiesOpen: boolean
  leftListTab: LeftListTab
  sending: boolean
  error: string | null
  bootstrappedProjectId: string | null

  ensureSession: () => Promise<void>
  newConversation: () => Promise<void>
  openConversation: (id: string) => Promise<void>
  deleteConversation: (id: string) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  runDemoTurn: () => Promise<void>
  pinBeat: (id: string) => Promise<void>
  unpinBeat: (id: string) => Promise<void>
  pinEntity: (id: string) => Promise<void>
  unpinEntity: (id: string) => Promise<void>
  openDetail: (target: DetailTarget) => void
  setDetailTarget: (target: DetailTarget | null) => void
  setRightPanelOpen: (open: boolean) => void
  toggleRightPanel: () => void
  setLeftBeatsOpen: (open: boolean) => void
  setLeftEntitiesOpen: (open: boolean) => void
  setLeftListTab: (tab: LeftListTab) => void
  reset: () => void
}

const initialState = {
  activeConversationId: null as string | null,
  activeConversation: null as Conversation | null,
  rightPanelOpen: false,
  detailTarget: null as DetailTarget | null,
  leftBeatsOpen: false,
  leftEntitiesOpen: false,
  leftListTab: 'conversations' as LeftListTab,
  sending: false,
  error: null as string | null,
  bootstrappedProjectId: null as string | null
}

function lastChapterId(conv: Conversation): string | null {
  for (let i = conv.messages.length - 1; i >= 0; i--) {
    const ids = conv.messages[i].chapterIds
    if (ids && ids.length > 0) return ids[ids.length - 1]
  }
  return null
}

/**
 * 创作页 UI / 会话状态
 */
export const useCreateStore = create<CreateState>((set, get) => ({
  ...initialState,

  ensureSession: async () => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    if (get().bootstrappedProjectId === projectId && get().activeConversation) return

    try {
      const summaries = await window.api.conversation.list(projectId)
      const snap = useProjectStore.getState().snapshot
      if (snap) {
        useProjectStore.getState().applyExternalSnapshot({
          ...snap,
          conversationSummaries: summaries
        })
      }

      if (summaries.length === 0) {
        const conv = await window.api.conversation.create(projectId, { title: '新对话' })
        set({
          activeConversationId: conv.id,
          activeConversation: conv,
          bootstrappedProjectId: projectId,
          detailTarget: null,
          rightPanelOpen: false,
          error: null
        })
        const refreshed = await window.api.project.open(projectId)
        useProjectStore.getState().applyExternalSnapshot(refreshed)
        return
      }

      const latest = summaries[0]
      const conv = await window.api.conversation.open(projectId, latest.id)
      const chapId = lastChapterId(conv)
      set({
        activeConversationId: conv.id,
        activeConversation: conv,
        bootstrappedProjectId: projectId,
        detailTarget: chapId ? { type: 'chapter', id: chapId } : null,
        rightPanelOpen: Boolean(chapId),
        error: null
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  newConversation: async () => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    try {
      const conv = await window.api.conversation.create(projectId, { title: '新对话' })
      set({
        activeConversationId: conv.id,
        activeConversation: conv,
        leftListTab: 'conversations',
        detailTarget: null,
        rightPanelOpen: false,
        error: null
      })
      const snap = await window.api.project.open(projectId)
      useProjectStore.getState().applyExternalSnapshot(snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  openConversation: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    try {
      const conv = await window.api.conversation.open(projectId, id)
      const chapId = lastChapterId(conv)
      set({
        activeConversationId: conv.id,
        activeConversation: conv,
        leftListTab: 'conversations',
        detailTarget: chapId ? { type: 'chapter', id: chapId } : get().detailTarget,
        rightPanelOpen: chapId ? true : get().rightPanelOpen,
        error: null
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  deleteConversation: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    try {
      const wasActive = get().activeConversationId === id
      await window.api.conversation.delete(projectId, id)
      const summaries = await window.api.conversation.list(projectId)
      const snap = useProjectStore.getState().snapshot
      if (snap) {
        useProjectStore.getState().applyExternalSnapshot({
          ...snap,
          conversationSummaries: summaries
        })
      }

      if (!wasActive) {
        set({ error: null })
        return
      }

      // 删的是当前会话：切到最近一条，或新建空会话
      if (summaries.length > 0) {
        const next = await window.api.conversation.open(projectId, summaries[0].id)
        const chapId = lastChapterId(next)
        set({
          activeConversationId: next.id,
          activeConversation: next,
          detailTarget: chapId ? { type: 'chapter', id: chapId } : null,
          rightPanelOpen: Boolean(chapId),
          error: null
        })
      } else {
        const conv = await window.api.conversation.create(projectId, { title: '新对话' })
        const refreshed = await window.api.project.open(projectId)
        useProjectStore.getState().applyExternalSnapshot(refreshed)
        set({
          activeConversationId: conv.id,
          activeConversation: conv,
          detailTarget: null,
          rightPanelOpen: false,
          error: null
        })
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  sendMessage: async (text) => {
    const projectId = useProjectStore.getState().activeProjectId
    const { activeConversationId, sending } = get()
    if (!projectId || !activeConversationId || sending) return
    const trimmed = text.trim()
    if (!trimmed) return

    set({ sending: true, error: null })
    const prev = get().activeConversation
    if (prev) {
      set({
        activeConversation: {
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: `tmp_${Date.now()}`,
              role: 'user',
              content: trimmed,
              createdAt: new Date().toISOString()
            }
          ]
        }
      })
    }

    try {
      const result = await window.api.agent.runTurn({
        projectId,
        conversationId: activeConversationId,
        userMessage: trimmed
      })
      useProjectStore.getState().applyExternalSnapshot(result.snapshot)
      const written = result.writtenChapterIds[result.writtenChapterIds.length - 1]
      set({
        activeConversation: result.conversation,
        sending: false,
        ...(written
          ? {
              detailTarget: { type: 'chapter' as const, id: written },
              rightPanelOpen: true,
              leftListTab: 'articles' as const
            }
          : {})
      })
    } catch (error) {
      try {
        const conv = await window.api.conversation.open(projectId, activeConversationId)
        set({
          activeConversation: conv,
          sending: false,
          error: error instanceof Error ? error.message : String(error)
        })
      } catch {
        set({
          sending: false,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  },

  runDemoTurn: async () => {
    const projectId = useProjectStore.getState().activeProjectId
    let { activeConversationId } = get()
    if (!projectId) return
    if (!activeConversationId) {
      await get().ensureSession()
      activeConversationId = get().activeConversationId
    }
    if (!activeConversationId || get().sending) return

    set({ sending: true, error: null })
    try {
      const result = await window.api.agent.runTurn({
        projectId,
        conversationId: activeConversationId,
        userMessage: '演示一轮：读取大纲并写一篇文章',
        demo: true
      })
      useProjectStore.getState().applyExternalSnapshot(result.snapshot)
      const written = result.writtenChapterIds[result.writtenChapterIds.length - 1]
      set({
        activeConversation: result.conversation,
        sending: false,
        ...(written
          ? {
              detailTarget: { type: 'chapter' as const, id: written },
              rightPanelOpen: true,
              leftListTab: 'articles' as const
            }
          : {})
      })
    } catch (error) {
      set({
        sending: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  pinBeat: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    const conv = get().activeConversation
    if (!projectId || !conv) return
    if (conv.pinnedBeatIds.includes(id)) return
    const pinnedBeatIds = [...conv.pinnedBeatIds, id]
    try {
      const next = await window.api.conversation.update(projectId, conv.id, { pinnedBeatIds })
      set({ activeConversation: next })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  unpinBeat: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    const conv = get().activeConversation
    if (!projectId || !conv) return
    const pinnedBeatIds = conv.pinnedBeatIds.filter((x) => x !== id)
    try {
      const next = await window.api.conversation.update(projectId, conv.id, { pinnedBeatIds })
      set({ activeConversation: next })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  pinEntity: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    const conv = get().activeConversation
    if (!projectId || !conv) return
    if (conv.pinnedEntityIds.includes(id)) return
    const pinnedEntityIds = [...conv.pinnedEntityIds, id]
    try {
      const next = await window.api.conversation.update(projectId, conv.id, { pinnedEntityIds })
      set({ activeConversation: next })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  unpinEntity: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    const conv = get().activeConversation
    if (!projectId || !conv) return
    const pinnedEntityIds = conv.pinnedEntityIds.filter((x) => x !== id)
    try {
      const next = await window.api.conversation.update(projectId, conv.id, { pinnedEntityIds })
      set({ activeConversation: next })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  openDetail: (target) => set({ detailTarget: target, rightPanelOpen: true }),
  setDetailTarget: (target) => set({ detailTarget: target }),
  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  toggleRightPanel: () => set({ rightPanelOpen: !get().rightPanelOpen }),
  setLeftBeatsOpen: (open) => set({ leftBeatsOpen: open }),
  setLeftEntitiesOpen: (open) => set({ leftEntitiesOpen: open }),
  setLeftListTab: (tab) => set({ leftListTab: tab }),

  reset: () => set({ ...initialState })
}))
