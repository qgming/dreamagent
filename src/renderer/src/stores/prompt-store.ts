import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PromptCategoryResource, PromptResourceItem } from '@shared/prompts'

export type PromptSource = 'builtin' | 'custom'

export interface PromptCategory {
  id: string
  label: string
  source: PromptSource
}

export type PromptCategoryId = string

export interface PromptCategoryDraft {
  label: string
}

export const DEFAULT_PROMPT_CATEGORY_ID = 'writing'
const LEGACY_CUSTOM_CATEGORY_ID = 'category-migrated-prompts'
const BUILTIN_PROMPT_TIMESTAMP = '2026-01-01T00:00:00.000Z'
const KNOWN_BUILTIN_CATEGORY_IDS = new Set(['writing', 'characters', 'plot', 'scene', 'review'])

export interface PromptTemplate {
  id: string
  title: string
  description: string
  content: string
  categoryId: PromptCategoryId
  source: PromptSource
  createdAt: string
  updatedAt: string
}

export interface PromptDraft {
  title: string
  description: string
  content: string
  categoryId: PromptCategoryId
}

type BuiltinStatus = 'idle' | 'loading' | 'ready' | 'error'

interface PromptState {
  categories: PromptCategory[]
  prompts: PromptTemplate[]
  builtinStatus: BuiltinStatus
  builtinError: string | null
  loadBuiltinPrompts: () => Promise<void>
  addCategory: (draft: PromptCategoryDraft) => string | null
  updateCategory: (id: string, draft: PromptCategoryDraft) => boolean
  removeCategory: (id: string) => void
  addPrompt: (draft: PromptDraft) => string | null
  updatePrompt: (id: string, draft: PromptDraft) => void
  removePrompt: (id: string) => void
  restorePromptDefault: (id: string) => Promise<PromptTemplate | null>
}

let loadedBuiltinPrompts: PromptTemplate[] = []
let builtinLoadPromise: Promise<void> | null = null

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function isPromptCategoryId(value: unknown): value is PromptCategoryId {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeCategoryDraft(draft: PromptCategoryDraft): PromptCategoryDraft {
  return { label: draft.label.trim() }
}

function normalizeDraft(draft: PromptDraft, categories: PromptCategory[]): PromptDraft {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    content: draft.content.trim(),
    categoryId: categories.some((category) => category.id === draft.categoryId)
      ? draft.categoryId
      : DEFAULT_PROMPT_CATEGORY_ID
  }
}

function categoryExists(categories: PromptCategory[], categoryId: unknown): categoryId is string {
  return isPromptCategoryId(categoryId) && categories.some((category) => category.id === categoryId)
}

function resourceToState(resources: PromptCategoryResource[]): {
  categories: PromptCategory[]
  prompts: PromptTemplate[]
} {
  const categories = resources.map((resource) => ({
    id: resource.id,
    label: resource.label,
    source: 'builtin' as const
  }))
  const prompts = resources.flatMap((resource) =>
    resource.prompts.map((prompt) => resourcePromptToTemplate(prompt, resource.id))
  )
  return { categories, prompts }
}

function resourcePromptToTemplate(prompt: PromptResourceItem, categoryId: string): PromptTemplate {
  return {
    id: prompt.id,
    title: prompt.title,
    description: prompt.description,
    content: prompt.content,
    categoryId,
    source: 'builtin',
    createdAt: prompt.createdAt ?? BUILTIN_PROMPT_TIMESTAMP,
    updatedAt: prompt.updatedAt ?? BUILTIN_PROMPT_TIMESTAMP
  }
}

