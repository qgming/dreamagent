/**
 * 造梦师 · 项目/节点/实体/文章/会话 共享类型
 *
 * {libraryRoot}/{projectFolder}/
 *   project.json
 *   index.json
 *   beats/{名称}-{uuid}.json
 *   entities/{名称}-{uuid}.json
 *   documents/chapters/{名称}-{uuid}.json
 *   conversations/{convId}.json
 */

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
  /** 取材 / 覆盖的大纲节点（供 Agent 判断节点状态） */
  sourceBeatIds: string[]
  /** 文中涉及的实体 id（元数据，非正文双链） */
  entityRefs: string[]
  /** 文中涉及的其他节点 id（元数据） */
  beatRefs: string[]
  conversationId?: string
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

export interface ProjectIndex {
  version: number
  beats: { order: string[] }
  entities: { order: string[] }
  chapters: { order: string[] }
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
}

export interface ProjectSnapshot {
  meta: ProjectMeta
  index: ProjectIndex
  beats: Record<string, Beat>
  entities: Record<string, Entity>
  chapters: Record<string, Chapter>
  conversationSummaries: ConversationSummary[]
  dirPath: string
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
  afterId?: string | null
}

export type UpdateBeatInput = Partial<
  Pick<Beat, 'title' | 'content' | 'status' | 'entityRefs' | 'beatRefs'>
>

export interface CreateEntityInput {
  name: string
  content?: string
  status?: EntityStatus
}

export type UpdateEntityInput = Partial<
  Pick<Entity, 'name' | 'content' | 'status' | 'entityRefs' | 'beatRefs'>
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
}

export type UpdateChapterInput = Partial<
  Pick<
    Chapter,
    'title' | 'content' | 'status' | 'sourceBeatIds' | 'entityRefs' | 'beatRefs' | 'conversationId'
  >
>

export interface CreateConversationInput {
  title?: string
  pinnedBeatIds?: string[]
  pinnedEntityIds?: string[]
}

export type UpdateConversationInput = Partial<
  Pick<Conversation, 'title' | 'pinnedBeatIds' | 'pinnedEntityIds'>
>

export interface ReorderBeatsInput {
  orderedIds: string[]
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

/**
 * 归一化 index：补齐 chapters / conversations，必要时标记需写回
 */
export function normalizeProjectIndex(raw: Partial<ProjectIndex> | null | undefined): {
  index: ProjectIndex
  needsWrite: boolean
} {
  const now = new Date().toISOString()
  const base = raw ?? {}
  const needsWrite =
    !raw ||
    (raw.version ?? 0) < INDEX_SCHEMA_VERSION ||
    !raw.chapters ||
    !raw.conversations

  return {
    index: {
      version: INDEX_SCHEMA_VERSION,
      beats: { order: [...(base.beats?.order ?? [])] },
      entities: { order: [...(base.entities?.order ?? [])] },
      chapters: { order: [...(base.chapters?.order ?? [])] },
      conversations: { order: [...(base.conversations?.order ?? [])] },
      updatedAt: base.updatedAt ?? now
    },
    needsWrite
  }
}

export const PROJECT_SCHEMA_VERSION = 2
/** index 含 chapters / conversations */
export const INDEX_SCHEMA_VERSION = 2
