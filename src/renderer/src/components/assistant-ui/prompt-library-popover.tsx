import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  GitBranch,
  Leaf,
  ListChecks,
  Map,
  PenLine,
  UserRound
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { cn } from '@/lib/utils'
import {
  usePromptStore,
  type PromptCategoryId,
  type PromptTemplate
} from '@/stores/prompt-store'

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  writing: PenLine,
  characters: UserRound,
  plot: GitBranch,
  scene: Map,
  review: ListChecks,
  custom: FolderOpen
}

export function PromptLibraryPopover({
  onSelect
}: {
  onSelect: (content: string) => void
}): React.JSX.Element {
  const prompts = usePromptStore((state) => state.prompts)
  const promptCategories = usePromptStore((state) => state.categories)
  const builtinStatus = usePromptStore((state) => state.builtinStatus)
  const loadBuiltinPrompts = usePromptStore((state) => state.loadBuiltinPrompts)
  const [open, setOpen] = useState(false)
  const [categoryId, setCategoryId] = useState<PromptCategoryId | null>(null)

  useEffect(() => {
    if (builtinStatus === 'idle') void loadBuiltinPrompts()
  }, [builtinStatus, loadBuiltinPrompts])

  const categories = useMemo(
    () =>
      promptCategories.map((category) => ({
        category,
        prompts: prompts.filter((prompt) => prompt.categoryId === category.id)
      })),
    [promptCategories, prompts]
  )

  const selectedCategory = promptCategories.find((category) => category.id === categoryId) ?? null
  const selectedPrompts = useMemo(
    () =>
      selectedCategory
        ? prompts.filter((prompt) => prompt.categoryId === selectedCategory.id)
        : [],
    [prompts, selectedCategory]
  )

  const selectPrompt = (prompt: PromptTemplate): void => {
    onSelect(prompt.content)
    setOpen(false)
    setCategoryId(null)
  }

  const openCategory = (nextCategoryId: PromptCategoryId): void => {
    setCategoryId(nextCategoryId)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setCategoryId(null)
      }}
    >
      <PopoverTrigger asChild>
        <TooltipIconButton
          tooltip="提示词库"
          side="top"
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'size-8 rounded-full text-muted-foreground hover:text-foreground',
            open && 'bg-accent text-foreground'
          )}
          aria-label="打开提示词库"
        >
          <Leaf className="size-4" />
        </TooltipIconButton>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="aui-composer-trigger-popover max-h-[min(20rem,calc(100dvh-6rem))] w-64 overflow-hidden rounded-xl border bg-popover p-0 text-popover-foreground shadow-lg"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {selectedCategory ? (
          <div className="flex max-h-[min(20rem,calc(100dvh-6rem))] flex-col">
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              className="text-muted-foreground hover:bg-accent flex shrink-0 cursor-pointer items-center gap-1.5 border-b px-3 py-2 text-xs tracking-wide uppercase transition-colors"
              aria-label="返回提示词分类"
            >
              <ArrowLeft className="size-3.5" />
              返回
            </button>
            <div className="app-scrollbar min-h-0 overflow-y-auto overscroll-contain py-1">
              {selectedPrompts.map((prompt) => (
                <PromptOption key={prompt.id} prompt={prompt} onSelect={() => selectPrompt(prompt)} />
              ))}
              {selectedPrompts.length === 0 ? (
                <div className="text-muted-foreground px-3 py-2 text-sm">此分类暂无提示词</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="app-scrollbar flex max-h-[min(20rem,calc(100dvh-6rem))] flex-col overflow-y-auto overscroll-contain py-1">
            {categories.map(({ category }) => {
              const Icon = CATEGORY_ICONS[category.id] ?? FolderOpen
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => openCategory(category.id)}
                  className="hover:bg-accent focus:bg-accent flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm transition-colors outline-none"
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-muted-foreground" />
                    {category.label}
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </button>
              )
            })}
            {categories.length === 0 ? (
              <div className="text-muted-foreground px-3 py-2 text-sm">暂无可用分类</div>
            ) : null}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function PromptOption({
  prompt,
  onSelect
}: {
  prompt: PromptTemplate
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="hover:bg-accent focus:bg-accent flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-start transition-colors outline-none"
    >
      <FileText className="text-primary size-3.5 shrink-0" />
      <span className="min-w-0 break-words text-sm font-medium">{prompt.title}</span>
    </button>
  )
}
