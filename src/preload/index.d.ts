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
  AgentRunningRun,
  AgentStartTurnInput,
  AgentStartTurnResult,
  CreateSessionInput,
  SessionSummary,
  SessionTokenUsageDay,
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
import type { PromptCategoryResource } from '../shared/prompts'
import type { UpdateStatus } from '../shared/updates'
import type { ProjectActivityDay } from '../shared/activity'

export interface AppApi {
  getVersion: () => Promise<string>
  getName: () => Promise<string>
}

export interface UpdatesApi {
  getStatus: () => Promise<UpdateStatus>
  check: () => Promise<UpdateStatus>
  download: () => Promise<UpdateStatus>
  quitAndInstall: () => Promise<void>
  openReleases: () => Promise<void>
  onStatus: (handler: (status: UpdateStatus) => void) => () => void
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
  tokenActivity: (projectId: string) => Promise<SessionTokenUsageDay[]>
  activity: (projectId: string) => Promise<ProjectActivityDay[]>
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
  steer: (input: import('../shared/ui-chat').AgentSteerInput) => Promise<void>
  followUp: (input: import('../shared/ui-chat').AgentFollowUpInput) => Promise<void>
  listTools: () => Promise<AgentToolDefinition[]>
  getRunning: (input?: {
    projectId?: string
    sessionId?: string
  }) => Promise<AgentRunningRun[]>
  onEvent: (handler: (event: AgentStreamEvent) => void) => () => void
}

export interface SettingsApi {
  getLlm: () => Promise<LlmProvidersPublic>
  addProvider: (input: LlmAddProviderInput) => Promise<LlmProvidersPublic>
  updateProvider: (
    providerId: string,
    patch: LlmUpdateProviderInput
  ) => Promise<LlmProvidersPublic>
  removeProvider: (providerId: string) => Promise<LlmProvidersPublic>
  setDefaultModel: (
    providerId: string,
    modelId: string
  ) => Promise<LlmProvidersPublic>
  setThinkingLevel: (level: LlmThinkingLevel) => Promise<LlmProvidersPublic>
  listSelectableModels: () => Promise<LlmSelectableModel[]>
  listRemoteModels: (input: {
    providerId?: string
    baseURL?: string
    apiKey?: string
  }) => Promise<LlmRemoteModelInfo[]>
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

export interface PromptsApi {
  listBuiltin: () => Promise<PromptCategoryResource[]>
}

export interface McpApi {
  list: () => Promise<import('../shared/mcp').McpServerConfig[]>
  get: (id: string) => Promise<import('../shared/mcp').McpServerConfig | null>
  upsert: (
    input: import('../shared/mcp').McpUpsertInput
  ) => Promise<import('../shared/mcp').McpServerConfig>
  importJson: (
    jsonText: string,
    discover?: boolean
  ) => Promise<import('../shared/mcp').McpServerConfig[]>
  remove: (id: string) => Promise<void>
  setEnabled: (
    id: string,
    enabled: boolean
  ) => Promise<import('../shared/mcp').McpServerConfig>
  toggleRemoteTool: (
    serverId: string,
    toolName: string,
    enabled: boolean
  ) => Promise<import('../shared/mcp').McpServerConfig>
  discover: (id: string) => Promise<import('../shared/mcp').McpServerConfig>
}

export interface DreamAgentApi {
  app: AppApi
  updates: UpdatesApi
  window: WindowApi
  project: ProjectApi
  session: SessionApi
  agent: AgentApi
  settings: SettingsApi
  skills: SkillsApi
  prompts: PromptsApi
  network: NetworkApi
  mcp: McpApi
}

declare global {
  interface Window {
    api: DreamAgentApi
  }
}

export {}
