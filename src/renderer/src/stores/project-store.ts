import { create } from 'zustand'
import type {
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
} from '@shared/project-types'

/** 项目内视图 */
export type ProjectView = 'overview' | 'beats' | 'entities' | 'create'

/** 项目表单模态：新建 或 编辑 */
export type ProjectFormMode =
  | { mode: 'create' }
  | { mode: 'edit'; projectId: string; title: string; description?: string }

/** 节点表单模态：新建或编辑名称 */
export type BeatFormMode =
  | { mode: 'create' }
  | { mode: 'edit'; beatId: string; title: string }

/** 实体表单模态：新建或编辑名称 */
export type EntityFormMode =
  | { mode: 'create' }
  | { mode: 'edit'; entityId: string; name: string }

interface ProjectState {
  library: ProjectSummary[]
  libraryRoot: string | null
  snapshot: ProjectSnapshot | null
  expandedProjectIds: string[]
  activeProjectId: string | null
  projectView: ProjectView
  selectedBeatId: string | null
  selectedEntityId: string | null
  projectForm: ProjectFormMode | null
  beatForm: BeatFormMode | null
  entityForm: EntityFormMode | null
  loading: boolean
  error: string | null

  refreshLibrary: () => Promise<void>
  loadLibraryRoot: () => Promise<void>
  createProject: (input: CreateProjectInput) => Promise<ProjectSnapshot>
  openProject: (projectId: string, view?: ProjectView) => Promise<void>
  closeProject: () => void
  deleteProject: (projectId: string) => Promise<void>
  updateProjectMeta: (
    projectId: string,
    patch: Partial<Pick<ProjectMeta, 'title' | 'description'>>
  ) => Promise<void>
  toggleProjectExpanded: (projectId: string) => void
  setProjectView: (view: ProjectView) => void
  setSelectedBeatId: (id: string | null) => void
  setSelectedEntityId: (id: string | null) => void
  openCreateProjectModal: () => void
  openEditProjectModal: (projectId: string) => void
  closeProjectFormModal: () => void
  openCreateBeatModal: () => void
  openEditBeatModal: (beatId: string) => void
  closeBeatFormModal: () => void
  openCreateEntityModal: () => void
  openEditEntityModal: (entityId: string) => void
  closeEntityFormModal: () => void

  createBeat: (input: CreateBeatInput) => Promise<void>
  updateBeat: (beatId: string, patch: UpdateBeatInput) => Promise<void>
  deleteBeat: (beatId: string) => Promise<void>
  reorderBeats: (input: ReorderBeatsInput) => Promise<void>

  createEntity: (input: CreateEntityInput) => Promise<void>
  updateEntity: (entityId: string, patch: UpdateEntityInput) => Promise<void>
  deleteEntity: (entityId: string) => Promise<void>
  reorderEntities: (orderedIds: string[]) => Promise<void>

  createChapter: (input: CreateChapterInput) => Promise<void>
  updateChapter: (chapterId: string, patch: UpdateChapterInput) => Promise<void>
  deleteChapter: (chapterId: string) => Promise<void>
  /** 外部（create-store）写入 snapshot */
  applyExternalSnapshot: (snap: ProjectSnapshot) => void
}

function applySnapshot(
  set: (partial: Partial<ProjectState>) => void,
  get: () => ProjectState,
  snap: ProjectSnapshot
): void {
  const expanded = new Set(get().expandedProjectIds)
  expanded.add(snap.meta.id)
  set({
    snapshot: {
      ...snap,
      chapters: snap.chapters ?? {},
      conversationSummaries: snap.conversationSummaries ?? []
    },
    activeProjectId: snap.meta.id,
    expandedProjectIds: [...expanded],
    error: null
  })
}

/**
 * 项目 / 节点 / 实体 / 章节 store
 */
