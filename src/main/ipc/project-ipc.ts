import { ipcMain, shell } from 'electron'
import type { ProjectService } from '../services/project-service'
import type { LegacyConversationMigrator } from '../services/legacy-migration'
import type {
  CreateBeatInput,
  CreateChapterFolderInput,
  CreateChapterInput,
  CreateEntityInput,
  CreateProjectInput,
  MoveChapterInput,
  ProjectMeta,
  ReorderBeatsInput,
  ReorderChaptersInFolderInput,
  ReorderSiblingsInput,
  ReparentInput,
  UpdateBeatInput,
  UpdateChapterFolderInput,
  UpdateChapterInput,
  UpdateEntityInput
} from '../../shared/project-types'

/**
 * 统一包装：把异常转成可序列化错误信息
 */
function handle<T>(fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[project-ipc]', message)
    throw new Error(message)
  })
}

/**
 * 注册项目/节点/实体/文章文件夹相关 IPC
 */
export function registerProjectIpc(
  projectService: ProjectService,
  legacyMigrator?: LegacyConversationMigrator
): void {
  ipcMain.handle('library:getRoot', () => handle(() => projectService.getLibraryRoot()))

  ipcMain.handle('library:setRoot', (_e, root: string) =>
    handle(() => projectService.setLibraryRoot(String(root)))
  )

  ipcMain.handle('library:listProjects', () => handle(() => projectService.listProjects()))

  ipcMain.handle('project:create', (_e, input: CreateProjectInput) =>
    handle(() => projectService.createProject(input))
  )

  ipcMain.handle('project:open', (_e, projectId: string) =>
    handle(() => projectService.openProject(String(projectId)))
  )

  ipcMain.handle('project:openByPath', (_e, dirPath: string) =>
    handle(() => projectService.openProjectByPath(String(dirPath)))
  )

  ipcMain.handle(
    'project:updateMeta',
    (_e, projectId: string, patch: Partial<Pick<ProjectMeta, 'title' | 'description'>>) =>
      handle(() => projectService.updateProjectMeta(String(projectId), patch))
  )

  ipcMain.handle('project:delete', (_e, projectId: string) =>
    handle(() => projectService.deleteProject(String(projectId)))
  )

  ipcMain.handle(
    'project:migrateLegacyConversations',
    (_e, projectId: string, options: { dryRun?: boolean } = {}) =>
      handle(() => {
        if (!legacyMigrator) {
          throw new Error('legacy 迁移服务未初始化')
        }
        return legacyMigrator.migrateProject(String(projectId), {
          dryRun: Boolean(options?.dryRun)
        })
      })
  )

  ipcMain.handle('project:revealInFolder', async (_e, projectId: string) => {
    return handle(async () => {
      const snap = await projectService.openProject(String(projectId))
      shell.showItemInFolder(snap.dirPath)
    })
  })

  // 节点（树）
  ipcMain.handle('beat:create', (_e, projectId: string, input: CreateBeatInput) =>
    handle(() => projectService.createBeat(String(projectId), input))
  )

  ipcMain.handle(
    'beat:update',
    (_e, projectId: string, beatId: string, patch: UpdateBeatInput) =>
      handle(() => projectService.updateBeat(String(projectId), String(beatId), patch))
  )

  ipcMain.handle('beat:delete', (_e, projectId: string, beatId: string) =>
    handle(() => projectService.deleteBeat(String(projectId), String(beatId)))
  )

  ipcMain.handle('beat:reorder', (_e, projectId: string, input: ReorderBeatsInput) =>
    handle(() => projectService.reorderBeats(String(projectId), input))
  )

  ipcMain.handle(
    'beat:reorderSiblings',
    (_e, projectId: string, input: ReorderSiblingsInput) =>
      handle(() => projectService.reorderBeatSiblings(String(projectId), input))
  )

  ipcMain.handle(
    'beat:reparent',
    (_e, projectId: string, beatId: string, input: ReparentInput) =>
      handle(() => projectService.reparentBeat(String(projectId), String(beatId), input))
  )

  // 实体（树）
  ipcMain.handle('entity:create', (_e, projectId: string, input: CreateEntityInput) =>
    handle(() => projectService.createEntity(String(projectId), input))
  )

  ipcMain.handle(
    'entity:update',
    (_e, projectId: string, entityId: string, patch: UpdateEntityInput) =>
      handle(() => projectService.updateEntity(String(projectId), String(entityId), patch))
  )

  ipcMain.handle('entity:delete', (_e, projectId: string, entityId: string) =>
    handle(() => projectService.deleteEntity(String(projectId), String(entityId)))
  )

  ipcMain.handle('entity:reorder', (_e, projectId: string, orderedIds: string[]) =>
    handle(() => projectService.reorderEntities(String(projectId), orderedIds))
  )

  ipcMain.handle(
    'entity:reorderSiblings',
    (_e, projectId: string, input: ReorderSiblingsInput) =>
      handle(() => projectService.reorderEntitySiblings(String(projectId), input))
  )

  ipcMain.handle(
    'entity:reparent',
    (_e, projectId: string, entityId: string, input: ReparentInput) =>
      handle(() => projectService.reparentEntity(String(projectId), String(entityId), input))
  )

  // 文章
  ipcMain.handle('chapter:create', (_e, projectId: string, input: CreateChapterInput) =>
    handle(() => projectService.createChapter(String(projectId), input))
  )

  ipcMain.handle(
    'chapter:update',
    (_e, projectId: string, chapterId: string, patch: UpdateChapterInput) =>
      handle(() => projectService.updateChapter(String(projectId), String(chapterId), patch))
  )

  ipcMain.handle('chapter:delete', (_e, projectId: string, chapterId: string) =>
    handle(() => projectService.deleteChapter(String(projectId), String(chapterId)))
  )

  ipcMain.handle('chapter:get', (_e, projectId: string, chapterId: string) =>
    handle(() => projectService.getChapter(String(projectId), String(chapterId)))
  )

  ipcMain.handle('chapter:reorder', (_e, projectId: string, orderedIds: string[]) =>
    handle(() => projectService.reorderChapters(String(projectId), orderedIds))
  )

  ipcMain.handle(
    'chapter:reorderInFolder',
    (_e, projectId: string, input: ReorderChaptersInFolderInput) =>
      handle(() => projectService.reorderChaptersInFolder(String(projectId), input))
  )

  ipcMain.handle(
    'chapter:move',
    (_e, projectId: string, chapterId: string, input: MoveChapterInput) =>
      handle(() => projectService.moveChapter(String(projectId), String(chapterId), input))
  )

  // 文章文件夹
  ipcMain.handle(
    'chapterFolder:create',
    (_e, projectId: string, input: CreateChapterFolderInput) =>
      handle(() => projectService.createChapterFolder(String(projectId), input))
  )

  ipcMain.handle(
    'chapterFolder:update',
    (_e, projectId: string, folderId: string, patch: UpdateChapterFolderInput) =>
      handle(() =>
        projectService.updateChapterFolder(String(projectId), String(folderId), patch)
      )
  )

  ipcMain.handle('chapterFolder:delete', (_e, projectId: string, folderId: string) =>
    handle(() => projectService.deleteChapterFolder(String(projectId), String(folderId)))
  )

  ipcMain.handle(
    'chapterFolder:reorder',
    (_e, projectId: string, input: ReorderSiblingsInput) =>
      handle(() => projectService.reorderChapterFolders(String(projectId), input))
  )
}
