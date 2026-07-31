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
  emptyProjectIndex,
  migrateLegacyBeatStatus,
  normalizeBeatStatus,
  normalizeChapterStatus,
  normalizeEntityStatus,
  normalizeProjectIndex,
  withDerivedOrders,
  type Beat,
  type Chapter,
  type ChapterFolderMeta,
  type ConversationSummary,
  type CreateBeatInput,
  type CreateChapterFolderInput,
  type CreateChapterInput,
  type CreateEntityInput,
  type CreateMutationResult,
  type CreateProjectInput,
  type Entity,
  type MoveChapterInput,
  type ProjectIndex,
  type ProjectMeta,
  type ProjectSnapshot,
  type ReorderBeatsInput,
  type ReorderChaptersInFolderInput,
  type ReorderSiblingsInput,
  type ReparentInput,
  type UpdateBeatInput,
  type UpdateChapterFolderInput,
  type UpdateChapterInput,
  type UpdateEntityInput
} from '../../shared/project-types'
import {
  deleteAndPromote,
  getChildIds,
  insertChapterIntoOrder,
  insertIntoTree,
  removeChapterFromOrder,
  removeFromTree,
  reorderChaptersInFolder,
  reorderSiblings,
  rebuildTreeFromParents,
  wouldCreateCycle
} from '../../shared/tree-index'
import type { LibraryService } from './library-service'
import {
  ensureDir,
  listFileNames,
  listFilesRecursive,
  pathExists,
  readJsonFile,
  removeDir,
  writeJsonAtomic
} from './fs-utils'
import type { WritingActivityDay } from '../../shared/activity'
import type { ActivityLedgerService } from './activity-ledger'

function nowIso(): string {
  return new Date().toISOString()
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

function normalizeParentId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null
  return String(raw)
}

/**
 * 项目服务：节点 / 实体 / 章节 / 文章文件夹
 * 结构树（parentId）与双链 mention 正交
 */
export class ProjectService {
  /** 按项目目录串行化 index.json 写入，避免 Windows 并发 rename ENOENT */
  private indexWriteQueues = new Map<string, Promise<void>>()
  /** 按项目目录串行化所有会改 index / 文件的写操作，避免并行 create 丢 id */
  private mutationQueues = new Map<string, Promise<unknown>>()

  constructor(
    private readonly library: LibraryService,
    private readonly activityLedger: ActivityLedgerService
  ) {}

  /**
   * 同一项目目录内的写操作串行执行。
   * 读操作（open/list）不进队，避免阻塞查询。
   */
  private enqueueMutation<T>(dirPath: string, task: () => Promise<T>): Promise<T> {
    const prev = this.mutationQueues.get(dirPath) ?? Promise.resolve()
    const next = prev
      .catch(() => undefined)
      .then(async () => {
        // 跨日后的首次修改/删除发生前先冻结旧日字数。
        await this.captureWritingActivityInDir(dirPath).catch((error) => {
          console.warn('[project] 修改前持久化文字活动失败', error)
        })
        try {
          return await task()
        } finally {
          // 今天的数据允许增减，每次落盘后都以现存内容覆盖。
          await this.captureWritingActivityInDir(dirPath).catch((error) => {
            console.warn('[project] 修改后持久化文字活动失败', error)
          })
        }
      })
    const queued = next.finally(() => {
      if (this.mutationQueues.get(dirPath) === queued) {
        this.mutationQueues.delete(dirPath)
      }
    })
    this.mutationQueues.set(dirPath, queued)
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

  private async collectWritingActivity(dirPath: string): Promise<WritingActivityDay[]> {
    const totals = new Map<string, Omit<WritingActivityDay, 'date'>>()
    const add = (
      createdAt: string,
      kind: keyof Omit<WritingActivityDay, 'date'>,
      content: string
    ): void => {
      const date = new Date(createdAt)
      if (Number.isNaN(date.getTime())) return
      const key = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0')
      ].join('-')
      const day = totals.get(key) ?? { beatWords: 0, entityWords: 0, articleWords: 0 }
      day[kind] += content.replace(/\s/g, '').length
      totals.set(key, day)
    }

    const p = this.paths(dirPath)
    for (const file of await listFileNames(p.beats)) {
      const beat = await readJsonFile<Beat>(path.join(p.beats, file))
      if (beat?.createdAt) add(beat.createdAt, 'beatWords', beat.content ?? '')
    }
    for (const file of await listFileNames(p.entities)) {
      const entity = await readJsonFile<Entity>(path.join(p.entities, file))
      if (entity?.createdAt) add(entity.createdAt, 'entityWords', entity.content ?? '')
    }
    for (const file of await listFilesRecursive(p.chapters)) {
      const chapter = await readJsonFile<Chapter>(file.absPath)
      if (chapter?.createdAt) add(chapter.createdAt, 'articleWords', chapter.content ?? '')
    }

    return [...totals.entries()].map(([date, value]) => ({ date, ...value }))
  }

