import { useEffect, useState } from 'react'
import { Check, CirclePause, CirclePlay, Pencil, Target, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useCreateStore } from '@/stores/create-store'
import {
  SESSION_GOAL_OBJECTIVE_LIMIT,
  type SessionGoal,
  type SessionGoalStatus
} from '@shared/session-goals'

const STATUS_LABEL: Record<SessionGoalStatus, string> = {
  active: '进行中',
  paused: '已暂停',
  blocked: '已阻塞',
  complete: '已完成'
}

const STATUS_CLASS: Record<SessionGoalStatus, string> = {
  active: 'text-sky-600 dark:text-sky-400',
  paused: 'text-muted-foreground',
  blocked: 'text-amber-600 dark:text-amber-400',
  complete: 'text-emerald-600 dark:text-emerald-400'
}

const STATUS_TITLE: Record<SessionGoalStatus, string> = {
  active: '进行中的目标',
  paused: '已暂停的目标',
  blocked: '已阻塞的目标',
  complete: '已完成的目标'
}

function formatGoalDuration(startedAt: string, now: number): string {
  const started = Date.parse(startedAt)
  if (!Number.isFinite(started)) return '0s'
  const totalSeconds = Math.max(0, Math.floor((now - started) / 1000))
  if (totalSeconds < 60) return `${totalSeconds}s`
  const minutes = Math.floor(totalSeconds / 60)
  if (minutes < 60) return `${minutes}m ${totalSeconds % 60}s`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h`
}

function useGoalDuration(startedAt: string | undefined): string {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  return startedAt ? formatGoalDuration(startedAt, now) : '0s'
}

function updatedGoal(goal: SessionGoal, patch: Partial<SessionGoal>): SessionGoal {
  return { ...goal, ...patch, updatedAt: new Date().toISOString() }
}

/** Composer 目标入口：无目标时武装下一次发送，有目标时打开会话目标管理。 */
export function SessionGoalControl(): React.JSX.Element {
  const goal = useCreateStore((s) => s.session?.goal ?? null)
  const goalArmed = useCreateStore((s) => s.goalArmed)
  const setGoalArmed = useCreateStore((s) => s.setGoalArmed)
  const updateGoal = useCreateStore((s) => s.updateGoal)
  const [open, setOpen] = useState(false)

  const activeGoal = goal?.status === 'complete' ? null : goal
  const engaged = goalArmed || Boolean(activeGoal)
  const label = activeGoal
    ? '管理会话目标'
    : goalArmed
      ? '取消目标模式'
      : '目标模式：下一条消息设为目标'

  return (
    <>
      <TooltipHint label={label}>
        <button
          type="button"
          aria-label={label}
          aria-pressed={engaged}
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-full transition-colors',
            engaged
              ? cn(
                  'hover:text-sky-700 dark:hover:text-sky-300',
                  goal ? STATUS_CLASS[goal.status] : 'text-sky-600 dark:text-sky-400'
                )
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
          onClick={() => (activeGoal ? setOpen(true) : setGoalArmed(!goalArmed))}
        >
          <Target className="size-4" />
        </button>
      </TooltipHint>

      {activeGoal ? (
        <SessionGoalDialog
          goal={activeGoal}
          open={open}
          onOpenChange={setOpen}
          onUpdate={updateGoal}
        />
      ) : null}
    </>
  )
}

/** 输入框上方的目标状态栏，提供目标的快速管理操作。 */
export function SessionGoalStatusBar(): React.JSX.Element | null {
  const goal = useCreateStore((s) => s.session?.goal ?? null)
  const goalAuditing = useCreateStore((s) => s.goalAuditing)
  const updateGoal = useCreateStore((s) => s.updateGoal)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const duration = useGoalDuration(goal?.createdAt)

  if (!goal || goal.status === 'complete') return null

  const runUpdate = async (next: SessionGoal | null): Promise<void> => {
    setBusy(true)
    try {
      await updateGoal(next)
    } finally {
      setBusy(false)
    }
  }

  const toggleStatus = (): void => {
    void runUpdate(
      updatedGoal(goal, {
        status: goal.status === 'active' ? 'paused' : 'active',
        statusReason: goal.status === 'active' ? '用户暂停' : '用户恢复'
      })
    )
  }

  return (
    <>
      <div className="mx-auto flex min-h-10 w-[90%] max-w-[38rem] items-center gap-2 rounded-t-[var(--composer-radius,1.25rem)] rounded-b-none border-x border-t border-b-0 border-border/60 bg-card/95 px-3 py-1 shadow-sm backdrop-blur-md dark:border-muted-foreground/15 dark:shadow-none">
        <Target className={cn('size-4 shrink-0', STATUS_CLASS[goal.status])} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <span className={cn('shrink-0 font-medium', STATUS_CLASS[goal.status])}>
            {goalAuditing ? '自动审计中' : STATUS_TITLE[goal.status]}
          </span>
          <span className="min-w-0 truncate text-foreground/80" title={goal.objective}>
            {goal.objective}
          </span>
          <span className="shrink-0 text-muted-foreground">• {duration}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <TooltipHint label="编辑目标">
            <button
              type="button"
              aria-label="编辑目标"
              disabled={busy}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              onClick={() => setOpen(true)}
            >
              <Pencil className="size-4" />
            </button>
          </TooltipHint>
          <TooltipHint label={goal.status === 'active' ? '暂停目标' : '恢复目标'}>
            <button
              type="button"
              aria-label={goal.status === 'active' ? '暂停目标' : '恢复目标'}
              disabled={busy}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              onClick={toggleStatus}
            >
              {goal.status === 'active' ? <CirclePause className="size-4" /> : <CirclePlay className="size-4" />}
            </button>
          </TooltipHint>
          <TooltipHint label="删除目标">
            <button
              type="button"
              aria-label="删除目标"
              disabled={busy}
              className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-40"
              onClick={() => void runUpdate(null)}
            >
              <Trash2 className="size-4" />
            </button>
          </TooltipHint>
        </div>
      </div>
      <SessionGoalDialog
        goal={goal}
        open={open}
        onOpenChange={setOpen}
        onUpdate={runUpdate}
      />
    </>
  )
}

function SessionGoalDialog({
  goal,
  open,
  onOpenChange,
  onUpdate
}: {
  goal: SessionGoal
  open: boolean
  onOpenChange: (open: boolean) => void
  onUpdate: (goal: SessionGoal | null) => Promise<void>
}): React.JSX.Element {
  const [objective, setObjective] = useState(goal.objective)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) setObjective(goal.objective)
  }, [goal.id, goal.objective, open])

  const run = async (next: SessionGoal | null, close = true): Promise<void> => {
    setBusy(true)
    try {
      await onUpdate(next)
      if (close) onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  const save = (): void => {
    const text = objective.trim()
    if (!text) return
    void run(
      updatedGoal(goal, {
        objective: text.slice(0, SESSION_GOAL_OBJECTIVE_LIMIT),
        status: 'active',
        note: '',
        statusReason: '目标已更新'
      })
    )
  }

  const statusAction = goal.status === 'active' ? '暂停' : '恢复'
  const statusIcon = goal.status === 'active' ? <CirclePause className="size-4" /> : <CirclePlay className="size-4" />

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>会话目标</DialogTitle>
          <DialogDescription>
            目标会随会话保存，并在每次生成时作为完成标准提供给 Agent。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <span className={cn('size-2 rounded-full bg-current', STATUS_CLASS[goal.status])} />
            <span className={cn('font-medium', STATUS_CLASS[goal.status])}>
              {STATUS_LABEL[goal.status]}
            </span>
          </div>

          {goal.note ? (
            <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {goal.note}
            </p>
          ) : null}

          <label className="space-y-1.5 text-sm font-medium">
            <span className="flex items-center justify-between gap-2">
              <span>目标内容</span>
              <span className="text-[11px] font-normal tabular-nums text-muted-foreground">
                {objective.length}/{SESSION_GOAL_OBJECTIVE_LIMIT}
              </span>
            </span>
            <Textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              maxLength={SESSION_GOAL_OBJECTIVE_LIMIT}
              rows={5}
              placeholder="描述需要完成并验证的结果…"
            />
          </label>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            className="text-destructive hover:text-destructive"
            onClick={() => void run(null)}
          >
            <Trash2 className="size-4" />
            清除目标
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || goal.status === 'complete'}
              onClick={() =>
                void run(
                  updatedGoal(goal, {
                    status: goal.status === 'active' ? 'paused' : 'active',
                    statusReason: statusAction === '暂停' ? '用户暂停' : '用户恢复'
                  }),
                  false
                )
              }
            >
              {statusIcon}
              {statusAction}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || goal.status === 'complete'}
              onClick={() =>
                void run(
                  updatedGoal(goal, {
                    status: 'complete',
                    statusReason: '用户标记完成'
                  })
                )
              }
            >
              <Check className="size-4" />
              完成
            </Button>
            <Button
              size="sm"
              disabled={busy || !objective.trim() || goal.status === 'complete'}
              onClick={save}
            >
              <Check className="size-4" />
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
