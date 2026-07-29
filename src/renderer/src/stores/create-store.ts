/**
 * 创作页会话 / 流式 Agent 状态（pi session 为 SSOT）
 */
import { create } from 'zustand'
import type { AgentStreamEvent } from '@shared/agent-events'
import type {
  SessionSummary,
  SessionView,
  UiChatMessage,
  UiToolCallPart
} from '@shared/ui-chat'
import type { ProjectSnapshot } from '@shared/project-types'
import { useProjectStore } from './project-store'

/** 右侧详情目标 */
export type DetailTarget = { type: 'beat' | 'entity' | 'chapter'; id: string }

/** 左侧下方：对话 / 文章 Tab */
export type LeftListTab = 'conversations' | 'articles'

interface CreateState {
  activeSessionId: string | null
  session: SessionView | null
  /** 会话列表摘要（左栏） */
  sessionSummaries: SessionSummary[]
  rightPanelOpen: boolean
  /** true = 用户手动开关，右栏走 spring；false = 进页/会话恢复等硬切 */
  rightPanelAnimate: boolean
  detailTarget: DetailTarget | null
  leftBeatsOpen: boolean
  leftEntitiesOpen: boolean
  leftListTab: LeftListTab
  sending: boolean
  runId: string | null
  error: string | null
  bootstrappedProjectId: string | null

  ensureSession: () => Promise<void>
  newSession: () => Promise<void>
  openSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  refreshSessionList: () => Promise<void>
  sendMessage: (text: string) => Promise<void>
  cancelTurn: () => Promise<void>
  pinBeat: (id: string) => Promise<void>
  unpinBeat: (id: string) => Promise<void>
  pinEntity: (id: string) => Promise<void>
  unpinEntity: (id: string) => Promise<void>
  openDetail: (target: DetailTarget) => void
  setDetailTarget: (target: DetailTarget | null) => void
  setRightPanelOpen: (open: boolean, animate?: boolean) => void
  toggleRightPanel: () => void
  setLeftBeatsOpen: (open: boolean) => void
  setLeftEntitiesOpen: (open: boolean) => void
  setLeftListTab: (tab: LeftListTab) => void
  /** 供 ExternalStore 直接改消息（一般不调用） */
  setMessages: (messages: UiChatMessage[]) => void
  reset: () => void
}

const initialState = {
  activeSessionId: null as string | null,
  session: null as SessionView | null,
  sessionSummaries: [] as SessionSummary[],
  rightPanelOpen: false,
  rightPanelAnimate: false,
  detailTarget: null as DetailTarget | null,
  leftBeatsOpen: false,
  leftEntitiesOpen: false,
  leftListTab: 'conversations' as LeftListTab,
  sending: false,
  runId: null as string | null,
  error: null as string | null,
  bootstrappedProjectId: null as string | null
}

function lastChapterId(messages: UiChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const ids = messages[i].chapterIds
    if (ids && ids.length > 0) return ids[ids.length - 1]
  }
  return null
}

function patchAssistantMessage(
  messages: UiChatMessage[],
  messageId: string,
  patch: (m: UiChatMessage) => UiChatMessage
): UiChatMessage[] {
  const idx = messages.findIndex((m) => m.id === messageId)
  if (idx < 0) {
    // 尚无该消息：追加空 assistant
    return [
      ...messages,
      patch({
        id: messageId,
        role: 'assistant',
        createdAt: new Date().toISOString(),
        parts: [],
        status: 'streaming'
      })
    ]
  }
  const next = [...messages]
  next[idx] = patch(next[idx])
  return next
}

let unsubAgent: (() => void) | null = null

