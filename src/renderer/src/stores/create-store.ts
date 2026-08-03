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
import type { TodoItem } from '@shared/todos'
import type { SessionGoal } from '@shared/session-goals'
import type { ContextCompactionState } from '@shared/context-usage'
import type {
  LlmSelectableModel,
  LlmThinkingLevel
} from '@shared/llm-settings'
import {
  decodeModelKey,
  encodeModelKey,
  DEFAULT_THINKING_LEVEL
} from '@shared/llm-settings'
import { useProjectStore } from './project-store'
import { extractContextRefsFromText } from '@shared/context-refs'

/** 右侧详情目标 */
export type DetailTarget = { type: 'beat' | 'entity' | 'chapter'; id: string }

export function isDetailTargetAvailable(
  snapshot: ProjectSnapshot | null,
  target: DetailTarget | null
): boolean {
  if (!snapshot || !target) return false
  switch (target.type) {
    case 'beat':
      return Boolean(snapshot.beats[target.id])
    case 'entity':
      return Boolean(snapshot.entities[target.id])
    case 'chapter':
      return Boolean(snapshot.chapters[target.id])
  }
}

/** 左侧下方：对话 / 文章 Tab */
export type LeftListTab = 'conversations' | 'articles'

interface CreateState {
  activeSessionId: string | null
  session: SessionView | null
  /** 会话列表摘要（左栏） */
  sessionSummaries: SessionSummary[]
  /** 当前会话 Agent 待办（只读展示；仅 AI todo 工具可写/清理，打开会话时从磁盘恢复） */
  todos: TodoItem[]
  goalArmed: boolean
  rightPanelOpen: boolean
  /** true = 用户手动开关，右栏走 spring；false = 进页/会话恢复等硬切 */
  rightPanelAnimate: boolean
  detailTarget: DetailTarget | null
  leftBeatsOpen: boolean
  leftEntitiesOpen: boolean
  leftTodosOpen: boolean
  leftListTab: LeftListTab
  sending: boolean
  /** 目标审计期间为 true；用户输入会先中断自动链再启动新回合。 */
  goalAuditing: boolean
  runId: string | null
  error: string | null
  compactionState: ContextCompactionState
  compactionError: string | null
  bootstrappedProjectId: string | null
  /** 当前选用模型 key = providerId::modelId */
  selectedModelKey: string | null
  thinkingLevel: LlmThinkingLevel
  selectableModels: LlmSelectableModel[]
  /** followUp 队列预览 */
  followUpCount: number
  followUpPreview: string | null
  retryMessage: string | null

  ensureSession: () => Promise<void>
  newSession: () => Promise<void>
  openSession: (id: string) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  refreshSessionList: () => Promise<void>
  loadSelectableModels: () => Promise<void>
  setSelectedModelKey: (key: string) => void
  setThinkingLevel: (level: LlmThinkingLevel) => void
  setGoalArmed: (armed: boolean) => void
  updateGoal: (goal: SessionGoal | null) => Promise<void>
  sendMessage: (text: string) => Promise<void>
  /** 运行中插话 */
  steerMessage: (text: string) => Promise<void>
  /** 排队到本轮结束后 */
  queueFollowUp: (text: string) => Promise<void>
  /** 重新生成：以 parentId（用户消息 id）为锚点 */
  regenerateMessage: (userMessageId: string) => Promise<void>
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
  setLeftTodosOpen: (open: boolean) => void
  setLeftListTab: (tab: LeftListTab) => void
  setTodos: (todos: TodoItem[]) => void
  /** 供 ExternalStore 直接改消息（一般不调用） */
  setMessages: (messages: UiChatMessage[]) => void
  reset: () => void
}

