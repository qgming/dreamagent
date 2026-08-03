/**
 * ContextBuilder：单一入口，负责“这一轮最终应该带什么、为什么”
 *
 * 两阶段编译（§10.2）：
 * 1. 生成候选块，不做静默截断；
 * 2. 按预算选择；完整候选放得下时直接发送，不启动摘要/检索降级。
 *
 * pi Session 继续负责 JSONL、branch、leaf 与 compaction checkpoint；
 * ContextBuilder 负责系统提示词、工作集、manifest、预算与审计。
 */
import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core'
import type { ProjectService } from '../project/project-service'
import type { PiSessionService } from '../session/pi-session-service'
import type { TodoService } from '../todo/todo-service'
import type { LlmThinkingLevel } from '../../../shared/llm-settings'
import type { ContextRef, ActiveDocumentRef } from '../../../shared/context-refs'
import { readGoalFromBranch, readPinsFromBranch } from '../session/pi-session-parser'
import {
  buildSystemPromptV2,
  type SystemPromptInput,
  type ProjectContextInput
} from './system-prompt'
import { resolveWorkset } from './workset-resolver'
import {
  computeBudget,
  estimateMessagesTokens,
  estimateSchemaTokens,
  estimateTextTokens,
  isOverBudget
} from './context-budget'
import { validateCompiledContext, validateMessageChain } from './context-validator'
import { resolveReasoningReplayPolicy, modelKey, type ReasoningReplayPolicy } from './reasoning-replay'
import {
  validateCheckpoint,
  isCheckpointStale,
  type NarrativeCheckpoint
} from './narrative-compactor'
import {
  PROMPT_VERSION,
  CHECKPOINT_TYPE,
  type CompiledContext,
  type ContextBlock,
  type ContextManifest,
  type ContextRequest
} from './types'
import type { TodoItem } from '../../../shared/todos'
import {
  escapeSessionGoalText,
  type SessionGoal
} from '../../../shared/session-goals'

export interface CompileInput {
  projectId: string
  sessionId: string
  runId: string
  userMessage: string
  contextRefs?: ContextRef[]
  activeDocument?: ActiveDocumentRef
  model: {
    providerId: string
    modelId: string
    api: string
    contextWindow: number
    maxOutputTokens: number
  }
  thinkingLevel?: LlmThinkingLevel
  sessionMessages: AgentMessage[]
  toolSchemas: AgentTool[]
  skillsBlock: string
  mcpBlock: string
  /** 上一轮 providerId::api::modelId（reasoning 回放策略用） */
  previousModelKey?: string
  /** 用户显式开启“回放最近可见 reasoning” */
  replayRecentVisible?: boolean
}

function outlineLines(snapshot: {
  beats: Record<string, { title?: string; status?: string; id: string }>
  index: { beats: { roots: string[]; children: Record<string, string[]> } }
}): string[] {
  const lines: string[] = []
  const walk = (ids: string[], depth: number): void => {
    for (const id of ids) {
      const b = snapshot.beats[id]
      if (!b) continue
      const pad = '  '.repeat(depth)
      const title = (b.title || '未命名').replace(/\s+/g, ' ').trim().slice(0, 40)
      lines.push(`${pad}- [${b.status ?? ''}] ${title} (${b.id})`)
      walk(snapshot.index.beats.children[id] ?? [], depth + 1)
    }
  }
  walk(snapshot.index.beats.roots, 0)
  return lines
}

export class ContextBuilder {
  private lastBranchHeadId = new Map<string, string>()
  /**
   * 项目快照缓存：按“代数”失效。
   * - beginCycle() / invalidateProject() 使代数 +1，下一次编译重新读盘；
   * - 同一轮（含工具循环）内多次编译复用同一快照，避免每次 createTurnState()
   *   都全量重读所有 beat/entity/chapter JSON。
   */
  private snapshotGenerations = new Map<string, number>()
  private snapshotCache = new Map<
    string,
    { generation: number; snapshot: Awaited<ReturnType<ProjectService['openProject']>> }
  >()

