/**
 * Agent 工具运行时：在真实 ProjectService 上执行工具
 */
import type {
  AgentToolName,
  AgentToolResult,
  LinkRef,
  OutlineBeatItem,
  ReadBeatResult,
  ReadEntityResult,
  WriteChapterToolInput
} from '../../shared/agent-tools'
import type {
  Beat,
  BeatStatus,
  Chapter,
  ChapterStatus,
  CreateBeatInput,
  CreateEntityInput,
  Entity,
  EntityStatus,
  ProjectSnapshot,
  UpdateBeatInput,
  UpdateChapterInput,
  UpdateEntityInput
} from '../../shared/project-types'
import type { ProjectService } from './project-service'
import {
  applyExactEdits,
  assertNoChapterDualLinks,
  parseGraphPath
} from './graph-path'

function plainSummary(content: string, max = 80): string {
  const text = content
    .replace(/\[@([^\]]+)\]\((?:entity|beat):[^)]+\)/g, '@$1')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

function beatLabel(b: Beat): LinkRef {
  return { id: b.id, label: b.title || '未命名节点' }
}

function entityLabel(e: Entity): LinkRef {
  return { id: e.id, label: e.name || '未命名实体' }
}

function chapterLabel(c: Chapter): LinkRef {
  return { id: c.id, label: c.title || '未命名文章' }
}

/** 摘要里回显双链解析结果，便于核对 entityRefs/beatRefs 是否完整 */
function refsSummary(item: {
  entityRefs?: string[]
  beatRefs?: string[]
}): string {
  const e = item.entityRefs?.length ?? 0
  const b = item.beatRefs?.length ?? 0
  if (e === 0 && b === 0) return '无双链'
  return `实体链 ${e} · 节点链 ${b}`
}

/**
 * 从 snapshot 计算入链（O(n)）
 */
export function computeInbound(
  snapshot: ProjectSnapshot,
  targetType: 'beat' | 'entity',
  targetId: string
): {
  beats: LinkRef[]
  entities: LinkRef[]
  chapters: LinkRef[]
} {
  const beats: LinkRef[] = []
  const entities: LinkRef[] = []
  const chapters: LinkRef[] = []

  for (const id of snapshot.index.beats.order) {
    const b = snapshot.beats[id]
    if (!b || b.id === targetId) continue
    const refs = targetType === 'beat' ? b.beatRefs : b.entityRefs
    if (refs?.includes(targetId)) beats.push(beatLabel(b))
  }
  for (const id of snapshot.index.entities.order) {
    const e = snapshot.entities[id]
    if (!e || e.id === targetId) continue
    const refs = targetType === 'beat' ? e.beatRefs : e.entityRefs
    if (refs?.includes(targetId)) entities.push(entityLabel(e))
  }
  for (const id of snapshot.index.chapters.order) {
    const c = snapshot.chapters[id]
    if (!c) continue
    const refs = targetType === 'beat' ? c.beatRefs : c.entityRefs
    if (refs?.includes(targetId) || (targetType === 'beat' && c.sourceBeatIds?.includes(targetId))) {
      chapters.push(chapterLabel(c))
    }
  }
  return { beats, entities, chapters }
}

export class AgentToolRuntime {
  constructor(private readonly projects: ProjectService) {}

