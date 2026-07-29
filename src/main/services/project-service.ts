import path from 'path'
import { promises as fs } from 'fs'
import { createId, toBeatFileName, toEntityFileName, toFolderName } from '../../shared/ids'
import {
  INDEX_SCHEMA_VERSION,
  PROJECT_SCHEMA_VERSION,
  type Beat,
  type CreateBeatInput,
  type CreateEntityInput,
  type CreateProjectInput,
  type Entity,
  type ProjectIndex,
  type ProjectMeta,
  type ProjectSnapshot,
  type ReorderBeatsInput,
  type UpdateBeatInput,
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
    updatedAt: nowIso()
  }
}

/**
 * 兼容旧版 index（rootIds/children）→ 扁平 order
 */
function normalizeIndex(raw: unknown): ProjectIndex {
  if (!raw || typeof raw !== 'object') return emptyIndex()
  const data = raw as Record<string, unknown>
  const beats = (data.beats ?? {}) as Record<string, unknown>

  // 新格式
  if (Array.isArray(beats.order)) {
    return {
      version: INDEX_SCHEMA_VERSION,
      beats: { order: beats.order.filter((id): id is string => typeof id === 'string') },
      entities: {
        order: Array.isArray((data.entities as { order?: unknown })?.order)
          ? ((data.entities as { order: string[] }).order)
          : []
      },
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : nowIso()
    }
  }

  // 旧格式：rootIds + children → 深度优先展平
  const rootIds = Array.isArray(beats.rootIds)
    ? (beats.rootIds as string[])
    : []
  const children =
    beats.children && typeof beats.children === 'object'
      ? (beats.children as Record<string, string[]>)
      : {}
  const order: string[] = []
  const walk = (ids: string[]): void => {
    for (const id of ids) {
      if (order.includes(id)) continue
      order.push(id)
      walk(children[id] ?? [])
    }
  }
  walk(rootIds)
  // 旧 children 里可能有遗漏
  for (const kids of Object.values(children)) {
    for (const id of kids) {
      if (!order.includes(id)) order.push(id)
    }
  }

  return {
    version: INDEX_SCHEMA_VERSION,
    beats: { order },
    entities: {
      order: Array.isArray((data.entities as { order?: unknown })?.order)
        ? ((data.entities as { order: string[] }).order)
        : []
    },
    updatedAt: nowIso()
  }
}

/**
 * 项目服务：对单个项目目录做节点/实体/索引的读写
 * 节点为扁平列表；文件名为「名称-uuid.json」
 */
export class ProjectService {
  constructor(private readonly library: LibraryService) {}

  // ── 路径辅助 ──────────────────────────────────────────

  private paths(dirPath: string) {
    return {
      meta: path.join(dirPath, 'project.json'),
      index: path.join(dirPath, 'index.json'),
      beats: path.join(dirPath, 'beats'),
      entities: path.join(dirPath, 'entities'),
      documents: path.join(dirPath, 'documents')
    }
  }

  /** 节点 / 实体文件完整路径（按 fileName） */
  private beatPath(dirPath: string, fileName: string): string {
    return path.join(dirPath, 'beats', fileName)
  }

  private entityPath(dirPath: string, fileName: string): string {
    return path.join(dirPath, 'entities', fileName)
  }

  private async resolveDir(projectId: string): Promise<string> {
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
    const raw = await readJsonFile<unknown>(this.paths(dirPath).index)
    return normalizeIndex(raw)
  }

  private async writeMeta(dirPath: string, meta: ProjectMeta): Promise<void> {
    await writeJsonAtomic(this.paths(dirPath).meta, meta)
  }

  private async writeIndex(dirPath: string, index: ProjectIndex): Promise<void> {
    index.version = INDEX_SCHEMA_VERSION
    index.updatedAt = nowIso()
    // 确保不写回 children
    const clean: ProjectIndex = {
      version: INDEX_SCHEMA_VERSION,
      beats: { order: [...index.beats.order] },
      entities: { order: [...index.entities.order] },
      updatedAt: index.updatedAt
    }
    await writeJsonAtomic(this.paths(dirPath).index, clean)
  }