function ensureAgentSubscription(
  get: () => CreateState,
  set: (
    partial: Partial<CreateState> | ((s: CreateState) => Partial<CreateState>)
  ) => void
): void {
  if (unsubAgent) return
  unsubAgent = window.api.agent.onEvent((event: AgentStreamEvent) => {
    const state = get()
    if (event.sessionId !== state.activeSessionId) return
    if (state.runId && 'runId' in event && event.runId !== state.runId) {
      // 允许 turn_start 建立 runId 之前的竞态：仅 turn_start 可改 runId
      if (event.type !== 'turn_start') return
    }

    switch (event.type) {
      case 'turn_start':
        set({ runId: event.runId, sending: true, error: null })
        break
      case 'user_message': {
        const sess = get().session
        if (!sess) break
        // 若已有乐观用户消息则跳过重复
        const exists = sess.messages.some(
          (m) =>
            m.role === 'user' &&
            m.parts[0]?.type === 'text' &&
            event.message.parts[0]?.type === 'text' &&
            m.parts[0].text === event.message.parts[0].text &&
            m.status === 'complete'
        )
        if (exists && sess.messages.some((m) => m.id.startsWith('tmp_'))) {
          // 用正式 id 替换临时
          set({
            session: {
              ...sess,
              messages: sess.messages.map((m) =>
                m.id.startsWith('tmp_') && m.role === 'user' ? event.message : m
              )
            }
          })
        } else if (!sess.messages.some((m) => m.id === event.message.id)) {
          set({
            session: { ...sess, messages: [...sess.messages, event.message] }
          })
        }
        break
      }
      case 'assistant_start': {
        const sess = get().session
        if (!sess) break
        if (sess.messages.some((m) => m.id === event.messageId)) break
        set({
          session: {
            ...sess,
            messages: [
              ...sess.messages,
              {
                id: event.messageId,
                role: 'assistant',
                createdAt: new Date().toISOString(),
                parts: [],
                status: 'streaming'
              }
            ]
          }
        })
        break
      }
      case 'text_delta': {
        const sess = get().session
        if (!sess) break
        set({
          session: {
            ...sess,
            messages: patchAssistantMessage(sess.messages, event.messageId, (m) => {
              const parts = [...m.parts]
              const last = parts[parts.length - 1]
              if (last && last.type === 'text') {
                parts[parts.length - 1] = {
                  type: 'text',
                  text: last.text + event.delta
                }
              } else {
                parts.push({ type: 'text', text: event.delta })
              }
              return { ...m, parts, status: 'streaming' }
            })
          }
        })
        break
      }
      case 'thinking_delta': {
        const sess = get().session
        if (!sess) break
        set({
          session: {
            ...sess,
            messages: patchAssistantMessage(sess.messages, event.messageId, (m) => {
              const parts = [...m.parts]
              const last = parts[parts.length - 1]
              if (last && last.type === 'reasoning') {
                parts[parts.length - 1] = {
                  type: 'reasoning',
                  text: last.text + event.delta
                }
              } else {
                parts.push({ type: 'reasoning', text: event.delta })
              }
              return { ...m, parts, status: 'streaming' }
            })
          }
        })
        break
      }
      case 'tool_start': {
        const sess = get().session
        if (!sess) break
        set({
          session: {
            ...sess,
            messages: patchAssistantMessage(sess.messages, event.messageId, (m) => ({
              ...m,
              status: 'streaming',
              parts: [...m.parts, event.tool]
            }))
          }
        })
        break
      }
      case 'tool_end': {
        const sess = get().session
        if (!sess) break
        set({
          session: {
            ...sess,
            messages: patchAssistantMessage(sess.messages, event.messageId, (m) => {
              const parts = m.parts.map((p) =>
                p.type === 'tool-call' && p.toolCallId === event.tool.toolCallId
                  ? event.tool
                  : p
              )
              // 若未找到则追加
              const has = parts.some(
                (p) =>
                  p.type === 'tool-call' && p.toolCallId === event.tool.toolCallId
              )
              if (!has) parts.push(event.tool)
              return {
                ...m,
                parts,
                chapterIds: event.chapterIds?.length
                  ? [...(m.chapterIds ?? []), ...event.chapterIds]
                  : m.chapterIds,
                beatStatusUpdates: event.beatStatusUpdates?.length
                  ? [...(m.beatStatusUpdates ?? []), ...event.beatStatusUpdates]
                  : m.beatStatusUpdates
              }
            })
          }
        })
        break
      }
      case 'assistant_end': {
        const sess = get().session
        if (!sess) break
        set({
          session: {
            ...sess,
            messages: sess.messages.map((m) =>
              m.id === event.message.id
                ? { ...event.message, status: 'complete' as const }
                : m.status === 'streaming'
                  ? { ...m, status: 'complete' as const }
                  : m
            )
          }
        })
        break
      }
      case 'snapshot': {
        if (event.snapshot) {
          useProjectStore
            .getState()
            .applyExternalSnapshot(event.snapshot as ProjectSnapshot)
        }
        break
      }
      case 'turn_done': {
        const payload = event.payload
        if (payload.snapshot) {
          useProjectStore
            .getState()
            .applyExternalSnapshot(payload.snapshot as ProjectSnapshot)
        }
        const written =
          payload.writtenChapterIds[payload.writtenChapterIds.length - 1]
        set({
          session: payload.session,
          sending: false,
          runId: null,
          error: null,
          ...(written
            ? {
                detailTarget: { type: 'chapter' as const, id: written },
                rightPanelOpen: true,
                rightPanelAnimate: false,
                leftListTab: 'articles' as const
              }
            : {})
        })
        void get().refreshSessionList()
        break
      }
      case 'error':
        set({ sending: false, runId: null, error: event.message })
        break
      case 'aborted': {
        const sess = get().session
        if (sess) {
          set({
            sending: false,
            runId: null,
            session: {
              ...sess,
              messages: sess.messages.map((m) =>
                m.status === 'streaming' ? { ...m, status: 'aborted' as const } : m
              )
            }
          })
        } else {
          set({ sending: false, runId: null })
        }
        break
      }
      default:
        break
    }
  })
}