  constructor(
    private readonly projects: ProjectService,
    private readonly sessions: PiSessionService,
    private readonly todos: TodoService
  ) {}

  /** 新编译周期（新一轮 / 图变更）：使项目快照缓存失效 */
  beginCycle(projectId: string): void {
    const current = this.snapshotGenerations.get(projectId) ?? 0
    this.snapshotGenerations.set(projectId, current + 1)
  }

  /** 项目图变更（agent 工具写入等）后显式失效 */
  invalidateProject(projectId: string): void {
    this.beginCycle(projectId)
  }

  private async getProjectSnapshot(projectId: string) {
    const generation = this.snapshotGenerations.get(projectId) ?? 0
    const hit = this.snapshotCache.get(projectId)
    if (hit && hit.generation === generation) return hit.snapshot
    const snapshot = await this.projects.openProject(projectId)
    this.snapshotCache.set(projectId, { generation, snapshot })
    return snapshot
  }

  /** 读取钉选（从活动分支）、待办与叙事检查点 */
  private async readPinsAndTodos(
    projectId: string,
    sessionId: string
  ): Promise<{
    pins: { pinnedBeatIds: string[]; pinnedEntityIds: string[] }
    todos: TodoItem[]
    goal: SessionGoal | null
    checkpoint?: { data: NarrativeCheckpoint; stale: boolean }
    branchHeadId: string
  }> {
    const [branch, todos] = await Promise.all([
      this.sessions.getActiveHistoryEntries(projectId, sessionId).catch(() => []),
      this.todos.load(projectId, sessionId).catch(() => [] as TodoItem[])
    ])
    const pins = readPinsFromBranch(branch)
    const goal = readGoalFromBranch(branch)
    const branchHeadId = branch.length > 0 ? branch[branch.length - 1]!.id : ''
    let checkpoint: { data: NarrativeCheckpoint; stale: boolean } | undefined
    for (let i = branch.length - 1; i >= 0; i -= 1) {
      const entry = branch[i]
      if (entry.type !== 'custom') continue
      const c = entry as unknown as { customType?: string; data?: unknown }
      if (c.customType !== CHECKPOINT_TYPE) continue
      const data = c.data as NarrativeCheckpoint | undefined
      if (!data || typeof data !== 'object') continue
      checkpoint = {
        data,
        stale: isCheckpointStale(data, branchHeadId)
      }
      break
    }
    return { pins, todos, goal, checkpoint, branchHeadId }
  }

  /** 渲染叙事检查点为紧凑摘要（reference 级别） */
  private checkpointText(checkpoint: NarrativeCheckpoint): string {
    const n = checkpoint.narrative
    if (!n) return '（空检查点）'
    const lines = [
      `userGoal: ${n.userGoal || '（未记录）'}`,
      `deliverable: ${n.deliverable || '（未记录）'}`
    ]
    if (n.hardConstraints.length) {
      lines.push(`hardConstraints: ${n.hardConstraints.join('；')}`)
    }
    if (n.rejectedDirections.length) {
      lines.push(`rejectedDirections: ${n.rejectedDirections.join('；')}`)
    }
    lines.push(`canonFacts: ${n.canonFacts.length} 条`)
    lines.push(`characters: ${n.characters.length} 个`)
    lines.push(`timeline: ${n.timeline.length} 条`)
    lines.push(`openThreads: ${n.openThreads.length} 条`)
    lines.push(`sourceRange: ${checkpoint.sourceRange.firstEntryId}..${checkpoint.sourceRange.lastEntryId} (${checkpoint.sourceRange.sourceHash})`)
    return lines.join('\n')
  }

