import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, Plus } from 'lucide-react'
import {
  BEAT_STATUS_LABELS,
  BEAT_STATUSES,
  ENTITY_STATUS_LABELS,
  ENTITY_STATUSES
} from '@shared/project-types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  BEAT_STATUS_DOT_CLASS,
  ENTITY_STATUS_DOT_CLASS,
  formatUpdatedAt
} from '@/lib/project-utils'
import {
  getOrderedBeats,
  getOrderedEntities,
  useProjectStore
} from '@/stores/project-store'

const RECENT_LIMIT = 6

/**
 * 项目概览：资料、进度、最近更新
 */
export function OverviewPage(): React.JSX.Element {
  const snapshot = useProjectStore((s) => s.snapshot)
  const setProjectView = useProjectStore((s) => s.setProjectView)
  const setSelectedBeatId = useProjectStore((s) => s.setSelectedBeatId)
  const setSelectedEntityId = useProjectStore((s) => s.setSelectedEntityId)
  const updateProjectMeta = useProjectStore((s) => s.updateProjectMeta)
  const openCreateBeatModal = useProjectStore((s) => s.openCreateBeatModal)
  const openCreateEntityModal = useProjectStore((s) => s.openCreateEntityModal)

  const beats = useMemo(() => getOrderedBeats(snapshot), [snapshot])
  const entities = useMemo(() => getOrderedEntities(snapshot), [snapshot])

  const beatStats = useMemo(
    () => countByStatus(beats, BEAT_STATUSES, (b) => b.status),
    [beats]
  )
  const entityStats = useMemo(
    () => countByStatus(entities, ENTITY_STATUSES, (e) => e.status),
    [entities]
  )

  const recentBeats = useMemo(
    () => [...beats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_LIMIT),
    [beats]
  )
  const recentEntities = useMemo(
    () =>
      [...entities].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, RECENT_LIMIT),
    [entities]
  )

  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        请先在侧栏打开或新建一个项目
      </div>
    )
  }

  const meta = snapshot.meta
  const writtenCount = beatStats.draft + beatStats.final
  const progressPct = beats.length === 0 ? 0 : Math.round((writtenCount / beats.length) * 100)

  const openBeat = (id: string): void => {
    setSelectedBeatId(id)
    setProjectView('beats')
  }

  const openEntity = (id: string): void => {
    setSelectedEntityId(id)
    setProjectView('entities')
  }

  return (
    <div className="h-full overflow-y-auto app-scrollbar">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-8">
        {/* 项目头：标题 + 简介可编辑 */}
        <ProjectHeader
          beatCount={beats.length}
          createdAt={meta.createdAt}
          description={meta.description}
          entityCount={entities.length}
          onSave={async (patch) => {
            await updateProjectMeta(meta.id, patch)
          }}
          title={meta.title}
          updatedAt={meta.updatedAt}
        />

        {/* 进度 + 实体状况 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">写作进度</h2>
              <span className="text-xs text-muted-foreground">
                {beats.length === 0 ? '暂无节点' : `${progressPct}% 成文+定稿`}
              </span>
            </div>
            <div className="mb-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-emerald-500/80 transition-[width]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {BEAT_STATUSES.map((s) => (
                <StatusStat
                  count={beatStats[s]}
                  dotClass={BEAT_STATUS_DOT_CLASS[s]}
                  key={s}
                  label={BEAT_STATUS_LABELS[s]}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">实体状况</h2>
              <span className="text-xs text-muted-foreground">
                {entities.length === 0 ? '暂无实体' : `共 ${entities.length} 个`}
              </span>
            </div>
            <div className="space-y-2 pt-1">
              {ENTITY_STATUSES.map((s) => (
                <StatusStat
                  count={entityStats[s]}
                  dotClass={ENTITY_STATUS_DOT_CLASS[s]}
                  key={s}
                  label={ENTITY_STATUS_LABELS[s]}
                  wide
                />
              ))}
            </div>
          </section>
        </div>

        {/* 空项目引导 / 最近更新 */}
        {beats.length === 0 && entities.length === 0 ? (
          <section className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <LayoutDashboard className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="mb-1 text-sm font-medium">还没有内容</p>
            <p className="mb-4 text-xs text-muted-foreground">
              先建几个节点搭结构，或建实体沉淀设定。
            </p>
            <div className="flex items-center justify-center gap-2">
              <Button onClick={openCreateBeatModal} size="sm" type="button">
                <Plus className="size-3.5" />
                新建节点
              </Button>
              <Button onClick={openCreateEntityModal} size="sm" type="button" variant="secondary">
                <Plus className="size-3.5" />
                新建实体
              </Button>
            </div>
          </section>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2">
            <RecentColumn
              emptyHint="暂无节点"
              items={recentBeats.map((b) => ({
                id: b.id,
                title: b.title || '未命名节点',
                sub: `${BEAT_STATUS_LABELS[b.status]} · ${formatUpdatedAt(b.updatedAt)}`,
                dotClass: BEAT_STATUS_DOT_CLASS[b.status],
                onClick: () => openBeat(b.id)
              }))}
              title="最近节点"
            />
            <RecentColumn
              emptyHint="暂无实体"
              items={recentEntities.map((e) => ({
                id: e.id,
                title: e.name || '未命名实体',
                sub: `${ENTITY_STATUS_LABELS[e.status]} · ${formatUpdatedAt(e.updatedAt)}`,
                dotClass: ENTITY_STATUS_DOT_CLASS[e.status],
                onClick: () => openEntity(e.id)
              }))}
              title="最近实体"
            />
          </section>
        )}
      </div>
    </div>
  )
}