function mergeBuiltinResources(
  state: Pick<PromptState, 'categories' | 'prompts'>,
  resources: PromptCategoryResource[]
): Pick<PromptState, 'categories' | 'prompts'> {
  const loaded = resourceToState(resources)
  const builtinCategoryIds = new Set(loaded.categories.map((category) => category.id))
  const customCategories = state.categories.filter(
    (category) => category.source === 'custom' && !builtinCategoryIds.has(category.id)
  )
  const categories = [...loaded.categories, ...customCategories]
  const savedBuiltinById = new Map(
    state.prompts
      .filter((prompt) => prompt.source === 'builtin')
      .map((prompt) => [prompt.id, prompt])
  )
  const prompts = loaded.prompts.map((prompt) => {
    const saved = savedBuiltinById.get(prompt.id)
    if (!saved) return prompt
    return {
      ...prompt,
      title: saved.title,
      description: saved.description,
      content: saved.content,
      // 内置提示词的所属分类由 resources/prompts/*.json 决定，避免旧版本
      // 持久化的错误 categoryId 将所有内置项集中到同一个分类。
      categoryId: prompt.categoryId,
      createdAt: saved.createdAt,
      updatedAt: saved.updatedAt
    }
  })
  return {
    categories,
    prompts: [
      ...prompts,
      ...state.prompts.filter((prompt) => prompt.source === 'custom')
    ]
  }
}