  /**
   * 编译系统提示词（含动态工作集）与候选块。
   * 不修改消息序列；messages 由 pi Session 负责。
   */
  async buildSystemPromptAndBlocks(
    input: CompileInput
  ): Promise<{
    systemPrompt: string
    promptHash: string
    blocks: ContextBlock[]
    worksetText: string
    projectContext: ProjectContextInput
  }> {
    const snapshot = await this.getProjectSnapshot(input.projectId)
    const { pins, todos, goal, checkpoint, branchHeadId } = await this.readPinsAndTodos(
      input.projectId,
      input.sessionId
    )
    const workset = resolveWorkset({
      snapshot,
      pins,
      contextRefs: input.contextRefs ?? [],
      activeDocument: input.activeDocument,
      todos
    })

    const worksetLines = [
      ...workset.explicitRefs.map((l) => `<explicit_reference trust="local_project_data">\n${l}\n</explicit_reference>`),
      ...workset.pinnedBeats.map((l) => `<pin trust="local_project_data">\n${l}\n</pin>`),
      ...workset.pinnedEntities.map((l) => `<pin trust="local_project_data">\n${l}\n</pin>`)
    ]
    if (workset.activeDocument) {
      worksetLines.push(`<active_document trust="local_project_data">\n${workset.activeDocument}\n</active_document>`)
    }
    if (workset.todos.length > 0) {
      worksetLines.push(
        `<open_todos trust="local_project_data">\n${workset.todos
          .map((t) => `- [${t.status}] ${t.content}`)
          .join('\n')}\n</open_todos>`
      )
    }
    if (goal?.status === 'active') {
      worksetLines.push(
        `<session_goal trust="local_project_data" status="${goal.status}">\nobjective:\n${escapeSessionGoalText(goal.objective)}\n</session_goal>`
      )
    }

    const projectContext: ProjectContextInput = {
      title: snapshot.meta.title,
      summary: snapshot.meta.description?.trim() || '（暂未填写）',
      outlineLines: outlineLines(snapshot)
    }

    const sysInput: SystemPromptInput = {
      project: projectContext,
      workset: {
        pinnedBeats: workset.pinnedBeats,
        pinnedEntities: workset.pinnedEntities,
        todos: workset.todos,
        explicitRefs: workset.explicitRefs,
        activeDocument: workset.activeDocument,
        goal
      },
      skillsBlock: input.skillsBlock,
      mcpBlock: input.mcpBlock,
      sessionId: input.sessionId
    }
    const { systemPrompt, promptHash } = buildSystemPromptV2(sysInput)
    if (branchHeadId) this.lastBranchHeadId.set(`${input.projectId}::${input.sessionId}`, branchHeadId)

    const blocks = this.buildCandidateBlocks({
      input,
      systemPrompt,
      worksetText: worksetLines.join('\n\n'),
      projectContext,
      pins,
      todos,
      goal,
      checkpoint,
      branchHeadId,
      conversationTokens: estimateMessagesTokens(input.sessionMessages),
      currentUserTokens: estimateTextTokens(input.userMessage),
      toolTokens: estimateSchemaTokens(JSON.stringify(input.toolSchemas))
    })

    return {
      systemPrompt,
      promptHash,
      blocks,
      worksetText: worksetLines.join('\n\n'),
      projectContext
    }
  }

