/**
 * 每会话一个 AgentHarness 缓存（少 recreate，动态 systemPrompt / context）
 */
import {
  AgentHarness,
  formatSkillsForSystemPrompt
} from '@earendil-works/pi-agent-core'
import type { Model, Models, Api } from '@earendil-works/pi-ai'
import type { ThinkingLevel } from '@earendil-works/pi-agent-core'
import type { ProjectService } from './project-service'
import type { PiSessionService } from './pi-session-service'
import type { PiModelsService } from './pi-models'
import type { SkillService } from './skill-service'
import { AgentToolRuntime } from './agent-tool-runtime'
import {
  buildDreamAgentTools,
  DREAM_AGENT_BASE_PROMPT,
  type DreamToolContext
} from './pi-agent-tools'
import { buildSkillTools } from './skill-tools'
import { buildWebTools } from './web-tools'
import { buildTodoTools } from './todo-tools'
import { buildMcpTools } from './mcp-tools'
import { getMcpService } from './mcp-service'
import type { TodoService } from './todo-service'
import { readPinsFromBranch } from './pi-session-parser'
import type { LlmThinkingLevel } from '../../shared/llm-settings'

type DreamHarness = AgentHarness<DreamToolContext>

function harnessKey(projectId: string, sessionId: string): string {
  return `${projectId}::${sessionId}`
}

interface CachedHarness {
  promise: Promise<DreamHarness>
  /** 仅 skills 集合变化时重建；模型/思考用 setModel 热切换 */
  signature: string
}

export interface HarnessSelection {
  providerId?: string
  modelId?: string
  thinkingLevel?: LlmThinkingLevel
}

/**
 * Harness 管理器
 */
export class HarnessManager {
  private cache = new Map<string, CachedHarness>()
  private pending = new Map<string, Promise<DreamHarness>>()
  private readonly toolRuntime: AgentToolRuntime

  constructor(
    private readonly projects: ProjectService,
    private readonly sessions: PiSessionService,
    private readonly modelsService: PiModelsService,
    private readonly skills: SkillService,
    private readonly todos: TodoService
  ) {
    this.toolRuntime = new AgentToolRuntime(projects)
  }

  clear(): void {
    for (const c of this.cache.values()) {
      void c.promise.then((h) => h.abort()).catch(() => undefined)
    }
    this.cache.clear()
    this.pending.clear()
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
  }

  /**
   * L0+L1：稳定规则 + 压缩 outline（不含 pin 全文）
   */
  private async buildSystemPrompt(projectId: string, sessionId: string): Promise<string> {
    const snap = await this.projects.openProject(projectId)

    const outlineLines: string[] = []
    const walkOutline = (ids: string[], depth: number): void => {
      for (const id of ids) {
        const b = snap.beats[id]
        if (!b) continue
        const pad = '  '.repeat(depth)
        const title = (b.title || '未命名').replace(/\s+/g, ' ').trim().slice(0, 40)
        outlineLines.push(`${pad}- [${b.status}] ${title} (${b.id})`)
        walkOutline(snap.index.beats.children[id] ?? [], depth + 1)
      }
    }
    walkOutline(snap.index.beats.roots, 0)

    const parts = [
      DREAM_AGENT_BASE_PROMPT,
      `## 当前项目\n标题：${snap.meta.title}`,
      outlineLines.length
        ? `## 节点大纲（仅标题；细节请 read）\n${outlineLines.join('\n')}`
        : '## 节点大纲\n（暂无节点）',
      `## 会话\nsessionId=${sessionId}`
    ]
    return parts.filter(Boolean).join('\n\n')
  }

