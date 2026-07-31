/**
 * 造梦师 · 项目/节点/实体/文章/会话 共享类型
 *
 * {libraryRoot}/{projectFolder}/
 *   project.json
 *   index.json
 *   beats/{名称}-{uuid}.json          # 平铺；父子靠 parentId
 *   entities/{名称}-{uuid}.json
 *   documents/chapters/               # 文章；文件夹为真实子目录
 *     {文章}.json
 *     卷一/{文章}.json
 *   conversations/{convId}.json
 *   sessions/
 */

import {
  chapterOrderFromFlat,
  emptyChapterOrder,
  emptyTreeOrder,
  flattenChapterOrder,
  flattenTreeOrder,
  treeFromFlatOrder,
  type ChapterOrderIndex,
  type TreeOrderIndex
} from './tree-index'

export type { ChapterOrderIndex, TreeOrderIndex }

/** 节点写作成熟度（递进） */
export type BeatStatus = 'idea' | 'outline' | 'draft' | 'final'

/** 实体生命周期 */
export type EntityStatus = 'active' | 'dormant' | 'archived'

/** 文章成稿状态（产品文案称「文章」，非仅限小说章节） */
export type ChapterStatus = 'draft' | 'final'

export interface ProjectMeta {
  id: string
  folderName: string
  title: string
  description?: string
  version: number
  createdAt: string
  updatedAt: string
}

/** 节点文件 */
export interface Beat {
  id: string
  title: string
  fileName: string
  content: string
  status: BeatStatus
  /** 正文双链 → 实体 */
  entityRefs: string[]
  /** 正文双链 → 其他节点 */
  beatRefs: string[]
  /**
   * 结构父节点（同类型树，单父）；与双链正交
   * null/缺省 = 根
   */
  parentId?: string | null
  createdAt: string
  updatedAt: string
}

