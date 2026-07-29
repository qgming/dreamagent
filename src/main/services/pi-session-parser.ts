/**
 * 将 pi Session branch 解析为 UI 消息投影
 */
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { SessionTreeEntry } from '@earendil-works/pi-agent-core'
import type {
  UiBeatStatusUpdate,
  UiChatMessage,
  UiChatPart,
  UiToolCallPart
} from '../../shared/ui-chat'
import { SESSION_ENTRY } from '../../shared/agent-events'

function isoFromTs(ts: number | string | undefined): string {
  if (typeof ts === 'number' && Number.isFinite(ts)) {
    return new Date(ts).toISOString()
  }
  if (typeof ts === 'string' && ts.trim()) {
    const d = new Date(ts)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
    return ts
  }
  return new Date().toISOString()
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

function textFromUserContent(content: AgentMessage extends never ? never : unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block && typeof block === 'object' && (block as { type?: string }).type === 'text') {
      const t = (block as { text?: string }).text
      if (typeof t === 'string') parts.push(t)
    }
  }
  return parts.join('')
}

function summaryFromToolResult(message: {
  content?: unknown
  details?: unknown
  isError?: boolean
}): string {
  if (message.details && typeof message.details === 'object') {
    const d = message.details as Record<string, unknown>
    if (typeof d.summary === 'string' && d.summary.trim()) return d.summary
  }
  if (Array.isArray(message.content)) {
    const texts = message.content
      .filter((b): b is { type: 'text'; text: string } =>
        Boolean(b && typeof b === 'object' && (b as { type?: string }).type === 'text')
      )
      .map((b) => b.text)
    if (texts.length) return texts.join('\n').slice(0, 200)
  }
  return message.isError ? '工具执行失败' : '已完成'
}

function extractChapterIds(details: unknown): string[] {
  if (!details || typeof details !== 'object') return []
  const d = details as Record<string, unknown>
  // AgentToolResult 包装：{ ok, summary, data }
  const data = (d.data && typeof d.data === 'object' ? d.data : d) as Record<string, unknown>
  if (typeof data.id === 'string' && data.id.startsWith('chap_')) return [data.id]
  if (Array.isArray(d.chapterIds)) {
    return d.chapterIds.filter((x): x is string => typeof x === 'string')
  }
  return []
}

