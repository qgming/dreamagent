import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  FolderPlus,
  GitBranch,
  ListChecks,
  Map,
  MoreHorizontal,
  PenLine,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
  X,
  Pencil
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { TooltipHint } from '@/components/ui/tooltip'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import { NamePromptDialog } from '@/components/ui/name-prompt-modal'
import { cn } from '@/lib/utils'
import {
  DEFAULT_PROMPT_CATEGORY_ID,
  usePromptStore,
  type PromptCategory,
  type PromptDraft,
  type PromptTemplate
} from '@/stores/prompt-store'

const TOOLBAR_CLASS = 'flex h-11 shrink-0 items-center gap-2 border-b border-border px-3'
const CATEGORY_EXPANDED_KEY = 'dreamagent:prompt-categories-expanded'

type EditorMode = 'new' | 'edit'
type CategoryNameAction =
  | { mode: 'create'; initialValue: string }
  | { mode: 'rename'; categoryId: string; initialValue: string }
  | null

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  writing: PenLine,
  characters: UserRound,
  plot: GitBranch,
  scene: Map,
  review: ListChecks,
  custom: FolderOpen
}

const EMPTY_DRAFT: PromptDraft = {
  title: '',
  description: '',
  content: '',
  categoryId: DEFAULT_PROMPT_CATEGORY_ID
}

