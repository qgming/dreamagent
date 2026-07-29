/**
 * Pi Session 服务：每项目一个 JsonlSessionRepo
 */
import path from 'path'
import { JsonlSessionRepo, type Session } from '@earendil-works/pi-agent-core'
import { NodeExecutionEnv } from '@earendil-works/pi-agent-core/node'
import { createId } from '../../shared/ids'
import type {
  CreateSessionInput,
  SessionSummary,
  SessionView,
  UpdateSessionInput
} from '../../shared/ui-chat'
import { SESSION_ENTRY } from '../../shared/agent-events'
import type { ProjectService } from './project-service'
import { ensureDir } from './fs-utils'
import {
  countUserAssistant,
  parseSessionBranch,
  previewFromMessages,
  readPinsFromBranch
} from './pi-session-parser'

interface ProjectSessionRuntime {
  env: NodeExecutionEnv
  repo: JsonlSessionRepo
  /** sessionId → 打开中的 Session Promise，防并发双建 */
  sessions: Map<string, Promise<Session>>
}

/**
 * 项目级 pi 会话仓库
 */
export class PiSessionService {
  private runtimes = new Map<string, Promise<ProjectSessionRuntime>>()

  constructor(private readonly projects: ProjectService) {}

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
      // 与 list 一致：限定 cwd:'.'，避免扫错目录
      const metas = await rt.repo.list({ cwd: '.' }).catch(() => [])
      const hits = metas.filter((m) => m.id === sessionId)
      if (hits.length > 0) {
        // 取 path 最新的一条
        const best = hits.slice().sort((a, b) => (b.path || '').localeCompare(a.path || ''))[0]
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
    // 同 id 可能多文件，按 id 分组取 path 字典序最大（最新文件）
    const byId = new Map<string, (typeof metas)[number]>()
    for (const m of metas) {
      const prev = byId.get(m.id)
      if (!prev || (m.path || '') > (prev.path || '')) byId.set(m.id, m)
    }

    const summaries: SessionSummary[] = []
    for (const meta of byId.values()) {
      try {
        const session = await rt.repo.open(meta)
        // 缓存起来
        if (!rt.sessions.has(meta.id)) {
          rt.sessions.set(meta.id, Promise.resolve(session))
        }
        const branch = await session.getBranch().catch(() => [])
        const messages = parseSessionBranch(branch)
        const name = (await session.getSessionName().catch(() => undefined))?.trim()
        const title =
          name ||
          previewFromMessages(messages)?.slice(0, 30) ||
          '新对话'
        const updatedAt =
          branch.length > 0
            ? new Date(
                Math.max(
                  ...branch.map((e) => {
                    const ts = e.timestamp
                    if (typeof ts === 'number') return ts
                    if (typeof ts === 'string') {
                      const n = Date.parse(ts)
                      return Number.isNaN(n) ? 0 : n
                    }
                    return 0
                  })
                )
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
    return {
      id,
      title,
      messages: [],
      pinnedBeatIds: input.pinnedBeatIds ?? [],
      pinnedEntityIds: input.pinnedEntityIds ?? [],
      createdAt: meta.createdAt,
      updatedAt: meta.createdAt
    }
  }

  async open(projectId: string, sessionId: string): Promise<SessionView> {
    const session = await this.openSessionObject(projectId, sessionId)
    const branch = await session.getBranch()
    const messages = parseSessionBranch(branch)
    const pins = readPinsFromBranch(branch)
    const name = (await session.getSessionName().catch(() => undefined))?.trim()
    const meta = await session.getMetadata()
    const title =
      name || previewFromMessages(messages)?.slice(0, 30) || '新对话'
    const updatedAt =
      branch.length > 0
        ? new Date(
            Math.max(
              ...branch.map((e) => {
                const ts = e.timestamp
                if (typeof ts === 'number') return ts
                if (typeof ts === 'string') {
                  const n = Date.parse(ts)
                  return Number.isNaN(n) ? 0 : n
                }
                return 0
              })
            )
          ).toISOString()
        : meta.createdAt

    return {
      id: sessionId,
      title,
      messages,
      pinnedBeatIds: pins.pinnedBeatIds,
      pinnedEntityIds: pins.pinnedEntityIds,
      createdAt: meta.createdAt,
      updatedAt
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
    return this.open(projectId, sessionId)
  }

  async delete(projectId: string, sessionId: string): Promise<void> {
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
