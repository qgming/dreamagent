/**
 * Pi Session 服务：每项目一个 JsonlSessionRepo
 *
 * P1 修复：
 * - repo.list I/O 异常不得转成 [] 后建空会话；只有明确空目录才 create。
 * - 同 ID 多文件按最新 entry 时间戳选择（而不是只按 path 字典序）。
 * - contextPercent / providerPayloadTokens 基于最终编译上下文估算（含 system/tools）。
 */
import path from 'path'
import {
  JsonlSessionRepo,
  calculateContextTokens,
  estimateContextTokens,
  estimateTokens,
  type AgentMessage,
  type Session,
  type SessionTreeEntry
} from '@earendil-works/pi-agent-core'
import type { Usage } from '@earendil-works/pi-ai'
import type { JsonlSessionMetadata } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { createId } from '../../../shared/ids'
import type {
  CreateSessionInput,
  SessionTokenUsageDay,
  SessionSummary,
  SessionView,
  UpdateSessionInput
} from '../../../shared/ui-chat'
import { SESSION_ENTRY } from '../../../shared/agent-events'
import type { ProjectService } from '../project/project-service'
import { ensureDir } from '../utils/fs-utils'
import type { PiModelsService } from '../llm/pi-models'
import {
  AUTO_COMPACT_RATIO,
  type SessionContextUsage,
  type TokenUsageBreakdown
} from '../../../shared/context-usage'
import { computeBudget } from '../context/context-budget'
import type { ProjectActivityDay } from '../../../shared/activity'
import type { ActivityLedgerService } from '../project/activity-ledger'
import {
  countUserAssistant,
  parseSessionBranch,
  previewFromMessages,
  readPinsFromBranch,
  readTodosFromBranch,
  readGoalFromBranch
} from './pi-session-parser'
import type { SessionGoal } from '../../../shared/session-goals'

interface ProjectSessionRuntime {
  env: NodeExecutionEnv
  repo: JsonlSessionRepo
  /** sessionId → 打开中的 Session Promise，防并发双建 */
  sessions: Map<string, Promise<Session>>
}

function entryTimeMs(entry: { timestamp?: string | number }): number {
  const ts = entry.timestamp
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts
  if (typeof ts === 'string') {
    const n = Date.parse(ts)
    return Number.isNaN(n) ? 0 : n
  }
  return 0
}

/** 同 ID 多文件：取最新 entry 时间戳；打开失败时回退 createdAt */
async function pickBestMeta(
  rt: ProjectSessionRuntime,
  hits: JsonlSessionMetadata[]
): Promise<JsonlSessionMetadata> {
  if (hits.length <= 1) return hits[0]!
  let best = hits[0]!
  let bestTs = -1
  for (const meta of hits) {
    try {
      const session = await rt.repo.open(meta)
      const entries = await session.getEntries()
      const ts = entries.reduce((max, e) => Math.max(max, entryTimeMs(e)), 0)
      if (ts > bestTs) {
        bestTs = ts
        best = meta
      }
    } catch {
      const created = Date.parse(meta.createdAt)
      if (!Number.isNaN(created) && created > bestTs) {
        bestTs = created
        best = meta
      }
    }
  }
  return best
}

/** 基线 system + tools 估算（无 trace 时兜底，避免 UI 低估 Provider payload） */
const BASELINE_SYSTEM_TOKENS = 900
const BASELINE_TOOL_TOKENS = 700

/**
 * 项目级 pi 会话仓库
 */
export class PiSessionService {
  private runtimes = new Map<string, Promise<ProjectSessionRuntime>>()

  constructor(
    private readonly projects: ProjectService,
    private readonly models: PiModelsService,
    private readonly activityLedger: ActivityLedgerService
  ) {}

  private async activeHistory(session: Session): Promise<SessionTreeEntry[]> {
    const [entries, leafId] = await Promise.all([
      session.getEntries(),
      session.getLeafId()
    ])
    if (!leafId) return []

    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    const path: SessionTreeEntry[] = []
    const visited = new Set<string>()
    let current = byId.get(leafId)
    while (current && !visited.has(current.id)) {
      visited.add(current.id)
      path.unshift(current)
      current = current.parentId ? byId.get(current.parentId) : undefined
    }
    return path
  }

  /** 完整活动分支用于 UI 和 pins；Pi 的模型上下文仍使用 compact 后的 getBranch。 */
  async getActiveHistoryEntries(
    projectId: string,
    sessionId: string
  ): Promise<SessionTreeEntry[]> {
    const session = await this.openSessionObject(projectId, sessionId)
    return this.activeHistory(session)
  }

  private usageFromEntry(entry: SessionTreeEntry): Usage | undefined {
    if (entry.type === 'message' && entry.message.role === 'assistant') {
      return entry.message.usage
    }
    if (entry.type === 'compaction' || entry.type === 'branch_summary') {
      return entry.usage
    }
    return undefined
  }

