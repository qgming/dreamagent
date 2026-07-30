/**
 * UI 聊天投影类型（非持久化 SSOT）
 * 真正的消息树在 pi Session jsonl 中。
 */

export type UiChatRole = 'user' | 'assistant'

export type UiTextPart = {
  type: 'text'
  text: string
}

/** 模型思考/推理内容（assistant-ui reasoning part） */
export type UiReasoningPart = {
  type: 'reasoning'
  text: string
}

export type UiToolCallPart = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  isError?: boolean
  /** 工具执行中 */
  status?: 'running' | 'done' | 'error'
  /** 人类可读摘要 */
  summary?: string
}

export type UiChatPart = UiTextPart | UiReasoningPart | UiToolCallPart

export type UiMessageStatus = 'streaming' | 'complete' | 'error' | 'aborted'

export interface UiBeatStatusUpdate {
  beatId: string
  from: string
  to: string
}

/** 一条可渲染的聊天消息（user / assistant 合并视图） */
export interface UiChatMessage {
  id: string
  role: UiChatRole
  createdAt: string
  parts: UiChatPart[]
  status?: UiMessageStatus
  /** 本条消息关联写出的文章 id（从 write_chapter details 提取） */
  chapterIds?: string[]
  beatStatusUpdates?: UiBeatStatusUpdate[]
}

/** 会话列表摘要 */
export interface SessionSummary {
  id: string
  title: string
  preview?: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

/** 打开会话的完整 UI 视图 */
export interface SessionView {
  id: string
  title: string
  messages: UiChatMessage[]
  pinnedBeatIds: string[]
  pinnedEntityIds: string[]
  /** 会话级 Agent 待办（仅 AI todo 工具可写/清理，打开时从 session 持久化恢复） */
  todos: import('./todos').TodoItem[]
  createdAt: string
  updatedAt: string
  usage: import('./context-usage').SessionContextUsage
}

export interface CreateSessionInput {
  title?: string
  pinnedBeatIds?: string[]
  pinnedEntityIds?: string[]
}

export interface UpdateSessionInput {
  title?: string
  pinnedBeatIds?: string[]
  pinnedEntityIds?: string[]
}

export interface AgentStartTurnInput {
  projectId: string
  sessionId: string
  userMessage: string
  /** 会话覆盖：providerId:: 可不传则用全局默认 */
  providerId?: string
  modelId?: string
  thinkingLevel?: import('./llm-settings').LlmThinkingLevel
}

export interface AgentStartTurnResult {
  runId: string
}

/** 重新生成：以某条用户消息为锚点，截断其后分支并再跑一轮 */
export interface AgentRegenerateTurnInput {
  projectId: string
  sessionId: string
  /** 用户消息 id（assistant 的 parentId / session entry id） */
  userMessageId: string
  providerId?: string
  modelId?: string
  thinkingLevel?: import('./llm-settings').LlmThinkingLevel
}

export interface AgentCancelTurnInput {
  projectId: string
  sessionId: string
  runId?: string
}

/** 运行中插话 */
export interface AgentSteerInput {
  projectId: string
  sessionId: string
  text: string
  runId?: string
}

/** 排队到本轮结束后 */
export interface AgentFollowUpInput {
  projectId: string
  sessionId: string
  text: string
  runId?: string
}

export interface AgentTurnDonePayload {
  session: SessionView
  /** 最新项目快照；由 runner 附带 */
  snapshot?: unknown
  writtenChapterIds: string[]
}
