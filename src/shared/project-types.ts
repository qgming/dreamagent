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

export type BeatStatus = 'draft' | 'outlined' | 'expanded' | 'polished'

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
}

export type UpdateEntityInput = Partial<
  Pick<Entity, 'name' | 'content' | 'entityRefs' | 'beatRefs'>
>

export interface ReorderBeatsInput {
  orderedIds: string[]
}

export const BEAT_STATUS_LABELS: Record<BeatStatus, string> = {
  draft: '草稿',
  outlined: '已大纲',
  expanded: '已扩写',
  polished: '已润色'
}

export const PROJECT_SCHEMA_VERSION = 1
export const INDEX_SCHEMA_VERSION = 1
