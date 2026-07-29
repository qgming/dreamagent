import { create } from 'zustand'
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
} from '@shared/project-types'

/** 项目内视图 */
export type ProjectView = 'beats' | 'entities' | 'create'

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
  createBeatsOpen: boolean
  createEntitiesOpen: boolean
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
  setCreateBeatsOpen: (open: boolean) => void
  setCreateEntitiesOpen: (open: boolean) => void
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
}

function applySnapshot(
  set: (partial: Partial<ProjectState>) => void,
  get: () => ProjectState,
  snap: ProjectSnapshot
): void {
  const expanded = new Set(get().expandedProjectIds)
  expanded.add(snap.meta.id)
  set({
    snapshot: snap,
    activeProjectId: snap.meta.id,
    expandedProjectIds: [...expanded],
    error: null
  })
}

/**
 * 项目 / 节点 / 实体 store
 */
export const useProjectStore = create<ProjectState>((set, get) => ({
  library: [],
  libraryRoot: null,
  snapshot: null,
  expandedProjectIds: [],
  activeProjectId: null,
  projectView: 'create',
  selectedBeatId: null,
  selectedEntityId: null,
  createBeatsOpen: true,
  createEntitiesOpen: true,
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
        projectView: 'create',
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

  openProject: async (projectId, view = 'create') => {
    set({ loading: true, error: null })
    try {
      const snap = await window.api.project.open(projectId)
      applySnapshot(set, get, snap)
      set({
        projectView: view,
        selectedBeatId: snap.index.beats.order[0] ?? null,
        selectedEntityId: snap.index.entities.order[0] ?? null,
        loading: false
      })
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
        ),
        projectForm: null
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
  setCreateBeatsOpen: (open) => set({ createBeatsOpen: open }),
  setCreateEntitiesOpen: (open) => set({ createEntitiesOpen: open }),

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
      set({
        snapshot: snap,
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
      set({ snapshot: snap, beatForm: null })
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
      set({ snapshot: snap, selectedBeatId: nextSelected })
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
      set({ snapshot: snap })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      set({ snapshot: snap })
    }
  },

  createEntity: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.createEntity(activeProjectId, input)
      const newId = snap.index.entities.order[snap.index.entities.order.length - 1] ?? null
      set({ snapshot: snap, selectedEntityId: newId, entityForm: null })
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
      set({ snapshot: snap, entityForm: null })
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
      set({ snapshot: snap, selectedEntityId: nextSelected })
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
      set({ snapshot: snap })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      set({ snapshot: snap })
    }
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
