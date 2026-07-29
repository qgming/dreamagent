/**
 * 占位 Agent Runner：无 LLM，启发式调用真实工具，跑通创作闭环
 */
import { createId } from '../../shared/ids'
import type { ReadBeatResult } from '../../shared/agent-tools'
import type {
  AgentRunTurnInput,
  AgentRunTurnResult,
  Beat,
  BeatStatus,
  BeatStatusUpdateRecord,
  ConversationMessage,
  ToolCallRecord,
  ToolResultRecord
} from '../../shared/project-types'
import type { ConversationService } from './conversation-service'
import type { ProjectService } from './project-service'
import { AgentToolRuntime } from './agent-tool-runtime'

function nowIso(): string {
  return new Date().toISOString()
}

function msg(
  role: ConversationMessage['role'],
  content: string,
  extra?: Partial<ConversationMessage>
): ConversationMessage {
  return {
    id: createId('msg'),
    role,
    content,
    createdAt: nowIso(),
    ...extra
  }
}

function callRec(name: string, input: Record<string, unknown>): ToolCallRecord {
  return {
    id: createId('call'),
    name,
    input,
    status: 'running'
  }
}

/**
 * 从用户文本匹配节点（标题包含 / 完全相等）
 */
function matchBeatsByText(text: string, beats: Beat[]): Beat[] {
  const q = text.trim().toLowerCase()
  if (!q) return []
  const exact = beats.filter((b) => b.title && q.includes(b.title.toLowerCase()))
  if (exact.length > 0) return exact
  return beats.filter((b) => b.title && b.title.toLowerCase().includes(q.slice(0, 12)))
}

/** 纯正文：禁止双链；关联走 sourceBeatIds / entityRefs 元数据 */
function buildArticleContent(title: string, reads: ReadBeatResult[]): string {
  const lines: string[] = []
  lines.push(title)
  lines.push('')
  for (const r of reads) {
    const name = r.title || '未命名'
    const body = (r.content || '（该节点尚无正文，以下为占位扩写。）')
      .replace(/\[@([^\]]+)\]\((?:entity|beat):[^)]+\)/g, '$1')
      .trim()
    const excerpt = body.length > 400 ? `${body.slice(0, 400)}…` : body
    lines.push(excerpt)
    lines.push('')
    if (r.outbound.entities.length > 0) {
      const ents = r.outbound.entities.map((e) => e.label).join('、')
      lines.push(`相关设定：${ents}。`)
      lines.push('')
    }
    lines.push(
      `围绕「${name}」的线索继续向前。风穿过街巷，把未说完的话吹向更远处。`
    )
    lines.push('')
  }
  if (reads.length === 0) {
    lines.push('尚无可用节点素材。请先在「节点」页创建大纲，或在对话中钉住相关节点后再试。')
    lines.push('')
  }
  return lines.join('\n').trim() + '\n'
}

function collectEntityRefs(reads: ReadBeatResult[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const r of reads) {
    for (const e of r.outbound.entities) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      ids.push(e.id)
    }
  }
  return ids
}

export class AgentPlaceholderRunner {
  private readonly tools: AgentToolRuntime

  constructor(
    private readonly projects: ProjectService,
    private readonly conversations: ConversationService
  ) {
    this.tools = new AgentToolRuntime(projects)
  }

