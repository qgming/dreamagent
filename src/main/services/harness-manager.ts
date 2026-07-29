/**
 * 每会话一个 AgentHarness 缓存
 */
import { AgentHarness, formatSkillsForSystemPrompt } from '@earendil-works/pi-agent-core'
import type { Model, Models, Api } from '@earendil-works/pi-ai'
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
import type { TodoService } from './todo-service'
import { readPinsFromBranch } from './pi-session-parser'

type DreamHarness = AgentHarness<DreamToolContext>

function harnessKey(projectId: string, sessionId: string): string {
  return `${projectId}::${sessionId}`
}

interface CachedHarness {
  promise: Promise<DreamHarness>
  signature: string
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

  private async buildSystemPrompt(projectId: string, sessionId: string): Promise<string> {
    const snap = await this.projects.openProject(projectId)
    const session = await this.sessions.openSessionObject(projectId, sessionId)
    const branch = await session.getBranch().catch(() => [])
    const pins = readPinsFromBranch(branch)

    const outlineLines = snap.index.beats.order
      .map((id) => snap.beats[id])
      .filter(Boolean)
      .map((b) => {
        const summary = (b.content || '')
          .replace(/\[@([^\]]+)\]\((?:entity|beat):[^)]+\)/g, '@$1')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 60)
        return `- [${b.status}] ${b.title || '未命名'} (${b.id})${summary ? ` — ${summary}` : ''}`
      })

    const pinBeatLines = pins.pinnedBeatIds
      .map((id) => snap.beats[id])
      .filter(Boolean)
      .map((b) => {
        const body = (b.content || '').replace(/\s+/g, ' ').trim().slice(0, 200)
        return `### 节点「${b.title}」(${b.id}) [${b.status}]\n${body || '（空）'}`
      })

    const pinEntityLines = pins.pinnedEntityIds
      .map((id) => snap.entities[id])
      .filter(Boolean)
      .map((e) => {
        const body = (e.content || '').replace(/\s+/g, ' ').trim().slice(0, 200)
        return `### 实体「${e.name}」(${e.id}) [${e.status}]\n${body || '（空）'}`
      })

    const parts = [
      DREAM_AGENT_BASE_PROMPT,
      `## 当前项目\n标题：${snap.meta.title}\n路径：${snap.dirPath}`,
      outlineLines.length
        ? `## 节点列表\n${outlineLines.join('\n')}`
        : '## 节点列表\n（暂无节点，可提示用户先去「节点」页创建）',
      pinBeatLines.length ? `## 已钉选节点\n${pinBeatLines.join('\n\n')}` : '',
      pinEntityLines.length ? `## 已钉选实体\n${pinEntityLines.join('\n\n')}` : '',
      `## 会话\nsessionId=${sessionId}`
    ]
    return parts.filter(Boolean).join('\n\n')
  }

  private async configSignature(projectId: string, sessionId: string): Promise<string> {
    const [{ model }, view, enabledSkillIds] = await Promise.all([
      this.modelsService.getModelsAndDefault(),
      this.sessions.open(projectId, sessionId).catch(() => null),
      this.skills.getEnabledSkillIds().catch(() => [] as string[])
    ])
    return JSON.stringify({
      modelId: model.id,
      provider: model.provider,
      baseUrl: model.baseUrl,
      pinsB: view?.pinnedBeatIds ?? [],
      pinsE: view?.pinnedEntityIds ?? [],
      skills: enabledSkillIds
    })
  }

  async getOrCreate(projectId: string, sessionId: string): Promise<DreamHarness> {
    const key = harnessKey(projectId, sessionId)
    const signature = await this.configSignature(projectId, sessionId)

    const cached = this.cache.get(key)
    if (cached && cached.signature === signature) {
      return cached.promise
    }
    if (cached) {
      // 配置变了：丢弃缓存引用，旧 run 自然结束
      this.cache.delete(key)
    }

    const pending = this.pending.get(key)
    if (pending) return pending

    const createPromise = this.createHarness(projectId, sessionId, signature)
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

  private async createHarness(
    projectId: string,
    sessionId: string,
    _signature: string
  ): Promise<DreamHarness> {
    const [{ models, model }, session, basePrompt, piSkills] = await Promise.all([
      this.modelsService.getModelsAndDefault(),
      this.sessions.openSessionObject(projectId, sessionId),
      this.buildSystemPrompt(projectId, sessionId),
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

    const systemPrompt = [basePrompt, skillsBlock].filter(Boolean).join('\n\n')

    const tools = [
      ...buildDreamAgentTools(),
      ...buildSkillTools(),
      ...buildWebTools(),
      ...buildTodoTools()
    ]
    const toolContext: DreamToolContext = {
      projectId,
      sessionId,
      runtime: this.toolRuntime,
      skills: piSkills,
      skillService: this.skills,
      todoService: this.todos
    }

    // pi 0.82：不再传 env；工具上下文经 toolContext 注入
    const harness = new AgentHarness<DreamToolContext>({
      session,
      models: models as Models,
      model: model as Model<Api>,
      tools,
      toolContext,
      systemPrompt,
      resources: { skills: piSkills },
      // 中等思考档：支持 reasoning 的模型会流式输出 thinking 块
      thinkingLevel: 'medium',
      // 流式请求默认重试（pi-ai 默认 maxRetries=0）
      streamOptions: {
        cacheRetention: 'short',
        metadata: { sessionId, projectId },
        maxRetries: 5,
        // 服务端要求过长等待时仍有上限，避免卡死
        maxRetryDelayMs: 30_000,
        timeoutMs: 180_000
      }
    })

    return harness
  }

  /** 运行前刷新 system prompt（pins/节点可能已变） */
  async refreshSystemPrompt(projectId: string, sessionId: string): Promise<void> {
    const key = harnessKey(projectId, sessionId)
    const cached = this.cache.get(key)
    if (!cached) return
    try {
      const harness = await cached.promise
      // AgentHarness 无直接 setSystemPrompt；通过重建更稳妥
      // 这里用 signature 失配触发下次 getOrCreate 重建
      const freshSig = await this.configSignature(projectId, sessionId)
      // 附加 outline 时间戳迫使在 startTurn 时若需要可重建
      void harness
      void freshSig
    } catch {
      // ignore
    }
  }

  /** 强制重建 harness（startTurn 前调用，保证 prompt/tools 最新） */
  async recreate(projectId: string, sessionId: string): Promise<DreamHarness> {
    this.disposeSession(projectId, sessionId)
    return this.getOrCreate(projectId, sessionId)
  }
}