function ProjectHeader({
  title,
  description,
  createdAt,
  updatedAt,
  beatCount,
  entityCount,
  onSave
}: {
  title: string
  description?: string
  createdAt: string
  updatedAt: string
  beatCount: number
  entityCount: number
  onSave: (patch: { title?: string; description?: string }) => Promise<void>
}): React.JSX.Element {
  const [localTitle, setLocalTitle] = useState(title)
  const [localDesc, setLocalDesc] = useState(description ?? '')
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    setLocalTitle(title)
    setLocalDesc(description ?? '')
  }, [title, description])

  // 防抖保存标题 / 简介
  useEffect(() => {
    const nextTitle = localTitle.trim()
    const nextDesc = localDesc.trim()
    const prevDesc = (description ?? '').trim()
    const titleChanged = nextTitle !== '' && nextTitle !== title
    const descChanged = nextDesc !== prevDesc
    if (!titleChanged && !descChanged) return

    const timer = window.setTimeout(() => {
      const patch: { title?: string; description?: string } = {}
      if (titleChanged) patch.title = nextTitle
      if (descChanged) patch.description = nextDesc
      void onSaveRef.current(patch)
    }, 500)
    return () => window.clearTimeout(timer)
  }, [localTitle, localDesc, title, description])

  return (
    <header className="rounded-xl border border-border bg-card p-5">
      <input
        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50"
        onChange={(e) => setLocalTitle(e.target.value)}
        placeholder="项目名称"
        value={localTitle}
      />
      <div className="my-3 border-t border-border" />
      <textarea
        className="min-h-[4.5rem] w-full resize-y bg-transparent text-sm leading-relaxed text-muted-foreground outline-none placeholder:text-muted-foreground/50"
        onChange={(e) => setLocalDesc(e.target.value)}
        placeholder="写一句项目简介：题材、主线、目标读者……"
        rows={3}
        value={localDesc}
      />
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>创建于 {formatDate(createdAt)}</span>
        <span>·</span>
        <span>更新于 {formatUpdatedAt(updatedAt)}</span>
        <span>·</span>
        <span>
          {beatCount} 节点 · {entityCount} 实体
        </span>
      </p>
    </header>
  )
}

function StatusStat({
  label,
  count,
  dotClass,
  wide
}: {
  label: string
  count: number
  dotClass: string
  wide?: boolean
}): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs',
        wide && 'justify-between'
      )}
    >
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <span className={cn('size-2 shrink-0 rounded-full', dotClass)} />
        {label}
      </span>
      <span className={cn('font-medium tabular-nums text-foreground', !wide && 'ml-auto')}>
        {count}
      </span>
    </div>
  )
}

function RecentColumn({
  title,
  emptyHint,
  items
}: {
  title: string
  emptyHint: string
  items: Array<{
    id: string
    title: string
    sub: string
    dotClass: string
    onClick: () => void
  }>
}): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">{emptyHint}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id}>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                onClick={item.onClick}
                type="button"
              >
                <span className={cn('size-2 shrink-0 rounded-full', item.dotClass)} />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">{item.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function countByStatus<T, S extends string>(
  items: T[],
  statuses: readonly S[],
  getStatus: (item: T) => S
): Record<S, number> {
  const result = Object.fromEntries(statuses.map((s) => [s, 0])) as Record<S, number>
  for (const item of items) {
    const s = getStatus(item)
    if (s in result) result[s] += 1
  }
  return result
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString()
}