/** 实体文件 */
export interface Entity {
  id: string
  name: string
  fileName: string
  content: string
  status: EntityStatus
  /** 正文双链 → 其他实体 */
  entityRefs: string[]
  /** 正文双链 → 节点 */
  beatRefs: string[]
  /** 结构父实体（同类型树）；null/缺省 = 根 */
  parentId?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * 文章（AI 产出正文，独立于节点）
 * content 为纯文本，不含双链；关联关系写在 sourceBeatIds / entityRefs / beatRefs
 */
export interface Chapter {
  id: string
  title: string
  fileName: string
  /** 纯正文，不含 [@…](beat|entity:…) 双链 */
  content: string
  status: ChapterStatus
  /** 取材 / 覆盖的源节点（供 Agent 判断节点状态） */
  sourceBeatIds: string[]
  /** 文中涉及的实体 id（元数据，非正文双链） */
  entityRefs: string[]
  /** 文中涉及的其他节点 id（元数据） */
  beatRefs: string[]
  /** 所属文章文件夹；null/缺省 = 根目录 */
  folderId?: string | null
  conversationId?: string
  createdAt: string
  updatedAt: string
}

/** 文章文件夹元数据（真实磁盘子目录） */
export interface ChapterFolderMeta {
  id: string
  name: string
  parentId: string | null
  /** 相对 documents/chapters 的路径，如「卷一」或「卷一/上」 */
  relPath: string
  createdAt: string
  updatedAt: string
}

export type ConversationRole = 'user' | 'assistant' | 'system' | 'tool'

export interface ToolCallRecord {
  id: string
  name: string
  input: Record<string, unknown>
  status: 'pending' | 'running' | 'done' | 'error'
}

export interface ToolResultRecord {
  callId: string
  name: string
  ok: boolean
  summary: string
  data?: unknown
  error?: string
}

export interface BeatStatusUpdateRecord {
  beatId: string
  from: BeatStatus
  to: BeatStatus
}

export interface ConversationMessage {
  id: string
  role: ConversationRole
  content: string
  createdAt: string
  toolCalls?: ToolCallRecord[]
  toolResults?: ToolResultRecord[]
  chapterIds?: string[]
  beatStatusUpdates?: BeatStatusUpdateRecord[]
}

/** 会话全文（单独文件，不进 snapshot） */
export interface Conversation {
  id: string
  title: string
  messages: ConversationMessage[]
  pinnedBeatIds: string[]
  pinnedEntityIds: string[]
  createdAt: string
  updatedAt: string
}

/** 会话列表摘要（进 snapshot） */
export interface ConversationSummary {
  id: string
  title: string
  preview?: string
  messageCount: number
  createdAt: string
  updatedAt: string
}

/**
 * 项目索引 v3：节点/实体为树；文章为文件夹分组 + 文件夹树
 *
 * 兼容读：normalizeProjectIndex 会把 v2 的 { order } 升为 roots
 * 写回时附带派生的 order（扁平 DFS），方便旧代码与外部工具
 */
export interface ProjectIndex {
  version: number
  beats: TreeOrderIndex & {
    /** 派生：DFS 扁平序（只读兼容；以 roots/children 为准） */
    order: string[]
  }
  entities: TreeOrderIndex & {
    order: string[]
  }
  chapters: ChapterOrderIndex & {
    order: string[]
  }
  /** 文章文件夹树 + 元数据 */
  chapterFolders: TreeOrderIndex & {
    byId: Record<string, ChapterFolderMeta>
  }
  conversations: { order: string[] }
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  folderName: string
  title: string
  description?: string
  dirPath: string
  updatedAt: string
  createdAt: string
  beatCount: number
  entityCount: number
  chapterCount: number
}

export interface ProjectSnapshot {
  meta: ProjectMeta
  index: ProjectIndex
  beats: Record<string, Beat>
  entities: Record<string, Entity>
  chapters: Record<string, Chapter>
  /** 文章文件夹（与 index.chapterFolders.byId 同步） */
  chapterFolders: Record<string, ChapterFolderMeta>
  conversationSummaries: ConversationSummary[]
  dirPath: string
}

/** 创建类写操作返回：完整快照 + 刚创建的对象（避免并发下用 diff 猜 id） */
export interface CreateMutationResult<T> {
  snapshot: ProjectSnapshot
  created: T
}

export interface CreateProjectInput {
  title: string
  description?: string
}

export type UpdateProjectMetaInput = Partial<Pick<ProjectMeta, 'title' | 'description'>>

export interface CreateBeatInput {
  title: string
  content?: string
  status?: BeatStatus
  /** 插在同级某节点之后（兼容旧语义） */
  afterId?: string | null
  /** 父节点 id；缺省为根 */
  parentId?: string | null
}

export type UpdateBeatInput = Partial<
  Pick<Beat, 'title' | 'content' | 'status' | 'entityRefs' | 'beatRefs' | 'parentId'>
>

export interface CreateEntityInput {
  name: string
  content?: string
  status?: EntityStatus
  parentId?: string | null
  afterId?: string | null
}

export type UpdateEntityInput = Partial<
  Pick<Entity, 'name' | 'content' | 'status' | 'entityRefs' | 'beatRefs' | 'parentId'>
>

export interface CreateChapterInput {
  title: string
  /** 纯正文 */
  content?: string
  status?: ChapterStatus
  sourceBeatIds?: string[]
  /** 显式关联实体（不从 content 解析） */
  entityRefs?: string[]
  /** 显式关联节点（不从 content 解析） */
  beatRefs?: string[]
  conversationId?: string
  /** 所属文件夹 */
  folderId?: string | null
}

export type UpdateChapterInput = Partial<
  Pick<
    Chapter,
    | 'title'
    | 'content'
    | 'status'
    | 'sourceBeatIds'
    | 'entityRefs'
    | 'beatRefs'
    | 'conversationId'
    | 'folderId'
  >
>

export interface CreateChapterFolderInput {
  name: string
  parentId?: string | null
}

export type UpdateChapterFolderInput = Partial<Pick<ChapterFolderMeta, 'name' | 'parentId'>>

export interface CreateConversationInput {
  title?: string
  pinnedBeatIds?: string[]
  pinnedEntityIds?: string[]
}

export type UpdateConversationInput = Partial<
  Pick<Conversation, 'title' | 'pinnedBeatIds' | 'pinnedEntityIds'>
>

/** @deprecated 优先用 ReorderSiblingsInput；仅当全部为根时仍可用 */
export interface ReorderBeatsInput {
  orderedIds: string[]
}

/** 同级重排 */
export interface ReorderSiblingsInput {
  /** null = 根级 */
  parentId?: string | null
  orderedIds: string[]
}

/** 改挂父节点 */
export interface ReparentInput {
  parentId?: string | null
  /** 插在新父下某兄弟之后 */
  afterId?: string | null
}

/** 文章在文件夹内重排 */
export interface ReorderChaptersInFolderInput {
  folderId?: string | null
  orderedIds: string[]
}

/** 移动文章到另一文件夹 */
export interface MoveChapterInput {
  folderId?: string | null
  afterId?: string | null
}

export interface AgentRunTurnInput {
  projectId: string
  conversationId: string
  userMessage: string
  /** 为 true 时跑固定演示剧本 */
  demo?: boolean
}

export interface AgentRunTurnResult {
  conversation: Conversation
  snapshot: ProjectSnapshot
  /** 本轮新写入的文章 id */
  writtenChapterIds: string[]
}

export const BEAT_STATUS_LABELS: Record<BeatStatus, string> = {
  idea: '构思',
  outline: '大纲',
  draft: '成文',
  final: '定稿'
}

export const BEAT_STATUSES: BeatStatus[] = ['idea', 'outline', 'draft', 'final']

export const ENTITY_STATUS_LABELS: Record<EntityStatus, string> = {
  active: '活跃',
  dormant: '搁置',
  archived: '归档'
}

export const ENTITY_STATUSES: EntityStatus[] = ['active', 'dormant', 'archived']

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, string> = {
  draft: '草稿',
  final: '定稿'
}

export const CHAPTER_STATUSES: ChapterStatus[] = ['draft', 'final']

/**
 * 将旧版节点状态映射为新版（仅用于 schema v1 → v2 迁移）
 * 旧: draft/outlined/expanded/polished
 * 新: idea/outline/draft/final
 */
export function migrateLegacyBeatStatus(raw: unknown): BeatStatus {
  switch (raw) {
    case 'draft':
      return 'idea'
    case 'outlined':
      return 'outline'
    case 'expanded':
      return 'draft'
    case 'polished':
      return 'final'
    case 'idea':
    case 'outline':
    case 'final':
      return raw
    default:
      return 'idea'
  }
}

/**
 * 归一化节点状态（已是 v2 之后的读盘兜底）
 */
export function normalizeBeatStatus(raw: unknown): BeatStatus {
  switch (raw) {
    case 'idea':
    case 'outline':
    case 'draft':
    case 'final':
      return raw
    case 'outlined':
      return 'outline'
    case 'expanded':
      return 'draft'
    case 'polished':
      return 'final'
    default:
      return 'idea'
  }
}

/**
 * 归一化实体状态：缺省为 active
 */
export function normalizeEntityStatus(raw: unknown): EntityStatus {
  switch (raw) {
    case 'active':
    case 'dormant':
    case 'archived':
      return raw
    default:
      return 'active'
  }
}

/** 归一化文章状态 */
export function normalizeChapterStatus(raw: unknown): ChapterStatus {
  switch (raw) {
    case 'draft':
    case 'final':
      return raw
    default:
      return 'draft'
  }
}

function isTreeShape(raw: unknown): raw is TreeOrderIndex {
  return (
    !!raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as TreeOrderIndex).roots)
  )
}