const initialState = {
  activeSessionId: null as string | null,
  session: null as SessionView | null,
  sessionSummaries: [] as SessionSummary[],
  todos: [] as TodoItem[],
  goalArmed: false,
  rightPanelOpen: false,
  rightPanelAnimate: false,
  detailTarget: null as DetailTarget | null,
  leftBeatsOpen: false,
  leftEntitiesOpen: false,
  leftTodosOpen: false,
  leftListTab: 'conversations' as LeftListTab,
  sending: false,
  goalAuditing: false,
  runId: null as string | null,
  error: null as string | null,
  compactionState: 'idle' as ContextCompactionState,
  compactionError: null as string | null,
  bootstrappedProjectId: null as string | null,
  selectedModelKey: null as string | null,
  thinkingLevel: DEFAULT_THINKING_LEVEL as LlmThinkingLevel,
  selectableModels: [] as LlmSelectableModel[],
  followUpCount: 0,
  followUpPreview: null as string | null,
  retryMessage: null as string | null
}

/**
 * 按项目串行化 ensureSession，避免 React StrictMode 双 effect
 * 或快速切换时并发 list→create 产生两个「新对话」。
 */
const ensureSessionInflight = new Map<string, Promise<void>>()

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

type SetState = (
  partial: Partial<CreateState> | ((s: CreateState) => Partial<CreateState>)
) => void

/**
 * 把当前选用模型写进 session.usage.model，顶部 ContextDisplay 立刻反映
 * 上下文窗口 / 名称 / logo；占用百分比按新窗口重算。
 */
function applySelectedModelToSessionUsage(
  get: () => CreateState,
  set: SetState,
  key?: string | null
): void {
  const state = get()
  const sess = state.session
  if (!sess?.usage) return
  const modelKey = key ?? state.selectedModelKey
  if (!modelKey) return
  const sel = state.selectableModels.find((m) => m.key === modelKey)
  if (!sel) return

  const prev = sess.usage
  const contextWindow = sel.contextWindow || prev.model.contextWindow || 1
  const contextPercent = Math.min(
    (prev.contextTokens / contextWindow) * 100,
    100
  )

  set({
    session: {
      ...sess,
      usage: {
        ...prev,
        contextPercent,
        model: {
          ...prev.model,
          configuredId: sel.modelId,
          id: sel.modelId,
          name: sel.modelName || sel.modelId,
          providerId: sel.providerId,
          providerName: sel.providerName,
          logoUrl: sel.logoUrl ?? prev.model.logoUrl,
          logoMonochrome: sel.logoMonochrome ?? prev.model.logoMonochrome,
          contextWindow,
          maxOutputTokens: sel.maxTokens || prev.model.maxOutputTokens,
          reasoning: sel.reasoning,
          effortLevels: sel.effortLevels,
          inputModalities: sel.inputModalities,
          outputModalities: sel.outputModalities,
          attachment: sel.attachment,
          toolCall: sel.toolCall,
          matched: true
        }
      }
    }
  })
}

/**
 * 主进程若仍有该会话的回合在跑（用户离开创作页后返回 / 页面重载），
 * 恢复“运行中”状态，让流式事件与取消/插话控制继续可用。
 * 运行本身始终在主进程执行，不依赖本页面是否一直挂载。
 */
