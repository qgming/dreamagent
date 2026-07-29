/**
 * 造梦师 · 项目/节点/实体 共享类型
 *
 * {libraryRoot}/{projectFolder}/
 *   project.json
 *   index.json
 *   beats/{名称}-{uuid}.json
 *   entities/{名称}-{uuid}.json
 *   documents/
 */

/** 节点写作成熟度（递进） */
export type BeatStatus = 'idea' | 'outline' | 'draft' | 'final'

/** 实体生命周期 */
export type EntityStatus = 'active' | 'dormant' | 'archived'

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

export interface ProjectIndex {
  version: number
  beats: { order: string[] }
  entities: { order: string[] }
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

export interface ReorderBeatsInput {
  orderedIds: string[]
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
    // 若仍撞到旧值（未迁移文件），按旧映射处理
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

export const PROJECT_SCHEMA_VERSION = 2
export const INDEX_SCHEMA_VERSION = 1
