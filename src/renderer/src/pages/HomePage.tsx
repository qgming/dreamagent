import { useEffect } from 'react'
import { ArrowUpRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 py-10">
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">DREAM AGENT</p>
          <h1 className="text-3xl font-semibold tracking-tight">造梦师</h1>
          <p className="text-sm text-muted-foreground">
            以项目为总单位：一本小说、一个公众号、一篇论文都是一个项目。
          </p>
          {libraryRoot ? (
            <p className="truncate text-xs text-muted-foreground" title={libraryRoot}>
              项目库：{libraryRoot}
            </p>
          ) : null}
        </div>

        <section className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-6">
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
            <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
              还没有项目。点击上方「新建项目」，或使用侧栏项目区的 +。
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {recent.map((p) => (
                <button
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/50"
                  key={p.id}
                  onClick={() => void openProject(p.id, 'overview')}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {p.title}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {p.beatCount} 节点 · {p.entityCount} 实体 · {formatUpdatedAt(p.updatedAt)}
                    </span>
                  </span>
                  <ArrowUpRight className="size-4 text-muted-foreground" />
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
