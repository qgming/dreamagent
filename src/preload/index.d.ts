import type { AgentToolDefinition } from '../shared/agent-tools'
import type { AgentStreamEvent } from '../shared/agent-events'
import type { LlmPublicSettings, LlmSettingsPatch } from '../shared/llm-settings'
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

export interface AppApi {
  getVersion: () => Promise<string>
  getName: () => Promise<string>
}

export interface WindowApi {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  setTitle: (title: string) => Promise<void>
  onMaximizedChange: (handler: (maximized: boolean) => void) => () => void
}

export interface ProjectApi {
  getLibraryRoot: () => Promise<string>
  setLibraryRoot: (root: string) => Promise<string>
  listProjects: () => Promise<ProjectSummary[]>

  create: (input: CreateProjectInput) => Promise<ProjectSnapshot>
  open: (projectId: string) => Promise<ProjectSnapshot>
  openByPath: (dirPath: string) => Promise<ProjectSnapshot>
  updateMeta: (
    projectId: string,
    patch: Partial<Pick<ProjectMeta, 'title' | 'description'>>
  ) => Promise<ProjectMeta>
  delete: (projectId: string) => Promise<void>
  revealInFolder: (projectId: string) => Promise<void>

  createBeat: (
    projectId: string,
    input: CreateBeatInput
  ) => Promise<CreateMutationResult<Beat>>
  updateBeat: (
    projectId: string,
    beatId: string,
    patch: UpdateBeatInput
  ) => Promise<ProjectSnapshot>
  deleteBeat: (projectId: string, beatId: string) => Promise<ProjectSnapshot>
  reorderBeats: (projectId: string, input: ReorderBeatsInput) => Promise<ProjectSnapshot>
  reorderBeatSiblings: (
    projectId: string,
    input: import('../shared/project-types').ReorderSiblingsInput
  ) => Promise<ProjectSnapshot>
  reparentBeat: (
    projectId: string,
    beatId: string,
    input: import('../shared/project-types').ReparentInput
  ) => Promise<ProjectSnapshot>

  createEntity: (
    projectId: string,
    input: CreateEntityInput
  ) => Promise<CreateMutationResult<Entity>>
  updateEntity: (
    projectId: string,
    entityId: string,
    patch: UpdateEntityInput
  ) => Promise<ProjectSnapshot>
  deleteEntity: (projectId: string, entityId: string) => Promise<ProjectSnapshot>
  reorderEntities: (projectId: string, orderedIds: string[]) => Promise<ProjectSnapshot>
  reorderEntitySiblings: (
    projectId: string,
    input: import('../shared/project-types').ReorderSiblingsInput
  ) => Promise<ProjectSnapshot>
  reparentEntity: (
    projectId: string,
    entityId: string,
    input: import('../shared/project-types').ReparentInput
  ) => Promise<ProjectSnapshot>

  createChapter: (
    projectId: string,
    input: CreateChapterInput
  ) => Promise<CreateMutationResult<Chapter>>
  updateChapter: (
    projectId: string,
    chapterId: string,
    patch: UpdateChapterInput
  ) => Promise<ProjectSnapshot>
  deleteChapter: (projectId: string, chapterId: string) => Promise<ProjectSnapshot>
  getChapter: (projectId: string, chapterId: string) => Promise<Chapter>
  reorderChapters: (projectId: string, orderedIds: string[]) => Promise<ProjectSnapshot>
  reorderChaptersInFolder: (
    projectId: string,
    input: import('../shared/project-types').ReorderChaptersInFolderInput
  ) => Promise<ProjectSnapshot>
  moveChapter: (
    projectId: string,
    chapterId: string,
    input: import('../shared/project-types').MoveChapterInput
  ) => Promise<ProjectSnapshot>
  createChapterFolder: (
    projectId: string,
    input: import('../shared/project-types').CreateChapterFolderInput
  ) => Promise<
    CreateMutationResult<import('../shared/project-types').ChapterFolderMeta>
  >
  updateChapterFolder: (
    projectId: string,
    folderId: string,
    patch: import('../shared/project-types').UpdateChapterFolderInput
  ) => Promise<ProjectSnapshot>
  deleteChapterFolder: (projectId: string, folderId: string) => Promise<ProjectSnapshot>
  reorderChapterFolders: (
    projectId: string,
    input: import('../shared/project-types').ReorderSiblingsInput
  ) => Promise<ProjectSnapshot>
}

export interface SessionApi {
  list: (projectId: string) => Promise<SessionSummary[]>
  create: (projectId: string, input?: CreateSessionInput) => Promise<SessionView>
  open: (projectId: string, sessionId: string) => Promise<SessionView>
  update: (
    projectId: string,
    sessionId: string,
    patch: UpdateSessionInput
  ) => Promise<SessionView>
  delete: (projectId: string, sessionId: string) => Promise<void>
}

export interface AgentApi {
  startTurn: (input: AgentStartTurnInput) => Promise<AgentStartTurnResult>
  regenerateTurn: (
    input: import('../shared/ui-chat').AgentRegenerateTurnInput
  ) => Promise<AgentStartTurnResult>
  cancelTurn: (input: AgentCancelTurnInput) => Promise<void>
  listTools: () => Promise<AgentToolDefinition[]>
  onEvent: (handler: (event: AgentStreamEvent) => void) => () => void
}

export interface SettingsApi {
  getLlm: () => Promise<LlmPublicSettings>
  setLlm: (patch: LlmSettingsPatch) => Promise<LlmPublicSettings>
  getWebSearch: () => Promise<
    import('../shared/web-search').WebSearchPublicSettings
  >
  setWebSearch: (
    patch: import('../shared/web-search').WebSearchSettingsPatch
  ) => Promise<import('../shared/web-search').WebSearchPublicSettings>
}

export interface NetworkApi {
  corsFetch: (
    request: import('../shared/web-search').CorsFetchRequest
  ) => Promise<import('../shared/web-search').CorsFetchResponse>
  webSearch: (
    request: import('../shared/web-search').WebSearchRequest
  ) => Promise<import('../shared/web-search').WebSearchResponse>
}

export interface SkillsApi {
  list: () => Promise<SkillSummary[]>
  getDetail: (id: string) => Promise<SkillDetail>
  setEnabled: (id: string, enabled: boolean) => Promise<SkillSummary[]>
  importZip: () => Promise<ImportSkillZipResult | null>
  uninstall: (id: string) => Promise<UninstallSkillResult>
  reload: () => Promise<SkillSummary[]>
  create: (input: CreateSkillInput) => Promise<SkillWriteResult>
  writeFile: (input: WriteSkillFileInput) => Promise<SkillWriteResult>
  readFile: (id: string, relativePath: string) => Promise<string>
}

export interface DreamAgentApi {
  app: AppApi
  window: WindowApi
  project: ProjectApi
  session: SessionApi
  agent: AgentApi
  settings: SettingsApi
  skills: SkillsApi
  network: NetworkApi
}

declare global {
  interface Window {
    api: DreamAgentApi
  }
}

export {}