/**
 * 创作页 UI / 会话状态
 */
export const useCreateStore = create<CreateState>((set, get) => ({
  ...initialState,

  ensureSession: async () => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return

    ensureAgentSubscription(get, set)

    // 已引导过：仍刷新列表，保证磁盘上的历史会话能出现在左栏
    if (get().bootstrappedProjectId === projectId && get().session) {
      try {
        const summaries = await window.api.session.list(projectId)
        set({ sessionSummaries: summaries, error: null })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) })
      }
      return
    }

    try {
      const summaries = await window.api.session.list(projectId)
      set({ sessionSummaries: summaries })

      if (summaries.length === 0) {
        const view = await window.api.session.create(projectId, { title: '新对话' })
        // 再 list 一次，与磁盘状态对齐
        const after = await window.api.session.list(projectId).catch(() => [
          {
            id: view.id,
            title: view.title,
            messageCount: 0,
            createdAt: view.createdAt,
            updatedAt: view.updatedAt
          }
        ])
        set({
          activeSessionId: view.id,
          session: view,
          sessionSummaries: after.length > 0 ? after : [
            {
              id: view.id,
              title: view.title,
              messageCount: 0,
              createdAt: view.createdAt,
              updatedAt: view.updatedAt
            }
          ],
          bootstrappedProjectId: projectId,
          detailTarget: null,
          rightPanelOpen: false,
          rightPanelAnimate: false,
          error: null
        })
        return
      }

      const latest = summaries[0]
      const view = await window.api.session.open(projectId, latest.id)
      const chapId = lastChapterId(view.messages)
      set({
        activeSessionId: view.id,
        session: view,
        sessionSummaries: summaries,
        bootstrappedProjectId: projectId,
        detailTarget: chapId ? { type: 'chapter', id: chapId } : null,
        rightPanelOpen: Boolean(chapId),
        rightPanelAnimate: false,
        error: null
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  refreshSessionList: async () => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    try {
      const summaries = await window.api.session.list(projectId)
      set({ sessionSummaries: summaries })
    } catch {
      // 忽略列表刷新失败
    }
  },

  newSession: async () => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    try {
      const view = await window.api.session.create(projectId, { title: '新对话' })
      set({
        activeSessionId: view.id,
        session: view,
        leftListTab: 'conversations',
        detailTarget: null,
        rightPanelOpen: false,
        rightPanelAnimate: false,
        error: null
      })
      await get().refreshSessionList()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  openSession: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    try {
      // 切换会话前若在生成则取消
      if (get().sending && get().activeSessionId) {
        await get().cancelTurn()
      }
      const view = await window.api.session.open(projectId, id)
      const chapId = lastChapterId(view.messages)
      set({
        activeSessionId: view.id,
        session: view,
        leftListTab: 'conversations',
        detailTarget: chapId ? { type: 'chapter', id: chapId } : get().detailTarget,
        rightPanelOpen: chapId ? true : get().rightPanelOpen,
        rightPanelAnimate: false,
        error: null,
        sending: false,
        runId: null
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  deleteSession: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    if (!projectId) return
    try {
      const wasActive = get().activeSessionId === id
      if (wasActive && get().sending) await get().cancelTurn()
      await window.api.session.delete(projectId, id)
      const summaries = await window.api.session.list(projectId)
      set({ sessionSummaries: summaries })

      if (!wasActive) {
        set({ error: null })
        return
      }

      if (summaries.length > 0) {
        const next = await window.api.session.open(projectId, summaries[0].id)
        const chapId = lastChapterId(next.messages)
        set({
          activeSessionId: next.id,
          session: next,
          detailTarget: chapId ? { type: 'chapter', id: chapId } : null,
          rightPanelOpen: Boolean(chapId),
          rightPanelAnimate: false,
          error: null
        })
      } else {
        const view = await window.api.session.create(projectId, { title: '新对话' })
        set({
          activeSessionId: view.id,
          session: view,
          sessionSummaries: [
            {
              id: view.id,
              title: view.title,
              messageCount: 0,
              createdAt: view.createdAt,
              updatedAt: view.updatedAt
            }
          ],
          detailTarget: null,
          rightPanelOpen: false,
          rightPanelAnimate: false,
          error: null
        })
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  sendMessage: async (text) => {
    ensureAgentSubscription(get, set)
    const projectId = useProjectStore.getState().activeProjectId
    const { activeSessionId, sending } = get()
    if (!projectId || !activeSessionId || sending) return
    const trimmed = text.trim()
    if (!trimmed) return

    set({ sending: true, error: null })
    const prev = get().session
    if (prev) {
      set({
        session: {
          ...prev,
          messages: [
            ...prev.messages,
            {
              id: `tmp_${Date.now()}`,
              role: 'user',
              createdAt: new Date().toISOString(),
              parts: [{ type: 'text', text: trimmed }],
              status: 'complete'
            }
          ]
        }
      })
    }

    try {
      const { runId } = await window.api.agent.startTurn({
        projectId,
        sessionId: activeSessionId,
        userMessage: trimmed
      })
      set({ runId })
    } catch (error) {
      set({
        sending: false,
        runId: null,
        error: error instanceof Error ? error.message : String(error)
      })
      // 回读会话
      try {
        const view = await window.api.session.open(projectId, activeSessionId)
        set({ session: view })
      } catch {
        // ignore
      }
    }
  },

  cancelTurn: async () => {
    const projectId = useProjectStore.getState().activeProjectId
    const { activeSessionId, runId } = get()
    if (!projectId || !activeSessionId) return
    try {
      await window.api.agent.cancelTurn({
        projectId,
        sessionId: activeSessionId,
        runId: runId ?? undefined
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ sending: false, runId: null })
    }
  },

  pinBeat: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    const sess = get().session
    if (!projectId || !sess) return
    if (sess.pinnedBeatIds.includes(id)) return
    const pinnedBeatIds = [...sess.pinnedBeatIds, id]
    try {
      const next = await window.api.session.update(projectId, sess.id, { pinnedBeatIds })
      set({ session: next })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  unpinBeat: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    const sess = get().session
    if (!projectId || !sess) return
    const pinnedBeatIds = sess.pinnedBeatIds.filter((x) => x !== id)
    try {
      const next = await window.api.session.update(projectId, sess.id, { pinnedBeatIds })
      set({ session: next })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  pinEntity: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    const sess = get().session
    if (!projectId || !sess) return
    if (sess.pinnedEntityIds.includes(id)) return
    const pinnedEntityIds = [...sess.pinnedEntityIds, id]
    try {
      const next = await window.api.session.update(projectId, sess.id, {
        pinnedEntityIds
      })
      set({ session: next })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  unpinEntity: async (id) => {
    const projectId = useProjectStore.getState().activeProjectId
    const sess = get().session
    if (!projectId || !sess) return
    const pinnedEntityIds = sess.pinnedEntityIds.filter((x) => x !== id)
    try {
      const next = await window.api.session.update(projectId, sess.id, {
        pinnedEntityIds
      })
      set({ session: next })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  // 点选详情：用户操作，允许动画
  openDetail: (target) =>
    set({ detailTarget: target, rightPanelOpen: true, rightPanelAnimate: true }),
  setDetailTarget: (target) => set({ detailTarget: target }),
  // animate 默认 true（手动）；会话恢复等传 false 硬切
  setRightPanelOpen: (open, animate = true) =>
    set({ rightPanelOpen: open, rightPanelAnimate: animate }),
  // 标题栏按钮：用户手动，开动画
  toggleRightPanel: () =>
    set({ rightPanelOpen: !get().rightPanelOpen, rightPanelAnimate: true }),
  setLeftBeatsOpen: (open) => set({ leftBeatsOpen: open }),
  setLeftEntitiesOpen: (open) => set({ leftEntitiesOpen: open }),
  setLeftListTab: (tab) => set({ leftListTab: tab }),

  setMessages: (messages) => {
    const sess = get().session
    if (!sess) return
    set({ session: { ...sess, messages: [...messages] } })
  },

  reset: () => {
    set({ ...initialState })
  }
}))

// 避免未使用告警（工具类型在事件里用）
void null as unknown as UiToolCallPart
