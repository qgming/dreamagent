/**
 * 造梦师 · 项目/节点/实体 共享类型
 * 本地目录结构：
 *   {libraryRoot}/{projectFolder}/
 *     project.json
 *     index.json                      ← 顺序的唯一索引（扁平）
 *     beats/{名称}-{uuid}.json
 *     entities/{名称}-{uuid}.json
 *     documents/
 */

/** 节点状态 */
export type BeatStatus = 'draft' | 'outlined' | 'expanded' | 'polished'

/** 项目元信息（project.json） */
export interface ProjectMeta {
  id: string
  folderName: string
  title: string
  description?: string
  version: number
  createdAt: string
  updatedAt: string
}

/** 节点文件（beats/{名称}-{uuid}.json） */
export interface Beat {
  id: string
  title: string
  fileName: string
  content: string
  status: BeatStatus
  entityRefs: string[]
  createdAt: string
  updatedAt: string
}

/** 实体文件（entities/{名称}-{uuid}.json）——无类型，仅名称 + 正文 */
export interface Entity {
  id: string
  name: string
  fileName: string
  /** 设定 / 简介正文 */
  content: string
  /** 别名，用于 @ 匹配 */
  aliases: string[]
  createdAt: string
  updatedAt: string
}

/** 索引文件（index.json） */
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

export type UpdateBeatInput = Partial<Pick<Beat, 'title' | 'content' | 'status' | 'entityRefs'>>

export interface CreateEntityInput {
  name: string
  content?: string
  aliases?: string[]
}

export type UpdateEntityInput = Partial<Pick<Entity, 'name' | 'content' | 'aliases'>>

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
export const INDEX_SCHEMA_VERSION = 2
