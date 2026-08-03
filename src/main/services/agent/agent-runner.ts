/**
 * 真实 Agent Runner：AgentHarness + 流式事件
 */
import { BrowserWindow } from 'electron'
import { createId } from '../../../shared/ids'
import type { AgentStreamEvent } from '../../../shared/agent-events'
import type {
  AgentCancelTurnInput,
  AgentFollowUpInput,
  AgentRegenerateTurnInput,
  AgentRunningRun,
  AgentStartTurnInput,
  AgentStartTurnResult,
  AgentSteerInput,
  UiBeatStatusUpdate,
  UiChatMessage,
  UiToolCallPart
} from '../../../shared/ui-chat'
import { GRAPH_MUTATING_TOOLS, type AgentToolName } from '../../../shared/agent-tools'
import type { ProjectSnapshot } from '../../../shared/project-types'
import type { ProjectService } from '../project/project-service'
import type { PiSessionService } from '../session/pi-session-service'
import type { LlmSettingsService } from '../llm/llm-settings-service'
import type { GoalAuditHarness, HarnessManager, HarnessSelection } from './harness-manager'
import type { AgentHarness } from '@earendil-works/pi-agent-core'
import type { DreamToolContext } from './pi-agent-tools'
import type { SessionContextUsage } from '../../../shared/context-usage'
import type { UiContextRef, UiActiveDocumentRef } from '../../../shared/ui-chat'
import { buildNarrativeCheckpointInstructions } from '../context/narrative-compactor'
import { buildGoalAuditPrompt } from './goal-audit-prompts'
import {
  createSessionGoal,
  normalizeSessionGoalAudit,
  SESSION_GOAL_NOTE_LIMIT,
  type SessionGoal,
  type SessionGoalAuditDecision
} from '../../../shared/session-goals'

type DreamHarness = AgentHarness<DreamToolContext>

interface ActiveRun {
  runId: string
  projectId: string
  sessionId: string
  aborted: boolean
  selection?: HarnessSelection
  /** 排队文案预览（followUp） */
  followUpPreview?: string
  followUpCount: number
  steerCount: number
  /** 本轮结构化上下文引用（P2） */
  contextRefs?: UiContextRef[]
  activeDocument?: UiActiveDocumentRef
  /** 目标审计期间用于响应停止 / 新回合的中止句柄。 */
  goalAuditAbort?: () => Promise<void>
}

function auditMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((part): part is { type: 'text'; text: string } =>
      Boolean(part && typeof part === 'object' && (part as { type?: unknown }).type === 'text' && typeof (part as { text?: unknown }).text === 'string')
    )
    .map((part) => part.text)
    .join('\n')
}

