import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Gauge, Loader2, PenLine } from 'lucide-react'
import { motion } from 'motion/react'
import type { ProjectSnapshot, ProjectSummary } from '@shared/project-types'
import type { SessionSummary, SessionTokenUsageDay } from '@shared/ui-chat'
import { Button } from '@/components/ui/button'
import { TooltipHint } from '@/components/ui/tooltip'
import { formatUpdatedAt } from '@/lib/project-utils'
import { useCreateStore } from '@/stores/create-store'
import { useProjectStore } from '@/stores/project-store'

const HEATMAP_WEEKS = 20
const RECENT_PROJECT_LIMIT = 8

interface ActivityDay {
  date: Date
  key: string
  beatWords: number
  entityWords: number
  articleWords: number
  tokens: number
  future: boolean
}

type HeatTheme = 'writing' | 'tokens'

/** 首页：双热力图 + 最近项目。 */
export function HomePage(): React.JSX.Element {
  const library = useProjectStore((s) => s.library)
  const libraryLoading = useProjectStore((s) => s.loading)
  const openProject = useProjectStore((s) => s.openProject)
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[]>([])
  const [tokenUsage, setTokenUsage] = useState<SessionTokenUsageDay[]>([])
  const [latestSessions, setLatestSessions] = useState<
    Record<string, SessionSummary | null>
  >({})
  const [activityLoading, setActivityLoading] = useState(false)
  const [openingProjectId, setOpeningProjectId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (library.length === 0) {
      setSnapshots([])
      setTokenUsage([])
      setLatestSessions({})
      setActivityLoading(false)
      return () => {
        cancelled = true
      }
    }

    setActivityLoading(true)
    void Promise.all([
      Promise.all(
        library.map((project) => window.api.project.open(project.id).catch(() => null))
      ),
      Promise.all(
        library.map((project) =>
          window.api.session.tokenActivity(project.id).catch(() => [])
        )
      ),
      Promise.all(
        library.map((project) =>
          window.api.session.list(project.id).then((sessions) => sessions[0] ?? null).catch(() => null)
        )
      )
    ]).then(([snapshotResults, tokenResults, sessionResults]) => {
      if (cancelled) return
      setSnapshots(
        snapshotResults.filter(
          (snapshot): snapshot is ProjectSnapshot => Boolean(snapshot)
        )
      )
      setTokenUsage(tokenResults.flat())
      setLatestSessions(
        Object.fromEntries(
          library.map((project, index) => [project.id, sessionResults[index]])
        )
      )
      setActivityLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [library])

  const activityDays = useMemo(
    () => buildActivityDays(snapshots, tokenUsage),
    [snapshots, tokenUsage]
  )
  const today = activityDays.find((day) => day.key === dateKey(new Date()))

  const openLatestConversation = async (project: ProjectSummary): Promise<void> => {
    if (openingProjectId) return
    setOpeningProjectId(project.id)
    try {
      const sessions = await window.api.session.list(project.id).catch(() => [])
      setLatestSessions((current) => ({
        ...current,
        [project.id]: sessions[0] ?? null
      }))
      await openProject(project.id, 'create')
      if (useProjectStore.getState().activeProjectId !== project.id) return

      const createStore = useCreateStore.getState()
      if (sessions[0]) await createStore.openSession(sessions[0].id)
      else await createStore.ensureSession()
    } finally {
      setOpeningProjectId(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto app-scrollbar">
      <div className="mx-auto w-full max-w-6xl px-6 pb-12 pt-8 lg:px-10 lg:pt-10">
        <section aria-label="创作活动" className="grid gap-4 lg:grid-cols-2">
          <HeatmapCard
            days={activityDays}
            description={`最近 ${HEATMAP_WEEKS} 周`}
            loading={activityLoading}
            theme="writing"
            title="文字热力图"
            today={
              <>
                节点 {formatNumber(today?.beatWords ?? 0)} 字 · 实体{' '}
                {formatNumber(today?.entityWords ?? 0)} 字 · 文章{' '}
                {formatNumber(today?.articleWords ?? 0)} 字
              </>
            }
          />
          <HeatmapCard
            days={activityDays}
            description={`最近 ${HEATMAP_WEEKS} 周`}
            loading={activityLoading}
            theme="tokens"
            title="Token 消耗"
            today={<>{formatCompactTokens(today?.tokens ?? 0)} Tokens</>}
          />
        </section>

        <section aria-labelledby="recent-title" className="mt-9">
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <h2 className="text-base font-semibold text-foreground" id="recent-title">
              最近项目
            </h2>
            {library.length > 0 ? (
              <span className="text-xs tabular-nums text-muted-foreground">
                {library.length} 个
              </span>
            ) : null}
          </div>

          {libraryLoading && library.length === 0 ? (
            <ProjectListSkeleton />
          ) : library.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
              还没有项目
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {library.slice(0, RECENT_PROJECT_LIMIT).map((project, index) => (
                <ProjectCard
                  index={index}
                  key={project.id}
                  loading={openingProjectId === project.id}
                  latestSession={latestSessions[project.id]}
                  onOpen={() => void openLatestConversation(project)}
                  project={project}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function HeatmapCard({
  title,
  description,
  theme,
  days,
  today,
  loading
}: {
  title: string
  description: string
  theme: HeatTheme
  days: ActivityDay[]
  today: React.ReactNode
  loading: boolean
}): React.JSX.Element {
  const Icon = theme === 'writing' ? PenLine : Gauge
  const maxScore = Math.max(
    1,
    ...days.map((day) =>
      theme === 'writing' ? writingScore(day) : day.tokens
    )
  )
  const surface =
    theme === 'writing'
      ? 'border-[#ead0c7] bg-[#fffaf8] dark:border-[#65483f] dark:bg-[#241d1a]'
      : 'border-[#c6dcd7] bg-[#f8fbfa] dark:border-[#3b5d56] dark:bg-[#192321]'
  const iconSurface =
    theme === 'writing'
      ? 'bg-[#f6dfd7] text-[#a84834] dark:bg-[#4b3029] dark:text-[#e88a72]'
      : 'bg-[#dcebe7] text-[#397c70] dark:bg-[#29433e] dark:text-[#7fc3b5]'

  return (
    <article className={`min-w-0 rounded-lg border p-5 ${surface}`}>
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${iconSurface}`}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-muted-foreground">今日</p>
          {loading ? (
            <div className="mt-1 h-4 w-24 animate-pulse rounded bg-muted" />
          ) : (
            <p className="mt-1 text-xs font-medium tabular-nums text-foreground">{today}</p>
          )}
        </div>
      </header>

      <div className="mt-5 overflow-x-auto pb-1 app-scrollbar">
        <div className="flex min-w-max items-start gap-2.5">
          <WeekdayLabels />
          {loading ? (
            <HeatmapSkeleton theme={theme} />
          ) : (
            <div aria-label={title} className="grid grid-flow-col grid-rows-7 gap-1" role="grid">
              {days.map((day) => {
                const score = theme === 'writing' ? writingScore(day) : day.tokens
                return (
                  <HeatCell
                    day={day}
                    key={day.key}
                    level={heatLevel(score, maxScore)}
                    theme={theme}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span className={`size-3 rounded-[3px] ${heatClass(theme, level)}`} key={level} />
        ))}
        <span>多</span>
      </div>
    </article>
  )
}

function WeekdayLabels(): React.JSX.Element {
  return (
    <div className="grid h-[122px] grid-rows-7 gap-1 pt-px text-[10px] text-muted-foreground">
      <span />
      <span className="flex items-center">一</span>
      <span />
      <span className="flex items-center">三</span>
      <span />
      <span className="flex items-center">五</span>
      <span />
    </div>
  )
}

function HeatCell({
  day,
  level,
  theme
}: {
  day: ActivityDay
  level: number
  theme: HeatTheme
}): React.JSX.Element {
  if (day.future) return <span aria-hidden="true" className="size-3.5" />
  const detail =
    theme === 'writing'
      ? `节点 ${formatNumber(day.beatWords)} 字，实体 ${formatNumber(day.entityWords)} 字，文章 ${formatNumber(day.articleWords)} 字`
      : `${formatNumber(day.tokens)} Tokens`
  const label = `${formatDay(day.date)}：${detail}`
  return (
    <TooltipHint label={label}>
      <span
        aria-label={label}
        className={`size-3.5 rounded-[3px] ring-1 ring-inset ring-black/[0.035] transition-transform hover:scale-125 dark:ring-white/[0.04] ${heatClass(theme, level)}`}
        role="gridcell"
      />
    </TooltipHint>
  )
}

function ProjectCard({
  project,
  latestSession,
  loading,
  index,
  onOpen
}: {
  project: ProjectSummary
  latestSession: SessionSummary | null | undefined
  loading: boolean
  index: number
  onOpen: () => void
}): React.JSX.Element {
  return (
    <motion.article
      animate={{ opacity: 1, y: 0 }}
      className="group flex h-[68px] items-center gap-3 px-4 transition-colors hover:bg-muted/35"
      initial={{ opacity: 0, y: 5 }}
      transition={{ delay: Math.min(index * 0.035, 0.2), duration: 0.22 }}
    >
      <button
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        onClick={onOpen}
        type="button"
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h3 className="truncate text-sm font-semibold text-foreground">{project.title}</h3>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {formatUpdatedAt(project.updatedAt)}
          </span>
        </div>
        {project.description ? (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {project.description}
          </p>
        ) : null}
      </button>
      {latestSession ? (
        <TooltipHint label={latestSession.title}>
          <span className="hidden max-w-48 shrink truncate text-xs text-muted-foreground sm:block lg:max-w-64">
            {latestSession.title}
          </span>
        </TooltipHint>
      ) : null}
      <Button
        aria-label={`打开 ${project.title} 的最近对话`}
        disabled={loading}
        onClick={onOpen}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : (
          <ChevronRight className="size-4 text-muted-foreground" />
        )}
      </Button>
    </motion.article>
  )
}

function buildActivityDays(
  snapshots: ProjectSnapshot[],
  tokenUsage: SessionTokenUsageDay[]
): ActivityDay[] {
  const today = startOfDay(new Date())
  const currentMonday = addDays(today, -((today.getDay() + 6) % 7))
  const start = addDays(currentMonday, -(HEATMAP_WEEKS - 1) * 7)
  const days = Array.from({ length: HEATMAP_WEEKS * 7 }, (_, index) => {
    const date = addDays(start, index)
    return {
      date,
      key: dateKey(date),
      beatWords: 0,
      entityWords: 0,
      articleWords: 0,
      tokens: 0,
      future: date.getTime() > today.getTime()
    }
  })
  const byKey = new Map(days.map((day) => [day.key, day]))

  for (const snapshot of snapshots) {
    for (const beat of Object.values(snapshot.beats)) {
      const day = byKey.get(dateKey(new Date(beat.createdAt)))
      if (day) day.beatWords += countWords(beat.content)
    }
    for (const entity of Object.values(snapshot.entities)) {
      const day = byKey.get(dateKey(new Date(entity.createdAt)))
      if (day) day.entityWords += countWords(entity.content)
    }
    for (const chapter of Object.values(snapshot.chapters)) {
      const day = byKey.get(dateKey(new Date(chapter.createdAt)))
      if (day) day.articleWords += countWords(chapter.content)
    }
  }
  for (const usage of tokenUsage) {
    const day = byKey.get(usage.date)
    if (day) day.tokens += usage.tokens
  }

  return days
}

function writingScore(day: ActivityDay): number {
  return day.beatWords + day.entityWords + day.articleWords
}

function heatLevel(score: number, maxScore: number): number {
  if (score <= 0) return 0
  const ratio = Math.log1p(score) / Math.log1p(maxScore)
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

function heatClass(theme: HeatTheme, level: number): string {
  const colors =
    theme === 'writing'
      ? [
          'bg-[#f5eeeb] dark:bg-[#332724]',
          'bg-[#f0d5cc] dark:bg-[#50352f]',
          'bg-[#e5a895] dark:bg-[#74473b]',
          'bg-[#d4775d] dark:bg-[#a35440]',
          'bg-[#b94d35] dark:bg-[#d06a51]'
        ]
      : [
          'bg-[#eaf1ef] dark:bg-[#24312e]',
          'bg-[#d1e4df] dark:bg-[#304b45]',
          'bg-[#9fc9c0] dark:bg-[#3d6a61]',
          'bg-[#67a99b] dark:bg-[#4d9184]',
          'bg-[#347e70] dark:bg-[#73bdaf]'
        ]
  return colors[level]
}

function countWords(content: string): number {
  return content.replace(/\s/g, '').length
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function dateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDay(date: Date): string {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

function formatNumber(value: number): string {
  return value.toLocaleString('zh-CN')
}

function formatCompactTokens(value: number): string {
  return new Intl.NumberFormat('zh-CN', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1
  }).format(value)
}

function HeatmapSkeleton({ theme }: { theme: HeatTheme }): React.JSX.Element {
  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1">
      {Array.from({ length: HEATMAP_WEEKS * 7 }, (_, index) => (
        <span
          className={`size-3.5 animate-pulse rounded-[3px] ${heatClass(theme, 0)}`}
          key={index}
        />
      ))}
    </div>
  )
}

function ProjectListSkeleton(): React.JSX.Element {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {[0, 1, 2, 3].map((item) => (
        <div className="flex h-[68px] items-center px-4" key={item}>
          <span className="h-4 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

/** 挂载时刷新项目库。 */
export function useBootstrapLibrary(): void {
  const refreshLibrary = useProjectStore((s) => s.refreshLibrary)
  const loadLibraryRoot = useProjectStore((s) => s.loadLibraryRoot)

  useEffect(() => {
    void loadLibraryRoot()
    void refreshLibrary()
  }, [loadLibraryRoot, refreshLibrary])
}