  private async captureWritingActivityInDir(
    dirPath: string
  ): Promise<WritingActivityDay[]> {
    return this.activityLedger.captureWriting(
      dirPath,
      await this.collectWritingActivity(dirPath)
    )
  }

  async writingActivity(projectId: string): Promise<WritingActivityDay[]> {
    return this.captureWritingActivityInDir(await this.resolveDir(projectId))
  }

  private beatPath(dirPath: string, fileName: string): string {
    return path.join(dirPath, 'beats', fileName)
  }

  private entityPath(dirPath: string, fileName: string): string {
    return path.join(dirPath, 'entities', fileName)
  }

  /** 文章绝对路径：根或 folder.relPath 下 */
  private chapterAbsPath(
    dirPath: string,
    fileName: string,
    folderRelPath?: string | null
  ): string {
    const base = this.paths(dirPath).chapters
    if (!folderRelPath) return path.join(base, fileName)
    return path.join(base, ...folderRelPath.split(/[/\\]+/).filter(Boolean), fileName)
  }

  private folderAbsPath(dirPath: string, relPath: string): string {
    const base = this.paths(dirPath).chapters
    return path.join(base, ...relPath.split(/[/\\]+/).filter(Boolean))
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
    const clean = withDerivedOrders({
      ...index,
      version: INDEX_SCHEMA_VERSION,
      updatedAt: nowIso()
    })

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
  ): Promise<{ filePath: string; fileName: string; relDir: string } | null> {
    const files = await listFilesRecursive(this.paths(dirPath).chapters)
    for (const f of files) {
      const chapter = await readJsonFile<Chapter>(f.absPath)
      if (chapter?.id === chapterId) {
        return { filePath: f.absPath, fileName: f.fileName, relDir: f.relDir }
      }
    }
    return null
  }

