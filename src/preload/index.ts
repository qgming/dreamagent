import { contextBridge, ipcRenderer } from 'electron'
import type { AgentToolDefinition } from '../shared/agent-tools'
import type { AgentStreamEvent } from '../shared/agent-events'
import type {
  LlmAddProviderInput,
  LlmProvidersPublic,
  LlmRemoteModelInfo,
  LlmSelectableModel,
  LlmThinkingLevel,
  LlmUpdateProviderInput
} from '../shared/llm-settings'
import type {
  AgentCancelTurnInput,
  AgentStartTurnInput,
  AgentStartTurnResult,
  CreateSessionInput,
  SessionSummary,
  SessionView,
  UpdateSessionInput
} from '../shared/ui-chat'
import type {
  Chapter,
  CreateBeatInput,
  CreateChapterInput,
  CreateEntityInput,
  CreateMutationResult,
  CreateProjectInput,
  Beat,
  Entity,
  ProjectMeta,
  ProjectSnapshot,
  ProjectSummary,
  ReorderBeatsInput,
  UpdateBeatInput,
  UpdateChapterInput,
  UpdateEntityInput
} from '../shared/project-types'
import type {
  CreateSkillInput,
  ImportSkillZipResult,
  SkillDetail,
  SkillSummary,
  SkillWriteResult,
  UninstallSkillResult,
  WriteSkillFileInput
} from '../shared/skills'

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
 * 项目库 / 项目 / 节点 / 实体 / 章节 API
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

  createBeat: (
    projectId: string,
    input: CreateBeatInput
  ): Promise<CreateMutationResult<Beat>> => ipcRenderer.invoke('beat:create', projectId, input),
  updateBeat: (
    projectId: string,
    beatId: string,
    patch: UpdateBeatInput
  ): Promise<ProjectSnapshot> => ipcRenderer.invoke('beat:update', projectId, beatId, patch),
  deleteBeat: (projectId: string, beatId: string): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('beat:delete', projectId, beatId),
  reorderBeats: (projectId: string, input: ReorderBeatsInput): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('beat:reorder', projectId, input),
  reorderBeatSiblings: (
    projectId: string,
    input: import('../shared/project-types').ReorderSiblingsInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('beat:reorderSiblings', projectId, input),
  reparentBeat: (
    projectId: string,
    beatId: string,
    input: import('../shared/project-types').ReparentInput
  ): Promise<ProjectSnapshot> => ipcRenderer.invoke('beat:reparent', projectId, beatId, input),

  createEntity: (
    projectId: string,
    input: CreateEntityInput
  ): Promise<CreateMutationResult<Entity>> =>
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
    ipcRenderer.invoke('entity:reorder', projectId, orderedIds),
  reorderEntitySiblings: (
    projectId: string,
    input: import('../shared/project-types').ReorderSiblingsInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('entity:reorderSiblings', projectId, input),
  reparentEntity: (
    projectId: string,
    entityId: string,
    input: import('../shared/project-types').ReparentInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('entity:reparent', projectId, entityId, input),

  createChapter: (
    projectId: string,
    input: CreateChapterInput
  ): Promise<CreateMutationResult<Chapter>> =>
    ipcRenderer.invoke('chapter:create', projectId, input),
  updateChapter: (
    projectId: string,
    chapterId: string,
    patch: UpdateChapterInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('chapter:update', projectId, chapterId, patch),
  deleteChapter: (projectId: string, chapterId: string): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('chapter:delete', projectId, chapterId),
  getChapter: (projectId: string, chapterId: string): Promise<Chapter> =>
    ipcRenderer.invoke('chapter:get', projectId, chapterId),
  reorderChapters: (projectId: string, orderedIds: string[]): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('chapter:reorder', projectId, orderedIds),
  reorderChaptersInFolder: (
    projectId: string,
    input: import('../shared/project-types').ReorderChaptersInFolderInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('chapter:reorderInFolder', projectId, input),
  moveChapter: (
    projectId: string,
    chapterId: string,
    input: import('../shared/project-types').MoveChapterInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('chapter:move', projectId, chapterId, input),
  createChapterFolder: (
    projectId: string,
    input: import('../shared/project-types').CreateChapterFolderInput
  ): Promise<
    CreateMutationResult<import('../shared/project-types').ChapterFolderMeta>
  > => ipcRenderer.invoke('chapterFolder:create', projectId, input),
  updateChapterFolder: (
    projectId: string,
    folderId: string,
    patch: import('../shared/project-types').UpdateChapterFolderInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('chapterFolder:update', projectId, folderId, patch),
  deleteChapterFolder: (projectId: string, folderId: string): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('chapterFolder:delete', projectId, folderId),
  reorderChapterFolders: (
    projectId: string,
    input: import('../shared/project-types').ReorderSiblingsInput
  ): Promise<ProjectSnapshot> =>
    ipcRenderer.invoke('chapterFolder:reorder', projectId, input)
}

/**
 * Pi Session API
 */
const sessionApi = {
  list: (projectId: string): Promise<SessionSummary[]> =>
    ipcRenderer.invoke('session:list', projectId),
  create: (projectId: string, input?: CreateSessionInput): Promise<SessionView> =>
    ipcRenderer.invoke('session:create', projectId, input),
  open: (projectId: string, sessionId: string): Promise<SessionView> =>
    ipcRenderer.invoke('session:open', projectId, sessionId),
  update: (
    projectId: string,
    sessionId: string,
    patch: UpdateSessionInput
  ): Promise<SessionView> => ipcRenderer.invoke('session:update', projectId, sessionId, patch),
  delete: (projectId: string, sessionId: string): Promise<void> =>
    ipcRenderer.invoke('session:delete', projectId, sessionId)
}

/**
 * Agent API（流式）
 */
const agentApi = {
  startTurn: (input: AgentStartTurnInput): Promise<AgentStartTurnResult> =>
    ipcRenderer.invoke('agent:startTurn', input),
  regenerateTurn: (
    input: import('../shared/ui-chat').AgentRegenerateTurnInput
  ): Promise<AgentStartTurnResult> => ipcRenderer.invoke('agent:regenerateTurn', input),
  cancelTurn: (input: AgentCancelTurnInput): Promise<void> =>
    ipcRenderer.invoke('agent:cancelTurn', input),
  steer: (input: import('../shared/ui-chat').AgentSteerInput): Promise<void> =>
    ipcRenderer.invoke('agent:steer', input),
  followUp: (input: import('../shared/ui-chat').AgentFollowUpInput): Promise<void> =>
    ipcRenderer.invoke('agent:followUp', input),
  listTools: (): Promise<AgentToolDefinition[]> => ipcRenderer.invoke('agent:listTools'),
  onEvent: (handler: (event: AgentStreamEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, event: AgentStreamEvent): void => {
      handler(event)
    }
    ipcRenderer.on('agent:event', listener)
    return () => {
      ipcRenderer.removeListener('agent:event', listener)
    }
  }
}

/**
 * 设置 API（多供应商 LLM + 网络搜索）
 */
const settingsApi = {
  getLlm: (): Promise<LlmProvidersPublic> => ipcRenderer.invoke('settings:getLlm'),
  addProvider: (input: LlmAddProviderInput): Promise<LlmProvidersPublic> =>
    ipcRenderer.invoke('settings:addProvider', input),
  updateProvider: (
    providerId: string,
    patch: LlmUpdateProviderInput
  ): Promise<LlmProvidersPublic> =>
    ipcRenderer.invoke('settings:updateProvider', providerId, patch),
  removeProvider: (providerId: string): Promise<LlmProvidersPublic> =>
    ipcRenderer.invoke('settings:removeProvider', providerId),
  setDefaultModel: (
    providerId: string,
    modelId: string
  ): Promise<LlmProvidersPublic> =>
    ipcRenderer.invoke('settings:setDefaultModel', providerId, modelId),
  setThinkingLevel: (level: LlmThinkingLevel): Promise<LlmProvidersPublic> =>
    ipcRenderer.invoke('settings:setThinkingLevel', level),
  listSelectableModels: (): Promise<LlmSelectableModel[]> =>
    ipcRenderer.invoke('settings:listSelectableModels'),
  listRemoteModels: (input: {
    providerId?: string
    baseURL?: string
    apiKey?: string
  }): Promise<LlmRemoteModelInfo[]> =>
    ipcRenderer.invoke('settings:listRemoteModels', input),
  getWebSearch: (): Promise<import('../shared/web-search').WebSearchPublicSettings> =>
    ipcRenderer.invoke('settings:getWebSearch'),
  setWebSearch: (
    patch: import('../shared/web-search').WebSearchSettingsPatch
  ): Promise<import('../shared/web-search').WebSearchPublicSettings> =>
    ipcRenderer.invoke('settings:setWebSearch', patch)
}

/**
 * 网络 API（调试/设置用；Agent 工具在主进程直连 NetworkService）
 */
const networkApi = {
  corsFetch: (
    request: import('../shared/web-search').CorsFetchRequest
  ): Promise<import('../shared/web-search').CorsFetchResponse> =>
    ipcRenderer.invoke('network:cors-fetch', request),
  webSearch: (
    request: import('../shared/web-search').WebSearchRequest
  ): Promise<import('../shared/web-search').WebSearchResponse> =>
    ipcRenderer.invoke('network:web-search', request)
}

/**
 * 技能 API
 */
const skillsApi = {
  list: (): Promise<SkillSummary[]> => ipcRenderer.invoke('skills:list'),
  getDetail: (id: string): Promise<SkillDetail> => ipcRenderer.invoke('skills:getDetail', id),
  setEnabled: (id: string, enabled: boolean): Promise<SkillSummary[]> =>
    ipcRenderer.invoke('skills:setEnabled', id, enabled),
  importZip: (): Promise<ImportSkillZipResult | null> => ipcRenderer.invoke('skills:importZip'),
  uninstall: (id: string): Promise<UninstallSkillResult> =>
    ipcRenderer.invoke('skills:uninstall', id),
  reload: (): Promise<SkillSummary[]> => ipcRenderer.invoke('skills:reload'),
  create: (input: CreateSkillInput): Promise<SkillWriteResult> =>
    ipcRenderer.invoke('skills:create', input),
  writeFile: (input: WriteSkillFileInput): Promise<SkillWriteResult> =>
    ipcRenderer.invoke('skills:writeFile', input),
  readFile: (id: string, relativePath: string): Promise<string> =>
    ipcRenderer.invoke('skills:readFile', id, relativePath)
}

const api = {
  app: appApi,
  window: windowApi,
  project: projectApi,
  session: sessionApi,
  agent: agentApi,
  settings: settingsApi,
  skills: skillsApi,
  network: networkApi
}

try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('暴露 preload API 失败:', error)
}