function readFlatOrder(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as { order?: unknown; roots?: unknown }
  if (Array.isArray(o.order)) return o.order.filter((x) => typeof x === 'string')
  if (Array.isArray(o.roots)) return o.roots.filter((x) => typeof x === 'string')
  return []
}

function normalizeTreeSection(raw: unknown): TreeOrderIndex & { order: string[] } {
  if (isTreeShape(raw)) {
    const roots = [...((raw as TreeOrderIndex).roots ?? [])].filter(
      (x) => typeof x === 'string'
    )
    const children: Record<string, string[]> = {}
    const rawChildren = (raw as TreeOrderIndex).children ?? {}
    for (const [k, v] of Object.entries(rawChildren)) {
      if (Array.isArray(v)) children[k] = v.filter((x) => typeof x === 'string')
    }
    const tree = { roots, children }
    return { ...tree, order: flattenTreeOrder(tree) }
  }
  const flat = readFlatOrder(raw)
  const tree = treeFromFlatOrder(flat)
  return { ...tree, order: [...flat] }
}

function normalizeChapterSection(raw: unknown): ChapterOrderIndex & { order: string[] } {
  if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as ChapterOrderIndex).roots) &&
    (raw as ChapterOrderIndex).byFolder &&
    typeof (raw as ChapterOrderIndex).byFolder === 'object'
  ) {
    const roots = [...((raw as ChapterOrderIndex).roots ?? [])].filter(
      (x) => typeof x === 'string'
    )
    const byFolder: Record<string, string[]> = {}
    for (const [k, v] of Object.entries((raw as ChapterOrderIndex).byFolder ?? {})) {
      if (Array.isArray(v)) byFolder[k] = v.filter((x) => typeof x === 'string')
    }
    const section = { roots, byFolder }
    return { ...section, order: flattenChapterOrder(section) }
  }
  const flat = readFlatOrder(raw)
  const section = chapterOrderFromFlat(flat)
  return { ...section, order: [...flat] }
}

