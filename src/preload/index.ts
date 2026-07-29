import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateBeatInput,
  CreateEntityInput,
  CreateProjectInput,
  ProjectMeta,
  ProjectSnapshot,
  ProjectSummary,
  ReorderBeatsInput,
  UpdateBeatInput,
  UpdateEntityInput
} from '../shared/project-types'

/**
 * 应用信息 API
 */
const appApi = {
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  getName: (): Promise<string> => ipcRenderer.invoke('app:getName')
}

/**
 * 窗口控制 API
 */
const windowApi = {
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  setTitle: (title: string): Promise<void> => ipcRenderer.invoke('window:set-title', title),
  onMaximizedChange: (handler: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean): void => {
      handler(Boolean(value))
    }
    ipcRenderer.on('window:maximized-change', listener)
    return () => {
      ipcRenderer.removeListener('window:maximized-change', listener)
    }
  }
}

/**
 * 项目库 / 项目 / 节点 / 实体 API
 */
const projectApi = {
  getLibraryRoot: (): Promise<string> => ipcRenderer.invoke('library:getRoot'),
  setLibraryRoot: (root: string): Promise<string> => ipcRenderer.invoke('library:setRoot', root),
  listProjects: (): Promise<ProjectSummary[]> => ipcRenderer.invoke('library:listProjects'),

  create: (input: CreateProjectInput): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('project:create', input),
  open: (projectId: string): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('project:open', projectId),
  openByPath: (dirPath: string): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('project:openByPath', dirPath),
  updateMeta: (
    projectId: string,
    patch: Partial<Pick<ProjectMeta, 'title' | 'description'>>
  ): Promise<ProjectMeta> => ipcRenderer.invoke('project:updateMeta', projectId, patch),
  delete: (projectId: string): Promise<void> => ipcRenderer.invoke('project:delete', projectId),
  revealInFolder: (projectId: string): Promise<void> =>
    ipcRenderer.invoke('project:revealInFolder', projectId),

  createBeat: (projectId: string, input: CreateBeatInput): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('beat:create', projectId, input),
  updateBeat: (
    projectId: string,
    beatId: string,
    patch: UpdateBeatInput
  ): Promise<ProjectSnapshot> => ipcRenderer.invoke('beat:update', projectId, beatId, patch),
  deleteBeat: (projectId: string, beatId: string): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('beat:delete', projectId, beatId),
  reorderBeats: (projectId: string, input: ReorderBeatsInput): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('beat:reorder', projectId, input),

  createEntity: (projectId: string, input: CreateEntityInput): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('entity:create', projectId, input),
  updateEntity: (
    projectId: string,
    entityId: string,
    patch: UpdateEntityInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('entity:update', projectId, entityId, patch),
  deleteEntity: (projectId: string, entityId: string): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('entity:delete', projectId, entityId),
  reorderEntities: (projectId: string, orderedIds: string[]): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('entity:reorder', projectId, orderedIds)
}

const api = {
  app: appApi,
  window: windowApi,
  project: projectApi
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('暴露 preload API 失败:', error)
}
