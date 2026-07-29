/**
 * 主进程 → 渲染进程的 Agent 流式事件
 */

import type {
  AgentTurnDonePayload,
  UiBeatStatusUpdate,
  UiChatMessage,
  UiToolCallPart
} from './ui-chat'

export type AgentStreamEvent =
  | {
      type: 'turn_start'
      projectId: string
      sessionId: string
      runId: string
    }
  | {
      /** 重新生成前：会话分支已截断，用最新投影替换 UI 消息列表 */
      type: 'branch_reset'
      projectId: string
      sessionId: string
      runId: string
      messages: UiChatMessage[]
    }
  | {
      type: 'user_message'
      projectId: string
      sessionId: string
      runId: string
      message: UiChatMessage
    }
  | {
      type: 'assistant_start'
      projectId: string
      sessionId: string
      runId: string
      messageId: string
    }
  | {
      type: 'text_delta'
      projectId: string
      sessionId: string
      runId: string
      messageId: string
      delta: string
    }
  | {
      type: 'thinking_delta'
      projectId: string
      sessionId: string
      runId: string
      messageId: string
      delta: string
    }
  | {
      type: 'tool_start'
      projectId: string
      sessionId: string
      runId: string
      messageId: string
      tool: UiToolCallPart
    }
  | {
      type: 'tool_end'
      projectId: string
      sessionId: string
      runId: string
      messageId: string
      tool: UiToolCallPart
      chapterIds?: string[]
      beatStatusUpdates?: UiBeatStatusUpdate[]
      /** todo 工具更新后的完整清单 */
      todos?: import('./todos').TodoItem[]
    }
  | {
      type: 'assistant_end'
      projectId: string
      sessionId: string
      runId: string
      message: UiChatMessage
    }
  | {
      type: 'snapshot'
      projectId: string
      sessionId: string
      runId: string
      snapshot: unknown
    }
  | {
      type: 'turn_done'
      projectId: string
      sessionId: string
      runId: string
      payload: AgentTurnDonePayload
    }
  | {
      type: 'error'
      projectId: string
      sessionId: string
      runId: string
      message: string
    }
  | {
      type: 'aborted'
      projectId: string
      sessionId: string
      runId: string
    }

/** 自定义 session entry 类型常量（pi custom entry） */
export const SESSION_ENTRY = {
  pinnedBeats: 'pinned_beats',
  pinnedEntities: 'pinned_entities',
  todos: 'session_todos'
} as const
