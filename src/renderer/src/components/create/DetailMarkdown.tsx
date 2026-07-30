/**
 * 右栏只读 Markdown：渲染 GFM，并把 [@名](beat|entity:id) 画成可点芯片
 */
import { memo, useMemo, type MouseEvent } from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  MENTION_CHIP_ATTR,
  MENTION_CHIP_CLASS,
  MENTION_CHIP_TYPE_ATTR,
  mentionColor,
  mentionColorClass,
  type MentionTargetType
} from '@shared/mentions'
import { cn } from '@/lib/utils'

/** 右栏正文排版：14px / leading-7，贴近原只读预览密度 */
const MD_CLASS = cn(
  'text-[14px] leading-7 text-foreground break-words',
  // 段落
  '[&_p]:my-2.5 [&_p]:leading-7 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  // 标题
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:scroll-m-20 [&_h1]:text-xl [&_h1]:font-semibold [&_h1:first-child]:mt-0',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:scroll-m-20 [&_h2]:text-lg [&_h2]:font-semibold [&_h2:first-child]:mt-0',
  '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:scroll-m-20 [&_h3]:text-base [&_h3]:font-semibold [&_h3:first-child]:mt-0',
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4:first-child]:mt-0',
  // 列表
  '[&_ul]:my-2.5 [&_ul]:ms-5 [&_ul]:list-disc [&_ul]:marker:text-muted-foreground',
  '[&_ol]:my-2.5 [&_ol]:ms-5 [&_ol]:list-decimal [&_ol]:marker:text-muted-foreground',
  '[&_li]:my-1 [&_li]:leading-7',
  '[&_ul:first-child]:mt-0 [&_ol:first-child]:mt-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0',
  // 引用 / 分隔
  '[&_blockquote]:my-2.5 [&_blockquote]:border-s-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:ps-4 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-3 [&_hr]:border-border',
  // 普通链接
  '[&_a:not(.mention-chip)]:text-primary [&_a:not(.mention-chip)]:underline [&_a:not(.mention-chip)]:underline-offset-2',
  // 行内代码 / 代码块
  '[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&_pre]:my-2.5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/50 [&_pre]:bg-muted/30 [&_pre]:p-3.5 [&_pre]:text-[13px] [&_pre]:leading-relaxed',
  '[&_pre:first-child]:mt-0 [&_pre:last-child]:mb-0',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  // 表格
  '[&_table]:my-2.5 [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:text-left',
  '[&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-start [&_th]:font-medium',
  '[&_td]:border-b [&_td]:border-muted-foreground/20 [&_td]:px-3 [&_td]:py-1.5',
  '[&_tr]:m-0 [&_tr]:border-b',
  // 强调
  '[&_strong]:font-semibold',
  '[&_em]:italic'
)

interface DetailMarkdownProps {
  content: string
  /** 当前详情主体类型，决定芯片三色语义 */
  sourceType: MentionTargetType
  className?: string
  onOpenMention?: (type: MentionTargetType, id: string) => void
}

/** 放行双链协议，其余走默认消毒 */
function urlTransform(url: string): string {
  if (url.startsWith('entity:') || url.startsWith('beat:')) return url
  return defaultUrlTransform(url)
}

function parseMentionHref(
  href: string | undefined
): { type: MentionTargetType; id: string } | null {
  if (!href) return null
  const m = /^(entity|beat):(.+)$/.exec(href)
  if (!m) return null
  const id = m[2].trim()
  if (!id) return null
  return { type: m[1] as MentionTargetType, id }
}

function DetailMarkdownImpl({
  content,
  sourceType,
  className,
  onOpenMention
}: DetailMarkdownProps): React.JSX.Element {
  const components = useMemo<Components>(() => {
    return {
      a: ({ href, children, ...rest }) => {
        const mention = parseMentionHref(href)
        if (mention) {
          const color = mentionColorClass(mentionColor(sourceType, mention.type))
          return (
            <span
              className={`${MENTION_CHIP_CLASS} ${color}`}
              {...{
                [MENTION_CHIP_ATTR]: mention.id,
                [MENTION_CHIP_TYPE_ATTR]: mention.type
              }}
              onClick={(e: MouseEvent) => {
                e.preventDefault()
                e.stopPropagation()
                onOpenMention?.(mention.type, mention.id)
              }}
              role="link"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onOpenMention?.(mention.type, mention.id)
                }
              }}
            >
              {children}
            </span>
          )
        }
        // 普通外链：新窗口打开，禁止把 rest 里的 node 等传下去
        const { node: _node, ...anchorProps } = rest as {
          node?: unknown
          [key: string]: unknown
        }
        return (
          <a
            href={href}
            rel="noreferrer noopener"
            target="_blank"
            {...anchorProps}
          >
            {children}
          </a>
        )
      }
    }
  }, [onOpenMention, sourceType])

  if (!content.trim()) {
    return <p className="text-muted-foreground">（无正文）</p>
  }

  return (
    <div className={cn(MD_CLASS, className)}>
      <ReactMarkdown
        components={components}
        remarkPlugins={[remarkGfm]}
        urlTransform={urlTransform}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

export const DetailMarkdown = memo(DetailMarkdownImpl)
