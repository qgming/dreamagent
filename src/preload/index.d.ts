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
  CreateProjectInput,
  ProjectMeta,
  ProjectSnapshot,
  ProjectSummary,
  ReorderBeatsInput,
  UpdateBeatInput,
  UpdateChapterInput,
  UpdateEntityInput
} from '../shared/project-types'

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

  createBeat: (projectId: string, input: CreateBeatInput) => Promise<ProjectSnapshot>
  updateBeat: (
    projectId: string,
    beatId: string,
    patch: UpdateBeatInput
  ) => Promise<ProjectSnapshot>
  deleteBeat: (projectId: string, beatId: string) => Promise<ProjectSnapshot>
  reorderBeats: (projectId: string, input: ReorderBeatsInput) => Promise<ProjectSnapshot>

  createEntity: (projectId: string, input: CreateEntityInput) => Promise<ProjectSnapshot>
  updateEntity: (
    projectId: string,
    entityId: string,
    patch: UpdateEntityInput
  ) => Promise<ProjectSnapshot>
  deleteEntity: (projectId: string, entityId: string) => Promise<ProjectSnapshot>
  reorderEntities: (projectId: string, orderedIds: string[]) => Promise<ProjectSnapshot>

  createChapter: (projectId: string, input: CreateChapterInput) => Promise<ProjectSnapshot>
  updateChapter: (
    projectId: string,
    chapterId: string,
    patch: UpdateChapterInput
  ) => Promise<ProjectSnapshot>
  deleteChapter: (projectId: string, chapterId: string) => Promise<ProjectSnapshot>
  getChapter: (projectId: string, chapterId: string) => Promise<Chapter>
  reorderChapters: (projectId: string, orderedIds: string[]) => Promise<ProjectSnapshot>
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
  cancelTurn: (input: AgentCancelTurnInput) => Promise<void>
  listTools: () => Promise<AgentToolDefinition[]>
  onEvent: (handler: (event: AgentStreamEvent) => void) => () => void
}

export interface SettingsApi {
  getLlm: () => Promise<LlmPublicSettings>
  setLlm: (patch: LlmSettingsPatch) => Promise<LlmPublicSettings>
}

export interface DreamAgentApi {
  app: AppApi
  window: WindowApi
  project: ProjectApi
  session: SessionApi
  agent: AgentApi
  settings: SettingsApi
}

declare global {
  interface Window {
    api: DreamAgentApi
  }
}

export {}
