import { app } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import {
  PROJECT_SCHEMA_VERSION,
  type ProjectMeta,
  type ProjectIndex,
  type ProjectSummary
} from '../../shared/project-types'
import { ensureDir, listSubdirNames, pathExists, readJsonFile, writeJsonAtomic } from './fs-utils'

const LIBRARY_STATE_FILE = 'library.json'

interface LibraryState {
  /** 项目库根目录；空则使用默认文档目录 */
  libraryRoot: string | null
}

/**
 * 项目库服务：管理库根目录与项目列表扫描
 */
export class LibraryService {
  private state: LibraryState = { libraryRoot: null }
  private statePath: string

  constructor() {
    this.statePath = path.join(app.getPath('userData'), LIBRARY_STATE_FILE)
  }

  /** 初始化：读取库配置，确保默认目录存在 */
  async init(): Promise<void> {
    const saved = await readJsonFile<LibraryState>(this.statePath)
    if (saved?.libraryRoot) {
      this.state = { libraryRoot: saved.libraryRoot }
    }
    await ensureDir(await this.getLibraryRoot())
  }

  /** 默认库路径：文档/造梦师/projects */
  getDefaultLibraryRoot(): string {
    return path.join(app.getPath('documents'), '造梦师', 'projects')
  }

  /** 当前项目库根目录 */
  async getLibraryRoot(): Promise<string> {
    return this.state.libraryRoot || this.getDefaultLibraryRoot()
  }

  /** 设置项目库根目录并持久化 */
  async setLibraryRoot(root: string): Promise<string> {
    const resolved = path.resolve(root)
    await ensureDir(resolved)
    this.state.libraryRoot = resolved
    await writeJsonAtomic(this.statePath, this.state)
    return resolved
  }

  /**
   * 扫描库根下所有合法项目，返回摘要列表（按更新时间倒序）
   */
  async listProjects(): Promise<ProjectSummary[]> {
    const root = await this.getLibraryRoot()
    await ensureDir(root)
    const folders = await listSubdirNames(root)
    const summaries: ProjectSummary[] = []

    for (const folderName of folders) {
      const dirPath = path.join(root, folderName)
      const summary = await this.readProjectSummary(dirPath, folderName)
      if (summary) summaries.push(summary)
    }

    summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    return summaries
  }

  /**
   * 读取单个项目摘要；目录不合法则返回 null
   */
  async readProjectSummary(dirPath: string, folderName: string): Promise<ProjectSummary | null> {
    const metaPath = path.join(dirPath, 'project.json')
    const meta = await readJsonFile<ProjectMeta>(metaPath)
    if (!meta?.id || !meta.title) return null

    const beatsDir = path.join(dirPath, 'beats')
    const entitiesDir = path.join(dirPath, 'entities')
    const indexPath = path.join(dirPath, 'index.json')
    let beatCount = 0
    let entityCount = 0
    let chapterCount = 0
    try {
      const beatFiles = await fs.readdir(beatsDir)
      beatCount = beatFiles.filter((f) => f.endsWith('.json') && !f.startsWith('.')).length
    } catch {
      // 目录可能尚未创建
    }
    try {
      const entityFiles = await fs.readdir(entitiesDir)
      entityCount = entityFiles.filter((f) => f.endsWith('.json') && !f.startsWith('.')).length
    } catch {
      // 忽略
    }
    try {
      const index = await readJsonFile<Partial<ProjectIndex>>(indexPath)
      chapterCount = Array.isArray(index?.chapters?.order)
        ? index.chapters.order.length
        : Array.isArray(index?.chapters?.roots)
          ? index.chapters.roots.length +
            Object.values(index.chapters.byFolder ?? {}).reduce(
              (sum, ids) => sum + (Array.isArray(ids) ? ids.length : 0),
              0
            )
          : 0
    } catch {
      // 旧项目可能还没有文章索引
    }

    return {
      id: meta.id,
      folderName: meta.folderName || folderName,
      title: meta.title,
      description: meta.description,
      dirPath,
      updatedAt: meta.updatedAt,
      createdAt: meta.createdAt,
      beatCount,
      entityCount,
      chapterCount
    }
  }

  /** 按项目 id 在库中查找目录 */
  async findProjectDirById(projectId: string): Promise<string | null> {
    const root = await this.getLibraryRoot()
    const folders = await listSubdirNames(root)
    for (const folderName of folders) {
      const dirPath = path.join(root, folderName)
      const meta = await readJsonFile<ProjectMeta>(path.join(dirPath, 'project.json'))
      if (meta?.id === projectId) return dirPath
    }
    return null
  }

  /** 生成不冲突的文件夹名 */
  async allocateFolderName(baseName: string): Promise<string> {
    const root = await this.getLibraryRoot()
    let name = baseName
    let i = 2
    while (await pathExists(path.join(root, name))) {
      name = `${baseName}-${i}`
      i += 1
    }
    return name
  }

  /** 兼容旧调用：schema 版本常量 */
  get schemaVersion(): number {
    return PROJECT_SCHEMA_VERSION
  }
}
