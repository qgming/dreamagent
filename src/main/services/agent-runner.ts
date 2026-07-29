/**
 * 真实 Agent Runner：AgentHarness + 流式事件
 */
import type { WebContents } from 'electron'
import { createId } from '../../shared/ids'
import type { AgentStreamEvent } from '../../shared/agent-events'
import type {
  AgentCancelTurnInput,
  AgentStartTurnInput,
  AgentStartTurnResult,
  UiBeatStatusUpdate,
  UiChatMessage,
  UiToolCallPart
} from '../../shared/ui-chat'
import { GRAPH_MUTATING_TOOLS, type AgentToolName } from '../../shared/agent-tools'
import type { ProjectSnapshot } from '../../shared/project-types'
import type { ProjectService } from './project-service'
import type { PiSessionService } from './pi-session-service'
import type { LlmSettingsService } from './llm-settings-service'
import type { HarnessManager } from './harness-manager'

interface ActiveRun {
  runId: string
  projectId: string
  sessionId: string
  sender: WebContents
  aborted: boolean
}

function chapterIdsFromDetails(details: unknown): string[] {
  if (!details || typeof details !== 'object') return []
  const d = details as Record<string, unknown>
  const data = (d.data && typeof d.data === 'object' ? d.data : d) as Record<string, unknown>
  if (typeof data.id === 'string' && data.id.startsWith('chap_')) return [data.id]
  return []
}

function beatStatusFromDetails(details: unknown): UiBeatStatusUpdate | null {
  if (!details || typeof details !== 'object') return null
  const d = details as Record<string, unknown>
  const data = (d.data && typeof d.data === 'object' ? d.data : d) as Record<string, unknown>
  if (
    typeof data.id === 'string' &&
    typeof data.from === 'string' &&
    typeof data.to === 'string'
  ) {
    return { beatId: data.id, from: data.from, to: data.to }
  }
  return null
}

/**
 * 主进程 Agent 运行器
 */
export class AgentRunner {
  /** sessionKey → 当前 run */
  private active = new Map<string, ActiveRun>()

  constructor(
    private readonly projects: ProjectService,
    private readonly sessions: PiSessionService,
    private readonly llm: LlmSettingsService,
    private readonly harnesses: HarnessManager
  ) {}

  private sessionKey(projectId: string, sessionId: string): string {
    return `${projectId}::${sessionId}`
  }

  private emit(sender: WebContents, event: AgentStreamEvent): void {
    if (sender.isDestroyed()) return
    sender.send('agent:event', event)
  }

