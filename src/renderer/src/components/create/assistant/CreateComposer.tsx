/**
 * 创作页 Composer
 * - Lexical 行内 directive 胶囊
 * - Ghost ModelSelector（发送按钮左侧）：模型 + 按模型自适应思考强度
 * - 运行中：Enter 插话 / Alt+Enter 排队
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ComposerPrimitive,
  unstable_useMentionAdapter,
  useAui,
  type Unstable_MentionCategory
} from '@assistant-ui/react'
import { LexicalComposerInput } from '@assistant-ui/react-lexical'
import {
  ArrowUp,
  AtSign,
  CircleDot,
  FileText,
  MessageSquarePlus,
  Sparkles,
  Square,
  Users,
  Wrench,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'
import { useCreateStore } from '@/stores/create-store'
import { useProjectStore } from '@/stores/project-store'
import { skillLabel, useSkillsStore } from '@/stores/skills-store'
import { AGENT_TOOL_DEFINITIONS } from '@shared/agent-tools'
import type { LlmThinkingLevel } from '@shared/llm-settings'
import {
  ComposerAddAttachment,
  ComposerAttachments
} from '@/components/assistant-ui/attachment'
import { ComposerTriggerPopover } from '@/components/assistant-ui/composer-trigger-popover'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { LexicalDirectiveChip } from '@/components/assistant-ui/lexical-directive-chip'
import {
  ModelSelector,
  type ModelOption,
  type ModelSelectorEffortOption
} from '@/components/assistant-ui/model-selector'

const MENTION_ICONS = {
  skill: Zap,
  beat: CircleDot,
  entity: Users,
  tool: Wrench,
  article: FileText
}

/** 思考档中文名（按模型 effortLevels 子集显示） */
const EFFORT_LABEL: Record<string, string> = {
  off: '关',
  none: '关',
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最大'
}

function effortsForModel(
  levels: string[] | undefined,
  reasoning: boolean
): boolean | ModelSelectorEffortOption[] | undefined {
  if (!reasoning) return undefined
  if (!levels || levels.length === 0) return true // 官方默认 low/med/high
  return levels.map((id) => ({
    id,
    name: EFFORT_LABEL[id] ?? id
  }))
}

export type CreateComposerProps = {
  /** 空对话居中态 */
  centered?: boolean
  className?: string
}

/**
 * 自定义发送区
 */
