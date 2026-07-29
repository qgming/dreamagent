import path from 'path'
import { promises as fs } from 'fs'
import {
  breakLinksInContent,
  extractRefIds,
  renameLinksInContent
} from '../../shared/mentions'
import {
  createId,
  toBeatFileName,
  toChapterFileName,
  toEntityFileName,
  toFolderName
} from '../../shared/ids'
import {
  INDEX_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  migrateLegacyBeatStatus,
  normalizeBeatStatus,
  normalizeChapterStatus,
  normalizeEntityStatus,
  normalizeProjectIndex,
  type Beat,
  type Chapter,
  type ConversationSummary,
  type CreateBeatInput,
  type CreateChapterInput,
  type CreateEntityInput,
  type CreateMutationResult,
  type CreateProjectInput,
  type Entity,
  type ProjectIndex,
  type ProjectMeta,
  type ProjectSnapshot,
  type ReorderBeatsInput,
  type UpdateBeatInput,
  type UpdateChapterInput,
  type UpdateEntityInput
} from '../../shared/project-types'
import type { LibraryService } from './library-service'
import {
  ensureDir,
  listFileNames,
  pathExists,
  readJsonFile,
  removeDir,
  writeJsonAtomic
} from './fs-utils'

function nowIso(): string {
  return new Date().toISOString()
}

function emptyIndex(): ProjectIndex {
  return {
    version: INDEX_SCHEMA_VERSION,
    beats: { order: [] },
    entities: { order: [] },
    chapters: { order: [] },
    conversations: { order: [] },
    updatedAt: nowIso()
  }
}

function refsFromContent(
  content: string,
  selfId?: string
): {
  entityRefs: string[]
  beatRefs: string[]
} {
  return {
    entityRefs: extractRefIds(content, 'entity', selfId),
    beatRefs: extractRefIds(content, 'beat', selfId)
  }
}

/**
 * 项目服务：节点 / 实体 / 章节；双链 beat↔entity / beat↔beat / entity↔entity / chapter
 */
export class ProjectService {
  /** 按项目目录串行化 index.json 写入，避免 Windows 并发 rename ENOENT */
  private indexWriteQueues = new Map<string, Promise<void>>()
  /** 按项目目录串行化所有会改 index / 文件的写操作，避免并行 create 丢 id */
  private mutationQueues = new Map<string, Promise<unknown>>()

  constructor(private readonly library: LibraryService) {}

  /**
   * 同一项目目录内的写操作串行执行。
   * 读操作（open/list）不进队，避免阻塞查询。
   */
  private enqueueMutation<T>(dirPath: string, task: () => Promise<T>): Promise<T> {
    const prev = this.mutationQueues.get(dirPath) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(task)
    this.mutationQueues.set(
      dirPath,
      next.finally(() => {
        if (this.mutationQueues.get(dirPath) === next) {
          this.mutationQueues.delete(dirPath)
        }
      })
    )
    return next
  }

  paths(dirPath: string) {
    return {
      meta: path.join(dirPath, 'project.json'),
      index: path.join(dirPath, 'index.json'),
      beats: path.join(dirPath, 'beats'),
      entities: path.join(dirPath, 'entities'),
      documents: path.join(dirPath, 'documents'),
      chapters: path.join(dirPath, 'documents', 'chapters'),
      /** @deprecated 旧会话 JSON；新会话走 pi sessions */
      conversations: path.join(dirPath, 'conversations'),
      /** pi JsonlSessionRepo 根目录 */
      sessions: path.join(dirPath, 'sessions')
    }
  }

  private beatPath(dirPath: string, fileName: string): string {
    return path.join(dirPath, 'beats', fileName)
  }

  private entityPath(dirPath: string, fileName: string): string {
    return path.join(dirPath, 'entities', fileName)
  }

  private chapterPath(dirPath: string, fileName: string): string {
    return path.join(dirPath, 'documents', 'chapters', fileName)
  }

  async resolveDir(projectId: string): Promise<string> {
    const dir = await this.library.findProjectDirById(projectId)
    if (!dir) throw new Error(`项目不存在: ${projectId}`)
    return dir
  }

  private async readMeta(dirPath: string): Promise<ProjectMeta> {
    const meta = await readJsonFile<ProjectMeta>(this.paths(dirPath).meta)
    if (!meta) throw new Error(`无法读取 project.json: ${dirPath}`)
    return meta
  }