  async startTurn(
    input: AgentStartTurnInput,
    sender: WebContents
  ): Promise<AgentStartTurnResult> {
    const { projectId, sessionId } = input
    const userMessage = (input.userMessage ?? '').trim()
    if (!userMessage) throw new Error('消息不能为空')

    await this.llm.assertConfigured()

    const key = this.sessionKey(projectId, sessionId)
    const prev = this.active.get(key)
    if (prev) {
      prev.aborted = true
      this.harnesses.abortSession(projectId, sessionId)
    }

    const runId = createId('run')
    const run: ActiveRun = { runId, projectId, sessionId, sender, aborted: false }
    this.active.set(key, run)

    // 异步执行，立即返回 runId
    void this.executeTurn(run, userMessage).catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[agent-runner]', message)
      if (!run.aborted) {
        this.emit(sender, {
          type: 'error',
          projectId,
          sessionId,
          runId,
          message
        })
      }
      if (this.active.get(key)?.runId === runId) this.active.delete(key)
    })

    return { runId }
  }

  async cancelTurn(input: AgentCancelTurnInput): Promise<void> {
    const key = this.sessionKey(input.projectId, input.sessionId)
    const run = this.active.get(key)
    if (!run) {
      this.harnesses.abortSession(input.projectId, input.sessionId)
      return
    }
    if (input.runId && input.runId !== run.runId) return
    run.aborted = true
    this.harnesses.abortSession(input.projectId, input.sessionId)
    this.emit(run.sender, {
      type: 'aborted',
      projectId: run.projectId,
      sessionId: run.sessionId,
      runId: run.runId
    })
  }

  private async executeTurn(run: ActiveRun, userText: string): Promise<void> {
    const { projectId, sessionId, runId, sender } = run
    const key = this.sessionKey(projectId, sessionId)

    this.emit(sender, { type: 'turn_start', projectId, sessionId, runId })

    // 乐观用户消息（真实落盘由 harness.prompt 完成）
    const userMsg: UiChatMessage = {
      id: createId('msg'),
      role: 'user',
      createdAt: new Date().toISOString(),
      parts: [{ type: 'text', text: userText }],
      status: 'complete'
    }
    this.emit(sender, {
      type: 'user_message',
      projectId,
      sessionId,
      runId,
      message: userMsg
    })

    // 每次 recreate，保证 system prompt / tools / model 最新
    const harness = await this.harnesses.recreate(projectId, sessionId)

    const assistantMessageId = createId('msg')
    let assistantStarted = false
    let textBuffer = ''
    let thinkingBuffer = ''
    // 思考与正文各自节流，避免互相抢 lastFlush 导致 thinking 几乎不刷
    let lastTextFlush = 0
    let lastThinkingFlush = 0
    const toolParts = new Map<string, UiToolCallPart>()
    const writtenChapterIds: string[] = []
    const beatStatusUpdates: UiBeatStatusUpdate[] = []

    const flushText = (force = false): void => {
      if (!textBuffer) return
      const now = Date.now()
      if (!force && now - lastTextFlush < 32) return
      const delta = textBuffer
      textBuffer = ''
      lastTextFlush = now
      this.emit(sender, {
        type: 'text_delta',
        projectId,
        sessionId,
        runId,
        messageId: assistantMessageId,
        delta
      })
    }

    const flushThinking = (force = false): void => {
      if (!thinkingBuffer) return
      const now = Date.now()
      if (!force && now - lastThinkingFlush < 32) return
      const delta = thinkingBuffer
      thinkingBuffer = ''
      lastThinkingFlush = now
      this.emit(sender, {
        type: 'thinking_delta',
        projectId,
        sessionId,
        runId,
        messageId: assistantMessageId,
        delta
      })
    }

    const flushAll = (force = false): void => {
      flushThinking(force)
      flushText(force)
    }

    const ensureAssistantStart = (): void => {
      if (assistantStarted) return
      assistantStarted = true
      this.emit(sender, {
        type: 'assistant_start',
        projectId,
        sessionId,
        runId,
        messageId: assistantMessageId
      })
    }

    const unsubscribe = harness.subscribe(async (event) => {
      if (run.aborted) return

      switch (event.type) {
        case 'message_update': {
          if (!('assistantMessageEvent' in event)) break
          const ame = event.assistantMessageEvent as {
            type?: string
            delta?: string
          }
          if (ame?.type === 'text_delta' && typeof ame.delta === 'string') {
            ensureAssistantStart()
            // 文本开始前先冲掉思考缓冲，保证 parts 顺序
            flushThinking(true)
            textBuffer += ame.delta
            flushText(false)
          } else if (
            (ame?.type === 'thinking_delta' || ame?.type === 'reasoning_delta') &&
            typeof ame.delta === 'string'
          ) {
            ensureAssistantStart()
            thinkingBuffer += ame.delta
            flushThinking(false)
          } else if (ame?.type === 'thinking_start' || ame?.type === 'thinking_end') {
            // 块边界强制刷出缓冲，避免只剩尾包未 flush
            ensureAssistantStart()
            flushThinking(true)
          }
          break
        }
        case 'message_end': {
          flushAll(true)
          break
        }
        case 'tool_execution_start': {
          ensureAssistantStart()
          flushAll(true)
          const tool: UiToolCallPart = {
            type: 'tool-call',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: (event.args ?? {}) as Record<string, unknown>,
            status: 'running'
          }
          toolParts.set(event.toolCallId, tool)
          this.emit(sender, {
            type: 'tool_start',
            projectId,
            sessionId,
            runId,
            messageId: assistantMessageId,
            tool
          })
          break
        }
        case 'tool_execution_end': {
          const prev = toolParts.get(event.toolCallId)
          const details = event.result?.details ?? event.result
          const summary =
            details && typeof details === 'object' && typeof (details as { summary?: string }).summary === 'string'
              ? (details as { summary: string }).summary
              : event.isError
                ? '工具失败'
                : '已完成'
          const tool: UiToolCallPart = {
            type: 'tool-call',
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: (prev?.args ?? {}) as Record<string, unknown>,
            status: event.isError ? 'error' : 'done',
            isError: event.isError,
            result: details,
            summary
          }
          toolParts.set(event.toolCallId, tool)

          let chapterIds: string[] | undefined
          let statusUpdates: UiBeatStatusUpdate[] | undefined
          let todosPayload: import('../../shared/todos').TodoItem[] | undefined
          // 路径式 write/edit 可能产出文章或状态变更
          if (event.toolName === 'write' || event.toolName === 'edit') {
            chapterIds = chapterIdsFromDetails(details)
            if (chapterIds.length) writtenChapterIds.push(...chapterIds)
            else chapterIds = undefined
            const st = beatStatusFromDetails(details)
            if (st) {
              beatStatusUpdates.push(st)
              statusUpdates = [st]
            }
          }
          // 兼容旧会话工具名
          if (event.toolName === 'write_chapter') {
            chapterIds = chapterIdsFromDetails(details)
            writtenChapterIds.push(...(chapterIds ?? []))
          }
          if (event.toolName === 'update_beat_status') {
            const st = beatStatusFromDetails(details)
            if (st) {
              beatStatusUpdates.push(st)
              statusUpdates = [st]
            }
          }

          if (event.toolName === 'todo') {
            const data =
              details && typeof details === 'object'
                ? (details as { data?: { todos?: unknown } }).data
                : undefined
            if (data && Array.isArray(data.todos)) {
              todosPayload = data.todos as import('../../shared/todos').TodoItem[]
            }
          }

          this.emit(sender, {
            type: 'tool_end',
            projectId,
            sessionId,
            runId,
            messageId: assistantMessageId,
            tool,
            chapterIds,
            beatStatusUpdates: statusUpdates,
            todos: todosPayload
          })

          // 图谱变更后推送 snapshot
          if (GRAPH_MUTATING_TOOLS.has(event.toolName as AgentToolName)) {
            try {
              const snapshot = await this.projects.openProject(projectId)
              this.emit(sender, {
                type: 'snapshot',
                projectId,
                sessionId,
                runId,
                snapshot
              })
            } catch (error) {
              console.warn('[agent-runner] 刷新 snapshot 失败', error)
            }
          }
          break
        }
        case 'agent_end': {
          flushAll(true)
          break
        }
        default:
          break
      }
    })

    try {
      // prompt 返回最终 AssistantMessage；失败时 stopReason=error/aborted 且可能不 throw
      const finalMessage = (await harness.prompt(userText)) as {
        stopReason?: string
        errorMessage?: string
        content?: unknown
      } | null

      flushAll(true)

      if (run.aborted) {
        this.emit(sender, { type: 'aborted', projectId, sessionId, runId })
        return
      }

      const stopReason = finalMessage?.stopReason
      const errorMessage =
        typeof finalMessage?.errorMessage === 'string' && finalMessage.errorMessage.trim()
          ? finalMessage.errorMessage.trim()
          : null

      if (stopReason === 'aborted') {
        this.emit(sender, { type: 'aborted', projectId, sessionId, runId })
        return
      }

      if (stopReason === 'error' || errorMessage) {
        // 尽量用 session 投影校准 UI（不发 turn_done，避免前端清掉 error）
        try {
          const sessionView = await this.sessions.open(projectId, sessionId)
          this.emit(sender, {
            type: 'assistant_end',
            projectId,
            sessionId,
            runId,
            message: {
              ...( [...sessionView.messages].reverse().find((m) => m.role === 'assistant') ?? {
                id: assistantMessageId,
                role: 'assistant' as const,
                createdAt: new Date().toISOString(),
                parts: []
              }),
              status: 'error'
            }
          })
        } catch {
          // ignore
        }
        this.emit(sender, {
          type: 'error',
          projectId,
          sessionId,
          runId,
          message: errorMessage || '模型生成失败'
        })
        return
      }

      // 简化：turn 结束后用 session 全量投影校准
      await this.sessions.maybeAutotitle(projectId, sessionId, userText)
      const sessionView = await this.sessions.open(projectId, sessionId)
      const snapshot = await this.projects.openProject(projectId)

      // 从 session 最后一条 assistant 作为 assistant_end
      const lastAssistant = [...sessionView.messages].reverse().find((m) => m.role === 'assistant')
      if (lastAssistant) {
        this.emit(sender, {
          type: 'assistant_end',
          projectId,
          sessionId,
          runId,
          message: lastAssistant
        })
      }

      this.emit(sender, {
        type: 'turn_done',
        projectId,
        sessionId,
        runId,
        payload: {
          session: sessionView,
          snapshot: snapshot as ProjectSnapshot,
          writtenChapterIds: [...new Set(writtenChapterIds)]
        }
      })
    } catch (error) {
      flushAll(true)
      if (run.aborted) {
        this.emit(sender, { type: 'aborted', projectId, sessionId, runId })
      } else {
        const message = error instanceof Error ? error.message : String(error)
        this.emit(sender, { type: 'error', projectId, sessionId, runId, message })
      }
    } finally {
      unsubscribe()
      if (this.active.get(key)?.runId === runId) {
        this.active.delete(key)
      }
    }
  }
}