  /** 钉选 + todo 动态段（context hook 注入） */
  private async buildDynamicContextBlock(
    projectId: string,
    sessionId: string
  ): Promise<string> {
    const snap = await this.projects.openProject(projectId)
    const branch = await this.sessions
      .getActiveHistoryEntries(projectId, sessionId)
      .catch(() => [])
    const pins = readPinsFromBranch(branch)

    const pinBeatLines = pins.pinnedBeatIds
      .map((id) => snap.beats[id])
      .filter(Boolean)
      .map((b) => {
        const body = (b.content || '').replace(/\s+/g, ' ').trim().slice(0, 400)
        return `### 节点「${b.title}」(${b.id}) [${b.status}]\n${body || '（空）'}`
      })

    const pinEntityLines = pins.pinnedEntityIds
      .map((id) => snap.entities[id])
      .filter(Boolean)
      .map((e) => {
        const body = (e.content || '').replace(/\s+/g, ' ').trim().slice(0, 400)
        return `### 实体「${e.name}」(${e.id}) [${e.status}]\n${body || '（空）'}`
      })

    let todoBlock = ''
    try {
      const todos = await this.todos.load(projectId, sessionId)
      const open = todos.filter((t) => t.status !== 'completed' && t.status !== 'cancelled')
      if (open.length) {
        todoBlock =
          '## 未完成待办\n' +
          open
            .map((t) => `- [${t.status}] ${t.content || t.id}`)
            .join('\n')
      }
    } catch {
      // ignore
    }

    return [
      pinBeatLines.length ? `## 已钉选节点\n${pinBeatLines.join('\n\n')}` : '',
      pinEntityLines.length ? `## 已钉选实体\n${pinEntityLines.join('\n\n')}` : '',
      todoBlock
    ]
      .filter(Boolean)
      .join('\n\n')
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
      .then((harness) => {
        this.cache.set(key, { promise: Promise.resolve(harness), signature })
        this.pending.delete(key)
        return harness
      })
      .catch((err) => {
        this.pending.delete(key)
        throw err
      })

    this.pending.set(key, createPromise)
    return createPromise
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

  private async createHarness(
    projectId: string,
    sessionId: string,
    selection?: HarnessSelection
  ): Promise<DreamHarness> {
    const [{ models, model, selection: sel }, session, piSkills] =
      await Promise.all([
        this.modelsService.getModelsAndDefault(selection),
        this.sessions.openSessionObject(projectId, sessionId),
        this.skills.getEnabledPiSkills().catch((error) => {
          console.warn('[harness-manager] 加载技能失败，降级为无技能:', error)
          return []
        })
      ])

    const skillsBlock = [
      formatSkillsForSystemPrompt(piSkills),
      piSkills.length > 0
        ? '需要使用某个技能时：先 list_skills 确认可用技能，再 read_skill 读取完整说明和目录树；references 等子文件用 read_skill_file。不要假设技能全文已在系统提示中。可用 write_skill 创建/编辑/删除自定义技能（不能改内置）。'
        : '可用 write_skill 创建自定义技能；list_skills / read_skill 在有启用技能时可用。'
    ]
      .filter(Boolean)
      .join('\n\n')

    // 云端 MCP：启用且探测成功的 server 注入为 pi 工具
    const mcpConfigs = await getMcpService()
      .listEnabledForAgent()
      .catch((error) => {
        console.warn('[harness-manager] 加载 MCP 失败，降级为无 MCP:', error)
        return []
      })
    const mcpTools = buildMcpTools(mcpConfigs)
    const mcpBlock =
      mcpTools.length > 0
        ? `## 云端 MCP\n已接入 ${mcpConfigs.length} 个 MCP server、${mcpTools.length} 个工具（名称形如 mcp__server__tool）。按任务需要调用。`
        : ''

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
      // 动态 systemPrompt：每轮重建 L0+L1，pins 走 context hook
      systemPrompt: async () => {
        const base = await this.buildSystemPrompt(projectId, sessionId)
        return [base, skillsBlock, mcpBlock].filter(Boolean).join('\n\n')
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

    // 每轮注入钉选与 todo
    harness.on('context', async () => {
      try {
        const block = await this.buildDynamicContextBlock(projectId, sessionId)
        if (!block) return undefined
        return {
          messages: [
            {
              role: 'user' as const,
              content: `【系统动态上下文 — 仅供参考，勿原样复述】\n${block}`,
              timestamp: Date.now()
            }
          ]
        }
      } catch (error) {
        console.warn('[harness-manager] context hook 失败', error)
        return undefined
      }
    })

    return harness
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

  /** 强制丢弃缓存（设置页改供应商后） */
  invalidateAll(): void {
    this.clear()
  }
}