  private async touchProject(dirPath: string): Promise<ProjectMeta> {
    const meta = await this.readMeta(dirPath)
    meta.updatedAt = nowIso()
    await this.writeMeta(dirPath, meta)
    return meta
  }

  /**
   * 按 id 定位节点文件：优先用已知 fileName，否则扫目录
   */
  private async findBeatFile(
    dirPath: string,
    beatId: string,
    knownFileName?: string
  ): Promise<{ filePath: string; fileName: string } | null> {
    const beatsDir = this.paths(dirPath).beats
    if (knownFileName) {
      const filePath = this.beatPath(dirPath, knownFileName)
      if (await pathExists(filePath)) return { filePath, fileName: knownFileName }
    }
    const files = await listFileNames(beatsDir)
    for (const file of files) {
      const full = path.join(beatsDir, file)
      const beat = await readJsonFile<Beat>(full)
      if (beat?.id === beatId) return { filePath: full, fileName: file }
    }
    return null
  }

  // ── 项目级 ────────────────────────────────────────────

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

    const baseFolder = toFolderName(input.title)
    const folderName = await this.library.allocateFolderName(baseFolder)
    const dirPath = path.join(root, folderName)
    const p = this.paths(dirPath)

    await ensureDir(p.beats)
    await ensureDir(p.entities)
    await ensureDir(p.documents)

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
    const index = emptyIndex()

    await this.writeMeta(dirPath, meta)
    await this.writeIndex(dirPath, index)