  private async readIndex(dirPath: string): Promise<ProjectIndex> {
    const raw = await readJsonFile<Partial<ProjectIndex>>(this.paths(dirPath).index)
    const { index, needsWrite } = normalizeProjectIndex(raw)
    if (needsWrite) {
      await this.writeIndex(dirPath, index)
    }
    return index
  }

  private async writeMeta(dirPath: string, meta: ProjectMeta): Promise<void> {
    await writeJsonAtomic(this.paths(dirPath).meta, meta)
  }

  private async writeIndex(dirPath: string, index: ProjectIndex): Promise<void> {
    const clean: ProjectIndex = {
      version: INDEX_SCHEMA_VERSION,
      beats: { order: [...index.beats.order] },
      entities: { order: [...(index.entities?.order ?? [])] },
      chapters: { order: [...(index.chapters?.order ?? [])] },
      conversations: { order: [...(index.conversations?.order ?? [])] },
      updatedAt: nowIso()
    }

    const prev = this.indexWriteQueues.get(dirPath) ?? Promise.resolve()
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        await writeJsonAtomic(this.paths(dirPath).index, clean)
      })
    this.indexWriteQueues.set(
      dirPath,
      next.finally(() => {
        if (this.indexWriteQueues.get(dirPath) === next) {
          this.indexWriteQueues.delete(dirPath)
        }
      })
    )
    await next
  }

  private async touchProject(dirPath: string): Promise<ProjectMeta> {
    const meta = await this.readMeta(dirPath)
    meta.updatedAt = nowIso()
    await this.writeMeta(dirPath, meta)
    return meta
  }

  private async findBeatFile(
    dirPath: string,
    beatId: string
  ): Promise<{ filePath: string; fileName: string } | null> {
    const files = await listFileNames(this.paths(dirPath).beats)
    for (const file of files) {
      const full = path.join(this.paths(dirPath).beats, file)
      const beat = await readJsonFile<Beat>(full)
      if (beat?.id === beatId) return { filePath: full, fileName: file }
    }
    return null
  }

  private async findEntityFile(
    dirPath: string,
    entityId: string
  ): Promise<{ filePath: string; fileName: string } | null> {
    const files = await listFileNames(this.paths(dirPath).entities)
    for (const file of files) {
      const full = path.join(this.paths(dirPath).entities, file)
      const entity = await readJsonFile<Entity>(full)
      if (entity?.id === entityId) return { filePath: full, fileName: file }
    }
    return null
  }

  private async findChapterFile(
    dirPath: string,
    chapterId: string
  ): Promise<{ filePath: string; fileName: string } | null> {
    const files = await listFileNames(this.paths(dirPath).chapters)
    for (const file of files) {
      const full = path.join(this.paths(dirPath).chapters, file)
      const chapter = await readJsonFile<Chapter>(full)
      if (chapter?.id === chapterId) return { filePath: full, fileName: file }
    }
    return null
  }

  // ── 项目 ──────────────────────────────────────────────

  async listProjects() {
    return this.library.listProjects()
  }

  async getLibraryRoot(): Promise<string> {
    return this.library.getLibraryRoot()
  }

  async setLibraryRoot(root: string): Promise<string> {
    return this.library.setLibraryRoot(root)
  }

  async createProject(input: CreateProjectInput): Promise<ProjectSnapshot> {
    const root = await this.library.getLibraryRoot()
    await ensureDir(root)

    const folderName = await this.library.allocateFolderName(toFolderName(input.title))
    const dirPath = path.join(root, folderName)
    const p = this.paths(dirPath)

    await ensureDir(p.beats)
    await ensureDir(p.entities)
    await ensureDir(p.documents)
    await ensureDir(p.chapters)
    await ensureDir(p.conversations)
    await ensureDir(p.sessions)

    const ts = nowIso()
    const meta: ProjectMeta = {
      id: createId('proj'),
      folderName,
      title: input.title.trim() || '未命名项目',
      description: input.description?.trim() || undefined,
      version: PROJECT_SCHEMA_VERSION,
      createdAt: ts,
      updatedAt: ts
    }

    await this.writeMeta(dirPath, meta)
    await this.writeIndex(dirPath, emptyIndex())

    return {
      meta,
      index: emptyIndex(),
      beats: {},
      entities: {},
      chapters: {},
      conversationSummaries: [],
      dirPath
    }
  }

  async openProject(projectId: string): Promise<ProjectSnapshot> {
    return this.loadSnapshot(await this.resolveDir(projectId))
  }

  async openProjectByPath(dirPath: string): Promise<ProjectSnapshot> {
    if (!(await pathExists(path.join(dirPath, 'project.json')))) {
      throw new Error('该目录不是有效的造梦师项目（缺少 project.json）')
    }
    return this.loadSnapshot(dirPath)
  }

  async loadSnapshot(dirPath: string): Promise<ProjectSnapshot> {
    const meta = await this.readMeta(dirPath)
    const index = await this.readIndex(dirPath)
    const p = this.paths(dirPath)
    await ensureDir(p.chapters)
    await ensureDir(p.conversations)
    await ensureDir(p.sessions)

    // v1 → v2：节点状态语义变更（旧 draft 与新 draft 撞名，必须按版本一次性迁移）
    const needsV2Migration = (meta.version ?? 1) < 2

    const beats: Record<string, Beat> = {}
    const beatFiles = await listFileNames(p.beats)
    for (const file of beatFiles) {
      const full = path.join(p.beats, file)
      const beat = await readJsonFile<Beat>(full)
      if (!beat?.id) continue
      const content = beat.content ?? ''
      const refs = refsFromContent(content, beat.id)
      const status = needsV2Migration
        ? migrateLegacyBeatStatus(beat.status)
        : normalizeBeatStatus(beat.status)
      const next: Beat = {
        ...beat,
        fileName: beat.fileName || file,
        content,
        status,
        entityRefs: beat.entityRefs ?? refs.entityRefs,
        beatRefs: beat.beatRefs ?? refs.beatRefs
      }
      beats[beat.id] = next
      if (needsV2Migration && beat.status !== status) {
        await writeJsonAtomic(full, next)
      }
    }

    const entities: Record<string, Entity> = {}
    const entityFiles = await listFileNames(p.entities)
    for (const file of entityFiles) {
      const full = path.join(p.entities, file)
      const entity = await readJsonFile<Entity>(full)
      if (!entity?.id) continue
      const content = entity.content ?? ''
      const refs = refsFromContent(content, entity.id)
      const status = normalizeEntityStatus(
        (entity as Entity & { status?: unknown }).status
      )
      const next: Entity = {
        ...entity,
        fileName: entity.fileName || file,
        content,
        status,
        entityRefs: entity.entityRefs ?? refs.entityRefs,
        beatRefs: entity.beatRefs ?? refs.beatRefs
      }
      entities[entity.id] = next
      if (needsV2Migration && (entity as Entity & { status?: unknown }).status !== status) {
        await writeJsonAtomic(full, next)
      }
    }

    const chapters: Record<string, Chapter> = {}
    const chapterFiles = await listFileNames(p.chapters)
    for (const file of chapterFiles) {
      const full = path.join(p.chapters, file)
      const chapter = await readJsonFile<Chapter>(full)
      if (!chapter?.id) continue
      const content = chapter.content ?? ''
      // 文章正文为纯文本；关联仅读元数据（兼容旧文件曾从 content 解析的 refs）
      const next: Chapter = {
        ...chapter,
        fileName: chapter.fileName || file,
        content,
        status: normalizeChapterStatus(chapter.status),
        sourceBeatIds: chapter.sourceBeatIds ?? [],
        entityRefs: chapter.entityRefs ?? [],
        beatRefs: chapter.beatRefs ?? chapter.sourceBeatIds ?? []
      }
      chapters[chapter.id] = next
    }

    index.beats.order = index.beats.order.filter((id) => beats[id])
    for (const id of Object.keys(beats)) {
      if (!index.beats.order.includes(id)) index.beats.order.push(id)
    }
    index.entities.order = index.entities.order.filter((id) => entities[id])
    for (const id of Object.keys(entities)) {
      if (!index.entities.order.includes(id)) index.entities.order.push(id)
    }
    index.chapters.order = (index.chapters?.order ?? []).filter((id) => chapters[id])
    for (const id of Object.keys(chapters)) {
      if (!index.chapters.order.includes(id)) index.chapters.order.push(id)
    }

    // 会话摘要：由 ConversationService 侧 list 时也可单独拉；此处扫描文件
    const conversationSummaries = await this.loadConversationSummaries(dirPath, index)

    if (needsV2Migration) {
      meta.version = PROJECT_SCHEMA_VERSION
      meta.updatedAt = nowIso()
      await this.writeMeta(dirPath, meta)
    }

    // 仅当 order 有变化时才写回 index，减少 Windows 上 index.json 并发 rename 冲突
    const prevRaw = await readJsonFile<ProjectIndex>(this.paths(dirPath).index)
    const orderChanged =
      !prevRaw ||
      JSON.stringify(prevRaw.beats?.order ?? []) !== JSON.stringify(index.beats.order) ||
      JSON.stringify(prevRaw.entities?.order ?? []) !== JSON.stringify(index.entities.order) ||
      JSON.stringify(prevRaw.chapters?.order ?? []) !== JSON.stringify(index.chapters.order) ||
      JSON.stringify(prevRaw.conversations?.order ?? []) !==
        JSON.stringify(index.conversations?.order ?? []) ||
      (prevRaw.version ?? 0) < INDEX_SCHEMA_VERSION

    if (orderChanged || needsV2Migration) {
      await this.writeIndex(dirPath, index)
    }

    return { meta, index, beats, entities, chapters, conversationSummaries, dirPath }
  }

  private async loadConversationSummaries(
    dirPath: string,
    index: ProjectIndex
  ): Promise<ConversationSummary[]> {
    const dir = this.paths(dirPath).conversations
    await ensureDir(dir)
    const files = await listFileNames(dir)
    type ConvFile = {
      id: string
      title?: string
      messages?: Array<{ content?: string; role?: string }>
      createdAt?: string
      updatedAt?: string
    }
    const map: Record<string, ConversationSummary> = {}
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const full = path.join(dir, file)
      const conv = await readJsonFile<ConvFile>(full)
      if (!conv?.id) continue
      const messages = conv.messages ?? []
      const lastUser = [...messages].reverse().find((m) => m.role === 'user')
      map[conv.id] = {
        id: conv.id,
        title: conv.title?.trim() || '新对话',
        preview: lastUser?.content?.slice(0, 80),
        messageCount: messages.length,
        createdAt: conv.createdAt ?? nowIso(),
        updatedAt: conv.updatedAt ?? conv.createdAt ?? nowIso()
      }
    }

    // 以 index 顺序为主，磁盘孤儿追加
    const order = [...(index.conversations?.order ?? [])]
    for (const id of Object.keys(map)) {
      if (!order.includes(id)) order.push(id)
    }
    index.conversations.order = order.filter((id) => map[id])
    return index.conversations.order.map((id) => map[id]).filter(Boolean)
  }

  async updateProjectMeta(
    projectId: string,
    patch: Partial<Pick<ProjectMeta, 'title' | 'description'>>
  ): Promise<ProjectMeta> {
    const dirPath = await this.resolveDir(projectId)
    const meta = await this.readMeta(dirPath)
    if (patch.title !== undefined) meta.title = patch.title.trim() || meta.title
    if (patch.description !== undefined) {
      meta.description = patch.description.trim() || undefined
    }
    meta.updatedAt = nowIso()
    await this.writeMeta(dirPath, meta)
    return meta
  }

  async deleteProject(projectId: string): Promise<void> {
    await removeDir(await this.resolveDir(projectId))
  }

  // ── 节点 ──────────────────────────────────────────────

  async createBeat(
    projectId: string,
    input: CreateBeatInput
  ): Promise<CreateMutationResult<Beat>> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      await ensureDir(this.paths(dirPath).beats)

      const ts = nowIso()
      const id = createId('beat')
      const title = input.title.trim() || '未命名节点'
      const fileName = toBeatFileName(title, id)
      const content = input.content ?? ''
      const refs = refsFromContent(content, id)
      const beat: Beat = {
        id,
        title,
        fileName,
        content,
        status: input.status ?? 'idea',
        entityRefs: refs.entityRefs,
        beatRefs: refs.beatRefs,
        createdAt: ts,
        updatedAt: ts
      }

      await writeJsonAtomic(this.beatPath(dirPath, fileName), beat)

      const index = await this.readIndex(dirPath)
      const list = [...index.beats.order.filter((x) => x !== id)]
      if (input.afterId && list.includes(input.afterId)) {
        list.splice(list.indexOf(input.afterId) + 1, 0, id)
      } else {
        list.push(id)
      }
      index.beats.order = list
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      const snapshot = await this.loadSnapshot(dirPath)
      // 用内存中的 beat，避免 snapshot 加载竞态导致找不到
      return { snapshot, created: snapshot.beats[id] ?? beat }
    })
  }

  async updateBeat(
    projectId: string,
    beatId: string,
    patch: UpdateBeatInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const located = await this.findBeatFile(dirPath, beatId)
      if (!located) throw new Error(`节点不存在: ${beatId}`)

      const beat = await readJsonFile<Beat>(located.filePath)
      if (!beat) throw new Error(`节点不存在: ${beatId}`)

      const titleChanged =
        patch.title !== undefined && patch.title.trim() !== '' && patch.title !== beat.title

      if (patch.title !== undefined) beat.title = patch.title.trim() || beat.title
      if (patch.content !== undefined) {
        beat.content = patch.content
        const refs = refsFromContent(patch.content, beatId)
        beat.entityRefs = refs.entityRefs
        beat.beatRefs = refs.beatRefs
      }
      if (patch.status !== undefined) beat.status = patch.status
      beat.updatedAt = nowIso()

      if (titleChanged) {
        const newFileName = toBeatFileName(beat.title, beat.id)
        beat.fileName = newFileName
        await writeJsonAtomic(this.beatPath(dirPath, newFileName), beat)
        if (newFileName !== located.fileName) {
          try {
            await fs.unlink(located.filePath)
          } catch {
            // 忽略
          }
        }
        await this.rewriteMentionsEverywhere(dirPath, 'beat', beatId, (c) =>
          renameLinksInContent(c, 'beat', beatId, beat.title)
        )
      } else {
        beat.fileName = beat.fileName || located.fileName
        await writeJsonAtomic(located.filePath, beat)
      }

      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async deleteBeat(projectId: string, beatId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const located = await this.findBeatFile(dirPath, beatId)

      index.beats.order = index.beats.order.filter((id) => id !== beatId)
      if (located) {
        try {
          await fs.unlink(located.filePath)
        } catch {
          // 忽略
        }
      }

      await this.rewriteMentionsEverywhere(dirPath, 'beat', beatId, (c) =>
        breakLinksInContent(c, 'beat', beatId)
      )

      // 清理章节 sourceBeatIds
      await this.stripSourceBeatFromChapters(dirPath, beatId)

      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  private async stripSourceBeatFromChapters(dirPath: string, beatId: string): Promise<void> {
    const p = this.paths(dirPath)
    for (const file of await listFileNames(p.chapters)) {
      const full = path.join(p.chapters, file)
      const chapter = await readJsonFile<Chapter>(full)
      if (!chapter?.sourceBeatIds?.includes(beatId)) continue
      chapter.sourceBeatIds = chapter.sourceBeatIds.filter((id) => id !== beatId)
      chapter.updatedAt = nowIso()
      await writeJsonAtomic(full, chapter)
    }
  }

  async reorderBeats(projectId: string, input: ReorderBeatsInput): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)

      const currentSet = new Set(index.beats.order)
      const nextSet = new Set(input.orderedIds)
      if (currentSet.size !== nextSet.size || [...currentSet].some((id) => !nextSet.has(id))) {
        throw new Error('重排失败：有序 id 列表与当前节点集合不一致')
      }

      index.beats.order = [...input.orderedIds]
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  // ── 实体 ──────────────────────────────────────────────

  async createEntity(
    projectId: string,
    input: CreateEntityInput
  ): Promise<CreateMutationResult<Entity>> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      await ensureDir(this.paths(dirPath).entities)

      const ts = nowIso()
      const id = createId('ent')
      const name = input.name.trim() || '未命名实体'
      const fileName = toEntityFileName(name, id)
      const content = input.content ?? ''
      const refs = refsFromContent(content, id)
      const entity: Entity = {
        id,
        name,
        fileName,
        content,
        status: input.status ?? 'active',
        entityRefs: refs.entityRefs,
        beatRefs: refs.beatRefs,
        createdAt: ts,
        updatedAt: ts
      }

      await writeJsonAtomic(this.entityPath(dirPath, fileName), entity)

      const index = await this.readIndex(dirPath)
      index.entities.order = [...index.entities.order.filter((x) => x !== id), id]
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      const snapshot = await this.loadSnapshot(dirPath)
      return { snapshot, created: snapshot.entities[id] ?? entity }
    })
  }

  async updateEntity(
    projectId: string,
    entityId: string,
    patch: UpdateEntityInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const located = await this.findEntityFile(dirPath, entityId)
      if (!located) throw new Error(`实体不存在: ${entityId}`)

      const entity = await readJsonFile<Entity>(located.filePath)
      if (!entity) throw new Error(`实体不存在: ${entityId}`)

      const nameChanged =
        patch.name !== undefined && patch.name.trim() !== '' && patch.name !== entity.name

      if (patch.name !== undefined) entity.name = patch.name.trim() || entity.name
      if (patch.content !== undefined) {
        entity.content = patch.content
        const refs = refsFromContent(patch.content, entityId)
        entity.entityRefs = refs.entityRefs
        entity.beatRefs = refs.beatRefs
      }
      if (patch.status !== undefined) entity.status = patch.status
      entity.updatedAt = nowIso()

      if (nameChanged) {
        const newFileName = toEntityFileName(entity.name, entity.id)
        entity.fileName = newFileName
        await writeJsonAtomic(this.entityPath(dirPath, newFileName), entity)
        if (newFileName !== located.fileName) {
          try {
            await fs.unlink(located.filePath)
          } catch {
            // 忽略
          }
        }
        await this.rewriteMentionsEverywhere(dirPath, 'entity', entityId, (c) =>
          renameLinksInContent(c, 'entity', entityId, entity.name)
        )
      } else {
        entity.fileName = entity.fileName || located.fileName
        await writeJsonAtomic(located.filePath, entity)
      }

      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async deleteEntity(projectId: string, entityId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const located = await this.findEntityFile(dirPath, entityId)

      index.entities.order = index.entities.order.filter((id) => id !== entityId)
      if (located) {
        try {
          await fs.unlink(located.filePath)
        } catch {
          // 忽略
        }
      }

      await this.rewriteMentionsEverywhere(dirPath, 'entity', entityId, (c) =>
        breakLinksInContent(c, 'entity', entityId)
      )

      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  /**
   * 改写全部节点、实体、章节正文中的双链（排除 subject 自身文件）
   */
  private async rewriteMentionsEverywhere(
    dirPath: string,
    subjectType: 'beat' | 'entity',
    subjectId: string,
    transform: (content: string) => string
  ): Promise<void> {
    const p = this.paths(dirPath)

    for (const file of await listFileNames(p.beats)) {
      const full = path.join(p.beats, file)
      const beat = await readJsonFile<Beat>(full)
      if (!beat) continue
      if (subjectType === 'beat' && beat.id === subjectId) continue
      const next = transform(beat.content ?? '')
      if (next === beat.content) continue
      beat.content = next
      const refs = refsFromContent(next, beat.id)
      beat.entityRefs = refs.entityRefs
      beat.beatRefs = refs.beatRefs
      beat.updatedAt = nowIso()
      await writeJsonAtomic(full, beat)
    }

    for (const file of await listFileNames(p.entities)) {
      const full = path.join(p.entities, file)
      const entity = await readJsonFile<Entity>(full)
      if (!entity) continue
      if (subjectType === 'entity' && entity.id === subjectId) continue
      const next = transform(entity.content ?? '')
      if (next === entity.content) continue
      entity.content = next
      const refs = refsFromContent(next, entity.id)
      entity.entityRefs = refs.entityRefs
      entity.beatRefs = refs.beatRefs
      entity.updatedAt = nowIso()
      await writeJsonAtomic(full, entity)
    }

    // 文章 content 为纯正文、无双链；仅清理旧数据中可能残留的 mention 语法，不改 refs 元数据
    for (const file of await listFileNames(p.chapters)) {
      const full = path.join(p.chapters, file)
      const chapter = await readJsonFile<Chapter>(full)
      if (!chapter) continue
      const next = transform(chapter.content ?? '')
      if (next === chapter.content) continue
      chapter.content = next
      chapter.updatedAt = nowIso()
      await writeJsonAtomic(full, chapter)
    }
  }

  async reorderEntities(projectId: string, orderedIds: string[]): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)

      const currentSet = new Set(index.entities.order)
      const nextSet = new Set(orderedIds)
      if (currentSet.size !== nextSet.size || [...currentSet].some((id) => !nextSet.has(id))) {
        throw new Error('重排失败：实体有序 id 列表与当前集合不一致')
      }

      index.entities.order = [...orderedIds]
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  // ── 文章 ──────────────────────────────────────────────

  async createChapter(
    projectId: string,
    input: CreateChapterInput
  ): Promise<CreateMutationResult<Chapter>> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      await ensureDir(this.paths(dirPath).chapters)

      const ts = nowIso()
      const id = createId('chap')
      const title = input.title.trim() || '未命名文章'
      const fileName = toChapterFileName(title, id)
      // 正文保持纯文本；关联仅存元数据字段
      const content = input.content ?? ''
      const sourceBeatIds = input.sourceBeatIds ?? []
      const beatRefs = input.beatRefs ?? sourceBeatIds
      const entityRefs = input.entityRefs ?? []
      const chapter: Chapter = {
        id,
        title,
        fileName,
        content,
        status: input.status ?? 'draft',
        sourceBeatIds,
        entityRefs,
        beatRefs,
        conversationId: input.conversationId,
        createdAt: ts,
        updatedAt: ts
      }

      await writeJsonAtomic(this.chapterPath(dirPath, fileName), chapter)

      const index = await this.readIndex(dirPath)
      index.chapters.order = [...index.chapters.order.filter((x) => x !== id), id]
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      const snapshot = await this.loadSnapshot(dirPath)
      return { snapshot, created: snapshot.chapters[id] ?? chapter }
    })
  }

  async updateChapter(
    projectId: string,
    chapterId: string,
    patch: UpdateChapterInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const located = await this.findChapterFile(dirPath, chapterId)
      if (!located) throw new Error(`文章不存在: ${chapterId}`)

      const chapter = await readJsonFile<Chapter>(located.filePath)
      if (!chapter) throw new Error(`文章不存在: ${chapterId}`)

      const titleChanged =
        patch.title !== undefined && patch.title.trim() !== '' && patch.title !== chapter.title

      if (patch.title !== undefined) chapter.title = patch.title.trim() || chapter.title
      if (patch.content !== undefined) {
        // 纯正文，不从 content 解析双链
        chapter.content = patch.content
      }
      if (patch.status !== undefined) chapter.status = patch.status
      if (patch.sourceBeatIds !== undefined) chapter.sourceBeatIds = patch.sourceBeatIds
      if (patch.entityRefs !== undefined) chapter.entityRefs = patch.entityRefs
      if (patch.beatRefs !== undefined) chapter.beatRefs = patch.beatRefs
      if (patch.conversationId !== undefined) chapter.conversationId = patch.conversationId
      chapter.updatedAt = nowIso()

      if (titleChanged) {
        const newFileName = toChapterFileName(chapter.title, chapter.id)
        chapter.fileName = newFileName
        await writeJsonAtomic(this.chapterPath(dirPath, newFileName), chapter)
        if (newFileName !== located.fileName) {
          try {
            await fs.unlink(located.filePath)
          } catch {
            // 忽略
          }
        }
      } else {
        chapter.fileName = chapter.fileName || located.fileName
        await writeJsonAtomic(located.filePath, chapter)
      }

      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async deleteChapter(projectId: string, chapterId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const located = await this.findChapterFile(dirPath, chapterId)

      index.chapters.order = index.chapters.order.filter((id) => id !== chapterId)
      if (located) {
        try {
          await fs.unlink(located.filePath)
        } catch {
          // 忽略
        }
      }

      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async reorderChapters(projectId: string, orderedIds: string[]): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)

      const currentSet = new Set(index.chapters.order)
      const nextSet = new Set(orderedIds)
      if (currentSet.size !== nextSet.size || [...currentSet].some((id) => !nextSet.has(id))) {
        throw new Error('重排失败：文章有序 id 列表与当前集合不一致')
      }

      index.chapters.order = [...orderedIds]
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async getChapter(projectId: string, chapterId: string): Promise<Chapter> {
    const dirPath = await this.resolveDir(projectId)
    const located = await this.findChapterFile(dirPath, chapterId)
    if (!located) throw new Error(`文章不存在: ${chapterId}`)
    const chapter = await readJsonFile<Chapter>(located.filePath)
    if (!chapter) throw new Error(`文章不存在: ${chapterId}`)
    return chapter
  }

  /** 供 ConversationService 写入 index.conversations.order */
  async setConversationOrder(projectId: string, orderedIds: string[]): Promise<void> {
    const dirPath = await this.resolveDir(projectId)
    const index = await this.readIndex(dirPath)
    index.conversations.order = orderedIds
    await this.writeIndex(dirPath, index)
  }

  async touchProjectPublic(projectId: string): Promise<void> {
    const dirPath = await this.resolveDir(projectId)
    await this.touchProject(dirPath)
  }
}