function parseAuditResponse(content: unknown): SessionGoalAuditDecision | null {
  const text = auditMessageText(content).trim()
  if (!text) return null
  const candidates = [text]
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(text.slice(objectStart, objectEnd + 1))
  }
  for (const candidate of candidates) {
    try {
      const parsed = normalizeSessionGoalAudit(JSON.parse(candidate))
      if (parsed) return parsed
    } catch {
      // 继续尝试从回答中提取 JSON 对象。
    }
  }
  return null
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
  /** turn_done 后仍在执行的压缩；下一轮必须等它完成。 */
  private compactions = new Map<string, Promise<SessionContextUsage>>()

  constructor(
    private readonly projects: ProjectService,
    private readonly sessions: PiSessionService,
    private readonly llm: LlmSettingsService,
    private readonly harnesses: HarnessManager
  ) {}

  private sessionKey(projectId: string, sessionId: string): string {
    return `${projectId}::${sessionId}`
  }

  /**
   * 广播到所有存活窗口的渲染进程。
   * 运行不绑定发起页面：用户离开创作页 / 页面重载后，任意页面仍能收到事件。
   */
  private emit(event: AgentStreamEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      const wc = win.webContents
      if (wc.isDestroyed()) continue
      try {
        wc.send('agent:event', event)
      } catch {
        // 页面正在重载/销毁时静默跳过
      }
    }
  }

  private async compactIfNeeded(
    run: ActiveRun,
    harness: DreamHarness,
    estimatedInputTokens: number
  ): Promise<SessionContextUsage> {
    const { projectId, sessionId, runId } = run
    const usage = await this.sessions.getUsage(projectId, sessionId, run.selection, {
      estimatedInputTokens
    })
    const threshold = usage.model.contextWindow * usage.autoCompactThreshold
    // 估算缺失时回退到 usage.providerPayloadTokens（trace 兜底）
    const estimated =
      estimatedInputTokens > 0 ? estimatedInputTokens : usage.providerPayloadTokens
    if (estimated < threshold) {
      this.emit({
        type: 'context_update',
        projectId,
        sessionId,
        runId,
        usage,
        compactionState: 'idle'
      })
      return usage
    }

    this.emit({
      type: 'context_update',
      projectId,
      sessionId,
      runId,
      usage,
      compactionState: 'compacting'
    })

    try {
      // P3：使用结构化叙事检查点压缩指令（替代通用一句话）
      const compactResult = await harness.compact(
        buildNarrativeCheckpointInstructions()
      )
      // 解析模型返回的 JSON 检查点并作为派生 custom entry 落盘（原始 JSONL 不删除）。
      // 解析失败不阻塞：保留 pi 通用 compaction entry，不写“空摘要”。
      if (compactResult?.summary?.trim()) {
        try {
          const parsed = JSON.parse(compactResult.summary) as {
            type?: string
            narrative?: unknown
            sourceRange?: unknown
          }
          if (parsed && typeof parsed === 'object' && (parsed.narrative || parsed.type)) {
            const session = await this.sessions.openSessionObject(projectId, sessionId)
            await session.appendCustomEntry('dreamagent.narrative_checkpoint.v1', {
              ...parsed,
              type: 'dreamagent.narrative_checkpoint.v1',
              sessionId,
              createdAt: new Date().toISOString(),
              generator: {
                model: harness.getModel().id,
                promptVersion: 'dreamagent.compaction.v1'
              }
            })
          }
        } catch {
          // 非 JSON 摘要：忽略，仍保留原始历史
        }
      }
      const compactedUsage = await this.sessions.getUsage(
        projectId,
        sessionId,
        run.selection
      )
      this.emit({
        type: 'context_update',
        projectId,
        sessionId,
        runId,
        usage: compactedUsage,
        compactionState: 'idle'
      })
      return compactedUsage
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('[agent-runner] 自动压缩失败:', message)
      const latestUsage = await this.sessions
        .getUsage(projectId, sessionId, run.selection)
        .catch(() => usage)
      this.emit({
        type: 'context_update',
        projectId,
        sessionId,
        runId,
        usage: latestUsage,
        compactionState: 'error',
        compactionError: message
      })
      return latestUsage
    }
  }

  async startTurn(input: AgentStartTurnInput): Promise<AgentStartTurnResult> {
    const { projectId, sessionId } = input
    const userMessage = (input.userMessage ?? '').trim()
    if (!userMessage) throw new Error('消息不能为空')

    await this.llm.assertConfigured()
    let goal: AgentStartTurnResult['goal']
    if (input.goalMode) {
      const current = await this.sessions.open(projectId, sessionId)
      if (current.goal && current.goal.status !== 'complete') {
        throw new Error('当前会话已有目标，请先完成、暂停或清除它')
      }
      goal = createSessionGoal(userMessage)
      await this.sessions.update(projectId, sessionId, { goal })
    }
    const selection: HarnessSelection = {
      providerId: input.providerId,
      modelId: input.modelId,
      thinkingLevel: input.thinkingLevel
    }
    const run = this.beginRun(
      projectId,
      sessionId,
      selection,
      input.contextRefs,
      input.activeDocument
    )

    // 异步执行，立即返回 runId
    void this.executeTurn(run, userMessage).catch((error) => {
      this.handleRunError(run, error)
    })

    return { runId: run.runId, goal }
  }

  /**
   * 重新生成：navigateTree 回到用户消息，截断其后分支，再 prompt 同一条用户文本
   */
  async regenerateTurn(input: AgentRegenerateTurnInput): Promise<AgentStartTurnResult> {
    const { projectId, sessionId, userMessageId } = input
    if (!userMessageId?.trim()) throw new Error('缺少用户消息 id')

    await this.llm.assertConfigured()
    const selection: HarnessSelection = {
      providerId: input.providerId,
      modelId: input.modelId,
      thinkingLevel: input.thinkingLevel
    }
    const run = this.beginRun(projectId, sessionId, selection)

    void this.executeRegenerate(run, userMessageId.trim()).catch((error) => {
      this.handleRunError(run, error)
    })

    return { runId: run.runId }
  }

  /** 运行中插话：立即注入，打断后续工具 */
  async steer(input: AgentSteerInput): Promise<void> {
    const text = (input.text ?? '').trim()
    if (!text) return
    const key = this.sessionKey(input.projectId, input.sessionId)
    const run = this.active.get(key)
    if (!run || run.aborted) {
      throw new Error('当前没有进行中的回合，无法插话')
    }
    if (input.runId && input.runId !== run.runId) return

    const harness = await this.harnesses.getOrCreate(
      input.projectId,
      input.sessionId,
      run.selection
    )
    await harness.steer(text)
    run.steerCount += 1
    this.emit({
      type: 'queue_update',
      projectId: run.projectId,
      sessionId: run.sessionId,
      runId: run.runId,
      steerCount: run.steerCount,
      followUpCount: run.followUpCount,
      followUpPreview: run.followUpPreview
    })
    // 乐观用户气泡
    this.emit({
      type: 'user_message',
      projectId: run.projectId,
      sessionId: run.sessionId,
      runId: run.runId,
      message: {
        id: createId('msg'),
        role: 'user',
        createdAt: new Date().toISOString(),
        parts: [{ type: 'text', text }],
        status: 'complete'
      }
    })
  }

  /** 排队：本轮结束后自动续跑 */
  async followUp(input: AgentFollowUpInput): Promise<void> {
    const text = (input.text ?? '').trim()
    if (!text) return
    const key = this.sessionKey(input.projectId, input.sessionId)
    const run = this.active.get(key)
    if (!run || run.aborted) {
      throw new Error('当前没有进行中的回合，无法排队')
    }
    if (input.runId && input.runId !== run.runId) return

    const harness = await this.harnesses.getOrCreate(
      input.projectId,
      input.sessionId,
      run.selection
    )
    await harness.followUp(text)
    run.followUpCount += 1
    run.followUpPreview = text.slice(0, 80)
    this.emit({
      type: 'queue_update',
      projectId: run.projectId,
      sessionId: run.sessionId,
      runId: run.runId,
      steerCount: run.steerCount,
      followUpCount: run.followUpCount,
      followUpPreview: run.followUpPreview
    })
  }

  private beginRun(
    projectId: string,
    sessionId: string,
    selection?: HarnessSelection,
    contextRefs?: UiContextRef[],
    activeDocument?: UiActiveDocumentRef
  ): ActiveRun {
    const key = this.sessionKey(projectId, sessionId)
    const prev = this.active.get(key)
    if (prev) {
      prev.aborted = true
      void prev.goalAuditAbort?.().catch(() => undefined)
      this.harnesses.abortSession(projectId, sessionId)
    }

    const runId = createId('run')
    const run: ActiveRun = {
      runId,
      projectId,
      sessionId,
      aborted: false,
      selection,
      followUpCount: 0,
      steerCount: 0,
      contextRefs,
      activeDocument
    }
    this.active.set(key, run)
    return run
  }

  private handleRunError(run: ActiveRun, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[agent-runner]', message)
    const key = this.sessionKey(run.projectId, run.sessionId)
    if (!run.aborted) {
      this.emit({
        type: 'error',
        projectId: run.projectId,
        sessionId: run.sessionId,
        runId: run.runId,
        message
      })
    }
    if (this.active.get(key)?.runId === run.runId) this.active.delete(key)
  }

  private async executeRegenerate(run: ActiveRun, userMessageId: string): Promise<void> {
    const { projectId, sessionId, runId } = run
    const key = this.sessionKey(projectId, sessionId)

    this.emit({ type: 'turn_start', projectId, sessionId, runId })

    const pendingCompaction = this.compactions.get(key)
    if (pendingCompaction) await pendingCompaction

    // 每次 getOrCreate + 应用模型
    const harness = await this.harnesses.getOrCreate(
      projectId,
      sessionId,
      run.selection
    )

    // 定位用户消息：navigateTree 对 user 会把 leaf 移到其 parent，并返回 editorText
    const nav = (await harness.navigateTree(userMessageId)) as {
      cancelled?: boolean
      editorText?: string
    }
    if (nav?.cancelled) {
      throw new Error('重新生成已取消')
    }

    // 截断后的会话投影同步到 UI（补回即将重发的用户消息，避免中间闪一下）
    const truncated = await this.sessions.open(projectId, sessionId)

    let userText = typeof nav?.editorText === 'string' ? nav.editorText.trim() : ''
    if (!userText) {
      const hit = truncated.messages.find((m) => m.id === userMessageId)
      const part = hit?.parts?.find((p) => p.type === 'text')
      userText = part && part.type === 'text' ? part.text.trim() : ''
    }
    if (!userText) {
      throw new Error('无法读取原用户消息内容，重新生成失败')
    }

    const restoredUser: UiChatMessage = {
      id: userMessageId,
      role: 'user',
      createdAt: new Date().toISOString(),
      parts: [{ type: 'text', text: userText }],
      status: 'complete'
    }

    this.emit({
      type: 'branch_reset',
      projectId,
      sessionId,
      runId,
      messages: [...truncated.messages, restoredUser]
    })

    if (run.aborted) {
      this.emit({ type: 'aborted', projectId, sessionId, runId })
      if (this.active.get(key)?.runId === runId) this.active.delete(key)
      return
    }

    // 不再重复发 user_message 乐观事件（已在 branch_reset 中）
    await this.executeTurn(run, userText, {
      harnessAlreadyCreated: true,
      harness,
      skipOptimisticUser: true
    })
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
    void run.goalAuditAbort?.().catch(() => undefined)
    this.harnesses.abortSession(input.projectId, input.sessionId)
    this.emit({
      type: 'aborted',
      projectId: run.projectId,
      sessionId: run.sessionId,
      runId: run.runId
    })
  }

  /**
   * 返回仍在运行的回合（供页面重新挂载 / 离开创作页后恢复“运行中”状态）。
   * 运行本身始终在主进程执行，不依赖发起页面是否存活。
   */
  listRunningRuns(query?: {
    projectId?: string
    sessionId?: string
  }): AgentRunningRun[] {
    const out: AgentRunningRun[] = []
    for (const run of this.active.values()) {
      if (run.aborted) continue
      if (query?.projectId && run.projectId !== query.projectId) continue
      if (query?.sessionId && run.sessionId !== query.sessionId) continue
      out.push({
        projectId: run.projectId,
        sessionId: run.sessionId,
        runId: run.runId,
        providerId: run.selection?.providerId,
        modelId: run.selection?.modelId,
        thinkingLevel: run.selection?.thinkingLevel,
        goalAuditing: Boolean(run.goalAuditAbort)
      })
    }
    return out
  }

  private async executeTurn(
    run: ActiveRun,
    userText: string,
    options?: {
      harnessAlreadyCreated?: boolean
      skipOptimisticUser?: boolean
      harness?: DreamHarness
      preserveRun?: boolean
    }
  ): Promise<void> {
    const { projectId, sessionId, runId } = run
    const key = this.sessionKey(projectId, sessionId)

    const pendingCompaction = this.compactions.get(key)
    if (pendingCompaction) await pendingCompaction

    // regenerate 路径已发过 turn_start
    if (!options?.harnessAlreadyCreated) {
      this.emit({ type: 'turn_start', projectId, sessionId, runId })
    }

    // 乐观用户消息（真实落盘由 harness.prompt 完成）
    if (!options?.skipOptimisticUser) {
      const userMsg: UiChatMessage = {
        id: createId('msg'),
        role: 'user',
        createdAt: new Date().toISOString(),
        parts: [{ type: 'text', text: userText }],
        status: 'complete'
      }
      this.emit({
        type: 'user_message',
        projectId,
        sessionId,
        runId,
        message: userMsg
      })
    }

    // 每次 getOrCreate（按 skills 签名缓存），并应用模型/思考
    const harness =
      options?.harnessAlreadyCreated && options.harness
        ? options.harness
        : await this.harnesses.getOrCreate(projectId, sessionId, run.selection)

    // P0/P2：记录本轮请求上下文（runId + 显式引用），供每轮 systemPrompt 读取
    this.harnesses.beginRequest(projectId, sessionId, {
      runId,
      userMessage: userText,
      contextRefs: run.contextRefs ?? [],
      activeDocument: run.activeDocument
    })

    // 使用最终编译上下文（system + tools + 动态块 + current user + 历史）做阈值预测
    const estimate = await this.harnesses
      .estimateNextRequestTokens(
        projectId,
        sessionId,
        run.selection,
        userText,
        run.contextRefs,
        run.activeDocument
      )
      .catch(() => undefined)
    await this.compactIfNeeded(run, harness, estimate?.estimatedInputTokens ?? 0)

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
      this.emit({
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
      this.emit({
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
      this.emit({
        type: 'assistant_start',
        projectId,
        sessionId,
        runId,
        messageId: assistantMessageId
      })
    }

    let unsubscribe: (() => void) | null = harness.subscribe(async (event) => {
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
          try {
            const usage = await this.sessions.getUsage(
              projectId,
              sessionId,
              run.selection
            )
            this.emit({
              type: 'context_update',
              projectId,
              sessionId,
              runId,
              usage,
              compactionState: 'idle'
            })
          } catch (error) {
            console.warn('[agent-runner] 刷新会话用量失败', error)
          }
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
          this.emit({
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
          let todosPayload: import('../../../shared/todos').TodoItem[] | undefined
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
              todosPayload = data.todos as import('../../../shared/todos').TodoItem[]
            }
          }

          this.emit({
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

          // 图谱变更后：失效 ContextBuilder 快照缓存 + 推送 snapshot
          if (GRAPH_MUTATING_TOOLS.has(event.toolName as AgentToolName)) {
            this.harnesses.invalidateProjectSnapshot(projectId)
            try {
              const snapshot = await this.projects.openProject(projectId)
              this.emit({
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
        this.emit({ type: 'aborted', projectId, sessionId, runId })
        return
      }

      const stopReason = finalMessage?.stopReason
      const errorMessage =
        typeof finalMessage?.errorMessage === 'string' && finalMessage.errorMessage.trim()
          ? finalMessage.errorMessage.trim()
          : null

      if (stopReason === 'aborted') {
        this.emit({ type: 'aborted', projectId, sessionId, runId })
        return
      }

      if (stopReason === 'error' || errorMessage) {
        // 尽量用 session 投影校准 UI（不发 turn_done，避免前端清掉 error）
        try {
          const sessionView = await this.sessions.open(projectId, sessionId)
          this.emit({
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
        this.emit({
          type: 'error',
          projectId,
          sessionId,
          runId,
          message: errorMessage || '模型生成失败'
        })
        return
      }

      // 简化：turn 结束后用 session 全量投影校准
      const sessionView = await this.sessions.open(projectId, sessionId)
      const snapshot = await this.projects.openProject(projectId)

      // 从 session 最后一条 assistant 作为 assistant_end
      const lastAssistant = [...sessionView.messages].reverse().find((m) => m.role === 'assistant')
      if (lastAssistant) {
        this.emit({
          type: 'assistant_end',
          projectId,
          sessionId,
          runId,
          message: lastAssistant
        })
      }

      this.emit({
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

      // 标题生成是独立的远程请求，不能阻塞已经完成的主回合。
      void this.sessions
        .maybeAutotitle(projectId, sessionId, userText, run.selection)
        .then((title) => {
          if (!title) return
          this.emit({
            type: 'session_title',
            projectId,
            sessionId,
            title
          })
        })
        .catch((error) => {
          console.warn('[agent-runner] 后台生成会话标题失败', error)
        })

      // 自动续跑会复用同一个缓存 harness。先解除本轮订阅，避免下一轮
      // 的流式事件同时被上一轮和当前轮处理，导致 UI 出现重复 AI 回复。
      unsubscribe?.()
      unsubscribe = null

      // turn_done 已让界面恢复可用；随后压缩，并用 per-session promise 串行化下一轮。
      // 注意：此时 session.buildContext() 已包含刚完成的 user+assistant 回合，
      // 不再把 userText 作为 current_user 追加，避免重复计入同一条用户消息。
      const estimate = await this.harnesses
        .estimateNextRequestTokens(projectId, sessionId, run.selection, '', run.contextRefs, run.activeDocument)
        .catch(() => undefined)
      const compaction = this.compactIfNeeded(run, harness, estimate?.estimatedInputTokens ?? 0)
      this.compactions.set(key, compaction)
      try {
        await compaction
      } finally {
        if (this.compactions.get(key) === compaction) this.compactions.delete(key)
      }

      if (sessionView.goal?.status === 'active' && !run.aborted) {
        await this.auditGoalAndContinue(run, sessionView.goal)
      }
    } catch (error) {
      flushAll(true)
      if (run.aborted) {
        this.emit({ type: 'aborted', projectId, sessionId, runId })
      } else {
        const message = error instanceof Error ? error.message : String(error)
        this.emit({ type: 'error', projectId, sessionId, runId, message })
      }
    } finally {
      this.harnesses.endRequest(projectId, sessionId)
      // 无论正常结束、报错还是中止，已经产生的模型用量都立即进入只增台账。
      await this.sessions.tokenActivity(projectId).catch((error) => {
        console.warn('[agent-runner] 持久化 Token 活动失败', error)
      })
      unsubscribe?.()
      if (!options?.preserveRun && this.active.get(key)?.runId === runId) {
        this.active.delete(key)
      }
    }
  }

  private async auditGoalAndContinue(run: ActiveRun, goal: SessionGoal): Promise<void> {
    const { projectId, sessionId, runId } = run
    if (run.aborted) return

    this.emit({
      type: 'goal_audit',
      projectId,
      sessionId,
      runId,
      phase: 'checking',
      goal
    })

    let auditHarness: GoalAuditHarness | null = null

    try {
      auditHarness = await this.harnesses.createGoalAuditHarness(
        projectId,
        sessionId,
        run.selection
      )
      run.goalAuditAbort = () => auditHarness!.abort().then(() => undefined)
      const [snapshot, sessionView] = await Promise.all([
        this.projects.openProject(projectId),
        this.sessions.open(projectId, sessionId)
      ])
      if (run.aborted || sessionView.goal?.id !== goal.id || sessionView.goal.status !== 'active') {
        return
      }

      const auditCharBudget = Math.min(
        80_000,
        Math.max(24_000, auditHarness.getModel().contextWindow * 2)
      )
      const lastMessage = sessionView.messages[sessionView.messages.length - 1]
      const prompt = buildGoalAuditPrompt({
        objective: goal.objective,
        lastMessage,
        snapshot,
        snapshotCharBudget: auditCharBudget
      })
      const result = await auditHarness.prompt(prompt)
      if (run.aborted) return

      const decision = parseAuditResponse(result?.content)
      if (!decision) {
        await this.blockGoalAfterAuditFailure(run, goal, '自动审计返回格式无效，已暂停自动续跑。')
        return
      }

      const latest = await this.sessions.open(projectId, sessionId)
      if (run.aborted || latest.goal?.id !== goal.id || latest.goal.status !== 'active') return

      if (decision.status === 'complete') {
        const completedGoal: SessionGoal = {
          ...latest.goal,
          status: 'complete',
          note: this.goalNote(decision, '目标已完成并通过自动审计。'),
          statusReason: '自动审计确认完成',
          updatedAt: new Date().toISOString()
        }
        const saved = await this.sessions.update(projectId, sessionId, { goal: completedGoal })
        this.emit({
          type: 'goal_audit',
          projectId,
          sessionId,
          runId,
          phase: 'completed',
          goal: saved.goal,
          message: '自动审计确认目标已完成。'
        })
        return
      }

      const progressGoal: SessionGoal = {
        ...latest.goal,
        note: this.goalNote(decision),
        statusReason: '自动审计确认仍需继续',
        updatedAt: new Date().toISOString()
      }

      const saved = await this.sessions.update(projectId, sessionId, { goal: progressGoal })
      this.emit({
        type: 'goal_audit',
        projectId,
        sessionId,
        runId,
        phase: 'continued',
        goal: saved.goal,
        message: '目标尚未完成，正在自动开始下一轮。'
      })
      if (run.aborted || saved.goal?.status !== 'active') return

      const continuation = [
        '继续自动完成当前会话目标。',
        `目标：${saved.goal.objective}`,
        `自动审计进度：${saved.goal.note}`,
        `下一步：${decision.nextStep}`,
        '请直接执行下一步，使用工具修改项目并验证结果；不要只输出计划。'
      ].join('\n')
      await this.executeTurn(run, continuation, { preserveRun: true })
    } catch (error) {
      if (run.aborted) return
      const message = error instanceof Error ? error.message : String(error)
      await this.blockGoalAfterAuditFailure(run, goal, `自动审计失败，已暂停自动续跑：${message}`)
    } finally {
      run.goalAuditAbort = undefined
      if (auditHarness) {
        await auditHarness.abort().catch(() => undefined)
        await auditHarness.waitForIdle().catch(() => undefined)
      }
    }
  }

  private goalNote(decision: SessionGoalAuditDecision, prefix?: string): string {
    const evidence = decision.evidence.length
      ? `证据：${decision.evidence.join('；')}`
      : ''
    return [prefix, `进度：${decision.progress}`, decision.status === 'continue' ? `下一步：${decision.nextStep}` : '', evidence]
      .filter(Boolean)
      .join('\n')
      .slice(0, SESSION_GOAL_NOTE_LIMIT)
  }

  private async blockGoalAfterAuditFailure(
    run: ActiveRun,
    goal: SessionGoal,
    message: string
  ): Promise<void> {
    const { projectId, sessionId, runId } = run
    const latest = await this.sessions.open(projectId, sessionId).catch(() => null)
    if (!latest?.goal || latest.goal.id !== goal.id || latest.goal.status !== 'active') return
    const blocked: SessionGoal = {
      ...latest.goal,
      status: 'blocked',
      note: message.slice(0, SESSION_GOAL_NOTE_LIMIT),
      statusReason: '自动审计不可用',
      updatedAt: new Date().toISOString()
    }
    const saved = await this.sessions.update(projectId, sessionId, { goal: blocked })
    this.emit({
      type: 'goal_audit',
      projectId,
      sessionId,
      runId,
      phase: 'error',
      goal: saved.goal,
      message
    })
  }
}