function normalizeChapterFolders(raw: unknown): ProjectIndex['chapterFolders'] {
  if (!raw || typeof raw !== 'object') {
    return { ...emptyTreeOrder(), byId: {} }
  }
  const r = raw as ProjectIndex['chapterFolders']
  const tree = normalizeTreeSection(r)
  const byId: Record<string, ChapterFolderMeta> = {}
  if (r.byId && typeof r.byId === 'object') {
    for (const [id, meta] of Object.entries(r.byId)) {
      if (!meta || typeof meta !== 'object') continue
      const m = meta as ChapterFolderMeta
      if (!m.id || !m.name) continue
      byId[id] = {
        id: m.id,
        name: String(m.name),
        parentId: m.parentId ?? null,
        relPath: String(m.relPath || m.name),
        createdAt: m.createdAt ?? new Date().toISOString(),
        updatedAt: m.updatedAt ?? m.createdAt ?? new Date().toISOString()
      }
    }
  }
  return { roots: tree.roots, children: tree.children, byId }
}

/**
 * 归一化 index：v2 {order} → v3 树；补齐 chapterFolders
 */
export function normalizeProjectIndex(raw: Partial<ProjectIndex> | null | undefined): {
  index: ProjectIndex
  needsWrite: boolean
} {
  const now = new Date().toISOString()
  const base = raw ?? {}
  const version = base.version ?? 0
  const needsWrite =
    !raw ||
    version < INDEX_SCHEMA_VERSION ||
    !raw.chapters ||
    !raw.conversations ||
    !raw.chapterFolders ||
    !isTreeShape(raw.beats) ||
    !isTreeShape(raw.entities)

  const beats = normalizeTreeSection(base.beats)
  const entities = normalizeTreeSection(base.entities)
  const chapters = normalizeChapterSection(base.chapters)
  const chapterFolders = normalizeChapterFolders(base.chapterFolders)

  return {
    index: {
      version: INDEX_SCHEMA_VERSION,
      beats,
      entities,
      chapters,
      chapterFolders,
      conversations: { order: [...(base.conversations?.order ?? [])] },
      updatedAt: base.updatedAt ?? now
    },
    needsWrite
  }
}

/** 写回前刷新派生 order 字段 */
export function withDerivedOrders(index: ProjectIndex): ProjectIndex {
  const beatsTree = { roots: index.beats.roots, children: index.beats.children }
  const entitiesTree = { roots: index.entities.roots, children: index.entities.children }
  const chaptersSec = { roots: index.chapters.roots, byFolder: index.chapters.byFolder }
  return {
    ...index,
    version: INDEX_SCHEMA_VERSION,
    beats: { ...beatsTree, order: flattenTreeOrder(beatsTree) },
    entities: { ...entitiesTree, order: flattenTreeOrder(entitiesTree) },
    chapters: { ...chaptersSec, order: flattenChapterOrder(chaptersSec) },
    chapterFolders: {
      roots: [...index.chapterFolders.roots],
      children: { ...index.chapterFolders.children },
      byId: { ...index.chapterFolders.byId }
    }
  }
}

export function emptyProjectIndex(): ProjectIndex {
  return {
    version: INDEX_SCHEMA_VERSION,
    beats: { ...emptyTreeOrder(), order: [] },
    entities: { ...emptyTreeOrder(), order: [] },
    chapters: { ...emptyChapterOrder(), order: [] },
    chapterFolders: { ...emptyTreeOrder(), byId: {} },
    conversations: { order: [] },
    updatedAt: new Date().toISOString()
  }
}

export const PROJECT_SCHEMA_VERSION = 3
/** index：树形 beats/entities + 文章文件夹 */
export const INDEX_SCHEMA_VERSION = 3