  async execute(
    projectId: string,
    name: AgentToolName,
    input: Record<string, unknown>
  ): Promise<AgentToolResult> {
    try {
      switch (name) {
        case 'list':
          return await this.listPath(projectId, input)
        case 'read':
          return await this.readPath(projectId, String(input.path ?? ''))
        case 'write':
          return await this.writePath(projectId, input)
        case 'edit':
          return await this.editPath(projectId, input)
        case 'delete':
          return await this.deletePath(projectId, String(input.path ?? ''))
        // 网络工具在 web-tools 中直接执行，不经 runtime
        case 'web_search':
        case 'web_fetch':
          return {
            ok: false,
            summary: `工具 ${name} 应由 web-tools 执行`,
            error: 'wrong_runtime'
          }
        default:
          return { ok: false, summary: `未知工具: ${name as string}`, error: 'unknown_tool' }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { ok: false, summary: message, error: message }
    }
  }

  private async listPath(
    projectId: string,
    input: Record<string, unknown>
  ): Promise<AgentToolResult> {
    const pathRaw = String(input.path ?? input.type ?? 'beats')
    const parsed = parseGraphPath(pathRaw)
    const query =
      typeof input.query === 'string' ? input.query.trim().toLowerCase() : ''
    const limit =
      typeof input.limit === 'number' && input.limit > 0 ? Math.floor(input.limit) : undefined
    const status = typeof input.status === 'string' ? input.status : undefined

    if (parsed.kind === 'outline') return this.getOutline(projectId)
    if (parsed.kind === 'item') {
      // list 传了具体 id：退化为 read
      return this.readPath(projectId, pathRaw)
    }

    if (parsed.type === 'beat') {
      const result = await this.listBeats(projectId, status as BeatStatus | undefined)
      if (!result.ok || !result.data) return result
      let items = result.data
      if (query) items = items.filter((i) => i.title.toLowerCase().includes(query))
      if (limit) items = items.slice(0, limit)
      return { ok: true, summary: `共 ${items.length} 个节点`, data: items }
    }
    if (parsed.type === 'entity') {
      const result = await this.listEntities(projectId, status as EntityStatus | undefined)
      if (!result.ok || !result.data) return result
      let items = result.data
      if (query) items = items.filter((i) => i.name.toLowerCase().includes(query))
      if (limit) items = items.slice(0, limit)
      return { ok: true, summary: `共 ${items.length} 个实体`, data: items }
    }
    const result = await this.listChapters(projectId)
    if (!result.ok || !result.data) return result
    let items = result.data
    if (status) items = items.filter((i) => i.status === status)
    if (query) items = items.filter((i) => i.title.toLowerCase().includes(query))
    if (limit) items = items.slice(0, limit)
    return { ok: true, summary: `共 ${items.length} 章`, data: items }
  }

  private async readPath(projectId: string, pathRaw: string): Promise<AgentToolResult> {
    const parsed = parseGraphPath(pathRaw)
    if (parsed.kind === 'outline') return this.getOutline(projectId)
    if (parsed.kind === 'collection') {
      return this.listPath(projectId, { path: pathRaw })
    }
    if (parsed.type === 'beat') return this.readBeat(projectId, parsed.id)
    if (parsed.type === 'entity') return this.readEntity(projectId, parsed.id)
    return this.readChapter(projectId, parsed.id)
  }

  private async writePath(
    projectId: string,
    input: Record<string, unknown>
  ): Promise<AgentToolResult> {
    const pathRaw = typeof input.path === 'string' ? input.path.trim() : ''
    if (pathRaw) {
      const parsed = parseGraphPath(pathRaw)
      if (parsed.kind !== 'item') {
        return { ok: false, summary: 'write 覆盖需要具体对象 path', error: 'invalid_path' }
      }
      if (parsed.type === 'beat') {
        const patch: UpdateBeatInput = {}
        if (typeof input.title === 'string') patch.title = input.title
        if (typeof input.content === 'string') patch.content = input.content
        if (typeof input.status === 'string') patch.status = input.status as BeatStatus
        return this.updateBeatTool(projectId, parsed.id, patch)
      }
      if (parsed.type === 'entity') {
        const patch: UpdateEntityInput = {}
        if (typeof input.name === 'string') patch.name = input.name
        if (typeof input.title === 'string' && !patch.name) patch.name = input.title
        if (typeof input.content === 'string') patch.content = input.content
        if (typeof input.status === 'string') patch.status = input.status as EntityStatus
        return this.updateEntityTool(projectId, parsed.id, patch)
      }
      // chapter 覆盖
      if (typeof input.content === 'string') assertNoChapterDualLinks(input.content)
      const chapterPatch: UpdateChapterInput = {}
      if (typeof input.title === 'string') chapterPatch.title = input.title
      if (typeof input.content === 'string') chapterPatch.content = input.content
      if (typeof input.status === 'string') {
        chapterPatch.status = input.status as 'draft' | 'final'
      }
      if (Array.isArray(input.sourceBeatIds)) {
        chapterPatch.sourceBeatIds = input.sourceBeatIds as string[]
      }
      if (Array.isArray(input.entityRefs)) {
        chapterPatch.entityRefs = input.entityRefs as string[]
      }
      if (Array.isArray(input.beatRefs)) chapterPatch.beatRefs = input.beatRefs as string[]
      if (typeof input.conversationId === 'string') {
        chapterPatch.conversationId = input.conversationId
      }
      return this.updateChapterTool(projectId, parsed.id, chapterPatch)
    }

    // 创建
    const type = String(input.type ?? '').toLowerCase()
    if (type === 'beat') {
      return this.createBeat(projectId, {
        title: String(input.title ?? ''),
        content: typeof input.content === 'string' ? input.content : undefined,
        status: input.status as BeatStatus | undefined,
        afterId: typeof input.afterId === 'string' ? input.afterId : undefined
      })
    }
    if (type === 'entity') {
      return this.createEntity(projectId, {
        name: String(input.name ?? input.title ?? ''),
        content: typeof input.content === 'string' ? input.content : undefined,
        status: input.status as EntityStatus | undefined
      })
    }
    if (type === 'chapter') {
      const content = String(input.content ?? '')
      assertNoChapterDualLinks(content)
      return this.writeChapter(projectId, {
        title: String(input.title ?? ''),
        content,
        status: (input.status as ChapterStatus | undefined) ?? 'draft',
        sourceBeatIds: input.sourceBeatIds as string[] | undefined,
        entityRefs: input.entityRefs as string[] | undefined,
        beatRefs: input.beatRefs as string[] | undefined,
        conversationId: input.conversationId as string | undefined
      })
    }
    return {
      ok: false,
      summary: 'write 创建需要 type=beat|entity|chapter，覆盖需要 path',
      error: 'invalid_input'
    }
  }

  private async editPath(
    projectId: string,
    input: Record<string, unknown>
  ): Promise<AgentToolResult> {
    const pathRaw = String(input.path ?? '')
    const parsed = parseGraphPath(pathRaw)
    if (parsed.kind !== 'item') {
      return { ok: false, summary: 'edit 需要具体对象 path', error: 'invalid_path' }
    }

    const editsRaw = Array.isArray(input.edits) ? input.edits : []
    const edits = editsRaw
      .filter((e): e is { oldText: string; newText: string } => {
        return (
          Boolean(e) &&
          typeof e === 'object' &&
          typeof (e as { oldText?: unknown }).oldText === 'string' &&
          typeof (e as { newText?: unknown }).newText === 'string'
        )
      })
      .map((e) => ({ oldText: e.oldText, newText: e.newText }))

    if (parsed.type === 'beat') {
      const snap = await this.projects.openProject(projectId)
      const beat = snap.beats[parsed.id]
      if (!beat) return { ok: false, summary: `节点不存在: ${parsed.id}`, error: 'not_found' }
      const patch: UpdateBeatInput = {}
      if (typeof input.title === 'string') patch.title = input.title
      if (typeof input.status === 'string') patch.status = input.status as BeatStatus
      if (edits.length) {
        patch.content = applyExactEdits(beat.content || '', edits)
      } else if (typeof input.content === 'string') {
        patch.content = input.content
      }
      if (Object.keys(patch).length === 0) {
        return { ok: false, summary: '没有可更新的字段', error: 'empty_patch' }
      }
      // 仅改 status 时走状态摘要
      if (patch.status && !patch.content && !patch.title) {
        return this.updateBeatStatus(projectId, parsed.id, patch.status)
      }
      return this.updateBeatTool(projectId, parsed.id, patch)
    }

    if (parsed.type === 'entity') {
      const snap = await this.projects.openProject(projectId)
      const entity = snap.entities[parsed.id]
      if (!entity) return { ok: false, summary: `实体不存在: ${parsed.id}`, error: 'not_found' }
      const patch: UpdateEntityInput = {}
      if (typeof input.name === 'string') patch.name = input.name
      if (typeof input.title === 'string' && !patch.name) patch.name = input.title
      if (typeof input.status === 'string') patch.status = input.status as EntityStatus
      if (edits.length) {
        patch.content = applyExactEdits(entity.content || '', edits)
      } else if (typeof input.content === 'string') {
        patch.content = input.content
      }
      return this.updateEntityTool(projectId, parsed.id, patch)
    }

    // chapter
    const chapter = await this.projects.getChapter(projectId, parsed.id)
    const patch: UpdateChapterInput = {}
    if (typeof input.title === 'string') patch.title = input.title
    if (typeof input.status === 'string') {
      patch.status = input.status as 'draft' | 'final'
    }
    if (edits.length) {
      patch.content = applyExactEdits(chapter.content || '', edits)
    } else if (typeof input.content === 'string') {
      patch.content = input.content
    }
    if (patch.content !== undefined) assertNoChapterDualLinks(patch.content)
    if (Array.isArray(input.sourceBeatIds)) {
      patch.sourceBeatIds = input.sourceBeatIds as string[]
    }
    if (Array.isArray(input.entityRefs)) patch.entityRefs = input.entityRefs as string[]
    if (Array.isArray(input.beatRefs)) patch.beatRefs = input.beatRefs as string[]
    return this.updateChapterTool(projectId, parsed.id, patch)
  }

  private async deletePath(projectId: string, pathRaw: string): Promise<AgentToolResult> {
    const parsed = parseGraphPath(pathRaw)
    if (parsed.kind !== 'item') {
      return { ok: false, summary: 'delete 需要具体对象 path', error: 'invalid_path' }
    }
    if (parsed.type === 'beat') return this.deleteBeat(projectId, parsed.id)
    if (parsed.type === 'entity') return this.deleteEntity(projectId, parsed.id)
    return this.deleteChapter(projectId, parsed.id)
  }

  private async listBeats(
    projectId: string,
    status?: BeatStatus
  ): Promise<AgentToolResult<Array<{ id: string; title: string; status: BeatStatus }>>> {
    const snap = await this.projects.openProject(projectId)
    let items = snap.index.beats.order
      .map((id) => snap.beats[id])
      .filter(Boolean)
      .map((b) => ({ id: b.id, title: b.title, status: b.status }))
    if (status) items = items.filter((i) => i.status === status)
    return {
      ok: true,
      summary: `共 ${items.length} 个节点`,
      data: items
    }
  }

  private async readBeat(
    projectId: string,
    beatId: string
  ): Promise<AgentToolResult<ReadBeatResult>> {
    if (!beatId) return { ok: false, summary: '缺少 beatId', error: 'missing_beatId' }
    const snap = await this.projects.openProject(projectId)
    const beat = snap.beats[beatId]
    if (!beat) return { ok: false, summary: `节点不存在: ${beatId}`, error: 'not_found' }

    const outboundEntities = (beat.entityRefs ?? [])
      .map((id) => snap.entities[id])
      .filter(Boolean)
      .map(entityLabel)
    const outboundBeats = (beat.beatRefs ?? [])
      .map((id) => snap.beats[id])
      .filter(Boolean)
      .map(beatLabel)
    const inbound = computeInbound(snap, 'beat', beatId)

    const suggestedReads: ReadBeatResult['suggestedReads'] = []
    const seen = new Set<string>([beatId])
    for (const r of [...outboundBeats, ...inbound.beats]) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      suggestedReads.push({ type: 'beat', id: r.id, label: r.label })
    }
    for (const r of [...outboundEntities, ...inbound.entities]) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      suggestedReads.push({ type: 'entity', id: r.id, label: r.label })
    }

