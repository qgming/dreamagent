/**
 * Legacy conversations → pi sessions 一次性迁移（P1）
 *
 * 规则（§19.2）：
 * - 先复制原 JSON 文件到 migration-backup。
 * - 为每个旧消息生成稳定 message ID、timestamp 和 parentId（pi Session 负责）。
 * - 保留原 role、正文和可见 reasoning；旧格式没有的 signature 标记 unavailable。
 * - 写入 migration version 和 source file hash。
 * - 迁移完成后重建 summary，不把旧 UI summary 当作模型事实。
 * - 支持幂等重跑和 dry-run 报告。
 */
import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import path from 'path'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Conversation, ConversationMessage } from '../../shared/project-types'
import type { ProjectService } from './project-service'
import type { PiSessionService } from './pi-session-service'
import { ensureDir } from './fs-utils'
import { SESSION_ENTRY } from '../../shared/agent-events'

export const LEGACY_MIGRATION_VERSION = 1
const MARKER_FILE = '.migration.json'
const BACKUP_DIR = 'migration-backup'

export interface LegacyMigrationReport {
  version: number
  migrated: number
  skipped: number
  failed: number
  dryRun: boolean
  details: Array<{
    id: string
    title: string
    status: 'migrated' | 'skipped' | 'failed'
    messageCount: number
    error?: string
  }>
}

interface MigrationMarker {
  version: number
  migratedAt: string
  files: Record<string, { hash: string; sessionId: string; messageCount: number }>
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
}

function tsToIso(value: string | undefined, fallback: number): string {
  if (!value) return new Date(fallback).toISOString()
  const n = Date.parse(value)
  return Number.isNaN(n) ? new Date(fallback).toISOString() : new Date(n).toISOString()
}

function buildUserMessage(message: ConversationMessage, fallbackTs: number): AgentMessage {
  const text = message.content ?? ''
  return {
    role: 'user',
    content: text,
    timestamp: Date.parse(tsToIso(message.createdAt, fallbackTs))
  }
}

function buildAssistantMessage(
  message: ConversationMessage,
  fallbackTs: number
): AgentMessage {
  const blocks: Array<Record<string, unknown>> = []
  // 可见 reasoning → thinking 块（旧格式 signature 标记 unavailable）
  const reasoning = (message as unknown as { reasoning?: string }).reasoning
  if (typeof reasoning === 'string' && reasoning.trim()) {
    blocks.push({ type: 'thinking', thinking: reasoning, signature: 'unavailable' })
  }
  // toolCalls → toolCall 块
  const callIds: string[] = []
  for (const tc of message.toolCalls ?? []) {
    callIds.push(tc.id)
    blocks.push({
      type: 'toolCall',
      id: tc.id,
      name: tc.name,
      arguments: tc.input ?? {}
    })
  }
  const text = message.content ?? ''
  if (text.trim()) blocks.push({ type: 'text', text })

  return {
    role: 'assistant',
    content: blocks as AgentMessage extends never ? never : unknown,
    api: 'openai-completions',
    provider: 'legacy',
    model: 'legacy',
    usage: {},
    stopReason: 'end_turn',
    timestamp: Date.parse(tsToIso(message.createdAt, fallbackTs))
  } as unknown as AgentMessage
}

function buildToolResultMessages(
  message: ConversationMessage,
  fallbackTs: number
): AgentMessage[] {
  const out: AgentMessage[] = []
  for (const tr of message.toolResults ?? []) {
    const contentText =
      tr.summary || (tr.ok ? '已完成' : `工具失败: ${tr.error ?? ''}`)
    out.push({
      role: 'toolResult',
      toolCallId: tr.callId,
      toolName: tr.name,
      content: [{ type: 'text', text: contentText }],
      details: tr.ok ? tr.data : undefined,
      isError: !tr.ok,
      timestamp: Date.parse(tsToIso(message.createdAt, fallbackTs))
    } as unknown as AgentMessage)
  }
  return out
}

/**
 * 把一条旧消息转换为 pi 消息序列：
 * - user → user
 * - assistant → assistant（含 thinking / toolCall 块）+ 紧随的 toolResult
 * - system / tool → 跳过（不把旧系统提示或工具记录重放为历史）
 */
function toPiMessages(
  message: ConversationMessage,
  fallbackTs: number
): AgentMessage[] {
  switch (message.role) {
    case 'user':
      return [buildUserMessage(message, fallbackTs)]
    case 'assistant': {
      const assistant = buildAssistantMessage(message, fallbackTs)
      const results = buildToolResultMessages(message, fallbackTs)
      return [assistant, ...results]
    }
    default:
      return []
  }
}

export class LegacyConversationMigrator {
  constructor(
    private readonly projects: ProjectService,
    private readonly sessions: PiSessionService
  ) {}

  private async markerPath(projectId: string): Promise<string> {
    const dir = await this.projects.resolveDir(projectId)
    return path.join(this.projects.paths(dir).conversations, MARKER_FILE)
  }

  private async readMarker(projectId: string): Promise<MigrationMarker | null> {
    try {
      const raw = await fs.readFile(await this.markerPath(projectId), 'utf8')
      return JSON.parse(raw) as MigrationMarker
    } catch {
      return null
    }
  }

