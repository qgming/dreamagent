/**
 * 技能 store：列表 / 开关 / 导入 / 卸载 / 新建 / 编辑
 */
import { create } from 'zustand'
import type {
  CreateSkillInput,
  SkillDetail,
  SkillSummary,
  WriteSkillFileInput
} from '@shared/skills'

type SkillsStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SkillsState {
  skills: SkillSummary[]
  status: SkillsStatus
  errorMessage: string | null
  detail: SkillDetail | null
  detailLoading: boolean

  load: () => Promise<void>
  reload: () => Promise<void>
  toggle: (id: string, enabled: boolean) => Promise<void>
  importZip: () => Promise<boolean>
  uninstall: (id: string) => Promise<boolean>
  create: (input: CreateSkillInput) => Promise<string>
  writeFile: (input: WriteSkillFileInput) => Promise<void>
  openDetail: (id: string) => Promise<void>
  closeDetail: () => void
}

function errMsg(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

/**
 * 技能管理 store
 */
export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  status: 'idle',
  errorMessage: null,
  detail: null,
  detailLoading: false,

  load: async () => {
    set({ status: 'loading', errorMessage: null })
    try {
      const skills = await window.api.skills.list()
      set({ skills, status: 'ready', errorMessage: null })
    } catch (error) {
      set({
        status: 'error',
        errorMessage: errMsg(error, '加载技能失败')
      })
    }
  },

  reload: async () => {
    set({ status: 'loading', errorMessage: null })
    try {
      const skills = await window.api.skills.reload()
      set({ skills, status: 'ready', errorMessage: null })
    } catch (error) {
      set({
        status: 'error',
        errorMessage: errMsg(error, '刷新技能失败')
      })
    }
  },

  toggle: async (id, enabled) => {
    try {
      const skills = await window.api.skills.setEnabled(id, enabled)
      set({ skills, errorMessage: null })
      const detail = get().detail
      if (detail?.id === id) {
        set({ detail: { ...detail, enabled } })
      }
    } catch (error) {
      set({ errorMessage: errMsg(error, '更新启用状态失败') })
      throw error
    }
  },

  importZip: async () => {
    try {
      const result = await window.api.skills.importZip()
      if (!result) return false
      const skills = await window.api.skills.list()
      set({ skills, status: 'ready', errorMessage: null })
      return true
    } catch (error) {
      set({ errorMessage: errMsg(error, '导入技能失败') })
      throw error
    }
  },

  uninstall: async (id) => {
    try {
      await window.api.skills.uninstall(id)
      const skills = await window.api.skills.list()
      const detail = get().detail
      set({
        skills,
        detail: detail?.id === id ? null : detail,
        errorMessage: null
      })
      return true
    } catch (error) {
      set({ errorMessage: errMsg(error, '卸载技能失败') })
      throw error
    }
  },

  create: async (input) => {
    try {
      const result = await window.api.skills.create(input)
      const skills = await window.api.skills.list()
      set({ skills, status: 'ready', errorMessage: null })
      return result.id
    } catch (error) {
      set({ errorMessage: errMsg(error, '创建技能失败') })
      throw error
    }
  },

  writeFile: async (input) => {
    try {
      await window.api.skills.writeFile(input)
      const skills = await window.api.skills.list()
      set({ skills, errorMessage: null })
      const detail = get().detail
      if (detail?.id === input.id) {
        const next = await window.api.skills.getDetail(input.id)
        set({ detail: next })
      }
    } catch (error) {
      set({ errorMessage: errMsg(error, '保存技能失败') })
      throw error
    }
  },

  openDetail: async (id) => {
    set({ detailLoading: true })
    try {
      const detail = await window.api.skills.getDetail(id)
      set({ detail, detailLoading: false, errorMessage: null })
    } catch (error) {
      set({
        detailLoading: false,
        errorMessage: errMsg(error, '读取技能详情失败')
      })
    }
  },

  closeDetail: () => set({ detail: null })
}))

/** 展示名：优先中文 displayName */
export function skillLabel(skill: Pick<SkillSummary, 'displayName' | 'name'>): string {
  const display = skill.displayName?.trim()
  return display || skill.name
}
