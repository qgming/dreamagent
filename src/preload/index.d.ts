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
}

export interface DreamAgentApi {
  app: AppApi
  window: WindowApi
  project: ProjectApi
}

declare global {
  interface Window {
    api: DreamAgentApi
  }
}

export {}