  async runTurn(input: AgentRunTurnInput): Promise<AgentRunTurnResult> {
    const { projectId, conversationId, demo } = input
    const userText = (input.userMessage ?? '').trim()
    if (!demo && !userText) {
      throw new Error('消息不能为空')
    }

    const conv = await this.conversations.open(projectId, conversationId)
    const newMessages: ConversationMessage[] = []
    const writtenChapterIds: string[] = []
    const statusUpdates: BeatStatusUpdateRecord[] = []

    const effectiveText = demo
      ? userText || '演示一轮：读取大纲并写一篇文章'
      : userText

    // 1. 用户消息
    newMessages.push(msg('user', effectiveText))

    // 2. 读取快照与 pin
    let snap = await this.projects.openProject(projectId)
    const beats = snap.index.beats.order.map((id) => snap.beats[id]).filter(Boolean)
    const pinnedIds = conv.pinnedBeatIds.filter((id) => snap.beats[id])

    // 3. 解析目标节点
    let targetBeats: Beat[] = []
    if (demo) {
      targetBeats = beats.slice(0, Math.min(2, beats.length))
    } else {
      const matched = matchBeatsByText(effectiveText, beats)
      targetBeats = matched.length > 0 ? matched.slice(0, 3) : pinnedIds.map((id) => snap.beats[id]).filter(Boolean).slice(0, 3)
      if (targetBeats.length === 0 && beats.length > 0) {
        // 启发式：取未定稿的前两个
        targetBeats = beats
          .filter((b) => b.status === 'idea' || b.status === 'outline' || b.status === 'draft')
          .slice(0, 2)
        if (targetBeats.length === 0) targetBeats = beats.slice(0, 1)
      }
    }

    const wantsWrite =
      demo ||
      /写|文章|章|创作|扩写|成文|生成/.test(effectiveText) ||
      targetBeats.length > 0

    // 4. assistant 开场
    newMessages.push(
      msg(
        'assistant',
        targetBeats.length > 0
          ? `好的，我将基于「${targetBeats.map((b) => b.title || '未命名').join('、')}」整理素材${wantsWrite ? '并起草文章' : ''}。`
          : '我先查看项目大纲，再决定如何推进。'
      )
    )

    // 5. 若无目标，先 get_project_outline
    if (targetBeats.length === 0) {
      const call = callRec('get_project_outline', {})
      const result = await this.tools.execute(projectId, 'get_project_outline', {})
      call.status = result.ok ? 'done' : 'error'
      const toolResult: ToolResultRecord = {
        callId: call.id,
        name: call.name,
        ok: result.ok,
        summary: result.summary,
        data: result.data,
        error: result.error
      }
      newMessages.push(
        msg('assistant', result.ok ? '已获取项目大纲。' : `读取大纲失败：${result.summary}`, {
          toolCalls: [{ ...call, status: call.status }],
          toolResults: [toolResult]
        })
      )
      if (!wantsWrite || beats.length === 0) {
        newMessages.push(
          msg(
            'assistant',
            beats.length === 0
              ? '当前项目还没有节点。请先到「节点」页创建大纲，再回到创作页继续。'
              : '你可以钉住节点后说「按大纲写一篇文章」，或点击「演示一轮」。'
          )
        )
        const saved = await this.conversations.appendMessages(projectId, conversationId, newMessages)
        snap = await this.projects.openProject(projectId)
        return { conversation: saved, snapshot: snap, writtenChapterIds }
      }
      targetBeats = beats.slice(0, 1)
    }

    // 6. 逐个 read_beat
    const reads: ReadBeatResult[] = []
    for (const beat of targetBeats) {
      const call = callRec('read_beat', { beatId: beat.id })
      const result = await this.tools.execute(projectId, 'read_beat', { beatId: beat.id })
      call.status = result.ok ? 'done' : 'error'
      const toolResult: ToolResultRecord = {
        callId: call.id,
        name: call.name,
        ok: result.ok,
        summary: result.summary,
        data: result.data,
        error: result.error
      }
      newMessages.push(
        msg('assistant', result.ok ? `已读取节点「${beat.title || '未命名'}」。` : result.summary, {
          toolCalls: [{ ...call, status: call.status }],
          toolResults: [toolResult]
        })
      )
      if (result.ok && result.data) {
        reads.push(result.data as ReadBeatResult)
      }
    }

    // 7. 写文章（纯正文 + 元数据关联）
    if (wantsWrite) {
      const title =
        demo || /开场|第一篇|序/.test(effectiveText)
          ? '开场'
          : /第\s*([一二三四五六七八九十\d]+)\s*(?:篇|章|节)/.exec(effectiveText)?.[0] ||
            targetBeats.map((b) => b.title || '未命名').join(' · ') ||
            '未命名文章'

      const content = buildArticleContent(title, reads)
      const sourceBeatIds = targetBeats.map((b) => b.id)
      const entityRefs = collectEntityRefs(reads)
      const beatRefs = sourceBeatIds
      const call = callRec('write_chapter', {
        title,
        content,
        sourceBeatIds,
        entityRefs,
        beatRefs,
        conversationId,
        status: 'draft'
      })
      const result = await this.tools.execute(projectId, 'write_chapter', {
        title,
        content,
        sourceBeatIds,
        entityRefs,
        beatRefs,
        conversationId,
        status: 'draft'
      })
      call.status = result.ok ? 'done' : 'error'
      const chapter = result.data as { id?: string; title?: string } | undefined
      if (chapter?.id) writtenChapterIds.push(chapter.id)

      const toolResult: ToolResultRecord = {
        callId: call.id,
        name: call.name,
        ok: result.ok,
        summary: result.summary,
        data: result.data,
        error: result.error
      }
      newMessages.push(
        msg(
          'assistant',
          result.ok
            ? `已将「${chapter?.title ?? title}」写入文章（${content.length} 字）。`
            : `写文章失败：${result.summary}`,
          {
            toolCalls: [{ ...call, status: call.status }],
            toolResults: [toolResult],
            chapterIds: chapter?.id ? [chapter.id] : undefined
          }
        )
      )

      // 8. 推进源节点 status → draft
      if (result.ok) {
        for (const beat of targetBeats) {
          if (beat.status === 'final' || beat.status === 'draft') continue
          const from = beat.status
          const to: BeatStatus = 'draft'
          const stCall = callRec('update_beat_status', { beatId: beat.id, status: to })
          const stResult = await this.tools.execute(projectId, 'update_beat_status', {
            beatId: beat.id,
            status: to
          })
          stCall.status = stResult.ok ? 'done' : 'error'
          if (stResult.ok) {
            statusUpdates.push({ beatId: beat.id, from, to })
          }
          const stToolResult: ToolResultRecord = {
            callId: stCall.id,
            name: stCall.name,
            ok: stResult.ok,
            summary: stResult.summary,
            data: stResult.data,
            error: stResult.error
          }
          newMessages.push(
            msg('assistant', stResult.summary, {
              toolCalls: [{ ...stCall, status: stCall.status }],
              toolResults: [stToolResult],
              beatStatusUpdates: stResult.ok ? [{ beatId: beat.id, from, to }] : undefined
            })
          )
        }
      }
    }

    // 9. 收尾
    newMessages.push(
      msg(
        'assistant',
        writtenChapterIds.length > 0
          ? '本轮完成：可在左侧「文章」或右侧详情中查看。继续说「再写一篇」，或钉住更多节点再生成。'
          : '本轮已读取相关资料。若要成文，请说「写一篇文章」或点击「演示一轮」。'
      )
    )

    const saved = await this.conversations.appendMessages(projectId, conversationId, newMessages)
    snap = await this.projects.openProject(projectId)
    return { conversation: saved, snapshot: snap, writtenChapterIds }
  }
}