function extractBeatStatus(details: unknown): UiBeatStatusUpdate | null {
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
 * 将 session branch 转为 UI 消息列表
 * - user → 一条
 * - assistant 连续轮次可合并为一条（含 tool-call parts）
 * - toolResult 回填到对应 tool-call
 */
export function parseSessionBranch(branch: SessionTreeEntry[]): UiChatMessage[] {
  const toolResults = new Map<
    string,
    { summary: string; details?: unknown; isError: boolean; content?: unknown }
  >()

  for (const entry of branch) {
    if (entry.type !== 'message') continue
    const message = entry.message as AgentMessage
    if (message.role !== 'toolResult') continue
    const tr = message as {
      toolCallId: string
      content?: unknown
      details?: unknown
      isError?: boolean
    }
    toolResults.set(tr.toolCallId, {
      summary: summaryFromToolResult(tr),
      details: tr.details,
      isError: Boolean(tr.isError),
      content: tr.content
    })
  }

  const out: UiChatMessage[] = []
  let pendingAssistant: UiChatMessage | null = null

  const flushAssistant = (): void => {
    if (pendingAssistant) {
      out.push(pendingAssistant)
      pendingAssistant = null
    }
  }

  for (const entry of branch) {
    if (entry.type !== 'message') continue
    const message = entry.message as AgentMessage
    const entryId = entry.id
    const msgTs = (message as { timestamp?: number | string }).timestamp
    const createdAt = isoFromTs(
      msgTs !== undefined ? msgTs : entry.timestamp
    )
    void entryTimeMs

    if (message.role === 'user') {
      flushAssistant()
      const text = textFromUserContent((message as { content?: unknown }).content)
      out.push({
        id: entryId,
        role: 'user',
        createdAt,
        parts: text ? [{ type: 'text', text }] : [],
        status: 'complete'
      })
      continue
    }

    if (message.role === 'assistant') {
      const am = message as {
        content: Array<{ type: string; text?: string; thinking?: string; id?: string; name?: string; arguments?: Record<string, unknown> }>
        errorMessage?: string
        stopReason?: string
      }
      const parts: UiChatPart[] = []
      const chapterIds: string[] = []
      const beatStatusUpdates: UiBeatStatusUpdate[] = []

      for (const block of am.content ?? []) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text) {
          parts.push({ type: 'text', text: block.text })
        } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking) {
          parts.push({ type: 'reasoning', text: block.thinking })
        } else if (block.type === 'toolCall' && block.id && block.name) {
          const tr = toolResults.get(block.id)
          const toolPart: UiToolCallPart = {
            type: 'tool-call',
            toolCallId: block.id,
            toolName: block.name,
            args: (block.arguments ?? {}) as Record<string, unknown>,
            status: tr ? (tr.isError ? 'error' : 'done') : 'done',
            result: tr?.details ?? tr?.content,
            isError: tr?.isError,
            summary: tr?.summary
          }
          parts.push(toolPart)
          if (tr?.details) {
            if (
              block.name === 'write' ||
              block.name === 'edit' ||
              block.name === 'write_chapter'
            ) {
              chapterIds.push(...extractChapterIds(tr.details))
            }
            if (
              block.name === 'write' ||
              block.name === 'edit' ||
              block.name === 'update_beat_status'
            ) {
              const st = extractBeatStatus(tr.details)
              if (st) beatStatusUpdates.push(st)
            }
          }
        }
      }

      if (parts.length === 0 && am.errorMessage) {
        parts.push({ type: 'text', text: am.errorMessage })
      }

      if (parts.length === 0) continue

      // 连续 assistant 合并为一条，便于 UI 呈现一整轮
      if (pendingAssistant) {
        pendingAssistant.parts.push(...parts)
        if (chapterIds.length) {
          pendingAssistant.chapterIds = [
            ...(pendingAssistant.chapterIds ?? []),
            ...chapterIds
          ]
        }
        if (beatStatusUpdates.length) {
          pendingAssistant.beatStatusUpdates = [
            ...(pendingAssistant.beatStatusUpdates ?? []),
            ...beatStatusUpdates
          ]
        }
      } else {
        pendingAssistant = {
          id: entryId,
          role: 'assistant',
          createdAt,
          parts,
          status: am.stopReason === 'error' ? 'error' : 'complete',
          chapterIds: chapterIds.length ? chapterIds : undefined,
          beatStatusUpdates: beatStatusUpdates.length ? beatStatusUpdates : undefined
        }
      }
      continue
    }

    // toolResult 不单独成条
  }

  flushAssistant()
  return out
}

/** 从 branch 读取最后一条指定 custom entry 的 data */
export function readLastCustomData<T>(
  branch: SessionTreeEntry[],
  customType: string
): T | undefined {
  let last: T | undefined
  for (const entry of branch) {
    if (entry.type !== 'custom') continue
    const c = entry as { customType?: string; data?: unknown }
    if (c.customType === customType && c.data !== undefined) {
      last = c.data as T
    }
  }
  return last
}

export function readPinsFromBranch(branch: SessionTreeEntry[]): {
  pinnedBeatIds: string[]
  pinnedEntityIds: string[]
} {
  const beats = readLastCustomData<{ ids?: string[] }>(branch, SESSION_ENTRY.pinnedBeats)
  const entities = readLastCustomData<{ ids?: string[] }>(branch, SESSION_ENTRY.pinnedEntities)
  return {
    pinnedBeatIds: Array.isArray(beats?.ids) ? beats!.ids.filter(Boolean) : [],
    pinnedEntityIds: Array.isArray(entities?.ids) ? entities!.ids.filter(Boolean) : []
  }
}

/** 从消息中取预览文本 */
export function previewFromMessages(messages: UiChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    for (const p of m.parts) {
      if (p.type === 'text' && p.text.trim()) return p.text.trim().slice(0, 80)
    }
  }
  return undefined
}

export function countUserAssistant(messages: UiChatMessage[]): number {
  return messages.length
}