    const data: ReadBeatResult = {
      id: beat.id,
      title: beat.title,
      status: beat.status,
      content: beat.content,
      outbound: { entities: outboundEntities, beats: outboundBeats },
      inbound,
      suggestedReads: suggestedReads.slice(0, 12)
    }
    return {
      ok: true,
      summary: `已读「${beat.title || '未命名'}」· 出链 ${outboundEntities.length + outboundBeats.length} · 入链 ${inbound.beats.length + inbound.entities.length + inbound.chapters.length}`,
      data
    }
  }

  private async listEntities(
    projectId: string,
    status?: EntityStatus
  ): Promise<AgentToolResult<Array<{ id: string; name: string; status: EntityStatus }>>> {
    const snap = await this.projects.openProject(projectId)
    let items = snap.index.entities.order
      .map((id) => snap.entities[id])
      .filter(Boolean)
      .map((e) => ({ id: e.id, name: e.name, status: e.status }))
    if (status) items = items.filter((i) => i.status === status)
    return { ok: true, summary: `共 ${items.length} 个实体`, data: items }
  }

  private async readEntity(
    projectId: string,
    entityId: string
  ): Promise<AgentToolResult<ReadEntityResult>> {
    if (!entityId) return { ok: false, summary: '缺少 entityId', error: 'missing_entityId' }
    const snap = await this.projects.openProject(projectId)
    const entity = snap.entities[entityId]
    if (!entity) return { ok: false, summary: `实体不存在: ${entityId}`, error: 'not_found' }

    const outboundEntities = (entity.entityRefs ?? [])
      .map((id) => snap.entities[id])
      .filter(Boolean)
      .map(entityLabel)
    const outboundBeats = (entity.beatRefs ?? [])
      .map((id) => snap.beats[id])
      .filter(Boolean)
      .map(beatLabel)
    const inbound = computeInbound(snap, 'entity', entityId)

    const suggestedReads: ReadEntityResult['suggestedReads'] = []
    const seen = new Set<string>([entityId])
    for (const r of [...outboundBeats, ...inbound.beats]) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      suggestedReads.push({ type: 'beat', id: r.id, label: r.label })
    }
    for (const r of [...outboundEntities, ...inbound.entities]) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
      suggestedReads.push({ type: 'entity', id: r.id, label: r.label })
    }

    return {
      ok: true,
      summary: `已读「${entity.name}」`,
      data: {
        id: entity.id,
        name: entity.name,
        status: entity.status,
        content: entity.content,
        outbound: { entities: outboundEntities, beats: outboundBeats },
        inbound,
        suggestedReads: suggestedReads.slice(0, 12)
      }
    }
  }

  private async createBeat(
    projectId: string,
    input: CreateBeatInput
  ): Promise<AgentToolResult<Beat>> {
    const title = String(input?.title ?? '').trim()
    if (!title) return { ok: false, summary: '缺少 title', error: 'invalid_input' }
    const { created } = await this.projects.createBeat(projectId, {
      title,
      content: input.content,
      status: input.status,
      afterId: input.afterId
    })
    return {
      ok: true,
      summary: `已创建节点「${created.title}」(${created.id}) · ${refsSummary(created)}`,
      data: created
    }
  }

  private async updateBeatTool(
    projectId: string,
    beatId: string,
    patch: UpdateBeatInput
  ): Promise<AgentToolResult<Beat>> {
    if (!beatId) return { ok: false, summary: '缺少 beatId', error: 'missing_beatId' }
    const clean: UpdateBeatInput = {}
    if (typeof patch.title === 'string') clean.title = patch.title
    if (typeof patch.content === 'string') clean.content = patch.content
    if (patch.status) clean.status = patch.status
    if (Object.keys(clean).length === 0) {
      return { ok: false, summary: '没有可更新的字段', error: 'empty_patch' }
    }
    const snap = await this.projects.updateBeat(projectId, beatId, clean)
    const beat = snap.beats[beatId]
    return {
      ok: true,
      summary: `已更新节点「${beat?.title ?? beatId}」 · ${beat ? refsSummary(beat) : '无双链'}`,
      data: beat
    }
  }

  private async deleteBeat(
    projectId: string,
    beatId: string
  ): Promise<AgentToolResult<{ id: string; title?: string }>> {
    if (!beatId) return { ok: false, summary: '缺少 beatId', error: 'missing_beatId' }
    const snap = await this.projects.openProject(projectId)
    const beat = snap.beats[beatId]
    if (!beat) return { ok: false, summary: `节点不存在: ${beatId}`, error: 'not_found' }
    const title = beat.title
    await this.projects.deleteBeat(projectId, beatId)
    return {
      ok: true,
      summary: `已删除节点「${title || '未命名'}」`,
      data: { id: beatId, title }
    }
  }

  private async createEntity(
    projectId: string,
    input: CreateEntityInput
  ): Promise<AgentToolResult<Entity>> {
    const name = String(input?.name ?? '').trim()
    if (!name) return { ok: false, summary: '缺少 name', error: 'invalid_input' }
    const { created } = await this.projects.createEntity(projectId, {
      name,
      content: input.content,
      status: input.status
    })
    return {
      ok: true,
      summary: `已创建实体「${created.name}」(${created.id}) · ${refsSummary(created)}`,
      data: created
    }
  }

  private async updateEntityTool(
    projectId: string,
    entityId: string,
    patch: UpdateEntityInput
  ): Promise<AgentToolResult<Entity>> {
    if (!entityId) return { ok: false, summary: '缺少 entityId', error: 'missing_entityId' }
    const clean: UpdateEntityInput = {}
    if (typeof patch.name === 'string') clean.name = patch.name
    if (typeof patch.content === 'string') clean.content = patch.content
    if (patch.status) clean.status = patch.status
    if (Object.keys(clean).length === 0) {
      return { ok: false, summary: '没有可更新的字段', error: 'empty_patch' }
    }
    const snap = await this.projects.updateEntity(projectId, entityId, clean)
    const entity = snap.entities[entityId]
    return {
      ok: true,
      summary: `已更新实体「${entity?.name ?? entityId}」 · ${entity ? refsSummary(entity) : '无双链'}`,
      data: entity
    }
  }

  private async deleteEntity(
    projectId: string,
    entityId: string
  ): Promise<AgentToolResult<{ id: string; name?: string }>> {
    if (!entityId) return { ok: false, summary: '缺少 entityId', error: 'missing_entityId' }
    const snap = await this.projects.openProject(projectId)
    const entity = snap.entities[entityId]
    if (!entity) return { ok: false, summary: `实体不存在: ${entityId}`, error: 'not_found' }
    const name = entity.name
    await this.projects.deleteEntity(projectId, entityId)
    return {
      ok: true,
      summary: `已删除实体「${name || '未命名'}」`,
      data: { id: entityId, name }
    }
  }

  private async deleteChapter(
    projectId: string,
    chapterId: string
  ): Promise<AgentToolResult<{ id: string; title?: string }>> {
    if (!chapterId) return { ok: false, summary: '缺少 chapterId', error: 'missing_chapterId' }
    const snap = await this.projects.openProject(projectId)
    const chapter = snap.chapters[chapterId]
    if (!chapter) return { ok: false, summary: `文章不存在: ${chapterId}`, error: 'not_found' }
    const title = chapter.title
    await this.projects.deleteChapter(projectId, chapterId)
    return {
      ok: true,
      summary: `已删除文章「${title || '未命名'}」`,
      data: { id: chapterId, title }
    }
  }

  private async updateBeatStatus(
    projectId: string,
    beatId: string,
    status: BeatStatus
  ): Promise<AgentToolResult<{ id: string; from: BeatStatus; to: BeatStatus }>> {
    if (!beatId || !status) {
      return { ok: false, summary: '缺少 beatId 或 status', error: 'invalid_input' }
    }
    const snap = await this.projects.openProject(projectId)
    const beat = snap.beats[beatId]
    if (!beat) return { ok: false, summary: `节点不存在: ${beatId}`, error: 'not_found' }
    const from = beat.status
    if (from === status) {
      return {
        ok: true,
        summary: `「${beat.title}」已是 ${status}`,
        data: { id: beatId, from, to: status }
      }
    }
    await this.projects.updateBeat(projectId, beatId, { status })
    return {
      ok: true,
      summary: `「${beat.title}」 ${from} → ${status}`,
      data: { id: beatId, from, to: status }
    }
  }

  private async writeChapter(
    projectId: string,
    input: WriteChapterToolInput
  ): Promise<AgentToolResult<Chapter>> {
    if (!input?.title || input.content === undefined) {
      return { ok: false, summary: '缺少 title 或 content', error: 'invalid_input' }
    }
    const sourceBeatIds = input.sourceBeatIds ?? []
    const beatRefs = input.beatRefs ?? sourceBeatIds
    const entityRefs = input.entityRefs ?? []
    if (input.chapterId) {
      const snap = await this.projects.updateChapter(projectId, input.chapterId, {
        title: input.title,
        content: input.content,
        status: input.status,
        sourceBeatIds,
        entityRefs,
        beatRefs,
        conversationId: input.conversationId
      })
      const chapter = snap.chapters[input.chapterId]
      return {
        ok: true,
        summary: `已更新文章「${chapter?.title ?? input.title}」· ${input.content.length} 字`,
        data: chapter
      }
    }
    const snap = await this.projects.createChapter(projectId, {
      title: input.title,
      content: input.content,
      status: input.status ?? 'draft',
      sourceBeatIds,
      entityRefs,
      beatRefs,
      conversationId: input.conversationId
    })
    const chapter = snap.created
    return {
      ok: true,
      summary: `已写入文章「${chapter.title}」· ${input.content.length} 字`,
      data: chapter
    }
  }

  private async listChapters(
    projectId: string
  ): Promise<
    AgentToolResult<Array<{ id: string; title: string; status: string; sourceBeatIds: string[] }>>
  > {
    const snap = await this.projects.openProject(projectId)
    const items = snap.index.chapters.order
      .map((id) => snap.chapters[id])
      .filter(Boolean)
      .map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        sourceBeatIds: c.sourceBeatIds
      }))
    return { ok: true, summary: `共 ${items.length} 章`, data: items }
  }

  private async readChapter(
    projectId: string,
    chapterId: string
  ): Promise<AgentToolResult<Chapter>> {
    if (!chapterId) return { ok: false, summary: '缺少 chapterId', error: 'missing_chapterId' }
    const chapter = await this.projects.getChapter(projectId, chapterId)
    return {
      ok: true,
      summary: `已读文章「${chapter.title}」· ${chapter.content.length} 字`,
      data: chapter
    }
  }

  private async updateChapterTool(
    projectId: string,
    chapterId: string,
    patch: UpdateChapterInput
  ): Promise<AgentToolResult<Chapter>> {
    if (!chapterId) return { ok: false, summary: '缺少 chapterId', error: 'missing_chapterId' }
    const snap = await this.projects.updateChapter(projectId, chapterId, patch)
    const chapter = snap.chapters[chapterId]
    return {
      ok: true,
      summary: `已更新文章「${chapter?.title ?? chapterId}」`,
      data: chapter
    }
  }

  private async getOutline(
    projectId: string
  ): Promise<AgentToolResult<OutlineBeatItem[]>> {
    const snap = await this.projects.openProject(projectId)
    const items: OutlineBeatItem[] = snap.index.beats.order
      .map((id) => snap.beats[id])
      .filter(Boolean)
      .map((b) => ({
        id: b.id,
        title: b.title,
        status: b.status,
        summary: plainSummary(b.content)
      }))
    return { ok: true, summary: `节点 ${items.length} 项`, data: items }
  }
}
