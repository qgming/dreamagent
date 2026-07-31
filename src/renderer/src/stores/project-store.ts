import { create } from 'zustand'
import type {
  CreateBeatInput,
  CreateChapterFolderInput,
  CreateChapterInput,
  CreateEntityInput,
  CreateProjectInput,
  MoveChapterInput,
  ProjectMeta,
  ProjectSnapshot,
  ProjectSummary,
  ReorderBeatsInput,
  ReorderChaptersInFolderInput,
  ReorderSiblingsInput,
  ReparentInput,
  UpdateBeatInput,
  UpdateChapterFolderInput,
  UpdateChapterInput,
  UpdateEntityInput
} from '@shared/project-types'
import { getChildIds } from '@shared/tree-index'

/** 项目内视图 */
export type ProjectView = 'overview' | 'beats' | 'entities' | 'create'

/** 应用主表面：首页 / 技能库 / 项目 */
export type AppSurface = 'home' | 'skills' | 'mcp' | 'project'

/** 项目表单模态：新建 或 编辑 */
export type ProjectFormMode =
  | { mode: 'create' }
  | { mode: 'edit'; projectId: string; title: string; description?: string }

/** 节点表单模态：新建或编辑名称；create 可带 parentId 建子节点 */
export type BeatFormMode =
  | { mode: 'create'; parentId?: string | null }
  | { mode: 'edit'; beatId: string; title: string }

/** 实体表单模态：新建或编辑名称；create 可带 parentId 建子实体 */
export type EntityFormMode =
  | { mode: 'create'; parentId?: string | null }
  | { mode: 'edit'; entityId: string; name: string }

interface ProjectState {
  library: ProjectSummary[]
  libraryRoot: string | null
  snapshot: ProjectSnapshot | null
  expandedProjectIds: string[]
  activeProjectId: string | null
  /** 全局主表面 */
  appSurface: AppSurface
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
  openSkills: () => void
  openMcp: () => void
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
  openCreateBeatModal: (parentId?: string | null) => void
  openEditBeatModal: (beatId: string) => void
  closeBeatFormModal: () => void
  openCreateEntityModal: (parentId?: string | null) => void
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
  reorderChapters: (orderedIds: string[]) => Promise<void>
  reorderChaptersInFolder: (input: ReorderChaptersInFolderInput) => Promise<void>
  moveChapter: (chapterId: string, input: MoveChapterInput) => Promise<void>

  reparentBeat: (beatId: string, input: ReparentInput) => Promise<void>
  reparentEntity: (entityId: string, input: ReparentInput) => Promise<void>
  reorderBeatSiblings: (input: ReorderSiblingsInput) => Promise<void>
  reorderEntitySiblings: (input: ReorderSiblingsInput) => Promise<void>

  createChapterFolder: (input: CreateChapterFolderInput) => Promise<void>
  updateChapterFolder: (folderId: string, patch: UpdateChapterFolderInput) => Promise<void>
  deleteChapterFolder: (folderId: string) => Promise<void>
  reorderChapterFolders: (input: ReorderSiblingsInput) => Promise<void>

  /** 外部（create-store）写入 snapshot */
  applyExternalSnapshot: (snap: ProjectSnapshot) => void
}