export function PromptsPage(): React.JSX.Element {
  const categories = usePromptStore((state) => state.categories)
  const prompts = usePromptStore((state) => state.prompts)
  const addCategory = usePromptStore((state) => state.addCategory)
  const updateCategory = usePromptStore((state) => state.updateCategory)
  const removeCategory = usePromptStore((state) => state.removeCategory)
  const loadBuiltinPrompts = usePromptStore((state) => state.loadBuiltinPrompts)
  const builtinStatus = usePromptStore((state) => state.builtinStatus)
  const restorePromptDefault = usePromptStore((state) => state.restorePromptDefault)
  const addPrompt = usePromptStore((state) => state.addPrompt)
  const updatePrompt = usePromptStore((state) => state.updatePrompt)
  const removePrompt = usePromptStore((state) => state.removePrompt)

  const [selectedCategoryId, setSelectedCategoryId] = useState('writing')
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [editorMode, setEditorMode] = useState<EditorMode | null>(null)
  const [draft, setDraft] = useState<PromptDraft>(EMPTY_DRAFT)
  const [search, setSearch] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [categoryNameAction, setCategoryNameAction] = useState<CategoryNameAction>(null)
  const [categoryNameError, setCategoryNameError] = useState<string | null>(null)
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(
    readExpandedCategoryIds
  )
  const knownCategoryIds = useRef(new Set<string>())

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId) ?? null
  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedPromptId) ?? null
  const query = search.trim().toLowerCase()

  useEffect(() => {
    if (builtinStatus === 'idle') void loadBuiltinPrompts()
  }, [builtinStatus, loadBuiltinPrompts])

  useEffect(() => {
    const newCategoryIds = categories
      .filter((category) => !knownCategoryIds.current.has(category.id))
      .map((category) => category.id)
    if (newCategoryIds.length > 0) {
      setExpandedCategoryIds((current) => new Set([...current, ...newCategoryIds]))
    }
    categories.forEach((category) => knownCategoryIds.current.add(category.id))
  }, [categories])

  useEffect(() => {
    try {
      localStorage.setItem(CATEGORY_EXPANDED_KEY, JSON.stringify([...expandedCategoryIds]))
    } catch {
      // 本地存储不可用时仍保持当前会话中的展开状态
    }
  }, [expandedCategoryIds])

  useEffect(() => {
    if (categories.some((category) => category.id === selectedCategoryId)) return
    setSelectedCategoryId(categories[0]?.id ?? DEFAULT_PROMPT_CATEGORY_ID)
    setSelectedPromptId(null)
    setEditorMode(null)
  }, [categories, selectedCategoryId])

  const visibleCategories = useMemo(() => {
    return categories
      .map((category) => {
        const categoryPrompts = prompts.filter((prompt) => prompt.categoryId === category.id)
        const categoryMatches = category.label.toLowerCase().includes(query)
        const visiblePrompts = query && !categoryMatches
          ? categoryPrompts.filter((prompt) => promptMatches(prompt, query))
          : categoryPrompts
        return { category, prompts: visiblePrompts, categoryPrompts }
      })
      .filter(({ category, prompts: categoryPrompts }) => {
        if (!query) return true
        return (
          category.label.toLowerCase().includes(query) ||
          categoryPrompts.length > 0
        )
      })
  }, [categories, prompts, query])

  const selectedCategoryPrompts = useMemo(() => {
    const category = categories.find((item) => item.id === selectedCategoryId)
    const categoryMatches = category
      ? category.label.toLowerCase().includes(query)
      : false
    return prompts
      .filter((prompt) => prompt.categoryId === selectedCategoryId)
      .filter((prompt) => !query || categoryMatches || promptMatches(prompt, query))
  }, [categories, prompts, query, selectedCategoryId])

  const toggleCategory = (categoryId: string): void => {
    setExpandedCategoryIds((current) => {
      const next = new Set(current)
      if (next.has(categoryId)) next.delete(categoryId)
      else next.add(categoryId)
      return next
    })
  }

  const selectCategory = (categoryId: string): void => {
    setSelectedCategoryId(categoryId)
    setSelectedPromptId(null)
    setEditorMode(null)
    setFormError(null)
    setSaved(false)
  }

  const openPrompt = (prompt: PromptTemplate): void => {
    setSelectedCategoryId(prompt.categoryId)
    setSelectedPromptId(prompt.id)
    setEditorMode('edit')
    setDraft({
      title: prompt.title,
      description: prompt.description,
      content: prompt.content,
      categoryId: prompt.categoryId
    })
    setFormError(null)
    setSaved(false)
    setExpandedCategoryIds((current) => new Set([...current, prompt.categoryId]))
  }

  const openNewPrompt = (): void => {
    const categoryId = selectedCategory?.id ?? DEFAULT_PROMPT_CATEGORY_ID
    setSelectedPromptId(null)
    setEditorMode('new')
    setDraft({ ...EMPTY_DRAFT, categoryId })
    setFormError(null)
    setSaved(false)
  }

  const closeEditor = (): void => {
    setSelectedPromptId(null)
    setEditorMode(null)
    setFormError(null)
    setSaved(false)
  }

  const updateDraft = (patch: Partial<PromptDraft>): void => {
    setDraft((current) => ({ ...current, ...patch }))
    setFormError(null)
    setSaved(false)
  }

  const handleSavePrompt = (): void => {
    const next: PromptDraft = {
      title: draft.title.trim(),
      description: draft.description.trim(),
      content: draft.content.trim(),
      categoryId: draft.categoryId
    }
    if (!next.title || !next.content) {
      setFormError('请填写提示词名称和正文。')
      setSaved(false)
      return
    }

    if (editorMode === 'new') {
      const id = addPrompt(next)
      if (!id) {
        setFormError('提示词保存失败，请确认分类仍然存在。')
        return
      }
      setSelectedPromptId(id)
      setEditorMode('edit')
    } else if (selectedPrompt) {
      updatePrompt(selectedPrompt.id, next)
    } else {
      setFormError('提示词保存失败，请重新选择一条提示词。')
      return
    }

    setSelectedCategoryId(next.categoryId)
    setExpandedCategoryIds((current) => new Set([...current, next.categoryId]))
    setDraft(next)
    setFormError(null)
    setSaved(true)
  }

  const handleDeletePrompt = async (): Promise<void> => {
    if (!selectedPrompt || selectedPrompt.source !== 'custom') return
    const confirmed = await confirmDelete({
      title: '删除提示词',
      description: `确定删除「${selectedPrompt.title}」？此操作不可恢复。`
    })
    if (!confirmed) return
    removePrompt(selectedPrompt.id)
    closeEditor()
  }

  const openCategoryCreate = (): void => {
    setCategoryNameError(null)
    setCategoryNameAction({ mode: 'create', initialValue: '' })
  }

  const beginRenameCategory = (category: PromptCategory): void => {
    setCategoryNameError(null)
    setCategoryNameAction({ mode: 'rename', categoryId: category.id, initialValue: category.label })
  }

  const handleCategoryNameSubmit = (label: string): void => {
    if (!categoryNameAction) return
    if (categoryNameAction.mode === 'create') {
      const id = addCategory({ label })
      if (!id) {
        setCategoryNameError('已有同名分类，请换一个名称。')
        throw new Error('duplicate category name')
      }
      setSelectedCategoryId(id)
      setSelectedPromptId(null)
      setEditorMode(null)
      setExpandedCategoryIds((current) => new Set([...current, id]))
    } else {
      const updated = updateCategory(categoryNameAction.categoryId, { label })
      if (!updated) {
        setCategoryNameError('已有同名分类，请换一个名称。')
        throw new Error('duplicate category name')
      }
    }
    setCategoryNameError(null)
    setCategoryNameAction(null)
  }

  const handleDeleteCategory = async (category: PromptCategory): Promise<void> => {
    if (category.source !== 'custom') return
    const count = prompts.filter((prompt) => prompt.categoryId === category.id).length
    const confirmed = await confirmDelete({
      title: '删除提示词分类',
      description: count
        ? `确定删除「${category.label}」？其中的 ${count} 条提示词会移动到「写作」。`
        : `确定删除「${category.label}」？此操作不可恢复。`
    })
    if (!confirmed) return
    removeCategory(category.id)
    if (selectedCategoryId === category.id) setSelectedCategoryId(DEFAULT_PROMPT_CATEGORY_ID)
    if (selectedPrompt?.categoryId === category.id) closeEditor()
  }

  const handleRestorePromptDefault = async (): Promise<void> => {
    if (!selectedPrompt || selectedPrompt.source !== 'builtin') return
    const confirmed = await confirmDelete({
      title: '恢复提示词默认值',
      description: `将恢复「${selectedPrompt.title}」的名称、说明、正文和分类。其他提示词不会受影响。`
    })
    if (!confirmed) return
    const restored = await restorePromptDefault(selectedPrompt.id)
    if (!restored) return
    setSelectedCategoryId(restored.categoryId)
    setExpandedCategoryIds((current) => new Set([...current, restored.categoryId]))
    setDraft({
      title: restored.title,
      description: restored.description,
      content: restored.content,
      categoryId: restored.categoryId
    })
    setFormError(null)
    setSaved(true)
  }

  return (
    <div className="flex h-full min-h-0 bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className={cn(TOOLBAR_CLASS, 'justify-between')}>
          <span className="text-sm font-medium">提示词</span>
          <div className="flex items-center gap-1">
            <TooltipHint label="新建分类">
              <Button
                aria-label="新建分类"
                onClick={openCategoryCreate}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <FolderPlus className="size-4" />
              </Button>
            </TooltipHint>
          </div>
        </div>

        <div className="shrink-0 border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="搜索提示词"
              className="h-8 border-transparent bg-background/60 pl-8 text-xs shadow-none"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索分类或提示词"
              value={search}
            />
          </div>
        </div>

        <nav aria-label="提示词分类" className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
          {visibleCategories.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">没有匹配的提示词</p>
          ) : (
            <div className="space-y-0.5">
              {visibleCategories.map(({ category, prompts: categoryPrompts, categoryPrompts: allPrompts }) => (
                <PromptCategoryTree
                  allPrompts={allPrompts}
                  category={category}
                  expanded={expandedCategoryIds.has(category.id)}
                  onDelete={() => void handleDeleteCategory(category)}
                  onOpenPrompt={openPrompt}
                  onRename={() => beginRenameCategory(category)}
                  onSelect={() => selectCategory(category.id)}
                  onToggle={() => toggleCategory(category.id)}
                  prompts={categoryPrompts}
                  selectedCategory={selectedCategoryId === category.id}
                  selectedPromptId={selectedPromptId}
                  key={category.id}
                />
              ))}
            </div>
          )}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {editorMode ? (
          <PromptEditor
            categories={categories}
            draft={draft}
            error={formError}
            mode={editorMode}
            onBack={closeEditor}
            onChange={updateDraft}
            onDelete={() => void handleDeletePrompt()}
            onRestore={() => void handleRestorePromptDefault()}
            onSave={handleSavePrompt}
            prompt={selectedPrompt}
            saved={saved}
          />
        ) : selectedCategory ? (
          <PromptCategoryContent
            category={selectedCategory}
            onNew={openNewPrompt}
            onOpenPrompt={openPrompt}
            prompts={selectedCategoryPrompts}
          />
        ) : (
          <Empty hint="从左侧选择一个提示词分类" />
        )}
      </main>

      <NamePromptDialog
        error={categoryNameError}
        initialValue={categoryNameAction?.initialValue ?? ''}
        onOpenChange={(open) => {
          if (!open) {
            setCategoryNameAction(null)
            setCategoryNameError(null)
          }
        }}
        onSubmit={handleCategoryNameSubmit}
        open={categoryNameAction !== null}
        placeholder="例如：语言风格"
        title={categoryNameAction?.mode === 'rename' ? '重命名分类' : '新建分类'}
      />
    </div>
  )
}