  private folderRelPath(
    index: ProjectIndex,
    folderId: string | null | undefined
  ): string | null {
    if (!folderId) return null
    return index.chapterFolders.byId[folderId]?.relPath ?? null
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
    await this.writeIndex(dirPath, emptyProjectIndex())

    return {
      meta,
      index: emptyProjectIndex(),
      beats: {},
      entities: {},
      chapters: {},
      chapterFolders: {},
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

    // v1→v2：节点状态；v2→v3：树形 index（由 normalizeProjectIndex 处理）
    const needsV2Migration = (meta.version ?? 1) < 2
    const needsV3Migration = (meta.version ?? 1) < 3

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
      const parentId = normalizeParentId(beat.parentId)
      const next: Beat = {
        ...beat,
        fileName: beat.fileName || file,
        content,
        status,
        entityRefs: beat.entityRefs ?? refs.entityRefs,
        beatRefs: beat.beatRefs ?? refs.beatRefs,
        parentId
      }
      beats[beat.id] = next
      if (
        (needsV2Migration && beat.status !== status) ||
        (needsV3Migration && beat.parentId !== parentId)
      ) {
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
      const parentId = normalizeParentId(entity.parentId)
      const next: Entity = {
        ...entity,
        fileName: entity.fileName || file,
        content,
        status,
        entityRefs: entity.entityRefs ?? refs.entityRefs,
        beatRefs: entity.beatRefs ?? refs.beatRefs,
        parentId
      }
      entities[entity.id] = next
      if (needsV3Migration && entity.parentId !== parentId) {
        await writeJsonAtomic(full, next)
      }
    }

    // 文章：递归扫描真实子目录
    const chapters: Record<string, Chapter> = {}
    const chapterFiles = await listFilesRecursive(p.chapters)
    // folder.relPath → folderId 反查
    const relPathToFolderId = new Map<string, string>()
    for (const [fid, metaF] of Object.entries(index.chapterFolders.byId)) {
      relPathToFolderId.set(metaF.relPath.replace(/\\/g, '/'), fid)
    }

    for (const f of chapterFiles) {
      const chapter = await readJsonFile<Chapter>(f.absPath)
      if (!chapter?.id) continue
      const content = chapter.content ?? ''
      const relNorm = f.relDir.replace(/\\/g, '/')
      const folderIdFromPath = relNorm ? (relPathToFolderId.get(relNorm) ?? null) : null
      const folderId = normalizeParentId(chapter.folderId) ?? folderIdFromPath
      const next: Chapter = {
        ...chapter,
        fileName: chapter.fileName || f.fileName,
        content,
        status: normalizeChapterStatus(chapter.status),
        sourceBeatIds: chapter.sourceBeatIds ?? [],
        entityRefs: chapter.entityRefs ?? [],
        beatRefs: chapter.beatRefs ?? chapter.sourceBeatIds ?? [],
        folderId
      }
      chapters[chapter.id] = next
      if (needsV3Migration && chapter.folderId !== folderId) {
        await writeJsonAtomic(f.absPath, next)
      }
    }

    // 用对象上的 parentId 重建/校验树，保留原 order 偏好
    const beatTree = rebuildTreeFromParents(
      Object.keys(beats),
      (id) => beats[id]?.parentId ?? null,
      index.beats.order?.length ? index.beats.order : index.beats.roots
    )
    // 同步对象 parentId（破环后可能变）
    for (const id of Object.keys(beats)) {
      const inRoots = beatTree.roots.includes(id)
      let parent: string | null = null
      if (!inRoots) {
        for (const [pId, kids] of Object.entries(beatTree.children)) {
          if (kids.includes(id)) {
            parent = pId
            break
          }
        }
      }
      if ((beats[id].parentId ?? null) !== parent) {
        beats[id] = { ...beats[id], parentId: parent }
        const located = await this.findBeatFile(dirPath, id)
        if (located) await writeJsonAtomic(located.filePath, beats[id])
      }
    }
    index.beats.roots = beatTree.roots
    index.beats.children = beatTree.children

    const entityTree = rebuildTreeFromParents(
      Object.keys(entities),
      (id) => entities[id]?.parentId ?? null,
      index.entities.order?.length ? index.entities.order : index.entities.roots
    )
    for (const id of Object.keys(entities)) {
      const inRoots = entityTree.roots.includes(id)
      let parent: string | null = null
      if (!inRoots) {
        for (const [pId, kids] of Object.entries(entityTree.children)) {
          if (kids.includes(id)) {
            parent = pId
            break
          }
        }
      }
      if ((entities[id].parentId ?? null) !== parent) {
        entities[id] = { ...entities[id], parentId: parent }
        const located = await this.findEntityFile(dirPath, id)
        if (located) await writeJsonAtomic(located.filePath, entities[id])
      }
    }
    index.entities.roots = entityTree.roots
    index.entities.children = entityTree.children

    // 文章 order 对账
    const chapterIds = new Set(Object.keys(chapters))
    index.chapters.roots = index.chapters.roots.filter((id) => chapterIds.has(id))
    for (const key of Object.keys(index.chapters.byFolder)) {
      index.chapters.byFolder[key] = index.chapters.byFolder[key].filter((id) =>
        chapterIds.has(id)
      )
      if (index.chapters.byFolder[key].length === 0) delete index.chapters.byFolder[key]
    }
    for (const id of chapterIds) {
      const fid = chapters[id].folderId ?? null
      const bucket = fid
        ? (index.chapters.byFolder[fid] ?? (index.chapters.byFolder[fid] = []))
        : index.chapters.roots
      if (!bucket.includes(id)) bucket.push(id)
      // 确保不在错误桶
      if (fid) {
        index.chapters.roots = index.chapters.roots.filter((x) => x !== id)
        for (const k of Object.keys(index.chapters.byFolder)) {
          if (k !== fid) {
            index.chapters.byFolder[k] = index.chapters.byFolder[k].filter((x) => x !== id)
          }
        }
      } else {
        for (const k of Object.keys(index.chapters.byFolder)) {
          index.chapters.byFolder[k] = index.chapters.byFolder[k].filter((x) => x !== id)
        }
      }
    }

    // 清理无效 folder 引用
    const validFolders = new Set(Object.keys(index.chapterFolders.byId))
    for (const key of Object.keys(index.chapters.byFolder)) {
      if (!validFolders.has(key)) {
        // 文章升到根
        for (const cid of index.chapters.byFolder[key]) {
          if (chapters[cid]) {
            chapters[cid] = { ...chapters[cid], folderId: null }
            const located = await this.findChapterFile(dirPath, cid)
            if (located) await writeJsonAtomic(located.filePath, chapters[cid])
          }
          if (!index.chapters.roots.includes(cid)) index.chapters.roots.push(cid)
        }
        delete index.chapters.byFolder[key]
      }
    }

    const conversationSummaries = await this.loadConversationSummaries(dirPath, index)

    if (needsV2Migration || needsV3Migration) {
      meta.version = PROJECT_SCHEMA_VERSION
      meta.updatedAt = nowIso()
      await this.writeMeta(dirPath, meta)
    }

    const finalIndex = withDerivedOrders(index)
    const prevRaw = await readJsonFile<ProjectIndex>(this.paths(dirPath).index)
    const orderChanged =
      !prevRaw ||
      JSON.stringify(withDerivedOrders(normalizeProjectIndex(prevRaw).index)) !==
        JSON.stringify(finalIndex) ||
      (prevRaw.version ?? 0) < INDEX_SCHEMA_VERSION

    if (orderChanged || needsV2Migration || needsV3Migration) {
      await this.writeIndex(dirPath, finalIndex)
    }

    return {
      meta,
      index: finalIndex,
      beats,
      entities,
      chapters,
      chapterFolders: { ...finalIndex.chapterFolders.byId },
      conversationSummaries,
      dirPath
    }
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
      let parentId = normalizeParentId(input.parentId)

      const index = await this.readIndex(dirPath)
      if (parentId && !index.beats.order.includes(parentId) && !index.beats.roots.includes(parentId)) {
        // 父可能仅在 children 里
        const all = new Set([
          ...index.beats.roots,
          ...Object.values(index.beats.children).flat()
        ])
        if (!all.has(parentId)) parentId = null
      }

      const beat: Beat = {
        id,
        title,
        fileName,
        content,
        status: input.status ?? 'idea',
        entityRefs: refs.entityRefs,
        beatRefs: refs.beatRefs,
        parentId,
        createdAt: ts,
        updatedAt: ts
      }

      await writeJsonAtomic(this.beatPath(dirPath, fileName), beat)

      insertIntoTree(index.beats, id, parentId, input.afterId)
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      const snapshot = await this.loadSnapshot(dirPath)
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
      // 显式传入的 refs 直接写入 JSON 属性（无需正文双链），覆盖内容派生的引用
      if (patch.entityRefs !== undefined) beat.entityRefs = patch.entityRefs
      if (patch.beatRefs !== undefined) beat.beatRefs = patch.beatRefs
      if (patch.status !== undefined) beat.status = patch.status

      // parentId 变更走 reparent 语义
      if (patch.parentId !== undefined) {
        const nextParent = normalizeParentId(patch.parentId)
        if (nextParent !== (beat.parentId ?? null)) {
          await this.reparentBeatInDir(dirPath, beatId, { parentId: nextParent })
          // reparent 已写盘；重新读
          const again = await this.findBeatFile(dirPath, beatId)
          if (again) {
            const b2 = await readJsonFile<Beat>(again.filePath)
            if (b2) Object.assign(beat, b2)
          }
        }
      }

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
        const cur = await this.findBeatFile(dirPath, beatId)
        await writeJsonAtomic(cur?.filePath ?? located.filePath, beat)
      }

      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async reparentBeat(
    projectId: string,
    beatId: string,
    input: ReparentInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      await this.reparentBeatInDir(dirPath, beatId, input)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  private async reparentBeatInDir(
    dirPath: string,
    beatId: string,
    input: ReparentInput
  ): Promise<void> {
    const located = await this.findBeatFile(dirPath, beatId)
    if (!located) throw new Error(`节点不存在: ${beatId}`)
    const beat = await readJsonFile<Beat>(located.filePath)
    if (!beat) throw new Error(`节点不存在: ${beatId}`)

    const newParent = normalizeParentId(input.parentId)
    if (newParent) {
      const parentFile = await this.findBeatFile(dirPath, newParent)
      if (!parentFile) throw new Error(`父节点不存在: ${newParent}`)
    }

    const index = await this.readIndex(dirPath)
    const parentOf = (id: string): string | null => {
      if (id === beatId) return beat.parentId ?? null
      // 从树反查
      if (index.beats.roots.includes(id)) return null
      for (const [p, kids] of Object.entries(index.beats.children)) {
        if (kids.includes(id)) return p
      }
      return null
    }
    if (wouldCreateCycle(beatId, newParent, parentOf)) {
      throw new Error('不能将节点挂到其子树下（会成环）')
    }

    const oldParent = beat.parentId ?? null
    removeFromTree(index.beats, beatId, oldParent)
    insertIntoTree(index.beats, beatId, newParent, input.afterId)
    beat.parentId = newParent
    beat.updatedAt = nowIso()
    await writeJsonAtomic(located.filePath, beat)
    await this.writeIndex(dirPath, index)
  }

  async deleteBeat(projectId: string, beatId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const located = await this.findBeatFile(dirPath, beatId)
      const beat = located ? await readJsonFile<Beat>(located.filePath) : null
      const oldParent = beat?.parentId ?? null

      // 子节点提升
      const kids = getChildIds(index.beats, beatId)
      deleteAndPromote(index.beats, beatId, oldParent)
      for (const kidId of kids) {
        const kidLoc = await this.findBeatFile(dirPath, kidId)
        if (!kidLoc) continue
        const kid = await readJsonFile<Beat>(kidLoc.filePath)
        if (!kid) continue
        kid.parentId = oldParent
        kid.updatedAt = nowIso()
        await writeJsonAtomic(kidLoc.filePath, kid)
      }

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
      await this.stripSourceBeatFromChapters(dirPath, beatId)

      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  private async stripSourceBeatFromChapters(dirPath: string, beatId: string): Promise<void> {
    const files = await listFilesRecursive(this.paths(dirPath).chapters)
    for (const f of files) {
      const chapter = await readJsonFile<Chapter>(f.absPath)
      if (!chapter?.sourceBeatIds?.includes(beatId)) continue
      chapter.sourceBeatIds = chapter.sourceBeatIds.filter((id) => id !== beatId)
      chapter.updatedAt = nowIso()
      await writeJsonAtomic(f.absPath, chapter)
    }
  }

  /**
   * 兼容旧 API：仅当全部为根且集合一致时重排 roots
   */
  async reorderBeats(projectId: string, input: ReorderBeatsInput): Promise<ProjectSnapshot> {
    return this.reorderBeatSiblings(projectId, {
      parentId: null,
      orderedIds: input.orderedIds
    })
  }

  async reorderBeatSiblings(
    projectId: string,
    input: ReorderSiblingsInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      reorderSiblings(index.beats, input.parentId ?? null, input.orderedIds)
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
      let parentId = normalizeParentId(input.parentId)

      const index = await this.readIndex(dirPath)
      if (parentId) {
        const all = new Set([
          ...index.entities.roots,
          ...Object.values(index.entities.children).flat()
        ])
        if (!all.has(parentId)) parentId = null
      }

      const entity: Entity = {
        id,
        name,
        fileName,
        content,
        status: input.status ?? 'active',
        entityRefs: refs.entityRefs,
        beatRefs: refs.beatRefs,
        parentId,
        createdAt: ts,
        updatedAt: ts
      }

      await writeJsonAtomic(this.entityPath(dirPath, fileName), entity)

      insertIntoTree(index.entities, id, parentId, input.afterId)
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
      // 显式传入的 refs 直接写入 JSON 属性（无需正文双链），覆盖内容派生的引用
      if (patch.entityRefs !== undefined) entity.entityRefs = patch.entityRefs
      if (patch.beatRefs !== undefined) entity.beatRefs = patch.beatRefs
      if (patch.status !== undefined) entity.status = patch.status

      if (patch.parentId !== undefined) {
        const nextParent = normalizeParentId(patch.parentId)
        if (nextParent !== (entity.parentId ?? null)) {
          await this.reparentEntityInDir(dirPath, entityId, { parentId: nextParent })
          const again = await this.findEntityFile(dirPath, entityId)
          if (again) {
            const e2 = await readJsonFile<Entity>(again.filePath)
            if (e2) Object.assign(entity, e2)
          }
        }
      }

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
        const cur = await this.findEntityFile(dirPath, entityId)
        await writeJsonAtomic(cur?.filePath ?? located.filePath, entity)
      }

      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async reparentEntity(
    projectId: string,
    entityId: string,
    input: ReparentInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      await this.reparentEntityInDir(dirPath, entityId, input)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  private async reparentEntityInDir(
    dirPath: string,
    entityId: string,
    input: ReparentInput
  ): Promise<void> {
    const located = await this.findEntityFile(dirPath, entityId)
    if (!located) throw new Error(`实体不存在: ${entityId}`)
    const entity = await readJsonFile<Entity>(located.filePath)
    if (!entity) throw new Error(`实体不存在: ${entityId}`)

    const newParent = normalizeParentId(input.parentId)
    if (newParent) {
      const parentFile = await this.findEntityFile(dirPath, newParent)
      if (!parentFile) throw new Error(`父实体不存在: ${newParent}`)
    }

    const index = await this.readIndex(dirPath)
    const parentOf = (id: string): string | null => {
      if (id === entityId) return entity.parentId ?? null
      if (index.entities.roots.includes(id)) return null
      for (const [p, kids] of Object.entries(index.entities.children)) {
        if (kids.includes(id)) return p
      }
      return null
    }
    if (wouldCreateCycle(entityId, newParent, parentOf)) {
      throw new Error('不能将实体挂到其子树下（会成环）')
    }

    const oldParent = entity.parentId ?? null
    removeFromTree(index.entities, entityId, oldParent)
    insertIntoTree(index.entities, entityId, newParent, input.afterId)
    entity.parentId = newParent
    entity.updatedAt = nowIso()
    await writeJsonAtomic(located.filePath, entity)
    await this.writeIndex(dirPath, index)
  }

  async deleteEntity(projectId: string, entityId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const located = await this.findEntityFile(dirPath, entityId)
      const entity = located ? await readJsonFile<Entity>(located.filePath) : null
      const oldParent = entity?.parentId ?? null

      const kids = getChildIds(index.entities, entityId)
      deleteAndPromote(index.entities, entityId, oldParent)
      for (const kidId of kids) {
        const kidLoc = await this.findEntityFile(dirPath, kidId)
        if (!kidLoc) continue
        const kid = await readJsonFile<Entity>(kidLoc.filePath)
        if (!kid) continue
        kid.parentId = oldParent
        kid.updatedAt = nowIso()
        await writeJsonAtomic(kidLoc.filePath, kid)
      }

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

  async reorderEntities(projectId: string, orderedIds: string[]): Promise<ProjectSnapshot> {
    return this.reorderEntitySiblings(projectId, { parentId: null, orderedIds })
  }

  async reorderEntitySiblings(
    projectId: string,
    input: ReorderSiblingsInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      reorderSiblings(index.entities, input.parentId ?? null, input.orderedIds)
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

    // 文章 content 为纯正文、无双链；仅清理旧数据中可能残留的 mention 语法
    for (const f of await listFilesRecursive(p.chapters)) {
      const chapter = await readJsonFile<Chapter>(f.absPath)
      if (!chapter) continue
      const next = transform(chapter.content ?? '')
      if (next === chapter.content) continue
      chapter.content = next
      chapter.updatedAt = nowIso()
      await writeJsonAtomic(f.absPath, chapter)
    }
  }

  // ── 文章文件夹 ──────────────────────────────────────────

  async createChapterFolder(
    projectId: string,
    input: CreateChapterFolderInput
  ): Promise<CreateMutationResult<ChapterFolderMeta>> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const name = input.name.trim() || '未命名文件夹'
      const safeSeg = toFolderName(name)
      const parentId = normalizeParentId(input.parentId)
      if (parentId && !index.chapterFolders.byId[parentId]) {
        throw new Error(`父文件夹不存在: ${parentId}`)
      }
      const parentRel = parentId ? index.chapterFolders.byId[parentId].relPath : ''
      let relPath = parentRel ? `${parentRel}/${safeSeg}` : safeSeg
      // 路径冲突则加后缀
      const used = new Set(
        Object.values(index.chapterFolders.byId).map((f) => f.relPath.replace(/\\/g, '/'))
      )
      let n = 2
      let candidate = relPath
      while (used.has(candidate.replace(/\\/g, '/'))) {
        candidate = `${relPath}-${n}`
        n += 1
      }
      relPath = candidate

      const abs = this.folderAbsPath(dirPath, relPath)
      await ensureDir(abs)

      const ts = nowIso()
      const id = createId('fold')
      const folder: ChapterFolderMeta = {
        id,
        name,
        parentId,
        relPath,
        createdAt: ts,
        updatedAt: ts
      }
      index.chapterFolders.byId[id] = folder
      insertIntoTree(index.chapterFolders, id, parentId)
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      const snapshot = await this.loadSnapshot(dirPath)
      return {
        snapshot,
        created: snapshot.chapterFolders[id] ?? folder
      }
    })
  }

  async updateChapterFolder(
    projectId: string,
    folderId: string,
    patch: UpdateChapterFolderInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const folder = index.chapterFolders.byId[folderId]
      if (!folder) throw new Error(`文件夹不存在: ${folderId}`)

      // 改父
      if (patch.parentId !== undefined) {
        const newParent = normalizeParentId(patch.parentId)
        if (newParent !== (folder.parentId ?? null)) {
          if (newParent && !index.chapterFolders.byId[newParent]) {
            throw new Error(`父文件夹不存在: ${newParent}`)
          }
          const parentOf = (id: string): string | null =>
            index.chapterFolders.byId[id]?.parentId ?? null
          if (wouldCreateCycle(folderId, newParent, parentOf)) {
            throw new Error('不能将文件夹挂到其子树下（会成环）')
          }
          // 计算新 relPath
          const nameSeg = folder.relPath.split(/[/\\]/).pop() || toFolderName(folder.name)
          const parentRel = newParent ? index.chapterFolders.byId[newParent].relPath : ''
          const newRel = parentRel ? `${parentRel}/${nameSeg}` : nameSeg
          await this.relocateFolderTree(dirPath, index, folderId, newRel)
          removeFromTree(index.chapterFolders, folderId, folder.parentId)
          insertIntoTree(index.chapterFolders, folderId, newParent)
          folder.parentId = newParent
        }
      }

      // 改名 → 改路径最后一段
      if (patch.name !== undefined && patch.name.trim() && patch.name.trim() !== folder.name) {
        const newName = patch.name.trim()
        const safeSeg = toFolderName(newName)
        const parts = folder.relPath.split(/[/\\]/).filter(Boolean)
        parts[parts.length - 1] = safeSeg
        let newRel = parts.join('/')
        const used = new Set(
          Object.entries(index.chapterFolders.byId)
            .filter(([id]) => id !== folderId)
            .map(([, f]) => f.relPath.replace(/\\/g, '/'))
        )
        let n = 2
        let candidate = newRel
        while (used.has(candidate)) {
          const p2 = [...parts]
          p2[p2.length - 1] = `${safeSeg}-${n}`
          candidate = p2.join('/')
          n += 1
        }
        newRel = candidate
        await this.relocateFolderTree(dirPath, index, folderId, newRel)
        folder.name = newName
      }

      folder.updatedAt = nowIso()
      index.chapterFolders.byId[folderId] = folder
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  /** 移动磁盘目录并更新子孙 relPath */
  private async relocateFolderTree(
    dirPath: string,
    index: ProjectIndex,
    folderId: string,
    newRelPath: string
  ): Promise<void> {
    const folder = index.chapterFolders.byId[folderId]
    if (!folder) return
    const oldRel = folder.relPath
    if (oldRel.replace(/\\/g, '/') === newRelPath.replace(/\\/g, '/')) return

    const oldAbs = this.folderAbsPath(dirPath, oldRel)
    const newAbs = this.folderAbsPath(dirPath, newRelPath)
    await ensureDir(path.dirname(newAbs))
    if (await pathExists(oldAbs)) {
      if (await pathExists(newAbs)) {
        throw new Error(`目标文件夹已存在: ${newRelPath}`)
      }
      await fs.rename(oldAbs, newAbs)
    } else {
      await ensureDir(newAbs)
    }

    // 更新本夹 + 所有以 oldRel 为前缀的子孙
    const oldPrefix = oldRel.replace(/\\/g, '/')
    for (const [id, meta] of Object.entries(index.chapterFolders.byId)) {
      const cur = meta.relPath.replace(/\\/g, '/')
      if (cur === oldPrefix || cur.startsWith(oldPrefix + '/')) {
        const rest = cur.slice(oldPrefix.length)
        meta.relPath = (newRelPath.replace(/\\/g, '/') + rest).replace(/\\/g, '/')
        meta.updatedAt = nowIso()
        index.chapterFolders.byId[id] = meta
      }
    }
  }

  async deleteChapterFolder(
    projectId: string,
    folderId: string
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const folder = index.chapterFolders.byId[folderId]
      if (!folder) throw new Error(`文件夹不存在: ${folderId}`)

      const parentId = folder.parentId ?? null
      // 子文件夹提升
      const subFolders = getChildIds(index.chapterFolders, folderId)
      deleteAndPromote(index.chapterFolders, folderId, parentId)

      // 子文件夹 relPath / parent 更新：提到 parent 下
      const parentRel = parentId ? index.chapterFolders.byId[parentId]?.relPath ?? '' : ''
      for (const subId of subFolders) {
        const sub = index.chapterFolders.byId[subId]
        if (!sub) continue
        sub.parentId = parentId
        const seg = sub.relPath.split(/[/\\]/).pop() || toFolderName(sub.name)
        const newRel = parentRel ? `${parentRel}/${seg}` : seg
        await this.relocateFolderTree(dirPath, index, subId, newRel)
        sub.parentId = parentId
        index.chapterFolders.byId[subId] = sub
      }

      // 本夹文章提升到父夹/根，并物理移动
      const chapterIds = [...(index.chapters.byFolder[folderId] ?? [])]
      const targetRel = parentRel || null
      for (const cid of chapterIds) {
        const located = await this.findChapterFile(dirPath, cid)
        if (!located) continue
        const chapter = await readJsonFile<Chapter>(located.filePath)
        if (!chapter) continue
        const dest = this.chapterAbsPath(dirPath, chapter.fileName || located.fileName, targetRel)
        await ensureDir(path.dirname(dest))
        if (path.resolve(located.filePath) !== path.resolve(dest)) {
          await fs.rename(located.filePath, dest)
        }
        chapter.folderId = parentId
        chapter.updatedAt = nowIso()
        await writeJsonAtomic(dest, chapter)
        removeChapterFromOrder(index.chapters, cid)
        insertChapterIntoOrder(index.chapters, cid, parentId)
      }
      delete index.chapters.byFolder[folderId]

      // 删空目录
      const abs = this.folderAbsPath(dirPath, folder.relPath)
      try {
        // 若仍有残留文件，不强制 rm；只尝试删空目录
        const entries = await fs.readdir(abs).catch(() => [])
        if (entries.length === 0) {
          await fs.rmdir(abs).catch(() => undefined)
        }
      } catch {
        // 忽略
      }

      delete index.chapterFolders.byId[folderId]
      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async reorderChapterFolders(
    projectId: string,
    input: ReorderSiblingsInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      reorderSiblings(index.chapterFolders, input.parentId ?? null, input.orderedIds)
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
      const content = input.content ?? ''
      const sourceBeatIds = input.sourceBeatIds ?? []
      const beatRefs = input.beatRefs ?? sourceBeatIds
      const entityRefs = input.entityRefs ?? []
      let folderId = normalizeParentId(input.folderId)

      const index = await this.readIndex(dirPath)
      if (folderId && !index.chapterFolders.byId[folderId]) folderId = null
      const rel = this.folderRelPath(index, folderId)

      const chapter: Chapter = {
        id,
        title,
        fileName,
        content,
        status: input.status ?? 'draft',
        sourceBeatIds,
        entityRefs,
        beatRefs,
        folderId,
        conversationId: input.conversationId,
        createdAt: ts,
        updatedAt: ts
      }

      const abs = this.chapterAbsPath(dirPath, fileName, rel)
      await ensureDir(path.dirname(abs))
      await writeJsonAtomic(abs, chapter)

      insertChapterIntoOrder(index.chapters, id, folderId)
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
        chapter.content = patch.content
      }
      if (patch.status !== undefined) chapter.status = patch.status
      if (patch.sourceBeatIds !== undefined) chapter.sourceBeatIds = patch.sourceBeatIds
      if (patch.entityRefs !== undefined) chapter.entityRefs = patch.entityRefs
      if (patch.beatRefs !== undefined) chapter.beatRefs = patch.beatRefs
      if (patch.conversationId !== undefined) chapter.conversationId = patch.conversationId

      const index = await this.readIndex(dirPath)
      let destPath = located.filePath

      // 移动文件夹
      if (patch.folderId !== undefined) {
        const nextFolder = normalizeParentId(patch.folderId)
        if (nextFolder && !index.chapterFolders.byId[nextFolder]) {
          throw new Error(`文件夹不存在: ${nextFolder}`)
        }
        if (nextFolder !== (chapter.folderId ?? null)) {
          const rel = this.folderRelPath(index, nextFolder)
          const fileName = chapter.fileName || located.fileName
          destPath = this.chapterAbsPath(dirPath, fileName, rel)
          await ensureDir(path.dirname(destPath))
          if (path.resolve(located.filePath) !== path.resolve(destPath)) {
            await fs.rename(located.filePath, destPath)
          }
          removeChapterFromOrder(index.chapters, chapterId)
          insertChapterIntoOrder(index.chapters, chapterId, nextFolder)
          chapter.folderId = nextFolder
        }
      }

      chapter.updatedAt = nowIso()

      if (titleChanged) {
        const newFileName = toChapterFileName(chapter.title, chapter.id)
        const rel = this.folderRelPath(index, chapter.folderId)
        const newPath = this.chapterAbsPath(dirPath, newFileName, rel)
        chapter.fileName = newFileName
        await ensureDir(path.dirname(newPath))
        await writeJsonAtomic(newPath, chapter)
        if (path.resolve(newPath) !== path.resolve(destPath)) {
          try {
            await fs.unlink(destPath)
          } catch {
            // 忽略
          }
        }
      } else {
        chapter.fileName = chapter.fileName || located.fileName
        await writeJsonAtomic(destPath, chapter)
      }

      await this.writeIndex(dirPath, index)
      await this.touchProject(dirPath)
      return this.loadSnapshot(dirPath)
    })
  }

  async moveChapter(
    projectId: string,
    chapterId: string,
    input: MoveChapterInput
  ): Promise<ProjectSnapshot> {
    return this.updateChapter(projectId, chapterId, {
      folderId: input.folderId ?? null
    })
  }

  async deleteChapter(projectId: string, chapterId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      const located = await this.findChapterFile(dirPath, chapterId)
      const chapter = located ? await readJsonFile<Chapter>(located.filePath) : null

      removeChapterFromOrder(index.chapters, chapterId, chapter?.folderId)
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

  /**
   * 兼容旧 API：仅当全部文章都在根且集合一致时重排 roots
   */
  async reorderChapters(projectId: string, orderedIds: string[]): Promise<ProjectSnapshot> {
    return this.reorderChaptersInFolder(projectId, {
      folderId: null,
      orderedIds
    })
  }

  async reorderChaptersInFolder(
    projectId: string,
    input: ReorderChaptersInFolderInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.enqueueMutation(dirPath, async () => {
      const index = await this.readIndex(dirPath)
      reorderChaptersInFolder(index.chapters, input.folderId ?? null, input.orderedIds)
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