  /** 扫描最后一条 assistant 消息，判断是否存在可回放的 thinking signature */
  private findLastThinkingSignature(messages: AgentMessage[]): boolean {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i] as { role?: string; content?: unknown }
      if (m.role !== 'assistant') continue
      const content = m.content
      if (!Array.isArray(content)) continue
      for (const block of content) {
        const b = block as { type?: string; thinking?: unknown; signature?: unknown }
        if (b.type === 'thinking' && typeof b.signature === 'string' && b.signature.length > 0) {
          return true
        }
      }
      // 只看最近一条 assistant
      break
    }
    return false
  }

  private resolveReasoningPolicy(input: CompileInput): ReasoningReplayPolicy {
    const currentKey = modelKey(
      input.model.providerId,
      input.model.api,
      input.model.modelId
    )
    return resolveReasoningReplayPolicy({
      previousModelKey: input.previousModelKey,
      currentModelKey: currentKey,
      hasValidSignature: this.findLastThinkingSignature(input.sessionMessages),
      replayRecentVisible: input.replayRecentVisible
    })
  }

  private buildCandidateBlocks(ctx: {
    input: CompileInput
    systemPrompt: string
    worksetText: string
    projectContext: ProjectContextInput
    pins: { pinnedBeatIds: string[]; pinnedEntityIds: string[] }
    todos: TodoItem[]
    goal: SessionGoal | null
    conversationTokens: number
    currentUserTokens: number
    toolTokens: number
    checkpoint?: { data: NarrativeCheckpoint; stale: boolean }
    branchHeadId: string
  }): ContextBlock[] {
    const { input } = ctx
    const now = new Date().toISOString()
    const blocks: ContextBlock[] = []

    blocks.push({
      id: 'system_policy',
      kind: 'system_policy',
      authority: 'system',
      trust: 'trusted_policy',
      required: true,
      priority: 1,
      content: ctx.systemPrompt,
      tokenCount: estimateTextTokens(ctx.systemPrompt),
      fidelity: 'verbatim',
      provenance: {
        sourceType: 'project',
        sourceIds: [],
        sourceHash: `sha256:${ctx.systemPrompt.length}`
      }
    })

    if (input.skillsBlock) {
      blocks.push({
        id: 'skills',
        kind: 'skills',
        authority: 'system',
        trust: 'local_project_data',
        required: false,
        priority: 30,
        content: input.skillsBlock,
        tokenCount: estimateTextTokens(input.skillsBlock),
        fidelity: 'verbatim',
        provenance: { sourceType: 'project', sourceIds: [], sourceHash: `skills:${input.skillsBlock.length}`, createdAt: now }
      })
    }

    if (input.mcpBlock) {
      blocks.push({
        id: 'mcp',
        kind: 'mcp',
        authority: 'system',
        trust: 'local_project_data',
        required: false,
        priority: 30,
        content: input.mcpBlock,
        tokenCount: estimateTextTokens(input.mcpBlock),
        fidelity: 'verbatim',
        provenance: { sourceType: 'project', sourceIds: [], sourceHash: `mcp:${input.mcpBlock.length}`, createdAt: now }
      })
    }

    const projectContractText =
      `标题：${ctx.projectContext.title}\n梗概：\n${ctx.projectContext.summary}`
    blocks.push({
      id: 'project_contract',
      kind: 'project_contract',
      authority: 'user_data',
      trust: 'local_project_data',
      required: true,
      priority: 10,
      content: projectContractText,
      tokenCount: estimateTextTokens(projectContractText),
      fidelity: 'verbatim',
      provenance: { sourceType: 'project', sourceIds: [], sourceHash: `project:${projectContractText.length}`, createdAt: now }
    })

    if (ctx.projectContext.outlineLines.length > 0) {
      const outlineText = ctx.projectContext.outlineLines.join('\n')
      blocks.push({
        id: 'project_outline',
        kind: 'project_outline',
        authority: 'user_data',
        trust: 'local_project_data',
        required: false,
        priority: 40,
        content: outlineText,
        tokenCount: estimateTextTokens(outlineText),
        fidelity: 'verbatim',
        provenance: { sourceType: 'project', sourceIds: [], sourceHash: `outline:${outlineText.length}`, createdAt: now }
      })
    }

    if (ctx.worksetText) {
      blocks.push({
        id: 'active_workset',
        kind: 'explicit_reference',
        authority: 'user_data',
        trust: 'local_project_data',
        required: false,
        priority: 20,
        content: ctx.worksetText,
        tokenCount: estimateTextTokens(ctx.worksetText),
        fidelity: 'verbatim',
        provenance: {
          sourceType: 'project',
          sourceIds: [...ctx.pins.pinnedBeatIds, ...ctx.pins.pinnedEntityIds],
          sourceHash: `workset:${ctx.worksetText.length}`,
          createdAt: now
        }
      })
    }

    const reasoningPolicy = this.resolveReasoningPolicy(ctx.input)
    blocks.push({
      id: 'reasoning_state',
      kind: 'reasoning_state',
      authority: 'system',
      trust: 'trusted_policy',
      required: false,
      priority: 45,
      content:
        reasoningPolicy.mode === 'omit'
          ? `reasoning: omit (${reasoningPolicy.reason})`
          : `reasoning: ${reasoningPolicy.mode} (${reasoningPolicy.reason})`,
      tokenCount: 1,
      fidelity: reasoningPolicy.mode === 'omit' ? ('omitted' as const) : ('summary' as const),
      reason: reasoningPolicy.mode === 'omit' ? reasoningPolicy.reason : undefined,
      provenance: {
        sourceType: 'derived_memory',
        sourceIds: [],
        sourceHash: `reasoning:${reasoningPolicy.mode}`,
        createdAt: now
      }
    })

    if (ctx.checkpoint && !ctx.checkpoint.stale) {
      const ckText = this.checkpointText(ctx.checkpoint.data)
      const ckValid = validateCheckpoint(ctx.checkpoint.data)
      blocks.push({
        id: 'narrative_checkpoint',
        kind: 'narrative_checkpoint',
        authority: 'user_data',
        trust: 'local_project_data',
        required: false,
        priority: 35,
        content: ckText,
        tokenCount: estimateTextTokens(ckText),
        fidelity: ckValid.ok ? ('summary' as const) : ('reference' as const),
        reason: ckValid.ok ? undefined : 'invalid_checkpoint',
        provenance: {
          sourceType: 'derived_memory',
          sourceIds: [
            ctx.checkpoint.data.sourceRange.firstEntryId,
            ctx.checkpoint.data.sourceRange.lastEntryId
          ],
          sourceHash: ctx.checkpoint.data.sourceRange.sourceHash,
          branchHeadId: ctx.branchHeadId,
          createdAt: ctx.checkpoint.data.createdAt
        }
      })
    }

    blocks.push({
      id: 'tool_chain',
      kind: 'tool_chain',
      authority: 'tool',
      trust: 'trusted_policy',
      required: true,
      priority: 5,
      content: `工具 schema（${input.toolSchemas.length} 个）`,
      tokenCount: ctx.toolTokens,
      fidelity: 'verbatim',
      provenance: { sourceType: 'project', sourceIds: [], sourceHash: `tools:${input.toolSchemas.length}`, createdAt: now }
    })

    blocks.push({
      id: 'current_user',
      kind: 'current_user',
      authority: 'conversation',
      trust: 'local_project_data',
      required: true,
      priority: 2,
      content: input.userMessage,
      tokenCount: ctx.currentUserTokens,
      fidelity: 'verbatim',
      provenance: { sourceType: 'session_entry', sourceIds: [], sourceHash: `user:${input.userMessage.length}`, createdAt: now }
    })

    if (input.sessionMessages.length > 0) {
      blocks.push({
        id: 'conversation_turns',
        kind: 'conversation_turn',
        authority: 'conversation',
        trust: 'local_project_data',
        required: false,
        priority: 50,
        messages: input.sessionMessages,
        tokenCount: ctx.conversationTokens,
        fidelity: 'verbatim',
        provenance: {
          sourceType: 'session_entry',
          sourceIds: [],
          sourceHash: `history:${ctx.conversationTokens}`,
          createdAt: now
        }
      })
    }

    return blocks
  }

  /**
   * 完整编译：systemPrompt + messages + tools + manifest。
   * 完整候选放得下时全部发送；超预算时在 manifest 中标记 omitted。
   */
  async compile(input: CompileInput): Promise<CompiledContext> {
    const { systemPrompt, promptHash, blocks } =
      await this.buildSystemPromptAndBlocks(input)

    const budget = computeBudget(input.model, input.model.maxOutputTokens)
    const conversationTokens = estimateMessagesTokens(input.sessionMessages)
    const currentUserTokens = estimateTextTokens(input.userMessage)
    const toolTokens = estimateSchemaTokens(JSON.stringify(input.toolSchemas))
    const systemTokens = estimateTextTokens(systemPrompt)

    const fixedTokens = systemTokens + toolTokens + currentUserTokens
    const estimatedInputTokens = fixedTokens + conversationTokens
    const over = isOverBudget(estimatedInputTokens, budget)

    const roleSequence = input.sessionMessages
      .map((m) => m.role)
      .concat('user')

    // 超预算时并不在编译期静默裁剪消息（pi 的 compaction 在请求前处理），
    // 而是在 manifest 中如实标注：conversation_turn 保持 verbatim，
    // 并给出可操作的 overflow 警告。
    const selected = blocks.map((b) => {
      if (over && b.kind === 'conversation_turn') {
        return {
          ...b,
          reason: 'budget',
          fidelity: 'verbatim' as const
        }
      }
      return b
    })

    const manifest: ContextManifest = {
      version: 1,
      runId: input.runId,
      sessionId: input.sessionId,
      branchHeadId: this.lastBranchHeadId.get(`${input.projectId}::${input.sessionId}`) ?? '',
      providerId: input.model.providerId,
      modelId: input.model.modelId,
      api: input.model.api,
      promptVersion: PROMPT_VERSION,
      promptHash,
      contextWindow: budget.contextWindow,
      outputReserve: budget.outputReserve,
      safetyReserve: budget.safetyReserve,
      inputBudget: budget.inputBudget,
      estimatedInputTokens,
      roleSequence,
      sourceMessageCount: input.sessionMessages.length,
      outputMessageCount: input.sessionMessages.length + 1,
      blocks: selected,
      validation: { ok: true, errors: [], warnings: [] }
    }

    const compiled: CompiledContext = {
      systemPrompt,
      messages: input.sessionMessages,
      activeTools: input.toolSchemas,
      manifest
    }
    const validation = validateCompiledContext(compiled, this.asRequest(input))
    if (over) {
      validation.warnings.push(
        `estimatedInputTokens(${estimatedInputTokens}) 超过 inputBudget(${budget.inputBudget})，建议 compact 或降低工具集/输出预算`
      )
    }
    manifest.validation = validation
    compiled.manifest = manifest
    return compiled
  }

  private asRequest(input: CompileInput): ContextRequest {
    return {
      projectId: input.projectId,
      sessionId: input.sessionId,
      runId: input.runId,
      userMessage: input.userMessage,
      contextRefs: input.contextRefs ?? [],
      activeDocument: input.activeDocument,
      model: input.model,
      thinkingLevel: input.thinkingLevel ?? 'medium',
      branchHeadId: input.sessionMessages.length ? 'active' : '',
      sessionMessages: input.sessionMessages,
      toolSchemas: input.toolSchemas
    }
  }

  /** 供 agent-runner 使用：预估下一次请求的总输入 token 与预算 */
  async estimateNextRequest(input: CompileInput): Promise<{
    estimatedInputTokens: number
    budget: ReturnType<typeof computeBudget>
    conversationTokens: number
    systemTokens: number
    toolTokens: number
    currentUserTokens: number
    over: boolean
  }> {
    const compiled = await this.compile(input)
    const budget = computeBudget(input.model, input.model.maxOutputTokens)
    const conversationTokens = estimateMessagesTokens(input.sessionMessages)
    const currentUserTokens = estimateTextTokens(input.userMessage)
    const toolTokens = estimateSchemaTokens(JSON.stringify(input.toolSchemas))
    const systemTokens = estimateTextTokens(compiled.systemPrompt)
    const estimatedInputTokens =
      systemTokens + toolTokens + currentUserTokens + conversationTokens
    return {
      estimatedInputTokens,
      budget,
      conversationTokens,
      systemTokens,
      toolTokens,
      currentUserTokens,
      over: isOverBudget(estimatedInputTokens, budget)
    }
  }
}

export { estimateMessagesTokens, estimateTextTokens }