export const useProjectStore = create<ProjectState>((set, get) => ({
  library: [],
  libraryRoot: null,
  snapshot: null,
  expandedProjectIds: [],
  activeProjectId: null,
  projectView: 'overview',
  selectedBeatId: null,
  selectedEntityId: null,
  projectForm: null,
  beatForm: null,
  entityForm: null,
  loading: false,
  error: null,

  loadLibraryRoot: async () => {
    try {
      const root = await window.api.project.getLibraryRoot()
      set({ libraryRoot: root })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  refreshLibrary: async () => {
    set({ loading: true, error: null })
    try {
      const library = await window.api.project.listProjects()
      set({ library, loading: false })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  createProject: async (input) => {
    set({ loading: true, error: null })
    try {
      const snap = await window.api.project.create(input)
      applySnapshot(set, get, snap)
      set({
        projectView: 'overview',
        selectedBeatId: null,
        selectedEntityId: null,
        loading: false,
        projectForm: null
      })
      await get().refreshLibrary()
      return snap
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  },

  openProject: async (projectId, view = 'overview') => {
    set({ loading: true, error: null })
    try {
      const prevId = get().activeProjectId
      const snap = await window.api.project.open(projectId)
      applySnapshot(set, get, snap)
      set({
        projectView: view,
        selectedBeatId: snap.index.beats.order[0] ?? null,
        selectedEntityId: snap.index.entities.order[0] ?? null,
        loading: false
      })
      if (prevId !== projectId) {
        void import('./create-store').then(({ useCreateStore }) => {
          useCreateStore.getState().reset()
        })
      }
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  closeProject: () => {
    set({
      snapshot: null,
      activeProjectId: null,
      selectedBeatId: null,
      selectedEntityId: null
    })
    // 动态导入避免循环依赖
    void import('./create-store').then(({ useCreateStore }) => {
      useCreateStore.getState().reset()
    })
  },

  deleteProject: async (projectId) => {
    set({ loading: true, error: null })
    try {
      await window.api.project.delete(projectId)
      const state = get()
      if (state.activeProjectId === projectId) {
        set({
          snapshot: null,
          activeProjectId: null,
          selectedBeatId: null,
          selectedEntityId: null
        })
        void import('./create-store').then(({ useCreateStore }) => {
          useCreateStore.getState().reset()
        })
      }
      set({
        expandedProjectIds: state.expandedProjectIds.filter((id) => id !== projectId),
        loading: false
      })
      await get().refreshLibrary()
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },

  updateProjectMeta: async (projectId, patch) => {
    try {
      const meta = await window.api.project.updateMeta(projectId, patch)
      const { snapshot, library } = get()
      if (snapshot?.meta.id === projectId) {
        set({ snapshot: { ...snapshot, meta } })
      }
      set({
        library: library.map((item) =>
          item.id === projectId
            ? {
                ...item,
                title: meta.title,
                description: meta.description,
                updatedAt: meta.updatedAt
              }
            : item
        )
      })
      await get().refreshLibrary()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  toggleProjectExpanded: (projectId) => {
    const setIds = new Set(get().expandedProjectIds)
    if (setIds.has(projectId)) setIds.delete(projectId)
    else setIds.add(projectId)
    set({ expandedProjectIds: [...setIds] })
  },

  setProjectView: (view) => set({ projectView: view }),
  setSelectedBeatId: (id) => set({ selectedBeatId: id }),
  setSelectedEntityId: (id) => set({ selectedEntityId: id }),

  openCreateProjectModal: () => set({ projectForm: { mode: 'create' } }),
  openEditProjectModal: (projectId) => {
    const { library, snapshot } = get()
    const fromLibrary = library.find((p) => p.id === projectId)
    const fromSnap = snapshot?.meta.id === projectId ? snapshot.meta : null
    const title = fromSnap?.title ?? fromLibrary?.title ?? ''
    const description = fromSnap?.description ?? fromLibrary?.description
    set({
      projectForm: { mode: 'edit', projectId, title, description }
    })
  },
  closeProjectFormModal: () => set({ projectForm: null }),

  openCreateBeatModal: () => set({ beatForm: { mode: 'create' } }),
  openEditBeatModal: (beatId) => {
    const beat = get().snapshot?.beats[beatId]
    if (!beat) return
    set({ beatForm: { mode: 'edit', beatId, title: beat.title } })
  },
  closeBeatFormModal: () => set({ beatForm: null }),

  openCreateEntityModal: () => set({ entityForm: { mode: 'create' } }),
  openEditEntityModal: (entityId) => {
    const entity = get().snapshot?.entities[entityId]
    if (!entity) return
    set({ entityForm: { mode: 'edit', entityId, name: entity.name } })
  },
  closeEntityFormModal: () => set({ entityForm: null }),

  createBeat: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.createBeat(activeProjectId, input)
      const newId = snap.index.beats.order[snap.index.beats.order.length - 1] ?? null
      applySnapshot(set, get, snap)
      set({
        selectedBeatId: newId ?? get().selectedBeatId,
        beatForm: null
      })
      await get().refreshLibrary()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  updateBeat: async (beatId, patch) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.updateBeat(activeProjectId, beatId, patch)
      applySnapshot(set, get, snap)
      set({ beatForm: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  deleteBeat: async (beatId) => {
    const { activeProjectId, selectedBeatId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.deleteBeat(activeProjectId, beatId)
      const nextSelected =
        selectedBeatId && !snap.beats[selectedBeatId]
          ? (snap.index.beats.order[0] ?? null)
          : selectedBeatId
      applySnapshot(set, get, snap)
      set({ selectedBeatId: nextSelected })
      await get().refreshLibrary()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  reorderBeats: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reorderBeats(activeProjectId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      applySnapshot(set, get, snap)
    }
  },

  createEntity: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.createEntity(activeProjectId, input)
      const newId = snap.index.entities.order[snap.index.entities.order.length - 1] ?? null
      applySnapshot(set, get, snap)
      set({ selectedEntityId: newId, entityForm: null })
      await get().refreshLibrary()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  updateEntity: async (entityId, patch) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.updateEntity(activeProjectId, entityId, patch)
      applySnapshot(set, get, snap)
      set({ entityForm: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  deleteEntity: async (entityId) => {
    const { activeProjectId, selectedEntityId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.deleteEntity(activeProjectId, entityId)
      const nextSelected =
        selectedEntityId && !snap.entities[selectedEntityId]
          ? (snap.index.entities.order[0] ?? null)
          : selectedEntityId
      applySnapshot(set, get, snap)
      set({ selectedEntityId: nextSelected })
      await get().refreshLibrary()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  reorderEntities: async (orderedIds) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reorderEntities(activeProjectId, orderedIds)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      applySnapshot(set, get, snap)
    }
  },

  createChapter: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.createChapter(activeProjectId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  updateChapter: async (chapterId, patch) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.updateChapter(activeProjectId, chapterId, patch)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  deleteChapter: async (chapterId) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.deleteChapter(activeProjectId, chapterId)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  applyExternalSnapshot: (snap) => {
    applySnapshot(set, get, snap)
  }
}))

/** 按 index 得到有序节点列表（扁平） */
export function getOrderedBeats(snapshot: ProjectSnapshot | null) {
  if (!snapshot) return []
  return snapshot.index.beats.order
    .map((id) => snapshot.beats[id])
    .filter(Boolean)
}

/** 有序实体列表 */
export function getOrderedEntities(snapshot: ProjectSnapshot | null) {
  if (!snapshot) return []
  return snapshot.index.entities.order
    .map((id) => snapshot.entities[id])
    .filter(Boolean)
}

/** 有序文章列表（按 index.chapters.order） */
export function getOrderedChapters(snapshot: ProjectSnapshot | null) {
  if (!snapshot) return []
  const order = snapshot.index.chapters?.order ?? []
  return order.map((id) => snapshot.chapters[id]).filter(Boolean)
}