function applySnapshot(
  set: (partial: Partial<ProjectState>) => void,
  get: () => ProjectState,
  snap: ProjectSnapshot
): void {
  const state = get()
  const expanded = new Set(state.expandedProjectIds)
  expanded.add(snap.meta.id)
  set({
    snapshot: {
      ...snap,
      chapters: snap.chapters ?? {},
      chapterFolders: snap.chapterFolders ?? snap.index?.chapterFolders?.byId ?? {},
      conversationSummaries: snap.conversationSummaries ?? []
    },
    activeProjectId: snap.meta.id,
    appSurface: 'project',
    expandedProjectIds: [...expanded],
    library: state.library.map((project) =>
      project.id === snap.meta.id
        ? {
            ...project,
            title: snap.meta.title,
            description: snap.meta.description,
            updatedAt: snap.meta.updatedAt,
            beatCount: Object.keys(snap.beats).length,
            entityCount: Object.keys(snap.entities).length,
            chapterCount: Object.keys(snap.chapters).length
          }
        : project
    ),
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
  appSurface: 'home',
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
      if (prevId !== projectId) {
        const { useCreateStore } = await import('./create-store')
        useCreateStore.getState().reset()
      }
      const snap = await window.api.project.open(projectId)
      applySnapshot(set, get, snap)
      // 同步切视图：进创作立刻满宽出现，不做 transition 延迟
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

  openSkills: () => {
    set({
      appSurface: 'skills',
      // 离开项目主视图，但保留侧栏项目展开状态
      activeProjectId: null,
      snapshot: null,
      selectedBeatId: null,
      selectedEntityId: null
    })
    void import('./create-store').then(({ useCreateStore }) => {
      useCreateStore.getState().reset()
    })
  },

  openMcp: () => {
    set({
      appSurface: 'mcp',
      activeProjectId: null,
      snapshot: null,
      selectedBeatId: null,
      selectedEntityId: null
    })
    void import('./create-store').then(({ useCreateStore }) => {
      useCreateStore.getState().reset()
    })
  },

  closeProject: () => {
    set({
      snapshot: null,
      activeProjectId: null,
      appSurface: 'home',
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
          appSurface: 'home',
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

  // 同步切页：进创作立刻满宽出现
  setProjectView: (view) => set({ appSurface: 'project', projectView: view }),
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

  openCreateBeatModal: (parentId) =>
    set({ beatForm: { mode: 'create', parentId: parentId ?? null } }),
  openEditBeatModal: (beatId) => {
    const beat = get().snapshot?.beats[beatId]
    if (!beat) return
    set({ beatForm: { mode: 'edit', beatId, title: beat.title } })
  },
  closeBeatFormModal: () => set({ beatForm: null }),

  openCreateEntityModal: (parentId) =>
    set({ entityForm: { mode: 'create', parentId: parentId ?? null } }),
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
      const { snapshot: snap, created } = await window.api.project.createBeat(
        activeProjectId,
        input
      )
      applySnapshot(set, get, snap)
      set({
        selectedBeatId: created.id,
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
      const { snapshot: snap, created } = await window.api.project.createEntity(
        activeProjectId,
        input
      )
      applySnapshot(set, get, snap)
      set({ selectedEntityId: created.id, entityForm: null })
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
      const { snapshot: snap } = await window.api.project.createChapter(
        activeProjectId,
        input
      )
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

  reorderChapters: async (orderedIds) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reorderChapters(activeProjectId, orderedIds)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      applySnapshot(set, get, snap)
    }
  },

  reorderChaptersInFolder: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reorderChaptersInFolder(activeProjectId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      applySnapshot(set, get, snap)
    }
  },

  moveChapter: async (chapterId, input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.moveChapter(activeProjectId, chapterId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  reparentBeat: async (beatId, input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reparentBeat(activeProjectId, beatId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  reparentEntity: async (entityId, input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reparentEntity(activeProjectId, entityId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  reorderBeatSiblings: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reorderBeatSiblings(activeProjectId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      applySnapshot(set, get, snap)
    }
  },

  reorderEntitySiblings: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reorderEntitySiblings(activeProjectId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      applySnapshot(set, get, snap)
    }
  },

  createChapterFolder: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const { snapshot: snap } = await window.api.project.createChapterFolder(
        activeProjectId,
        input
      )
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  updateChapterFolder: async (folderId, patch) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.updateChapterFolder(
        activeProjectId,
        folderId,
        patch
      )
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  },

  deleteChapterFolder: async (folderId) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.deleteChapterFolder(activeProjectId, folderId)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    }
  },

  reorderChapterFolders: async (input) => {
    const { activeProjectId } = get()
    if (!activeProjectId) return
    try {
      const snap = await window.api.project.reorderChapterFolders(activeProjectId, input)
      applySnapshot(set, get, snap)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
      const snap = await window.api.project.open(activeProjectId)
      applySnapshot(set, get, snap)
    }
  },

  applyExternalSnapshot: (snap) => {
    applySnapshot(set, get, snap)
  }
}))

/** 按 index 得到有序节点列表（DFS 扁平，兼容旧调用） */
export function getOrderedBeats(snapshot: ProjectSnapshot | null) {
  if (!snapshot) return []
  const order = snapshot.index.beats.order?.length
    ? snapshot.index.beats.order
    : [...(snapshot.index.beats.roots ?? [])]
  return order.map((id) => snapshot.beats[id]).filter(Boolean)
}

/** 有序实体列表（DFS 扁平） */
export function getOrderedEntities(snapshot: ProjectSnapshot | null) {
  if (!snapshot) return []
  const order = snapshot.index.entities.order?.length
    ? snapshot.index.entities.order
    : [...(snapshot.index.entities.roots ?? [])]
  return order.map((id) => snapshot.entities[id]).filter(Boolean)
}

/** 有序文章列表（扁平） */
export function getOrderedChapters(snapshot: ProjectSnapshot | null) {
  if (!snapshot) return []
  const order = snapshot.index.chapters?.order ?? []
  return order.map((id) => snapshot.chapters[id]).filter(Boolean)
}

/** 某父下的直接子节点 */
export function getBeatChildren(snapshot: ProjectSnapshot | null, parentId?: string | null) {
  if (!snapshot) return []
  return getChildIds(snapshot.index.beats, parentId)
    .map((id) => snapshot.beats[id])
    .filter(Boolean)
}

/** 某父下的直接子实体 */
export function getEntityChildren(snapshot: ProjectSnapshot | null, parentId?: string | null) {
  if (!snapshot) return []
  return getChildIds(snapshot.index.entities, parentId)
    .map((id) => snapshot.entities[id])
    .filter(Boolean)
}

/** 文件夹内文章 */
export function getChaptersInFolder(
  snapshot: ProjectSnapshot | null,
  folderId?: string | null
) {
  if (!snapshot) return []
  const ids = !folderId
    ? (snapshot.index.chapters.roots ?? [])
    : (snapshot.index.chapters.byFolder?.[folderId] ?? [])
  return ids.map((id) => snapshot.chapters[id]).filter(Boolean)
}

/** 某父下的子文件夹 */
export function getChapterFolderChildren(
  snapshot: ProjectSnapshot | null,
  parentId?: string | null
) {
  if (!snapshot) return []
  return getChildIds(snapshot.index.chapterFolders, parentId)
    .map((id) => snapshot.chapterFolders[id] ?? snapshot.index.chapterFolders.byId[id])
    .filter(Boolean)
}
