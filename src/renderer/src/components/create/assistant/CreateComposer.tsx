/**
 * 创作页 Composer（assistant-ui ComposerPrimitive）
 * - 顶部 chip：技能 / 节点 / 实体
 * - 底部：+ 菜单选择上下文 + Input + Send/Cancel
 * - 发送时把上下文拼进文本；用户气泡再解析展示
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ComposerPrimitive,
  useAui
} from '@assistant-ui/react'
import {
  CircleDot,
  Plus,
  Send,
  Square,
  Users,
  X,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useCreateStore } from '@/stores/create-store'
import { useProjectStore } from '@/stores/project-store'
import { skillLabel, useSkillsStore } from '@/stores/skills-store'
import {
  formatComposerPayload,
  type ComposerContextItem,
  type ComposerContextKind
} from './composer-context'

function chipClass(kind: ComposerContextKind): string {
  switch (kind) {
    case 'skill':
      return 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300'
    case 'beat':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
    case 'entity':
      return 'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300'
  }
}

function ChipIcon({ kind }: { kind: ComposerContextKind }): React.JSX.Element {
  const cls = 'size-3 shrink-0 opacity-80'
  if (kind === 'skill') return <Zap className={cls} />
  if (kind === 'beat') return <CircleDot className={cls} />
  return <Users className={cls} />
}

function ContextChip({
  item,
  onRemove
}: {
  item: ComposerContextItem
  onRemove: () => void
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex max-w-[12rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        chipClass(item.kind)
      )}
      title={`${item.label} (${item.id})`}
    >
      <ChipIcon kind={item.kind} />
      <span className="min-w-0 truncate">{item.label}</span>
      <button
        className="rounded-full p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        type="button"
        onClick={onRemove}
        aria-label={`移除 ${item.label}`}
      >
        <X className="size-3" />
      </button>
    </span>
  )
}

/**
 * 自定义发送区：ComposerPrimitive + 上下文 chip
 */
