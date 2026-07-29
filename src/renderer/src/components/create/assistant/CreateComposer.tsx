/**
 * 创作页 Composer
 * - Lexical 行内 directive 胶囊（退格整颗删除）
 * - 加号右侧 @ 按钮，与手输 @ 相同
 * - 胶囊样式与用户消息一致（浅/深色）
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
  Sparkles,
  Square,
  Users,
  Wrench,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCreateStore } from '@/stores/create-store'
import { useProjectStore } from '@/stores/project-store'
import { skillLabel, useSkillsStore } from '@/stores/skills-store'
import { AGENT_TOOL_DEFINITIONS } from '@shared/agent-tools'
import {
  ComposerAddAttachment,
  ComposerAttachments
} from '@/components/assistant-ui/attachment'
import { ComposerTriggerPopover } from '@/components/assistant-ui/composer-trigger-popover'
import { TooltipIconButton } from '@/components/assistant-ui/tooltip-icon-button'
import { LexicalDirectiveChip } from '@/components/assistant-ui/lexical-directive-chip'

const MENTION_ICONS = {
  skill: Zap,
  beat: CircleDot,
  entity: Users,
  tool: Wrench,
  article: FileText
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
  /** Lexical 根节点（contenteditable 在内部） */
  const editorRootRef = useRef<HTMLDivElement | null>(null)

  const snapshot = useProjectStore((s) => s.snapshot)
  const skills = useSkillsStore((s) => s.skills)
  const loadSkills = useSkillsStore((s) => s.load)
  const skillsStatus = useSkillsStore((s) => s.status)

  useEffect(() => {
    if (skillsStatus === 'idle') void loadSkills()
  }, [skillsStatus, loadSkills])

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

  /**
   * 在当前光标处插入 @，触发与手输相同的 mention popover。
   * Lexical 使用 contenteditable，通过 execCommand / beforeinput 写入文本。
   */
  const insertMentionTrigger = useCallback(() => {
    const root = editorRootRef.current
    const editable =
      root?.querySelector<HTMLElement>('[contenteditable="true"]') ?? null

    if (editable) {
      editable.focus()

      // 尽量在当前选区插入；若无选区则落到末尾
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !editable.contains(sel.anchorNode)) {
        const range = document.createRange()
        range.selectNodeContents(editable)
        range.collapse(false)
        sel?.removeAllRanges()
        sel?.addRange(range)
      }

      // 前面不是空白时补空格，满足 detectTrigger 边界
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
        // 部分环境 execCommand 失败：退回 setText（会丢光标精度）
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

  return (
    <div className={cn('w-full', className)}>
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
          >
            <ComposerAttachments />

            {/* Lexical：directive 以行内容器渲染，退格整颗删除 */}
            <LexicalComposerInput
              ref={editorRootRef}
              placeholder="发送消息…"
              autoFocus={centered}
              submitMode="enter"
              directiveChip={LexicalDirectiveChip}
              className={cn(
                // 覆盖默认 aui-lexical-editor 尺寸，贴合现有输入样式
                'min-h-10 w-full px-2.5 py-1 text-sm outline-none',
                '[&_.aui-lexical-input]:min-h-10 [&_.aui-lexical-input]:w-full [&_.aui-lexical-input]:outline-none',
                '[&_.aui-lexical-input]:whitespace-pre-wrap [&_.aui-lexical-input]:break-words',
                '[&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:text-muted-foreground/80'
              )}
              aria-label="消息输入"
            />

            <div className="relative flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-0.5">
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

              {sending ? (
                <button
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full',
                    'bg-muted text-foreground hover:bg-muted/80'
                  )}
                  onClick={() => void cancelTurn()}
                  title="停止"
                  type="button"
                >
                  <Square className="size-3.5 fill-current" />
                </button>
              ) : (
                <ComposerPrimitive.Send asChild>
                  <button
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-full',
                      'bg-primary text-primary-foreground hover:bg-primary/90',
                      'disabled:opacity-40'
                    )}
                    title="发送"
                    type="button"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                </ComposerPrimitive.Send>
              )}
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