  private addUsage(target: TokenUsageBreakdown, usage: Usage): void {
    target.input += usage.input || 0
    target.output += usage.output || 0
    target.cacheRead += usage.cacheRead || 0
    target.cacheWrite += usage.cacheWrite || 0
    target.reasoning += usage.reasoning || 0
  }

  async getUsage(
    projectId: string,
    sessionId: string,
    modelOverride?: { providerId?: string; modelId?: string },
    providerEstimate?: { estimatedInputTokens: number }
  ): Promise<SessionContextUsage> {
    const session = await this.openSessionObject(projectId, sessionId)
    const [branch, context, entries, stats, model] = await Promise.all([
      session.getBranch(),
      session.buildContext(),
      session.getEntries(),
      session.getSessionStats(),
      this.models.getCurrentModelInfo(modelOverride)
    ])

    const lastCompactionIndex = branch.findLastIndex(
      (entry) => entry.type === 'compaction'
    )
    const hasFreshAssistantUsage = branch
      .slice(lastCompactionIndex + 1)
      .some(
        (entry) =>
          entry.type === 'message' &&
          entry.message.role === 'assistant' &&
          entry.message.stopReason !== 'error' &&
          entry.message.stopReason !== 'aborted' &&
          calculateContextTokens(entry.message.usage) > 0
      )

    let contextTokens: number
    let estimated: boolean
    if (lastCompactionIndex >= 0 && !hasFreshAssistantUsage) {
      contextTokens = context.messages.reduce(
        (sum, message) => sum + estimateTokens(message as AgentMessage),
        0
      )
      estimated = true
    } else {
      const estimate = estimateContextTokens(context.messages)
      contextTokens = estimate.tokens
      estimated = estimate.lastUsageIndex === null
    }

    // providerPayloadTokens = 调用方传入的最终编译上下文估算（system+tools+current user+历史）；
    // 未提供时退化为 contextTokens + 基线 system/tool 估算。
    let providerPayloadTokens = contextTokens
    if (providerEstimate && providerEstimate.estimatedInputTokens > 0) {
      providerPayloadTokens = providerEstimate.estimatedInputTokens
    } else {
      providerPayloadTokens = contextTokens + BASELINE_SYSTEM_TOKENS + BASELINE_TOOL_TOKENS
    }

    const cumulative: TokenUsageBreakdown = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      reasoning: 0,
      total: stats.totalTokens,
      cost: stats.costTotal
    }
    for (const entry of entries) {
      const usage = this.usageFromEntry(entry)
      if (usage) this.addUsage(cumulative, usage)
    }

