import type { AgentToolDefinition } from '../shared/agent-tools'
import type {
  AgentRunTurnInput,
  AgentRunTurnResult,
  Chapter,
  Conversation,
  ConversationMessage,
  ConversationSummary,
  CreateBeatInput,
  CreateChapterInput,
  CreateConversationInput,
  CreateEntityInput,
  CreateProjectInput,
  ProjectMeta,
  ProjectSnapshot,
  ProjectSummary,
  ReorderBeatsInput,
  UpdateBeatInput,
  UpdateChapterInput,
  UpdateConversationInput,
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
}

export interface ConversationApi {
  list: (projectId: string) => Promise<ConversationSummary[]>
  create: (projectId: string, input?: CreateConversationInput) => Promise<Conversation>
  open: (projectId: string, conversationId: string) => Promise<Conversation>
  appendMessages: (
    projectId: string,
    conversationId: string,
    messages: ConversationMessage[]
  ) => Promise<Conversation>
  update: (
    projectId: string,
    conversationId: string,
    patch: UpdateConversationInput
  ) => Promise<Conversation>
  delete: (projectId: string, conversationId: string) => Promise<void>
}

export interface AgentApi {
  runTurn: (input: AgentRunTurnInput) => Promise<AgentRunTurnResult>
  listTools: () => Promise<AgentToolDefinition[]>
}

export interface DreamAgentApi {
  app: AppApi
  window: WindowApi
  project: ProjectApi
  conversation: ConversationApi
  agent: AgentApi
}

declare global {
  interface Window {
    api: DreamAgentApi
  }
}

export {}
