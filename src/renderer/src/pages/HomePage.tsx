import { useEffect } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatUpdatedAt } from '@/lib/project-utils'
import { useProjectStore } from '@/stores/project-store'

/**
 * 首页：最近项目 + 快速新建入口
 */
export function HomePage(): React.JSX.Element {
  const library = useProjectStore((s) => s.library)
  const openProject = useProjectStore((s) => s.openProject)
  const openCreateProjectModal = useProjectStore((s) => s.openCreateProjectModal)
  const libraryRoot = useProjectStore((s) => s.libraryRoot)

  const recent = library.slice(0, 8)

  return (
    <div className="flex h-full flex-col overflow-y-auto app-scrollbar">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-8 py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">首页</h1>
          <p className="text-sm text-muted-foreground">
            以项目为总单位：一本小说、一个公众号、一篇论文都是一个项目。
          </p>
          {libraryRoot ? (
            <p className="truncate text-xs text-muted-foreground" title={libraryRoot}>
              项目库：{libraryRoot}
            </p>
          ) : null}
        </div>

        <section className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-5">
          <div className="space-y-1">
            <h2 className="text-sm font-medium text-foreground">新建项目</h2>
            <p className="text-xs text-muted-foreground">只需填写名称，即可开始创作。</p>
          </div>
          <Button onClick={openCreateProjectModal} type="button">
            <Plus className="size-4" />
            新建项目
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-foreground">最近项目</h2>
          {recent.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              还没有项目。点击上方「新建项目」，或使用侧栏项目区的 +。
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map((p) => (
                <button
                  className={cn(
                    'flex flex-col items-start gap-1 rounded-xl border border-border bg-card p-4 text-left transition-colors',
                    'hover:border-ring/40 hover:bg-muted/40'
                  )}
                  key={p.id}
                  onClick={() => void openProject(p.id, 'overview')}
                  type="button"
                >
                  <span className="text-sm font-medium text-foreground">{p.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {p.beatCount} 节点 · {p.entityCount} 实体
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatUpdatedAt(p.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * 挂载时刷新项目库
 */
export function useBootstrapLibrary(): void {
  const refreshLibrary = useProjectStore((s) => s.refreshLibrary)
  const loadLibraryRoot = useProjectStore((s) => s.loadLibraryRoot)

  useEffect(() => {
    void loadLibraryRoot()
    void refreshLibrary()
  }, [loadLibraryRoot, refreshLibrary])
}
