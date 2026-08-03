/**
 * 每会话一个 AgentHarness 缓存（少 recreate，动态 systemPrompt / context）
 *
 * P0 修复（2026-07-31）：
 * - 删除 context hook 的整体替换（pi 的 context hook 语义是“返回下一次请求的
 *   完整消息数组”，不是“追加消息”）。
 * - pins / todo / 显式引用合入每轮重新生成的 systemPrompt 数据分区。
 */
import {
  AgentHarness,
  InMemorySessionRepo,
  formatSkillsForSystemPrompt
} from '@earendil-works/pi-agent-core'
import type {
  Model,
  Models,
  Api
} from '@earendil-works/pi-ai'
import type { ThinkingLevel, AgentMessage, AgentTool } from '@earendil-works/pi-agent-core'
import type { ProjectService } from '../project/project-service'
import type { PiSessionService } from '../session/pi-session-service'
import type { PiModelsService } from '../llm/pi-models'
import type { SkillService } from '../skill/skill-service'
import { AgentToolRuntime } from './agent-tool-runtime'
import {
  buildDreamAgentTools,
  type DreamToolContext
} from './pi-agent-tools'
import { buildSkillTools } from '../skill/skill-tools'
import { buildWebTools } from '../network/web-tools'
import { buildTodoTools } from '../todo/todo-tools'
import { buildMcpTools } from '../mcp/mcp-tools'
import { getMcpService } from '../mcp/mcp-service'
import type { TodoService } from '../todo/todo-service'
import type { LlmThinkingLevel } from '../../../shared/llm-settings'
import type { ContextRef, ActiveDocumentRef } from '../../../shared/context-refs'
import { ContextBuilder, type CompileInput } from '../context/context-builder'
import type { CompiledContext } from '../context/types'
import {
  applyGoalAuditJsonMode,
  GOAL_AUDIT_SYSTEM_PROMPT
} from './goal-audit-prompts'

type DreamHarness = AgentHarness<DreamToolContext>
export type GoalAuditHarness = AgentHarness<DreamToolContext>

function harnessKey(projectId: string, sessionId: string): string {
  return `${projectId}::${sessionId}`
}

interface CachedHarness {
  promise: Promise<DreamHarness>
  /** 仅 skills 集合变化时重建；模型/思考用 setModel 热切换 */
  signature: string
  skillsBlock: string
  mcpBlock: string
}

export interface HarnessSelection {
  providerId?: string
  modelId?: string
  thinkingLevel?: LlmThinkingLevel
}

/** 一次运行的请求上下文（runId + 显式引用 + 当前 user） */
export interface PendingRequestContext {
  runId: string
  userMessage: string
  contextRefs: ContextRef[]
  activeDocument?: ActiveDocumentRef
}

interface HarnessWithBlocks {
  harness: DreamHarness
  skillsBlock: string
  mcpBlock: string
}

/**
 * Harness 管理器
 */
export class HarnessManager {
  private cache = new Map<string, CachedHarness>()
  private pending = new Map<string, Promise<DreamHarness>>()
  /** 当前运行中的请求上下文（供 systemPrompt 回调读取） */
  private requestContexts = new Map<string, PendingRequestContext>()
  /** 每个会话上一次实际使用的模型 key（reasoning 回放策略） */
  private lastModelKeys = new Map<string, string>()
  private readonly toolRuntime: AgentToolRuntime
  private readonly contextBuilder: ContextBuilder

  constructor(
    private readonly projects: ProjectService,
    private readonly sessions: PiSessionService,
    private readonly modelsService: PiModelsService,
    private readonly skills: SkillService,
    private readonly todos: TodoService
  ) {
    this.toolRuntime = new AgentToolRuntime(projects)
    this.contextBuilder = new ContextBuilder(projects, sessions, todos)
  }

  clear(): void {
    for (const c of this.cache.values()) {
      void c.promise.then((h) => h.abort()).catch(() => undefined)
    }
    this.cache.clear()
    this.pending.clear()
    this.requestContexts.clear()
    this.lastModelKeys.clear()
    this.modelsService.reset()
  }

  abortSession(projectId: string, sessionId: string): void {
    const key = harnessKey(projectId, sessionId)
    const cached = this.cache.get(key)
    if (cached) {
      void cached.promise.then((h) => h.abort()).catch(() => undefined)
    }
  }