export function CreateComposer({
  centered = false,
  className
}: CreateComposerProps): React.JSX.Element {
  const aui = useAui()
  const sending = useCreateStore((s) => s.sending)
  const cancelTurn = useCreateStore((s) => s.cancelTurn)
  const sendMessage = useCreateStore((s) => s.sendMessage)
  const queueFollowUp = useCreateStore((s) => s.queueFollowUp)
  const selectableModels = useCreateStore((s) => s.selectableModels)
  const selectedModelKey = useCreateStore((s) => s.selectedModelKey)
  const thinkingLevel = useCreateStore((s) => s.thinkingLevel)
  const setSelectedModelKey = useCreateStore((s) => s.setSelectedModelKey)
  const setThinkingLevel = useCreateStore((s) => s.setThinkingLevel)
  const loadSelectableModels = useCreateStore((s) => s.loadSelectableModels)
  const followUpCount = useCreateStore((s) => s.followUpCount)
  const followUpPreview = useCreateStore((s) => s.followUpPreview)
  const retryMessage = useCreateStore((s) => s.retryMessage)

  /** Lexical 根节点（contenteditable 在内部） */
  const editorRootRef = useRef<HTMLDivElement | null>(null)

  const snapshot = useProjectStore((s) => s.snapshot)
  const skills = useSkillsStore((s) => s.skills)
  const loadSkills = useSkillsStore((s) => s.load)
  const skillsStatus = useSkillsStore((s) => s.status)

  useEffect(() => {
    if (skillsStatus === 'idle') void loadSkills()
  }, [skillsStatus, loadSkills])

  useEffect(() => {
    void loadSelectableModels()
  }, [loadSelectableModels])

  const modelOptions = useMemo((): ModelOption[] => {
    return selectableModels.map((m) => {
      const mods = (m.inputModalities ?? ['text']).filter((x) => x !== 'text')
      const caps: string[] = []
      if (m.reasoning) caps.push('推理')
      if (mods.length) caps.push(mods.join('/'))
      if (m.contextWindow) {
        caps.push(
          m.contextWindow >= 1000
            ? `${Math.round(m.contextWindow / 1000)}k`
            : String(m.contextWindow)
        )
      }
      return {
        id: m.key,
        name: m.modelName || m.modelId,
        description: [m.providerName, caps.join(' · ')].filter(Boolean).join(' · '),
        disabled: m.disabled,
        keywords: [m.modelId, m.providerName, m.providerId, ...caps],
        // 按模型：无 reasoning 不显示；有则用该模型 effortLevels
        efforts: effortsForModel(m.effortLevels, m.reasoning),
        icon: m.logoUrl ? (
          <img
            alt=""
            src={m.logoUrl}
            className={cn(
              'size-3.5 rounded-sm object-contain',
              m.logoMonochrome && 'dark:invert'
            )}
          />
        ) : undefined
      }
    })
  }, [selectableModels])

  const categories = useMemo((): Unstable_MentionCategory[] => {
    const enabledSkills = skills.filter((s) => s.enabled && s.isValid)
    const beats =
      snapshot?.index.beats.order
        .map((id) => snapshot.beats[id])
        .filter(Boolean)
        .map((b) => ({
          id: b.id,
          type: 'beat',
          label: b.title || '未命名节点',
          description: b.status,
          icon: 'beat'
        })) ?? []

    const entities =
      snapshot?.index.entities.order
        .map((id) => snapshot.entities[id])
        .filter(Boolean)
        .map((e) => ({
          id: e.id,
          type: 'entity',
          label: e.name || '未命名实体',
          description: e.status,
          icon: 'entity'
        })) ?? []

    const articles =
      snapshot?.index.chapters?.order
        .map((id) => snapshot.chapters[id])
        .filter(Boolean)
        .map((c) => ({
          id: c.id,
          type: 'article',
          label: c.title || '未命名文章',
          description: c.status,
          icon: 'article'
        })) ?? []

    const tools = AGENT_TOOL_DEFINITIONS.map((t) => ({
      id: t.name,
      type: 'tool',
      label: t.name,
      description: t.description,
      icon: 'tool'
    }))

    return [
      {
        id: 'skill',
        label: '技能',
        items: enabledSkills.map((s) => ({
          id: s.id,
          type: 'skill',
          label: skillLabel(s),
          description: s.description || s.name,
          icon: 'skill'
        }))
      },
      { id: 'beat', label: '节点', items: beats },
      { id: 'entity', label: '实体', items: entities },
      { id: 'tool', label: '工具', items: tools },
      { id: 'article', label: '文章', items: articles }
    ]
  }, [skills, snapshot])

  const mention = unstable_useMentionAdapter({
    categories,
    includeModelContextTools: false,
    iconMap: MENTION_ICONS,
    fallbackIcon: Sparkles
  })

  const insertMentionTrigger = useCallback(() => {
    const root = editorRootRef.current
    const editable =
      root?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null

    if (editable) {
      editable.focus()
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !editable.contains(sel.anchorNode)) {
        const range = document.createRange()
        range.selectNodeContents(editable)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
      }

      let prefix = ''
      try {
        const r = sel?.getRangeAt(0)
        if (r) {
          const pre = r.cloneRange()
          pre.selectNodeContents(editable)
          pre.setEnd(r.startContainer, r.startOffset)
          const before = pre.toString()
          if (before.length > 0 && !/\s$/.test(before)) prefix = ' '
        }
      } catch {
        // ignore
      }

      const ok = document.execCommand('insertText', false, `${prefix}@`)
      if (!ok) {
        const stateText = aui.composer.getState().text ?? ''
        const needSpace = stateText.length > 0 && !/\s$/.test(stateText)
        aui.composer.setText(`${stateText}${needSpace ? ' ' : ''}@`)
      }
      return
    }

    const stateText = aui.composer.getState().text ?? ''
    const needSpace = stateText.length > 0 && !/\s$/.test(stateText)
    aui.composer.setText(`${stateText}${needSpace ? ' ' : ''}@`)
  }, [aui])

  /** 拦截 Enter / Alt+Enter：运行中分别走插话 / 排队 */
  const handleKeyDownCapture = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey) return
      if (!sending) return
      // 运行中：阻止默认发送
      e.preventDefault()
      e.stopPropagation()
      const text = (aui.composer.getState().text ?? '').trim()
      if (!text) return
      if (e.altKey) {
        void queueFollowUp(text).then(() => aui.composer.setText(''))
      } else {
        void sendMessage(text).then(() => aui.composer.setText(''))
      }
    },
    [sending, aui, queueFollowUp, sendMessage]
  )

  return (
    <div className={cn('w-full', className)}>
      {/* 排队 / 重试提示条 */}
      {(followUpCount > 0 || retryMessage) && (
        <div className="mx-auto mb-1.5 flex w-full max-w-[var(--thread-max-width,42rem)] items-center gap-2 px-1 text-xs text-muted-foreground">
          {retryMessage ? <span className="truncate">{retryMessage}</span> : null}
          {followUpCount > 0 ? (
            <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5">
              <MessageSquarePlus className="size-3 shrink-0" />
              排队 {followUpCount} 条
              {followUpPreview ? ` · ${followUpPreview}` : ''}
            </span>
          ) : null}
        </div>
      )}

      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
        <ComposerPrimitive.Root className="aui-composer-root relative mx-auto flex w-full max-w-[var(--thread-max-width,42rem)] flex-col">
          <div
            data-slot="aui_composer-shell"
            className={cn(
              'flex w-full flex-col gap-2 rounded-[var(--composer-radius,1.25rem)] border border-border/60 bg-card/95 p-2 shadow-sm backdrop-blur-md transition-[border-color,box-shadow]',
              'focus-within:border-border focus-within:shadow-md',
              'dark:border-muted-foreground/15 dark:focus-within:border-muted-foreground/30 dark:shadow-none',
              centered && 'shadow-md'
            )}
            onKeyDownCapture={handleKeyDownCapture}
          >
            <ComposerAttachments />

            <LexicalComposerInput
              ref={editorRootRef}
              placeholder={
                sending
                  ? '输入以插话… · Alt+Enter 排队'
                  : '发送消息…'
              }
              autoFocus={centered}
              submitMode="enter"
              directiveChip={LexicalDirectiveChip}
              className={cn(
                'min-h-10 w-full px-2.5 py-1 text-sm outline-none',
                '[&_.aui-lexical-input]:min-h-10 [&_.aui-lexical-input]:w-full [&_.aui-lexical-input]:outline-none',
                '[&_.aui-lexical-input]:whitespace-pre-wrap [&_.aui-lexical-input]:break-words',
                '[&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:text-muted-foreground/80'
              )}
              aria-label="消息输入"
            />

            <div className="relative flex items-center justify-between gap-1.5">
              <div className="flex min-w-0 items-center gap-0.5">
                <ComposerAddAttachment />
                <TooltipIconButton
                  tooltip="附加技能 / 节点 / 实体…"
                  side="top"
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-full text-muted-foreground hover:text-foreground"
                  aria-label="插入 @"
                  onClick={insertMentionTrigger}
                >
                  <AtSign className="size-4" />
                </TooltipIconButton>
              </div>

              {/* 右侧：官方 ModelSelector Ghost + 发送/停止 */}
              <div className="flex shrink-0 items-center gap-1">
                {modelOptions.length > 0 ? (
                  <ModelSelector
                    models={modelOptions}
                    value={selectedModelKey ?? undefined}
                    onValueChange={(key) => setSelectedModelKey(key)}
                    effort={thinkingLevel}
                    onEffortChange={(level) =>
                      setThinkingLevel(level as LlmThinkingLevel)
                    }
                    variant="ghost"
                    size="sm"
                    searchable
                    align="end"
                  />
                ) : (
                  <TooltipHint label="加载模型列表">
                    <button
                      type="button"
                      className="h-8 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent"
                      onClick={() => void loadSelectableModels()}
                    >
                      未配置模型
                    </button>
                  </TooltipHint>
                )}

                {sending ? (
                  <TooltipHint label="停止">
                    <button
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                        'bg-muted text-foreground hover:bg-muted/80'
                      )}
                      onClick={() => void cancelTurn()}
                      type="button"
                    >
                      <Square className="size-3.5 fill-current" />
                    </button>
                  </TooltipHint>
                ) : (
                  <TooltipHint label="发送">
                    <ComposerPrimitive.Send asChild>
                      <button
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-full',
                          'bg-primary text-primary-foreground hover:bg-primary/90',
                          'disabled:opacity-40'
                        )}
                        type="button"
                      >
                        <ArrowUp className="size-4" />
                      </button>
                    </ComposerPrimitive.Send>
                  </TooltipHint>
                )}
              </div>
            </div>
          </div>

          <ComposerTriggerPopover
            char="@"
            {...mention}
            iconMap={MENTION_ICONS}
            fallbackIcon={Sparkles}
            backLabel="返回"
            emptyCategoriesLabel="暂无可用分类"
            emptyItemsLabel="无匹配项"
          />
        </ComposerPrimitive.Root>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>
    </div>
  )
}
