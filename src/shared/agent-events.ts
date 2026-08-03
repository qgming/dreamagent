/**
 * 主进程 → 渲染进程的 Agent 流式事件
 */

import type {
  AgentTurnDonePayload,
  UiBeatStatusUpdate,
  UiChatMessage,
  UiToolCallPart
} from './ui-chat'
import type {
  ContextCompactionState,
  SessionContextUsage
} from './context-usage'
import type { SessionGoal } from './session-goals'

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
      type: 'context_update'
      projectId: string
      sessionId: string
      runId: string
      usage: SessionContextUsage
      compactionState: ContextCompactionState
      compactionError?: string
    }
  | {
      /** 目标模式后台审计 / 自动续跑状态。 */
      type: 'goal_audit'
      projectId: string
      sessionId: string
      runId: string
      phase: 'checking' | 'continued' | 'completed' | 'blocked' | 'error'
      goal: SessionGoal | null
      message?: string
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
  | {
      /** 插话/排队队列变化 */
      type: 'queue_update'
      projectId: string
      sessionId: string
      runId: string
      steerCount: number
      followUpCount: number
      /** 最近一条排队文案预览 */
      followUpPreview?: string
    }
  | {
      /** 提供商自动重试 */
      type: 'retry_status'
      projectId: string
      sessionId: string
      runId: string
      phase: 'scheduled' | 'attempt' | 'finished'
      attempt?: number
      delayMs?: number
      message?: string
    }

/** 自定义 session entry 类型常量（pi custom entry） */
export const SESSION_ENTRY = {
  pinnedBeats: 'pinned_beats',
  pinnedEntities: 'pinned_entities',
  todos: 'session_todos',
  goal: 'session_goal'
} as const