  private async writeMarker(projectId: string, marker: MigrationMarker): Promise<void> {
    const file = await this.markerPath(projectId)
    await fs.writeFile(file, JSON.stringify(marker, null, 2), 'utf8')
  }

  /** 幂等 + dry-run 报告 */
  async migrateProject(
    projectId: string,
    options: { dryRun?: boolean } = {}
  ): Promise<LegacyMigrationReport> {
    const dryRun = Boolean(options.dryRun)
    const dir = await this.projects.resolveDir(projectId)
    const convDir = this.projects.paths(dir).conversations
    await ensureDir(convDir)

    const marker = (await this.readMarker(projectId)) ?? {
      version: LEGACY_MIGRATION_VERSION,
      migratedAt: '',
      files: {}
    }
    const report: LegacyMigrationReport = {
      version: LEGACY_MIGRATION_VERSION,
      migrated: 0,
      skipped: 0,
      failed: 0,
      dryRun,
      details: []
    }

    const files = await fs.readdir(convDir).catch(() => [] as string[])
    const convFiles = files
      .filter((f) => f.endsWith('.json') && f !== MARKER_FILE)
      .sort()

    for (const file of convFiles) {
      const full = path.join(convDir, file)
      let conv: Conversation
      let raw: string
      try {
        raw = await fs.readFile(full, 'utf8')
        conv = JSON.parse(raw) as Conversation
      } catch (error) {
        report.failed += 1
        report.details.push({
          id: file,
          title: file,
          status: 'failed',
          messageCount: 0,
          error: `读取失败: ${error instanceof Error ? error.message : String(error)}`
        })
        continue
      }
      const hash = sha256(raw)
      const prev = marker.files[file]
      if (prev && prev.hash === hash) {
        report.skipped += 1
        report.details.push({
          id: conv.id ?? file,
          title: conv.title ?? file,
          status: 'skipped',
          messageCount: prev.messageCount
        })
        continue
      }

      const messageCount = conv.messages?.length ?? 0
      if (dryRun) {
        report.migrated += 1
        report.details.push({
          id: conv.id ?? file,
          title: conv.title ?? file,
          status: 'migrated',
          messageCount
        })
        continue
      }

      try {
        // 1) 备份原文件
        const backupDir = path.join(convDir, BACKUP_DIR)
        await ensureDir(backupDir)
        const backupFile = path.join(backupDir, file)
        if (!(await fs.stat(backupFile).catch(() => null))) {
          await fs.copyFile(full, backupFile)
        }

        // 2) 打开（或创建）同名 pi session
        const rawId = conv.id ?? createFallbackId()
        const sessionId = /^(sess|conv)_/.test(rawId) ? rawId : `conv_${rawId}`
        const session = await this.sessions.openSessionObject(projectId, sessionId)

        // 幂等保护：目标 session 已有消息（说明之前迁移过或迁移被中断但已写入），
        // 不再重复追加，避免源文件被编辑后重跑产生重复历史。
        const existingEntries = await session.getEntries().catch(() => [])
        const existingMessages = existingEntries.filter(
          (e) => e.type === 'message'
        ).length
        if (existingMessages > 0) {
          marker.files[file] = { hash, sessionId, messageCount }
          report.skipped += 1
          report.details.push({
            id: sessionId,
            title: conv.title ?? file,
            status: 'skipped',
            messageCount
          })
          continue
        }

        // 3) 追加标题与 pin
        if (conv.title?.trim()) {
          await session.appendSessionName(conv.title.trim())
        }
        if (conv.pinnedBeatIds?.length) {
          await session.appendCustomEntry(SESSION_ENTRY.pinnedBeats, {
            ids: conv.pinnedBeatIds
          })
        }
        if (conv.pinnedEntityIds?.length) {
          await session.appendCustomEntry(SESSION_ENTRY.pinnedEntities, {
            ids: conv.pinnedEntityIds
          })
        }

        // 4) 追加消息（保留 role / 正文 / 可见 reasoning）
        const baseTs = Date.parse(conv.createdAt ?? '') || Date.now()
        for (let i = 0; i < conv.messages.length; i += 1) {
          const msg = conv.messages[i]!
          const fallbackTs = baseTs + i * 1000
          for (const piMsg of toPiMessages(msg, fallbackTs)) {
            await session.appendMessage(piMsg)
          }
        }

        // 5) 记录迁移标记
        marker.files[file] = { hash, sessionId, messageCount }
        report.migrated += 1
        report.details.push({
          id: sessionId,
          title: conv.title ?? file,
          status: 'migrated',
          messageCount
        })
      } catch (error) {
        report.failed += 1
        report.details.push({
          id: conv.id ?? file,
          title: conv.title ?? file,
          status: 'failed',
          messageCount,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }

    if (!dryRun && (report.migrated > 0 || report.failed > 0)) {
      marker.migratedAt = new Date().toISOString()
      await this.writeMarker(projectId, marker)
    }

    // 迁移后使会话缓存失效，让 UI 重新读取 pi session
    if (!dryRun && report.migrated > 0) {
      this.sessions.invalidateSessionCache(projectId)
    }

    return report
  }
}

function createFallbackId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