export const usePromptStore = create<PromptState>()(
  persist(
    (set, get) => ({
      categories: [],
      prompts: [],
      builtinStatus: 'idle',
      builtinError: null,

      loadBuiltinPrompts: () => {
        if (builtinLoadPromise) return builtinLoadPromise
        builtinLoadPromise = (async () => {
          set({ builtinStatus: 'loading', builtinError: null })
          try {
            const resources = await window.api.prompts.listBuiltin()
            if (!Array.isArray(resources) || resources.length === 0) {
              throw new Error('未读取到内置提示词资源。')
            }
            const merged = mergeBuiltinResources(get(), resources)
            loadedBuiltinPrompts = resourceToState(resources).prompts
            set({ ...merged, builtinStatus: 'ready', builtinError: null })
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            set({ builtinStatus: 'error', builtinError: message })
          }
        })().finally(() => {
          builtinLoadPromise = null
        })
        return builtinLoadPromise
      },

      addCategory: (input) => {
        const draft = normalizeCategoryDraft(input)
        if (!draft.label) return null
        if (get().categories.some((category) => category.label.toLowerCase() === draft.label.toLowerCase())) {
          return null
        }
        const id = createId('category')
        set((state) => ({
          categories: [
            ...state.categories,
            { id, label: draft.label, source: 'custom' }
          ]
        }))
        return id
      },

      updateCategory: (id, input) => {
        const draft = normalizeCategoryDraft(input)
        if (!draft.label) return false
        if (
          get().categories.some(
            (category) =>
              category.id !== id && category.label.toLowerCase() === draft.label.toLowerCase()
          )
        ) {
          return false
        }
        set((state) => ({
          categories: state.categories.map((category) =>
            category.id === id && category.source === 'custom'
              ? { ...category, label: draft.label }
              : category
          )
        }))
        return true
      },

      removeCategory: (id) => {
        if (!get().categories.some((category) => category.id === id && category.source === 'custom')) {
          return
        }
        set((state) => ({
          categories: state.categories.filter((category) => category.id !== id),
          prompts: state.prompts.map((prompt) =>
            prompt.categoryId === id
              ? { ...prompt, categoryId: DEFAULT_PROMPT_CATEGORY_ID }
              : prompt
          )
        }))
      },

      addPrompt: (input) => {
        const draft = normalizeDraft(input, get().categories)
        if (!draft.title || !draft.content) return null
        const now = new Date().toISOString()
        const id = createId('prompt')
        set((state) => ({
          prompts: [...state.prompts, { ...draft, id, source: 'custom', createdAt: now, updatedAt: now }]
        }))
        return id
      },

      updatePrompt: (id, input) => {
        const draft = normalizeDraft(input, get().categories)
        if (!draft.title || !draft.content) return
        set((state) => ({
          prompts: state.prompts.map((prompt) =>
            prompt.id === id
              ? { ...prompt, ...draft, updatedAt: new Date().toISOString() }
              : prompt
          )
        }))
      },

      removePrompt: (id) => {
        set((state) => ({
          prompts: state.prompts.filter((prompt) => prompt.id !== id || prompt.source === 'builtin')
        }))
      },

      restorePromptDefault: async (id) => {
        if (loadedBuiltinPrompts.length === 0) {
          await get().loadBuiltinPrompts()
        }
        const defaultPrompt = loadedBuiltinPrompts.find((prompt) => prompt.id === id)
        if (!defaultPrompt) return null
        set((state) => ({
          prompts: state.prompts.map((prompt) =>
            prompt.id === id && prompt.source === 'builtin'
              ? { ...defaultPrompt }
              : prompt
          )
        }))
        return { ...defaultPrompt }
      }
    }),
    {
      name: 'dreamagent.prompt-library',
      partialize: (state) => ({
        categories: state.categories.filter((category) => category.source === 'custom'),
        prompts: state.prompts
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as { categories?: unknown[]; prompts?: unknown[] } | undefined
        const customCategories = Array.isArray(persistedState?.categories)
          ? persistedState.categories.flatMap((value): PromptCategory[] => {
              if (!value || typeof value !== 'object') return []
              const category = value as Record<string, unknown>
              if (
                category.source !== 'custom' ||
                typeof category.id !== 'string' ||
                typeof category.label !== 'string'
              ) {
                return []
              }
              return [{ id: category.id, label: category.label, source: 'custom' }]
            })
          : []
        const persistedPrompts = Array.isArray(persistedState?.prompts)
          ? persistedState.prompts
          : []
        const categoriesWithoutLegacy = customCategories
        const hasLegacyUncategorizedPrompts = persistedPrompts.some((value) => {
          if (!value || typeof value !== 'object') return false
          const prompt = value as Record<string, unknown>
          return (
            prompt.source === 'custom' &&
            !categoryExists(categoriesWithoutLegacy, prompt.categoryId) &&
            !(typeof prompt.categoryId === 'string' && KNOWN_BUILTIN_CATEGORY_IDS.has(prompt.categoryId))
          )
        })
        const categories = hasLegacyUncategorizedPrompts
          ? [
              ...categoriesWithoutLegacy,
              { id: LEGACY_CUSTOM_CATEGORY_ID, label: '我的提示词', source: 'custom' as const }
            ]
          : categoriesWithoutLegacy
        const now = new Date().toISOString()
        const promptValues = persistedPrompts.flatMap((value): PromptTemplate[] => {
          if (!value || typeof value !== 'object') return []
          const prompt = value as Record<string, unknown>
          if (
            typeof prompt.id !== 'string' ||
            typeof prompt.title !== 'string' ||
            typeof prompt.content !== 'string'
          ) {
            return []
          }
          if (prompt.source !== 'builtin' && prompt.source !== 'custom') return []
          return [
            {
              id: prompt.id,
              title: prompt.title,
              description: typeof prompt.description === 'string' ? prompt.description : '',
              content: prompt.content,
              categoryId: categoryExists(categories, prompt.categoryId)
                ? prompt.categoryId
                : prompt.source === 'custom' &&
                    typeof prompt.categoryId === 'string' &&
                    KNOWN_BUILTIN_CATEGORY_IDS.has(prompt.categoryId)
                  ? prompt.categoryId
                  : prompt.source === 'custom'
                    ? LEGACY_CUSTOM_CATEGORY_ID
                    : DEFAULT_PROMPT_CATEGORY_ID,
              source: prompt.source,
              createdAt: typeof prompt.createdAt === 'string' ? prompt.createdAt : now,
              updatedAt: typeof prompt.updatedAt === 'string' ? prompt.updatedAt : now
            }
          ]
        })
        const promptById = new Map(promptValues.map((prompt) => [prompt.id, prompt]))
        return {
          ...current,
          categories,
          prompts: [...promptById.values()]
        }
      }
    }
  )
)