    return {
      meta,
      index,
      beats: {},
      entities: {},
      dirPath
    }
  }

  async openProject(projectId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    return this.loadSnapshot(dirPath)
  }

  async openProjectByPath(dirPath: string): Promise<ProjectSnapshot> {
    if (!(await pathExists(path.join(dirPath, 'project.json')))) {
      throw new Error('该目录不是有效的造梦师项目（缺少 project.json）')
    }
    return this.loadSnapshot(dirPath)
  }

  private async loadSnapshot(dirPath: string): Promise<ProjectSnapshot> {
    const meta = await this.readMeta(dirPath)
    let index = await this.readIndex(dirPath)
    const p = this.paths(dirPath)

    const beats: Record<string, Beat> = {}
    const beatFiles = await listFileNames(p.beats)
    for (const file of beatFiles) {
      const beat = await readJsonFile<Beat>(path.join(p.beats, file))
      if (!beat?.id) continue
      // 补全/校正 fileName 字段
      if (!beat.fileName) beat.fileName = file
      beats[beat.id] = beat
    }

    // 迁移：若实际文件名与规范「名称-uuid.json」不一致，则重命名
    for (const beat of Object.values(beats)) {
      const expected = toBeatFileName(beat.title, beat.id)
      if (beat.fileName === expected) continue
      const from = this.beatPath(dirPath, beat.fileName)
      const to = this.beatPath(dirPath, expected)
      if (from !== to && (await pathExists(from))) {
        try {
          // 目标已存在则跳过（极端冲突）
          if (!(await pathExists(to))) {
            await fs.rename(from, to)
            beat.fileName = expected
            beat.updatedAt = nowIso()
            await writeJsonAtomic(to, beat)
          }
        } catch {
          // 重命名失败不阻断加载
        }
      }
    }

    const entities: Record<string, Entity> = {}
    const entityFiles = await listFileNames(p.entities)
    for (const file of entityFiles) {
      const raw = await readJsonFile<Record<string, unknown>>(path.join(p.entities, file))
      const entity = this.normalizeEntity(raw, file)
      if (entity) entities[entity.id] = entity
    }

    // 实体文件名迁移为「名称-uuid.json」
    for (const entity of Object.values(entities)) {
      const expected = toEntityFileName(entity.name, entity.id)
      if (entity.fileName === expected) continue
      const from = this.entityPath(dirPath, entity.fileName)
      const to = this.entityPath(dirPath, expected)
      if (from !== to && (await pathExists(from))) {
        try {
          if (!(await pathExists(to))) {
            await fs.rename(from, to)
            entity.fileName = expected
            entity.updatedAt = nowIso()
            await writeJsonAtomic(to, entity)
          }
        } catch {
          // 忽略
        }
      }
    }

    index = this.reconcileIndex(index, beats, entities)
    await this.writeIndex(dirPath, index)

    return { meta, index, beats, entities, dirPath }
  }

  /**
   * 兼容旧实体字段（kind / summary / attributes）→ 新结构
   */
  private normalizeEntity(
    raw: Record<string, unknown> | null,
    fileName: string
  ): Entity | null {
    if (!raw || typeof raw.id !== 'string') return null
    const name =
      typeof raw.name === 'string' && raw.name.trim() ? raw.name : '未命名实体'
    const content =
      typeof raw.content === 'string'
        ? raw.content
        : typeof raw.summary === 'string'
          ? raw.summary
          : ''
    const aliases = Array.isArray(raw.aliases)
      ? raw.aliases.filter((a): a is string => typeof a === 'string')
      : []
    return {
      id: raw.id,
      name,
      fileName: typeof raw.fileName === 'string' ? raw.fileName : fileName,
      content,
      aliases,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : nowIso(),
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : nowIso()
    }
  }

  /**
   * 让 index 与磁盘文件对齐（扁平 order）
   */
  private reconcileIndex(
    index: ProjectIndex,
    beats: Record<string, Beat>,
    entities: Record<string, Entity>
  ): ProjectIndex {
    const beatIds = new Set(Object.keys(beats))
    const entityIds = new Set(Object.keys(entities))

    index.beats.order = index.beats.order.filter((id) => beatIds.has(id))
    for (const id of beatIds) {
      if (!index.beats.order.includes(id)) index.beats.order.push(id)
    }

    index.entities.order = index.entities.order.filter((id) => entityIds.has(id))
    for (const id of entityIds) {
      if (!index.entities.order.includes(id)) index.entities.order.push(id)
    }

    return index
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
    const dirPath = await this.resolveDir(projectId)
    await removeDir(dirPath)
  }

  // ── 节点（扁平） ──────────────────────────────────────

  async createBeat(projectId: string, input: CreateBeatInput): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    const p = this.paths(dirPath)
    await ensureDir(p.beats)

    const ts = nowIso()
    const id = createId('beat')
    const title = input.title.trim() || '未命名节点'
    const fileName = toBeatFileName(title, id)
    const beat: Beat = {
      id,
      title,
      fileName,
      content: input.content ?? '',
      status: input.status ?? 'draft',
      entityRefs: [],
      createdAt: ts,
      updatedAt: ts
    }

    await writeJsonAtomic(this.beatPath(dirPath, fileName), beat)

    const index = await this.readIndex(dirPath)
    const list = [...index.beats.order.filter((x) => x !== id)]
    if (input.afterId && list.includes(input.afterId)) {
      const idx = list.indexOf(input.afterId)
      list.splice(idx + 1, 0, id)
    } else {
      list.push(id)
    }
    index.beats.order = list

    await this.writeIndex(dirPath, index)
    await this.touchProject(dirPath)
    return this.loadSnapshot(dirPath)
  }

  async updateBeat(
    projectId: string,
    beatId: string,
    patch: UpdateBeatInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    const located = await this.findBeatFile(dirPath, beatId)
    if (!located) throw new Error(`节点不存在: ${beatId}`)

    const beat = await readJsonFile<Beat>(located.filePath)
    if (!beat) throw new Error(`节点不存在: ${beatId}`)

    const titleChanged =
      patch.title !== undefined && patch.title.trim() && patch.title !== beat.title

    if (patch.title !== undefined) beat.title = patch.title.trim() || beat.title
    if (patch.content !== undefined) beat.content = patch.content
    if (patch.status !== undefined) beat.status = patch.status
    if (patch.entityRefs !== undefined) beat.entityRefs = patch.entityRefs
    beat.updatedAt = nowIso()

    // 标题变更 → 同步重命名文件（名称-uuid.json）
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
    } else {
      beat.fileName = beat.fileName || located.fileName
      await writeJsonAtomic(located.filePath, beat)
    }

    await this.touchProject(dirPath)
    return this.loadSnapshot(dirPath)
  }

  /**
   * 删除节点（扁平，无级联）
   */
  async deleteBeat(projectId: string, beatId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    const index = await this.readIndex(dirPath)
    const located = await this.findBeatFile(dirPath, beatId)

    index.beats.order = index.beats.order.filter((id) => id !== beatId)
    if (located) {
      try {
        await fs.unlink(located.filePath)
      } catch {
        // 文件可能已不在
      }
    }

    await this.writeIndex(dirPath, index)
    await this.touchProject(dirPath)
    return this.loadSnapshot(dirPath)
  }

  /**
   * 重排节点：用完整有序 id 列表覆盖
   */
  async reorderBeats(projectId: string, input: ReorderBeatsInput): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
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
  }

  // ── 实体 ──────────────────────────────────────────────

  private async findEntityFile(
    dirPath: string,
    entityId: string,
    knownFileName?: string
  ): Promise<{ filePath: string; fileName: string } | null> {
    const entitiesDir = this.paths(dirPath).entities
    if (knownFileName) {
      const filePath = this.entityPath(dirPath, knownFileName)
      if (await pathExists(filePath)) return { filePath, fileName: knownFileName }
    }
    const files = await listFileNames(entitiesDir)
    for (const file of files) {
      const full = path.join(entitiesDir, file)
      const raw = await readJsonFile<Record<string, unknown>>(full)
      if (raw && raw.id === entityId) return { filePath: full, fileName: file }
    }
    return null
  }

  async createEntity(projectId: string, input: CreateEntityInput): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    const p = this.paths(dirPath)
    await ensureDir(p.entities)

    const ts = nowIso()
    const id = createId('ent')
    const name = input.name.trim() || '未命名实体'
    const fileName = toEntityFileName(name, id)
    const entity: Entity = {
      id,
      name,
      fileName,
      content: input.content ?? '',
      aliases: input.aliases ?? [],
      createdAt: ts,
      updatedAt: ts
    }

    await writeJsonAtomic(this.entityPath(dirPath, fileName), entity)

    const index = await this.readIndex(dirPath)
    index.entities.order = [...index.entities.order.filter((x) => x !== id), id]
    await this.writeIndex(dirPath, index)
    await this.touchProject(dirPath)
    return this.loadSnapshot(dirPath)
  }

  async updateEntity(
    projectId: string,
    entityId: string,
    patch: UpdateEntityInput
  ): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    const located = await this.findEntityFile(dirPath, entityId)
    if (!located) throw new Error(`实体不存在: ${entityId}`)

    const raw = await readJsonFile<Record<string, unknown>>(located.filePath)
    const entity = this.normalizeEntity(raw, located.fileName)
    if (!entity) throw new Error(`实体不存在: ${entityId}`)

    const nameChanged =
      patch.name !== undefined && patch.name.trim() && patch.name !== entity.name

    if (patch.name !== undefined) entity.name = patch.name.trim() || entity.name
    if (patch.content !== undefined) entity.content = patch.content
    if (patch.aliases !== undefined) entity.aliases = patch.aliases
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
    } else {
      entity.fileName = entity.fileName || located.fileName
      await writeJsonAtomic(located.filePath, entity)
    }

    await this.touchProject(dirPath)
    return this.loadSnapshot(dirPath)
  }

  async deleteEntity(projectId: string, entityId: string): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
    const p = this.paths(dirPath)
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

    // 从节点的 entityRefs 中清理
    const beatFiles = await listFileNames(p.beats)
    for (const file of beatFiles) {
      const full = path.join(p.beats, file)
      const beat = await readJsonFile<Beat>(full)
      if (!beat?.entityRefs?.includes(entityId)) continue
      beat.entityRefs = beat.entityRefs.filter((id) => id !== entityId)
      beat.updatedAt = nowIso()
      await writeJsonAtomic(full, beat)
    }

    await this.writeIndex(dirPath, index)
    await this.touchProject(dirPath)
    return this.loadSnapshot(dirPath)
  }

  async reorderEntities(projectId: string, orderedIds: string[]): Promise<ProjectSnapshot> {
    const dirPath = await this.resolveDir(projectId)
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
  }
}
