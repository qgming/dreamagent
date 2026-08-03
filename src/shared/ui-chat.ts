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
  /** 本条用户消息中的图片附件（用于消息展示和重新生成）。 */
  attachments?: UiImageAttachment[]
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

/** 按本地自然日汇总的模型 Token 消耗。 */
export interface SessionTokenUsageDay {
  date: string
  tokens: number
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
  /** 当前会话目标；目标状态通过 session custom entry 持久化。 */
  goal: import('./session-goals').SessionGoal | null
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
  /** 传 null 清除目标；不传表示不修改。 */
  goal?: import('./session-goals').SessionGoal | null
}

/** 显式引用（Composer directive mention 结构化形式，P2） */
export interface UiContextRef {
  type: 'beat' | 'entity' | 'chapter' | 'skill'
  id: string
  label?: string
}

/** 渲染层解码后的图片附件，data 为不含 data URL 前缀的 base64。 */
export interface UiImageAttachment {
  name: string
  data: string
  mimeType: string
}

export interface UiActiveDocumentRef {
  type: 'chapter' | 'beat' | 'entity'
  id: string
  cursor?: number
}

export interface AgentStartTurnInput {
  projectId: string
  sessionId: string
  userMessage: string
  /** 会话覆盖：providerId:: 可不传则用全局默认 */
  providerId?: string
  modelId?: string
  thinkingLevel?: import('./llm-settings').LlmThinkingLevel
  /** 结构化上下文引用（P2）：Composer 中的显式 directive mention */
  contextRefs?: UiContextRef[]
  /** 当前打开的文章 / 节点 / 实体（可选） */
  activeDocument?: UiActiveDocumentRef
  /** 将本次用户消息作为新会话目标，并在本轮 system prompt 中启用目标契约。 */
  goalMode?: boolean
  /** 当前用户消息中的图片附件。文本附件已经加入 userMessage。 */
  images?: UiImageAttachment[]
}

export interface AgentStartTurnResult {
  runId: string
  /** 目标模式发送时返回实际落盘的目标，供 UI 立即展示。 */
  goal?: import('./session-goals').SessionGoal
}

/** 主进程仍在运行的 Agent 回合（用于页面重新挂载后恢复运行状态） */
export interface AgentRunningRun {
  projectId: string
  sessionId: string
  runId: string
  providerId?: string
  modelId?: string
  thinkingLevel?: import('./llm-settings').LlmThinkingLevel
  /** 当前 run 是否正在等待目标审计结果。 */
  goalAuditing?: boolean
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
  images?: UiImageAttachment[]
}

/** 排队到本轮结束后 */
export interface AgentFollowUpInput {
  projectId: string
  sessionId: string
  text: string
  runId?: string
  images?: UiImageAttachment[]
}

export interface AgentTurnDonePayload {
  session: SessionView
  /** 最新项目快照；由 runner 附带 */
  snapshot?: unknown
  writtenChapterIds: string[]
}