  disposeSession(projectId: string, sessionId: string): void {
    const key = harnessKey(projectId, sessionId)
    const cached = this.cache.get(key)
    if (cached) {
      void cached.promise.then((h) => h.abort()).catch(() => undefined)
      this.cache.delete(key)
    }
    this.pending.delete(key)
    this.requestContexts.delete(key)
    this.lastModelKeys.delete(key)
  }

  /** 开始一次运行：记录 runId / userMessage / contextRefs，供每轮 systemPrompt 读取 */
  beginRequest(
    projectId: string,
    sessionId: string,
    request: PendingRequestContext
  ): void {
    this.requestContexts.set(harnessKey(projectId, sessionId), request)
    // 新一轮：项目快照缓存进入新代数（同一轮内多次编译复用，避免重复读盘）
    this.contextBuilder.beginCycle(projectId)
  }

  /** 结束运行：清理请求上下文 */
  endRequest(projectId: string, sessionId: string): void {
    this.requestContexts.delete(harnessKey(projectId, sessionId))
  }

  getPendingRequest(projectId: string, sessionId: string): PendingRequestContext | undefined {
    return this.requestContexts.get(harnessKey(projectId, sessionId))
  }

  /** 结构性签名：skills / MCP 变化才重建 harness */
  private async structuralSignature(_projectId: string): Promise<string> {
    const enabledSkillIds = await this.skills
      .getEnabledSkillIds()
      .catch(() => [] as string[])
    // MCP 配置变化时强制重建 harness（工具列表会变）
    const mcpConfigs = await getMcpService()
      .list()
      .catch(() => [])
    const mcpSig = mcpConfigs
      .map((s) => ({
        id: s.id,
        enabled: s.enabled,
        url: s.server?.url,
        disabled: [...(s.disabledToolNames ?? [])].sort(),
        tools: (s.discoveredTools ?? []).map((t) => t.name).sort(),
        status: s.installCheck?.status
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
    return JSON.stringify({ skills: enabledSkillIds, mcp: mcpSig })
  }

  async getOrCreate(
    projectId: string,
    sessionId: string,
    selection?: HarnessSelection
  ): Promise<DreamHarness> {
    const key = harnessKey(projectId, sessionId)
    const signature = await this.structuralSignature(projectId)

    const cached = this.cache.get(key)
    if (cached && cached.signature === signature) {
      const harness = await cached.promise
      await this.applySelection(harness, selection)
      return harness
    }
    if (cached) {
      this.cache.delete(key)
    }

    const pending = this.pending.get(key)
    if (pending) {
      const harness = await pending
      await this.applySelection(harness, selection)
      return harness
    }

    const createPromise = this.createHarness(projectId, sessionId, selection)
      .then((created) => {
        this.cache.set(key, {
          promise: Promise.resolve(created.harness),
          signature,
          skillsBlock: created.skillsBlock,
          mcpBlock: created.mcpBlock
        })
        this.pending.delete(key)
        return created.harness
      })
      .catch((err) => {
        this.pending.delete(key)
        throw err
      })

    this.pending.set(key, createPromise)
    return createPromise
  }

  /**
   * 创建只存在于内存中的目标审计 harness。
   * 审计不能写入创作 session，也不暴露创作工具，避免审计过程污染会话或修改项目。
   */
  async createGoalAuditHarness(
    projectId: string,
    sessionId: string,
    selection?: HarnessSelection
  ): Promise<GoalAuditHarness> {
    const [{ models, model }, session] = await Promise.all([
      this.modelsService.getModelsAndDefault({
        ...selection,
        thinkingLevel: 'low'
      }),
      new InMemorySessionRepo().create()
    ])

    const auditToolNames = new Set(['list', 'read', 'text_stats'])
    const tools = buildDreamAgentTools().filter((tool) => auditToolNames.has(tool.name))
    const toolContext: DreamToolContext = {
      projectId,
      sessionId,
      runtime: this.toolRuntime
    }

    const harness = new AgentHarness<DreamToolContext>({
      session,
      models: models as Models,
      model: model as Model<Api>,
      tools,
      toolContext,
      systemPrompt: GOAL_AUDIT_SYSTEM_PROMPT,
      thinkingLevel: 'low',
      streamOptions: {
        maxRetries: 1,
        maxRetryDelayMs: 5_000,
        timeoutMs: 120_000,
        metadata: { purpose: 'session-goal-audit' }
      }
    })

    harness.on('before_provider_payload', ({ model: requestModel, payload }) => ({
      payload: applyGoalAuditJsonMode(payload, requestModel.api)
    }))

    return harness
  }

  private async applySelection(
    harness: DreamHarness,
    selection?: HarnessSelection
  ): Promise<void> {
    try {
      const { model, selection: sel } =
        await this.modelsService.getModelsAndDefault(selection)
      const current = harness.getModel()
      if (
        current.id !== model.id ||
        current.provider !== model.provider ||
        current.baseUrl !== model.baseUrl
      ) {
        await harness.setModel(model as Model<Api>)
      }
      const level = (sel.thinkingLevel || 'medium') as ThinkingLevel
      if (harness.getThinkingLevel() !== level) {
        await harness.setThinkingLevel(level)
      }
    } catch (error) {
      console.warn('[harness-manager] 应用模型/思考档失败', error)
    }
  }

  private buildSkillsBlock(piSkills: Awaited<ReturnType<SkillService['getEnabledPiSkills']>>): string {
    return [
      formatSkillsForSystemPrompt(piSkills),
      piSkills.length > 0
        ? '需要使用某个技能时：先 list_skills 确认可用技能，再 read_skill 读取完整说明和目录树；references 等子文件用 read_skill_file。不要假设技能全文已在系统提示中。可用 write_skill 创建/编辑/删除自定义技能（不能改内置）。'
        : '可用 write_skill 创建自定义技能；list_skills / read_skill 在有启用技能时可用。'
    ]
      .filter(Boolean)
      .join('\n\n')
  }

  private buildMcpBlock(mcpToolsCount: number, mcpServerCount: number): string {
    return mcpToolsCount > 0
      ? `已接入 ${mcpServerCount} 个 MCP server、${mcpToolsCount} 个工具（名称形如 mcp__server__tool）。按任务需要调用。`
      : ''
  }

  /** 编译当前请求（systemPrompt + manifest），并缓存供 trace 合并 */
  private async compileForHarness(
    projectId: string,
    sessionId: string,
    turnContext: {
      session: { buildContext(): Promise<{ messages: AgentMessage[] }> }
      model: { id: string; provider: string; api: Api; contextWindow: number; maxTokens: number }
      thinkingLevel: ThinkingLevel
      activeTools: unknown[]
    },
    skillsBlock: string,
    mcpBlock: string
  ): Promise<CompiledContext> {
    const key = harnessKey(projectId, sessionId)
    const pending = this.getPendingRequest(projectId, sessionId)
    const context = await turnContext.session.buildContext()
    const currentModelKey = `${turnContext.model.provider}::${turnContext.model.api}::${turnContext.model.id}`
    const previousModelKey = this.lastModelKeys.get(key)
    const input: CompileInput = {
      projectId,
      sessionId,
      runId: pending?.runId ?? 'build',
      userMessage: pending?.userMessage ?? '',
      contextRefs: pending?.contextRefs ?? [],
      activeDocument: pending?.activeDocument,
      model: {
        providerId: turnContext.model.provider,
        modelId: turnContext.model.id,
        api: turnContext.model.api,
        contextWindow: turnContext.model.contextWindow,
        maxOutputTokens: turnContext.model.maxTokens
      },
      thinkingLevel: turnContext.thinkingLevel as LlmThinkingLevel,
      sessionMessages: context.messages,
      toolSchemas: turnContext.activeTools as unknown as AgentTool[],
      skillsBlock,
      mcpBlock,
      previousModelKey
    }
    const compiled = await this.contextBuilder.compile(input)
    this.lastModelKeys.set(key, currentModelKey)
    return compiled
  }

  private async createHarness(
    projectId: string,
    sessionId: string,
    selection?: HarnessSelection
  ): Promise<HarnessWithBlocks> {
    const [{ models, model, selection: sel }, session, piSkills] =
      await Promise.all([
        this.modelsService.getModelsAndDefault(selection),
        this.sessions.openSessionObject(projectId, sessionId),
        this.skills.getEnabledPiSkills().catch((error) => {
          console.warn('[harness-manager] 加载技能失败，降级为无技能:', error)
          return []
        })
      ])

    const skillsBlock = this.buildSkillsBlock(piSkills)

    // 云端 MCP：启用且探测成功的 server 注入为 pi 工具
    const mcpConfigs = await getMcpService()
      .listEnabledForAgent()
      .catch((error) => {
        console.warn('[harness-manager] 加载 MCP 失败，降级为无 MCP:', error)
        return []
      })
    const mcpTools = buildMcpTools(mcpConfigs)
    const mcpBlock = this.buildMcpBlock(mcpTools.length, mcpConfigs.length)

    const tools = [
      ...buildDreamAgentTools(),
      ...buildSkillTools(),
      ...buildWebTools(),
      ...buildTodoTools(),
      ...mcpTools
    ]
    const toolContext: DreamToolContext = {
      projectId,
      sessionId,
      runtime: this.toolRuntime,
      skills: piSkills,
      skillService: this.skills,
      todoService: this.todos
    }

    const thinkingLevel = (sel.thinkingLevel || 'medium') as ThinkingLevel

    const harness = new AgentHarness<DreamToolContext>({
      session,
      models: models as Models,
      model: model as Model<Api>,
      tools,
      toolContext,
      // P0：动态 systemPrompt 每轮重建（含 pins / todo / 显式引用数据分区），
      // 不再注册 replacement context hook。
      systemPrompt: async (turnContext) => {
        const compiled = await this.compileForHarness(
          projectId,
          sessionId,
          turnContext,
          skillsBlock,
          mcpBlock
        )
        return compiled.systemPrompt
      },
      resources: { skills: piSkills },
      thinkingLevel,
      steeringMode: 'one-at-a-time',
      followUpMode: 'one-at-a-time',
      streamOptions: {
        cacheRetention: 'short',
        metadata: { sessionId, projectId },
        maxRetries: 5,
        maxRetryDelayMs: 30_000,
        timeoutMs: 180_000
      }
    })

    return { harness, skillsBlock, mcpBlock }
  }

  /** 兼容旧调用：仅在 skills 变时重建，否则复用 */
  async recreate(
    projectId: string,
    sessionId: string,
    selection?: HarnessSelection
  ): Promise<DreamHarness> {
    // 不再无脑 dispose；交由 getOrCreate 按 structural signature 决定
    return this.getOrCreate(projectId, sessionId, selection)
  }

  /** 强制丢弃缓存并中止运行中的 harness（应用退出 / 明确重置） */
  invalidateAll(): void {
    this.clear()
  }

  /** 项目图变更（agent 工具写入等）后失效快照缓存 */
  invalidateProjectSnapshot(projectId: string): void {
    this.contextBuilder.invalidateProject(projectId)
  }

  /**
   * 设置变更后的非破坏性失效：只清缓存与 Models，不 abort 正在运行的 turn。
   * 下一轮 getOrCreate 会用最新 Provider / Key / Model 重建，当前轮不受影响。
   */
  invalidateCaches(): void {
    for (const c of this.cache.values()) {
      void c.promise.catch(() => undefined)
    }
    this.cache.clear()
    this.pending.clear()
    this.requestContexts.clear()
    this.lastModelKeys.clear()
    this.modelsService.reset()
  }

  /**
   * 预估下一次请求的总输入 token 与预算（供 compaction 决策）。
   * 使用最终编译上下文：system + tools + 动态块 + current user + 历史。
   */
  async estimateNextRequestTokens(
    projectId: string,
    sessionId: string,
    selection: HarnessSelection | undefined,
    userMessage: string,
    contextRefs: ContextRef[] = [],
    activeDocument?: ActiveDocumentRef
  ): Promise<{
    estimatedInputTokens: number
    budget: { contextWindow: number; outputReserve: number; safetyReserve: number; inputBudget: number; fixedTokens: number; availableForHistory: number }
    over: boolean
  }> {
    const harness = await this.getOrCreate(projectId, sessionId, selection)
    const key = harnessKey(projectId, sessionId)
    const cached = this.cache.get(key)
    const skillsBlock = cached?.skillsBlock ?? ''
    const mcpBlock = cached?.mcpBlock ?? ''
    const model = harness.getModel()
    const session = await this.sessions.openSessionObject(projectId, sessionId)
    const context = await session.buildContext()
    const runId = this.getPendingRequest(projectId, sessionId)?.runId ?? 'estimate'

    const input: CompileInput = {
      projectId,
      sessionId,
      runId,
      userMessage,
      contextRefs,
      activeDocument,
      model: {
        providerId: model.provider,
        modelId: model.id,
        api: model.api,
        contextWindow: model.contextWindow,
        maxOutputTokens: model.maxTokens
      },
      thinkingLevel: harness.getThinkingLevel() as unknown as LlmThinkingLevel,
      sessionMessages: context.messages,
      toolSchemas: harness.getTools() as unknown as AgentTool[],
      skillsBlock,
      mcpBlock
    }
    const estimate = await this.contextBuilder.estimateNextRequest(input)
    return {
      estimatedInputTokens: estimate.estimatedInputTokens,
      budget: estimate.budget,
      over: estimate.over
    }
  }
}