export function CreateComposer(): React.JSX.Element {
  const aui = useAui()
  const sending = useCreateStore((s) => s.sending)
  const cancelTurn = useCreateStore((s) => s.cancelTurn)

  const snapshot = useProjectStore((s) => s.snapshot)
  const skills = useSkillsStore((s) => s.skills)
  const loadSkills = useSkillsStore((s) => s.load)
  const skillsStatus = useSkillsStore((s) => s.status)

  const [items, setItems] = useState<ComposerContextItem[]>([])
  const [pickerQuery, setPickerQuery] = useState('')

  useEffect(() => {
    if (skillsStatus === 'idle') void loadSkills()
  }, [skillsStatus, loadSkills])

  const enabledSkills = useMemo(
    () => skills.filter((s) => s.enabled && s.isValid),
    [skills]
  )

  const beats = useMemo(() => {
    if (!snapshot) return []
    return snapshot.index.beats.order
      .map((id) => snapshot.beats[id])
      .filter(Boolean)
      .map((b) => ({ id: b.id, label: b.title || '未命名节点' }))
  }, [snapshot])

  const entities = useMemo(() => {
    if (!snapshot) return []
    return snapshot.index.entities.order
      .map((id) => snapshot.entities[id])
      .filter(Boolean)
      .map((e) => ({ id: e.id, label: e.name || '未命名实体' }))
  }, [snapshot])

  const q = pickerQuery.trim().toLowerCase()
  const filteredSkills = useMemo(() => {
    if (!q) return enabledSkills.slice(0, 40)
    return enabledSkills
      .filter((s) => {
        const hay = `${skillLabel(s)} ${s.name} ${s.description}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 40)
  }, [enabledSkills, q])

  const filteredBeats = useMemo(() => {
    if (!q) return beats.slice(0, 40)
    return beats.filter((b) => b.label.toLowerCase().includes(q)).slice(0, 40)
  }, [beats, q])

  const filteredEntities = useMemo(() => {
    if (!q) return entities.slice(0, 40)
    return entities.filter((e) => e.label.toLowerCase().includes(q)).slice(0, 40)
  }, [entities, q])

  const addItem = (item: ComposerContextItem): void => {
    setItems((prev) => {
      if (prev.some((x) => x.kind === item.kind && x.id === item.id)) return prev
      return [...prev, item]
    })
  }

  const removeItem = (kind: ComposerContextKind, id: string): void => {
    setItems((prev) => prev.filter((x) => !(x.kind === kind && x.id === id)))
  }

  const handleSendClick = (): void => {
    if (sending) return
    const text = aui.composer.getState().text ?? ''
    if (!text.trim() && items.length === 0) return
    const payload = formatComposerPayload(text, items)
    // 先写入拼装后的全文，再交给 assistant-ui 发送管线
    aui.composer.setText(payload)
    queueMicrotask(() => {
      try {
        aui.composer.send()
      } finally {
        setItems([])
      }
    })
  }

  return (
    <div className="border-t border-border px-3 py-3">
      <ComposerPrimitive.Root className="mx-auto flex w-full max-w-2xl flex-col gap-2 rounded-2xl border border-border bg-card px-3 py-2 shadow-sm">
        {items.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {items.map((item) => (
              <ContextChip
                key={`${item.kind}:${item.id}`}
                item={item}
                onRemove={() => removeItem(item.kind, item.id)}
              />
            ))}
          </div>
        ) : null}

        <ComposerPrimitive.Input
          className="max-h-40 min-h-[40px] w-full resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground select-text"
          placeholder="描述你想写的内容… 可用 + 附加技能 / 节点 / 实体"
          rows={1}
          // 关闭默认 Enter 提交，统一走拼装发送（含上下文 chip）
          submitMode="none"
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
            e.preventDefault()
            handleSendClick()
          }}
        />

        <div className="flex items-center gap-1.5 pb-0.5">
          <DropdownMenu
            onOpenChange={(open) => {
              if (!open) setPickerQuery('')
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button
                className="size-8 rounded-full"
                size="icon-sm"
                title="附加上下文"
                type="button"
                variant="ghost"
              >
                <Plus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72" side="top">
              <DropdownMenuLabel>附加到本条消息</DropdownMenuLabel>
              <div className="px-2 pb-2">
                <input
                  className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                  placeholder="筛选…"
                  value={pickerQuery}
                  onChange={(e) => setPickerQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                />
              </div>
              <DropdownMenuSeparator />

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Zap className="size-3.5 text-violet-500" />
                  技能
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {enabledSkills.length}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 w-64 overflow-y-auto">
                  {filteredSkills.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      无已启用技能。请到技能库开启。
                    </div>
                  ) : (
                    filteredSkills.map((s) => (
                      <DropdownMenuItem
                        key={s.id}
                        onSelect={() =>
                          addItem({
                            kind: 'skill',
                            id: s.id,
                            label: skillLabel(s)
                          })
                        }
                      >
                        <span className="min-w-0 flex-1 truncate">{skillLabel(s)}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {s.name}
                        </span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CircleDot className="size-3.5 text-sky-500" />
                  节点
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {beats.length}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 w-64 overflow-y-auto">
                  {filteredBeats.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      暂无节点
                    </div>
                  ) : (
                    filteredBeats.map((b) => (
                      <DropdownMenuItem
                        key={b.id}
                        onSelect={() =>
                          addItem({ kind: 'beat', id: b.id, label: b.label })
                        }
                      >
                        <span className="min-w-0 flex-1 truncate">{b.label}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Users className="size-3.5 text-rose-500" />
                  实体
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {entities.length}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-64 w-64 overflow-y-auto">
                  {filteredEntities.length === 0 ? (
                    <div className="px-2 py-3 text-xs text-muted-foreground">
                      暂无实体
                    </div>
                  ) : (
                    filteredEntities.map((e) => (
                      <DropdownMenuItem
                        key={e.id}
                        onSelect={() =>
                          addItem({ kind: 'entity', id: e.id, label: e.label })
                        }
                      >
                        <span className="min-w-0 flex-1 truncate">{e.label}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            Enter 发送 · Shift+Enter 换行
          </span>

          {sending ? (
            <button
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                'bg-muted text-foreground hover:bg-muted/80'
              )}
              onClick={() => void cancelTurn()}
              title="停止"
              type="button"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                'bg-primary text-primary-foreground hover:bg-primary/90',
                'disabled:opacity-40'
              )}
              title="发送"
              type="button"
              onClick={handleSendClick}
            >
              <Send className="size-4" />
            </button>
          )}
        </div>
      </ComposerPrimitive.Root>
    </div>
  )
}