function PromptCategoryTree({
  category,
  prompts,
  allPrompts,
  expanded,
  selectedCategory,
  selectedPromptId,
  onToggle,
  onSelect,
  onOpenPrompt,
  onRename,
  onDelete
}: {
  category: PromptCategory
  prompts: PromptTemplate[]
  allPrompts: PromptTemplate[]
  expanded: boolean
  selectedCategory: boolean
  selectedPromptId: string | null
  onToggle: () => void
  onSelect: () => void
  onOpenPrompt: (prompt: PromptTemplate) => void
  onRename: () => void
  onDelete: () => void
}): React.JSX.Element {
  const Icon = CATEGORY_ICONS[category.id] ?? FolderOpen
  const hasChildren = prompts.length > 0
  return (
    <div>
      <div
        className={cn(
          'group flex min-h-8 items-center gap-0.5 rounded-md text-sm transition-colors',
          selectedCategory
            ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
            : 'text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]'
        )}
      >
          <button
            aria-label={expanded ? `收起${category.label}` : `展开${category.label}`}
            className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
            disabled={!hasChildren}
            onClick={(event) => {
              event.stopPropagation()
              onToggle()
            }}
            type="button"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
          </button>
          <button className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left" onClick={onSelect} type="button">
            <Icon className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{category.label}</span>
            <span className="pr-1 text-[10px] tabular-nums text-muted-foreground">{allPrompts.length}</span>
          </button>
          {category.source === 'custom' ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`管理${category.label}`}
                  className="mr-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
                  size="icon-xs"
                  type="button"
                  variant="ghost"
                >
                  <MoreHorizontal className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="bottom">
                <DropdownMenuItem onSelect={onRename}>
                  <Pencil className="size-3.5" />
                  重命名
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDelete} variant="destructive">
                  <Trash2 className="size-3.5" />
                  删除分类
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
      </div>

      {expanded ? (
        <div className="ml-3 border-l border-border/70 pl-2">
          {prompts.map((prompt) => (
            <button
              className={cn(
                'flex min-h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                selectedPromptId === prompt.id
                  ? 'bg-black/[0.06] font-medium text-foreground dark:bg-white/[0.08]'
                  : 'text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/[0.08]'
              )}
              key={prompt.id}
              onClick={() => onOpenPrompt(prompt)}
              type="button"
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{prompt.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function PromptCategoryContent({
  category,
  prompts,
  onNew,
  onOpenPrompt
}: {
  category: PromptCategory
  prompts: PromptTemplate[]
  onNew: () => void
  onOpenPrompt: (prompt: PromptTemplate) => void
}): React.JSX.Element {
  const Icon = CATEGORY_ICONS[category.id] ?? FolderOpen
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className={TOOLBAR_CLASS}>
        <Icon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{category.label}</span>
        <span className="text-xs text-muted-foreground">{prompts.length} 条提示词</span>
        <Button className="ml-auto" onClick={onNew} size="sm" type="button" variant="secondary">
          <Plus className="size-3.5" />
          新建提示词
        </Button>
      </div>
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
        <div className="mx-auto max-w-4xl">
          {prompts.length > 0 ? (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {prompts.map((prompt) => (
                <button
                  className="flex min-h-[64px] w-full items-start gap-3 px-4 pb-2 pt-4 text-left transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:outline-none"
                  key={prompt.id}
                  onClick={() => onOpenPrompt(prompt)}
                  type="button"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                    <FileText className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{prompt.title}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {prompt.source === 'builtin' ? '内置' : '自定义'}
                      </span>
                    </span>
                    <span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {prompt.description || prompt.content}
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <span className="flex size-12 items-center justify-center rounded-xl bg-muted">
                <FileText className="size-5 text-muted-foreground" />
              </span>
              <h2 className="text-base font-semibold">这个分类还没有提示词</h2>
              <p className="max-w-sm text-sm leading-6 text-muted-foreground">
                新建一条提示词，它会保存在本地并出现在左侧分类下。
              </p>
              <Button onClick={onNew} size="sm" type="button" variant="outline">
                <Plus className="size-4" />
                新建提示词
              </Button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function PromptEditor({
  categories,
  prompt,
  mode,
  draft,
  error,
  saved,
  onChange,
  onBack,
  onDelete,
  onRestore,
  onSave
}: {
  categories: PromptCategory[]
  prompt: PromptTemplate | null
  mode: EditorMode
  draft: PromptDraft
  error: string | null
  saved: boolean
  onChange: (patch: Partial<PromptDraft>) => void
  onBack: () => void
  onDelete: () => void
  onRestore: () => void
  onSave: () => void
}): React.JSX.Element {
  const builtin = prompt?.source === 'builtin'
  const Icon = CATEGORY_ICONS[draft.categoryId] ?? FolderOpen
  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className={TOOLBAR_CLASS}>
        <Icon className="size-4 text-muted-foreground" />
        <span className="min-w-0 truncate text-sm font-medium">
          {mode === 'new' ? '新建提示词' : prompt?.title || '提示词'}
        </span>
        <span className="text-xs text-muted-foreground">
          {mode === 'new' ? '编辑中' : builtin ? '内置提示词' : '自定义提示词'}
        </span>
        {builtin ? (
          <TooltipHint label="恢复此提示词默认值">
            <Button
              aria-label="恢复此提示词默认值"
              onClick={onRestore}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </TooltipHint>
        ) : null}
        <TooltipHint label="关闭编辑">
          <Button aria-label="关闭编辑" className="ml-auto" onClick={onBack} size="icon-sm" type="button" variant="ghost">
            <X className="size-4" />
          </Button>
        </TooltipHint>
      </div>

      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.8fr)]">
            <div className="space-y-2">
              <Label htmlFor="prompt-title">名称</Label>
              <Input
                id="prompt-title"
                onChange={(event) => onChange({ title: event.target.value })}
                placeholder="例如：检查对白节奏"
                value={draft.title}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt-category">分类</Label>
              <Select
                onValueChange={(value) => onChange({ categoryId: value })}
                value={draft.categoryId}
              >
                <SelectTrigger className="w-full" id="prompt-category">
                  <SelectValue placeholder="选择分类" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="prompt-description">说明</Label>
            <Input
              id="prompt-description"
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder="用一句话说明这条提示词的用途"
              value={draft.description}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="prompt-content">提示词正文</Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">{draft.content.length} 字符</span>
            </div>
            <Textarea
              className="min-h-[360px] resize-y leading-6"
              id="prompt-content"
              onChange={(event) => onChange({ content: event.target.value })}
              placeholder="写下要发送给模型的指令"
              value={draft.content}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {saved ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="size-4" />
              已保存到本地
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-4 sm:px-7">
        <div className="flex items-center gap-1">
          {mode === 'edit' && !builtin ? (
            <Button onClick={onDelete} size="sm" type="button" variant="ghost">
              <Trash2 className="size-4" />
              删除
            </Button>
          ) : null}
        </div>
        <Button onClick={onSave} size="sm" type="button">
          <Check className="size-4" />
          保存提示词
        </Button>
      </div>
    </section>
  )
}

function Empty({ hint }: { hint: string }): React.JSX.Element {
  return (
    <div className="flex h-full min-h-0 items-center justify-center px-8 text-center">
      <div>
        <FileText className="mx-auto size-6 text-muted-foreground/60" />
        <p className="mt-3 text-sm text-muted-foreground">{hint}</p>
      </div>
    </div>
  )
}

function promptMatches(prompt: PromptTemplate, query: string): boolean {
  return `${prompt.title} ${prompt.description} ${prompt.content}`.toLowerCase().includes(query)
}

function readExpandedCategoryIds(): Set<string> {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(CATEGORY_EXPANDED_KEY)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      // 使用默认展开状态
    }
  }
  return new Set<string>()
}