async function restoreRunningRun(
  set: SetState,
  projectId: string,
  sessionId: string
): Promise<void> {
  try {
    const runs = await window.api.agent.getRunning({ projectId, sessionId })
    const run = runs[0]
    if (run) {
      set({
        sending: true,
        goalAuditing: Boolean(run.goalAuditing),
        runId: run.runId,
        error: null
      })
    }
  } catch {
    // 主进程无运行状态时忽略
  }
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
        set({ runId: event.runId, sending: true, goalAuditing: false, error: null })
        break
      case 'branch_reset': {
        const sess = get().session
        if (!sess) break
        set({
          session: {
            ...sess,
            messages: event.messages
          }
        })
        break
      }
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
          },
          ...(event.todos ? { todos: event.todos } : {})
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
          todos: payload.session.todos ?? get().todos,
          sending: false,
          goalAuditing: false,
          runId: null,
          error: null,
          followUpCount: 0,
          followUpPreview: null,
          retryMessage: null,
          ...(written ? { leftListTab: 'articles' as const } : {})
        })
        // 回合结束后再按当前选用模型校正上下文展示
        applySelectedModelToSessionUsage(get, set)
        void get().refreshSessionList()
        break
      }
      case 'context_update': {
        const sess = get().session
        if (!sess) break
        set({
          session: { ...sess, usage: event.usage },
          compactionState: event.compactionState,
          compactionError: event.compactionError ?? null
        })
        applySelectedModelToSessionUsage(get, set)
        break
      }
      case 'goal_audit': {
        const sess = get().session
        set({
          ...(sess && event.goal ? { session: { ...sess, goal: event.goal } } : {}),
          sending: event.phase === 'checking' || event.phase === 'continued',
          goalAuditing: event.phase === 'checking',
          error: event.phase === 'error' ? event.message ?? '目标自动续跑失败' : null,
          ...(event.phase === 'completed' || event.phase === 'blocked' || event.phase === 'error'
            ? { runId: null }
            : {})
        })
        if (event.phase === 'completed' || event.phase === 'blocked' || event.phase === 'error') {
          void get().refreshSessionList()
        }
        break
      }
      case 'error': {
        const sess = get().session
        if (sess) {
          set({
            sending: false,
            goalAuditing: false,
            runId: null,
            error: event.message,
            session: {
              ...sess,
              messages: sess.messages.map((m) =>
                m.status === 'streaming' ? { ...m, status: 'error' as const } : m
              )
            }
          })
        } else {
          set({ sending: false, goalAuditing: false, runId: null, error: event.message })
        }
        break
      }
      case 'aborted': {
        const sess = get().session
        if (sess) {
          set({
            sending: false,
            goalAuditing: false,
            runId: null,
            followUpCount: 0,
            followUpPreview: null,
            retryMessage: null,
            session: {
              ...sess,
              messages: sess.messages.map((m) =>
                m.status === 'streaming' ? { ...m, status: 'aborted' as const } : m
              )
            }
          })
        } else {
          set({
            sending: false,
            goalAuditing: false,
            runId: null,
            followUpCount: 0,
            followUpPreview: null,
            retryMessage: null
          })
        }
        break
      }
      case 'queue_update': {
        set({
          followUpCount: event.followUpCount,
          followUpPreview: event.followUpPreview ?? null
        })
        break
      }
      case 'retry_status': {
        if (event.phase === 'finished') {
          set({ retryMessage: null })
        } else {
          set({
            retryMessage:
              event.message ||
              (event.attempt
                ? `重试中 ${event.attempt}…`
                : '正在重试…')
          })
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

    // 同一项目只跑一次引导；并发调用复用同一 Promise
    const inflight = ensureSessionInflight.get(projectId)
    if (inflight) {
      await inflight
      return
    }

    const run = (async () => {
      try {
        // 二次检查：等锁期间可能已被其他调用引导完成
        if (get().bootstrappedProjectId === projectId && get().session) {
          const summaries = await window.api.session.list(projectId).catch(() => null)
          if (summaries) set({ sessionSummaries: summaries, error: null })
          return
        }

        const summaries = await window.api.session.list(projectId)
        set({ sessionSummaries: summaries })

        if (summaries.length === 0) {
          const view = await window.api.session.create(projectId, { title: '新对话' })
          // 再 list 一次，与磁盘状态对齐（并去重，防止历史竞态残留）
          let after = await window.api.session.list(projectId).catch(() => [
            {
              id: view.id,
              title: view.title,
              messageCount: 0,
              createdAt: view.createdAt,
              updatedAt: view.updatedAt
            }
          ])
          // 空项目若仍出现多个「新对话」（旧竞态产物），只保留当前 view，多余的删掉
          if (after.length > 1) {
            const extras = after.filter((s) => s.id !== view.id && s.messageCount === 0)
            for (const extra of extras) {
              await window.api.session.delete(projectId, extra.id).catch(() => undefined)
            }
            after = await window.api.session.list(projectId).catch(() =>
              after.filter((s) => s.id === view.id)
            )
          }
          set({
            activeSessionId: view.id,
            session: view,
            todos: view.todos ?? [],
            goalArmed: false,
            goalAuditing: false,
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
            error: null,
            compactionState: 'idle',
            compactionError: null
          })
          return
        }

        const latest = summaries[0]
        const view = await window.api.session.open(projectId, latest.id)
        set({
          activeSessionId: view.id,
          session: view,
          todos: view.todos ?? [],
          goalArmed: false,
          goalAuditing: false,
          sessionSummaries: summaries,
          bootstrappedProjectId: projectId,
          detailTarget: null,
          rightPanelOpen: false,
          rightPanelAnimate: false,
          error: null,
          compactionState: 'idle',
          compactionError: null
        })
        // 离开创作页后返回：若该会话仍在后台运行，恢复“运行中”状态
        await restoreRunningRun(set, projectId, view.id)
      } catch (error) {
        set({ error: error instanceof Error ? error.message : String(error) })
      }
    })()

    ensureSessionInflight.set(projectId, run)
    try {
      await run
    } finally {
      if (ensureSessionInflight.get(projectId) === run) {
        ensureSessionInflight.delete(projectId)
      }
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
        // 新会话无待办；待办仅由 AI todo 工具写入/清理
        todos: view.todos ?? [],
        goalArmed: false,
        goalAuditing: false,
        error: null,
        compactionState: 'idle',
        compactionError: null
      })
      // 新对话：顶部上下文按当前选用模型刷新窗口/名称/logo
      applySelectedModelToSessionUsage(get, set)
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
      set({
        activeSessionId: view.id,
        session: view,
        leftListTab: 'conversations',
        detailTarget: null,
        rightPanelOpen: false,
        rightPanelAnimate: false,
        // 从 session custom entry 恢复持久化待办（UI 只读，不可手动清理）
        todos: view.todos ?? [],
        goalArmed: false,
        goalAuditing: false,
        error: null,
        sending: false,
        runId: null,
        compactionState: 'idle',
        compactionError: null
      })
      applySelectedModelToSessionUsage(get, set)
      // 若该会话仍在后台运行（离开页面后返回），恢复“运行中”状态
      await restoreRunningRun(set, projectId, view.id)
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
      set({
        activeSessionId: next.id,
        session: next,
        todos: next.todos ?? [],
        goalArmed: false,
        goalAuditing: false,
        detailTarget: null,
          rightPanelOpen: false,
          rightPanelAnimate: false,
          error: null,
          compactionState: 'idle',
          compactionError: null
        })
      } else {
        const view = await window.api.session.create(projectId, { title: '新对话' })
        set({
          activeSessionId: view.id,
          session: view,
          todos: view.todos ?? [],
          goalArmed: false,
          goalAuditing: false,
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
          error: null,
          compactionState: 'idle',
          compactionError: null
        })
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  loadSelectableModels: async () => {
    try {
      const models = await window.api.settings.listSelectableModels()
      const state = get()
      let selectedModelKey = state.selectedModelKey
      // 若当前选择无效，回落到第一个可用模型
      if (
        !selectedModelKey ||
        !models.some((m) => m.key === selectedModelKey && !m.disabled)
      ) {
        selectedModelKey =
          models.find((m) => !m.disabled)?.key ?? models[0]?.key ?? null
      }
      let thinkingLevel = state.thinkingLevel
      try {
        const llm = await window.api.settings.getLlm()
        // 若无选中，用全局默认模型
        if (!selectedModelKey && llm.defaultProviderId && llm.defaultModelId) {
          const key = encodeModelKey(llm.defaultProviderId, llm.defaultModelId)
          if (models.some((m) => m.key === key)) selectedModelKey = key
        }
        // 思考档：优先该模型能力，再回落全局默认
        const selected = models.find((m) => m.key === selectedModelKey)
        if (selected?.reasoning) {
          const levels =
            selected.effortLevels.length > 0
              ? selected.effortLevels
              : (['low', 'medium', 'high'] as LlmThinkingLevel[])
          if (levels.includes(llm.defaultThinkingLevel)) {
            thinkingLevel = llm.defaultThinkingLevel
          } else if (!levels.includes(thinkingLevel)) {
            thinkingLevel = levels.includes('medium')
              ? 'medium'
              : levels[Math.floor(levels.length / 2)] ?? levels[0]
          }
        } else if (llm.defaultThinkingLevel) {
          thinkingLevel = llm.defaultThinkingLevel
        }
      } catch {
        // ignore
      }
      set({ selectableModels: models, selectedModelKey, thinkingLevel })
      // 刷新当前会话上下文展示的模型信息
      applySelectedModelToSessionUsage(get, set, selectedModelKey)
    } catch (error) {
      console.warn('[create-store] 加载可选模型失败', error)
    }
  },

  setSelectedModelKey: (key) => {
    const model = get().selectableModels.find((m) => m.key === key)
    // 切换模型后：思考档纠正到该模型支持范围
    let thinkingLevel = get().thinkingLevel
    if (model?.reasoning) {
      const levels =
        model.effortLevels.length > 0
          ? model.effortLevels
          : (['low', 'medium', 'high'] as LlmThinkingLevel[])
      if (!levels.includes(thinkingLevel)) {
        thinkingLevel = levels.includes('medium')
          ? 'medium'
          : levels[Math.floor(levels.length / 2)] ?? levels[0]
      }
    }
    set({ selectedModelKey: key, thinkingLevel })
    // 立即刷新顶部上下文展示中的模型信息（窗口/名称/logo）
    applySelectedModelToSessionUsage(get, set, key)
  },

  setThinkingLevel: (level) => {
    set({ thinkingLevel: level })
    // 同步写回全局默认（不阻塞 UI）
    void window.api.settings.setThinkingLevel(level).catch(() => undefined)
  },

  setGoalArmed: (armed) => set({ goalArmed: armed }),

  updateGoal: async (goal) => {
    const projectId = useProjectStore.getState().activeProjectId
    const sess = get().session
    if (!projectId || !sess) return
    if (get().goalAuditing) await get().cancelTurn()
    try {
      const next = await window.api.session.update(projectId, sess.id, { goal })
      set({ session: next, goalArmed: false, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  sendMessage: async (text) => {
    ensureAgentSubscription(get, set)
    const projectId = useProjectStore.getState().activeProjectId
    const {
      activeSessionId,
      sending,
      goalAuditing,
      selectedModelKey,
      thinkingLevel,
      goalArmed
    } = get()
    if (!projectId || !activeSessionId) return
    const trimmed = text.trim()
    if (!trimmed) return

    // 运行中 → 插话
    if (sending && goalAuditing) {
      await get().cancelTurn()
    } else if (sending) {
      await get().steerMessage(trimmed)
      return
    }

    set({ sending: true, goalAuditing: false, error: null, followUpCount: 0, followUpPreview: null })
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

    const decoded = selectedModelKey ? decodeModelKey(selectedModelKey) : null
    try {
      const contextRefs = extractContextRefsFromText(trimmed)
      const { runId, goal } = await window.api.agent.startTurn({
        projectId,
        sessionId: activeSessionId,
        userMessage: trimmed,
        providerId: decoded?.providerId,
        modelId: decoded?.modelId,
        thinkingLevel,
        contextRefs,
        goalMode: goalArmed
      })
      const currentSession = get().session
      set({
        runId,
        goalArmed: false,
        ...(goal && currentSession
          ? { session: { ...currentSession, goal } }
          : {})
      })
    } catch (error) {
      set({
        sending: false,
        goalAuditing: false,
        runId: null,
        goalArmed: false,
        error: error instanceof Error ? error.message : String(error)
      })
      try {
        const view = await window.api.session.open(projectId, activeSessionId)
        set({ session: view, todos: view.todos ?? [], goalArmed: false, goalAuditing: false })
      } catch {
        // ignore
      }
    }
  },

  steerMessage: async (text) => {
    ensureAgentSubscription(get, set)
    const projectId = useProjectStore.getState().activeProjectId
    const { activeSessionId, runId, sending } = get()
    if (!projectId || !activeSessionId || !sending) return
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      await window.api.agent.steer({
        projectId,
        sessionId: activeSessionId,
        text: trimmed,
        runId: runId ?? undefined
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  queueFollowUp: async (text) => {
    ensureAgentSubscription(get, set)
    const projectId = useProjectStore.getState().activeProjectId
    const { activeSessionId, runId, sending } = get()
    if (!projectId || !activeSessionId || !sending) return
    const trimmed = text.trim()
    if (!trimmed) return
    try {
      await window.api.agent.followUp({
        projectId,
        sessionId: activeSessionId,
        text: trimmed,
        runId: runId ?? undefined
      })
      set({
        followUpCount: get().followUpCount + 1,
        followUpPreview: trimmed.slice(0, 80)
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  regenerateMessage: async (userMessageId) => {
    ensureAgentSubscription(get, set)
    const projectId = useProjectStore.getState().activeProjectId
    const { activeSessionId, sending, session, selectedModelKey, thinkingLevel } =
      get()
    if (!projectId || !activeSessionId || sending || !session) return
    if (!userMessageId?.trim()) return

    const idx = session.messages.findIndex((m) => m.id === userMessageId)
    if (idx < 0) {
      set({ error: '找不到要重新生成的用户消息' })
      return
    }
    const truncated = session.messages.slice(0, idx + 1)
    const decoded = selectedModelKey ? decodeModelKey(selectedModelKey) : null

    set({
      sending: true,
      goalAuditing: false,
      error: null,
      session: { ...session, messages: truncated }
    })

    try {
      const { runId } = await window.api.agent.regenerateTurn({
        projectId,
        sessionId: activeSessionId,
        userMessageId,
        providerId: decoded?.providerId,
        modelId: decoded?.modelId,
        thinkingLevel
      })
      set({ runId })
    } catch (error) {
      set({
        sending: false,
        goalAuditing: false,
        runId: null,
        error: error instanceof Error ? error.message : String(error)
      })
      try {
        const view = await window.api.session.open(projectId, activeSessionId)
        set({ session: view, todos: view.todos ?? [] })
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
      set({ followUpCount: 0, followUpPreview: null, retryMessage: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ sending: false, goalAuditing: false, runId: null })
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

  // 点选详情：仅有效的用户点击目标可以打开右栏
  openDetail: (target) => {
    if (!isDetailTargetAvailable(useProjectStore.getState().snapshot, target)) return
    set({ detailTarget: target, rightPanelOpen: true, rightPanelAnimate: true })
  },
  setDetailTarget: (target) => {
    const validTarget = isDetailTargetAvailable(
      useProjectStore.getState().snapshot,
      target
    )
      ? target
      : null
    set(
      validTarget
        ? { detailTarget: validTarget }
        : { detailTarget: null, rightPanelOpen: false, rightPanelAnimate: true }
    )
  },
  // animate 默认 true（手动）；会话恢复等传 false 硬切
  setRightPanelOpen: (open, animate = true) => {
    const state = get()
    const canOpen = isDetailTargetAvailable(
      useProjectStore.getState().snapshot,
      state.detailTarget
    )
    set({ rightPanelOpen: open && canOpen, rightPanelAnimate: animate })
  },
  // 标题栏按钮：用户手动，开动画
  toggleRightPanel: () => {
    const state = get()
    const canOpen = isDetailTargetAvailable(
      useProjectStore.getState().snapshot,
      state.detailTarget
    )
    set({
      rightPanelOpen: state.rightPanelOpen ? false : canOpen,
      rightPanelAnimate: true
    })
  },
  setLeftBeatsOpen: (open) => set({ leftBeatsOpen: open }),
  setLeftEntitiesOpen: (open) => set({ leftEntitiesOpen: open }),
  setLeftTodosOpen: (open) => set({ leftTodosOpen: open }),
  setLeftListTab: (tab) => set({ leftListTab: tab }),
  setTodos: (todos) => set({ todos }),

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