    const compactions = entries.filter((entry) => entry.type === 'compaction')
    const lastCompaction = compactions[compactions.length - 1]
    // 输出预留随模型真实输出上限变大后，自动压缩阈值收紧到“输入预算”以内，
    // 避免输入 + 输出同时逼近窗口导致 Provider 拒绝请求。
    const budget = computeBudget({
      contextWindow: model.contextWindow,
      maxOutputTokens: model.maxOutputTokens
    })
    const effectiveThreshold =
      model.contextWindow > 0
        ? Math.min(AUTO_COMPACT_RATIO, budget.inputBudget / model.contextWindow)
        : AUTO_COMPACT_RATIO
    return {
      model,
      contextTokens,
      providerPayloadTokens,
      contextPercent:
        model.contextWindow > 0
          ? Math.min((providerPayloadTokens / model.contextWindow) * 100, 100)
          : 0,
      autoCompactThreshold: effectiveThreshold,
      estimated,
      cumulative,
      compactionCount: compactions.length,
      lastCompactedAt: lastCompaction?.timestamp
    }
  }

  private async runtimeFor(projectId: string): Promise<ProjectSessionRuntime> {
    const cached = this.runtimes.get(projectId)
    if (cached) return cached

    const promise = (async () => {
      const dirPath = await this.projects.resolveDir(projectId)
      const sessionsRoot = this.projects.paths(dirPath).sessions
      await ensureDir(sessionsRoot)
      // cwd 用 sessionsRoot：相对路径解析到会话目录；create 时仍传 cwd:'.' 避免长路径编码
      const env = new NodeExecutionEnv({ cwd: sessionsRoot })
      const created = await env.createDir(sessionsRoot, { recursive: true })
      if (!created.ok) {
        console.warn('[pi-session] 创建 sessions 目录告警', created.error)
      }
      const repo = new JsonlSessionRepo({ fs: env, sessionsRoot })
      return { env, repo, sessions: new Map<string, Promise<Session>>() }
    })()

    this.runtimes.set(projectId, promise)
    promise.catch(() => this.runtimes.delete(projectId))
    return promise
  }

  /** 供 Harness 使用的 NodeExecutionEnv（cwd = 项目根，方便相对路径语义） */
  async getEnvForProject(projectId: string): Promise<NodeExecutionEnv> {
    const dirPath = await this.projects.resolveDir(projectId)
    return new NodeExecutionEnv({ cwd: dirPath })
  }

  async openSessionObject(projectId: string, sessionId: string): Promise<Session> {
    const rt = await this.runtimeFor(projectId)
    const cached = rt.sessions.get(sessionId)
    if (cached) return cached

    const promise = (async () => {
      // P1：repo.list I/O 异常必须向上抛（不允许静默建空会话遮蔽旧历史）。
      // 只有明确返回空列表（目录存在但无会话）才 create。
      const metas = await rt.repo.list({ cwd: '.' })
      const hits = metas.filter((m) => m.id === sessionId)
      if (hits.length > 0) {
        const best = await pickBestMeta(rt, hits)
        return rt.repo.open(best)
      }
      return rt.repo.create({ cwd: '.', id: sessionId })
    })()

    rt.sessions.set(sessionId, promise)
    promise.catch(() => rt.sessions.delete(sessionId))
    return promise
  }

  invalidateSessionCache(projectId: string, sessionId?: string): void {
    const rtPromise = this.runtimes.get(projectId)
    if (!rtPromise) return
    void rtPromise.then((rt) => {
      if (sessionId) rt.sessions.delete(sessionId)
      else rt.sessions.clear()
    })
  }

  async list(projectId: string): Promise<SessionSummary[]> {
    const rt = await this.runtimeFor(projectId)
    // 显式传 cwd:'.'：与 create 时 encodeCwd 一致，直接扫会话子目录，
    // 避免 list() 无 cwd 时依赖 listDir 返回的 path 字段在 Windows 上不可靠。
    const metas = await rt.repo.list({ cwd: '.' }).catch((error) => {
      console.warn('[pi-session] list 失败', error)
      return []
    })
    // 同 id 可能多文件：按最新 entry 时间戳选，避免字典序误选旧文件
    const byId = new Map<string, JsonlSessionMetadata>()
    for (const meta of metas) {
      const group = [...byId.values()].filter((m) => m.id === meta.id)
      if (group.length === 0) {
        byId.set(meta.id, meta)
        continue
      }
      const best = await pickBestMeta(rt, [meta, ...group])
      byId.set(meta.id, best)
    }

    const summaries: SessionSummary[] = []
    for (const meta of byId.values()) {
      try {
        const session = await rt.repo.open(meta)
        // 缓存起来
        if (!rt.sessions.has(meta.id)) {
          rt.sessions.set(meta.id, Promise.resolve(session))
        }
        const branch = await this.activeHistory(session).catch(() => [])
        const messages = parseSessionBranch(branch)
        const name = (await session.getSessionName().catch(() => undefined))?.trim()
        const title =
          name ||
          previewFromMessages(messages)?.slice(0, 30) ||
          '新对话'
        const updatedAt =
          branch.length > 0
            ? new Date(
                Math.max(...branch.map((e) => entryTimeMs(e)))
              ).toISOString()
            : meta.createdAt

        summaries.push({
          id: meta.id,
          title,
          preview: previewFromMessages(messages),
          messageCount: countUserAssistant(messages),
          createdAt: meta.createdAt,
          updatedAt
        })
      } catch (error) {
        console.warn('[pi-session] list 跳过损坏会话', meta.id, error)
      }
    }

    // 最近更新优先
    summaries.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    return summaries
  }

  /**
   * 把尚未记账的模型用量 entry 追加到本地台账。台账只增不减，
   * 因此后续删除会话不会影响已经产生的 Token 统计。
   */
  async tokenActivity(projectId: string): Promise<SessionTokenUsageDay[]> {
    const rt = await this.runtimeFor(projectId)
    const metas = await rt.repo.list({ cwd: '.' }).catch((error) => {
      console.warn('[pi-session] tokenActivity list 失败', error)
      return []
    })
    const byId = new Map<string, JsonlSessionMetadata>()
    for (const meta of metas) {
      const group = [...byId.values()].filter((m) => m.id === meta.id)
      if (group.length === 0) {
        byId.set(meta.id, meta)
        continue
      }
      const best = await pickBestMeta(rt, [meta, ...group])
      byId.set(meta.id, best)
    }

    const usageEntries: Array<{ id: string; date: string; tokens: number }> = []
    for (const meta of byId.values()) {
      try {
        const session = await rt.repo.open(meta)
        const sessionEntries = await session.getEntries()
        for (const entry of sessionEntries) {
          const usage = this.usageFromEntry(entry)
          if (!usage?.totalTokens) continue
          const date = new Date(entry.timestamp)
          if (Number.isNaN(date.getTime())) continue
          const key = [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
          ].join('-')
          usageEntries.push({
            id: `${meta.id}:${entry.id}`,
            date: key,
            tokens: usage.totalTokens
          })
        }
      } catch (error) {
        console.warn('[pi-session] tokenActivity 跳过损坏会话', meta.id, error)
      }
    }

    const projectDir = await this.projects.resolveDir(projectId)
    return this.activityLedger.captureTokens(projectDir, usageEntries)
  }

  /** 同步并返回首页两张热力图的项目活动数据。 */
  async activity(projectId: string): Promise<ProjectActivityDay[]> {
    await Promise.all([
      this.projects.writingActivity(projectId),
      this.tokenActivity(projectId)
    ])
    return this.activityLedger.activity(await this.projects.resolveDir(projectId))
  }

  async create(projectId: string, input: CreateSessionInput = {}): Promise<SessionView> {
    const id = createId('sess')
    const session = await this.openSessionObject(projectId, id)
    const title = input.title?.trim() || '新对话'
    // 始终写入 session_name，保证 list 能稳定读到标题
    await session.appendSessionName(title)
    if (input.pinnedBeatIds?.length) {
      await session.appendCustomEntry(SESSION_ENTRY.pinnedBeats, {
        ids: input.pinnedBeatIds
      })
    }
    if (input.pinnedEntityIds?.length) {
      await session.appendCustomEntry(SESSION_ENTRY.pinnedEntities, {
        ids: input.pinnedEntityIds
      })
    }
    const meta = await session.getMetadata()
    const usage = await this.getUsage(projectId, id)
    return {
      id,
      title,
      messages: [],
      pinnedBeatIds: input.pinnedBeatIds ?? [],
      pinnedEntityIds: input.pinnedEntityIds ?? [],
      todos: [],
      goal: null,
      createdAt: meta.createdAt,
      updatedAt: meta.createdAt,
      usage
    }
  }

  async open(projectId: string, sessionId: string): Promise<SessionView> {
    const session = await this.openSessionObject(projectId, sessionId)
    const branch = await this.activeHistory(session)
    const messages = parseSessionBranch(branch)
    const pins = readPinsFromBranch(branch)
    const todos = readTodosFromBranch(branch)
    const goal = readGoalFromBranch(branch)
    const name = (await session.getSessionName().catch(() => undefined))?.trim()
    const meta = await session.getMetadata()
    const title =
      name || previewFromMessages(messages)?.slice(0, 30) || '新对话'
    const updatedAt =
      branch.length > 0
        ? new Date(Math.max(...branch.map((e) => entryTimeMs(e)))).toISOString()
        : meta.createdAt
    const usage = await this.getUsage(projectId, sessionId)

    return {
      id: sessionId,
      title,
      messages,
      pinnedBeatIds: pins.pinnedBeatIds,
      pinnedEntityIds: pins.pinnedEntityIds,
      todos,
      goal,
      createdAt: meta.createdAt,
      updatedAt,
      usage
    }
  }

  async update(
    projectId: string,
    sessionId: string,
    patch: UpdateSessionInput
  ): Promise<SessionView> {
    const session = await this.openSessionObject(projectId, sessionId)
    if (typeof patch.title === 'string' && patch.title.trim()) {
      await session.appendSessionName(patch.title.trim())
    }
    if (patch.pinnedBeatIds) {
      await session.appendCustomEntry(SESSION_ENTRY.pinnedBeats, {
        ids: patch.pinnedBeatIds
      })
    }
    if (patch.pinnedEntityIds) {
      await session.appendCustomEntry(SESSION_ENTRY.pinnedEntities, {
        ids: patch.pinnedEntityIds
      })
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'goal')) {
      await session.appendCustomEntry(SESSION_ENTRY.goal, patch.goal ?? null)
    }
    return this.open(projectId, sessionId)
  }

  async delete(projectId: string, sessionId: string): Promise<void> {
    // 删除源文件前先落盘其中所有尚未记账的用量。
    await this.tokenActivity(projectId)
    const rt = await this.runtimeFor(projectId)
    const metas = await rt.repo.list({ cwd: '.' }).catch(() => [])
    const hits = metas.filter((m) => m.id === sessionId)
    for (const meta of hits) {
      try {
        await rt.repo.delete(meta)
      } catch (error) {
        console.warn('[pi-session] 删除会话失败', sessionId, error)
      }
    }
    rt.sessions.delete(sessionId)
  }

  /** 自动标题：仅当仍为默认名时 */
  async maybeAutotitle(
    projectId: string,
    sessionId: string,
    userText: string
  ): Promise<void> {
    const session = await this.openSessionObject(projectId, sessionId)
    const name = (await session.getSessionName().catch(() => undefined))?.trim()
    if (name && name !== '新对话') return
    const title = userText.trim().slice(0, 30)
    if (!title) return
    await session.appendSessionName(title)
  }
}
