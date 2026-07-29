import path from 'path'
import { promises as fs } from 'fs'
import { createId } from '../../shared/ids'
import type {
  Conversation,
  ConversationMessage,
  ConversationSummary,
  CreateConversationInput,
  ProjectIndex,
  UpdateConversationInput
} from '../../shared/project-types'
import type { ProjectService } from './project-service'
import {
  ensureDir,
  listFileNames,
  pathExists,
  readJsonFile,
  writeJsonAtomic
} from './fs-utils'

function nowIso(): string {
  return new Date().toISOString()
}

function toSummary(conv: Conversation): ConversationSummary {
  const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user')
  return {
    id: conv.id,
    title: conv.title.trim() || '新对话',
    preview: lastUser?.content?.slice(0, 80),
    messageCount: conv.messages.length,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt
  }
}

/**
 * 会话服务：每会话一个 JSON，正文不进 snapshot
 */
export class ConversationService {
  constructor(private readonly projects: ProjectService) {}

  private async dirOf(projectId: string): Promise<string> {
    const dirPath = await this.projects.resolveDir(projectId)
    const dir = this.projects.paths(dirPath).conversations
    await ensureDir(dir)
    return dir
  }

  private fileOf(dir: string, convId: string): string {
    return path.join(dir, `${convId}.json`)
  }

  private async readIndex(projectId: string): Promise<{ dirPath: string; index: ProjectIndex }> {
    const dirPath = await this.projects.resolveDir(projectId)
    const index =
      (await readJsonFile<ProjectIndex>(this.projects.paths(dirPath).index)) ??
      ({
        version: 2,
        beats: { order: [] },
        entities: { order: [] },
        chapters: { order: [] },
        conversations: { order: [] },
        updatedAt: nowIso()
      } as ProjectIndex)
    if (!index.conversations) index.conversations = { order: [] }
    if (!index.chapters) index.chapters = { order: [] }
    return { dirPath, index }
  }

  private async writeIndex(dirPath: string, index: ProjectIndex): Promise<void> {
    index.updatedAt = nowIso()
    index.version = 2
    await writeJsonAtomic(this.projects.paths(dirPath).index, index)
  }

  async list(projectId: string): Promise<ConversationSummary[]> {
    const dir = await this.dirOf(projectId)
    const { dirPath, index } = await this.readIndex(projectId)
    const files = await listFileNames(dir)
    const map: Record<string, ConversationSummary> = {}

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const conv = await readJsonFile<Conversation>(path.join(dir, file))
      if (!conv?.id) continue
      map[conv.id] = toSummary({
        ...conv,
        messages: conv.messages ?? [],
        pinnedBeatIds: conv.pinnedBeatIds ?? [],
        pinnedEntityIds: conv.pinnedEntityIds ?? []
      })
    }

    let order = [...(index.conversations?.order ?? [])]
    for (const id of Object.keys(map)) {
      if (!order.includes(id)) order.push(id)
    }
    order = order.filter((id) => map[id])
    // 最近更新优先
    order.sort((a, b) => (map[b].updatedAt || '').localeCompare(map[a].updatedAt || ''))

    if (JSON.stringify(order) !== JSON.stringify(index.conversations.order)) {
      index.conversations.order = order
      await this.writeIndex(dirPath, index)
    }

    return order.map((id) => map[id])
  }

  async create(projectId: string, input: CreateConversationInput = {}): Promise<Conversation> {
    const dir = await this.dirOf(projectId)
    const { dirPath, index } = await this.readIndex(projectId)
    const ts = nowIso()
    const conv: Conversation = {
      id: createId('conv'),
      title: input.title?.trim() || '新对话',
      messages: [],
      pinnedBeatIds: input.pinnedBeatIds ?? [],
      pinnedEntityIds: input.pinnedEntityIds ?? [],
      createdAt: ts,
      updatedAt: ts
    }
    await writeJsonAtomic(this.fileOf(dir, conv.id), conv)
    index.conversations.order = [conv.id, ...index.conversations.order.filter((id) => id !== conv.id)]
    await this.writeIndex(dirPath, index)
    await this.projects.touchProjectPublic(projectId)
    return conv
  }

  async open(projectId: string, conversationId: string): Promise<Conversation> {
    const dir = await this.dirOf(projectId)
    const file = this.fileOf(dir, conversationId)
    if (!(await pathExists(file))) throw new Error(`会话不存在: ${conversationId}`)
    const conv = await readJsonFile<Conversation>(file)
    if (!conv?.id) throw new Error(`会话不存在: ${conversationId}`)
    return {
      ...conv,
      messages: conv.messages ?? [],
      pinnedBeatIds: conv.pinnedBeatIds ?? [],
      pinnedEntityIds: conv.pinnedEntityIds ?? []
    }
  }

  async appendMessages(
    projectId: string,
    conversationId: string,
    messages: ConversationMessage[]
  ): Promise<Conversation> {
    const conv = await this.open(projectId, conversationId)
    conv.messages = [...conv.messages, ...messages]
    // 首条用户消息自动命名
    if (
      (conv.title === '新对话' || !conv.title.trim()) &&
      messages.some((m) => m.role === 'user' && m.content.trim())
    ) {
      const first = messages.find((m) => m.role === 'user' && m.content.trim())
      if (first) {
        conv.title = first.content.trim().slice(0, 30)
      }
    }
    conv.updatedAt = nowIso()
    const dir = await this.dirOf(projectId)
    await writeJsonAtomic(this.fileOf(dir, conv.id), conv)
    await this.bumpOrder(projectId, conv.id)
    await this.projects.touchProjectPublic(projectId)
    return conv
  }

  async replaceMessages(
    projectId: string,
    conversationId: string,
    messages: ConversationMessage[]
  ): Promise<Conversation> {
    const conv = await this.open(projectId, conversationId)
    conv.messages = messages
    conv.updatedAt = nowIso()
    const dir = await this.dirOf(projectId)
    await writeJsonAtomic(this.fileOf(dir, conv.id), conv)
    await this.bumpOrder(projectId, conv.id)
    await this.projects.touchProjectPublic(projectId)
    return conv
  }

  async update(
    projectId: string,
    conversationId: string,
    patch: UpdateConversationInput
  ): Promise<Conversation> {
    const conv = await this.open(projectId, conversationId)
    if (patch.title !== undefined) conv.title = patch.title.trim() || conv.title
    if (patch.pinnedBeatIds !== undefined) conv.pinnedBeatIds = patch.pinnedBeatIds
    if (patch.pinnedEntityIds !== undefined) conv.pinnedEntityIds = patch.pinnedEntityIds
    conv.updatedAt = nowIso()
    const dir = await this.dirOf(projectId)
    await writeJsonAtomic(this.fileOf(dir, conv.id), conv)
    await this.projects.touchProjectPublic(projectId)
    return conv
  }

  async delete(projectId: string, conversationId: string): Promise<void> {
    const dir = await this.dirOf(projectId)
    const file = this.fileOf(dir, conversationId)
    try {
      await fs.unlink(file)
    } catch {
      // 忽略
    }
    const { dirPath, index } = await this.readIndex(projectId)
    index.conversations.order = index.conversations.order.filter((id) => id !== conversationId)
    await this.writeIndex(dirPath, index)
    await this.projects.touchProjectPublic(projectId)
  }

  private async bumpOrder(projectId: string, conversationId: string): Promise<void> {
    const { dirPath, index } = await this.readIndex(projectId)
    index.conversations.order = [
      conversationId,
      ...index.conversations.order.filter((id) => id !== conversationId)
    ]
    await this.writeIndex(dirPath, index)
  }
}
