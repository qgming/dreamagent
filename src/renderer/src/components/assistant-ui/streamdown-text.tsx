/**
 * Streamdown 文本：AI 消息流式 markdown
 * 依赖：npm i @assistant-ui/react-streamdown streamdown
 * 思考内容仍走 shadcn 的 @assistant-ui/markdown-text（见 reasoning.tsx）
 */
import { memo } from 'react'
import { StreamdownTextPrimitive } from '@assistant-ui/react-streamdown'
import { cn } from '@/lib/utils'

/**
 * 对齐官方 markdown-text 的阅读节奏，略收紧段落间距，避免气泡内过疏/过密
 * first/last 清掉上下边距，避免与相邻 reasoning/tool 叠出大空隙
 */
const MD_CLASS = cn(
  'aui-md aui-streamdown text-sm leading-relaxed text-foreground',
  // 段落
  '[&_p]:my-2.5 [&_p]:leading-relaxed [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
  // 标题
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:scroll-m-20 [&_h1]:text-xl [&_h1]:font-semibold [&_h1:first-child]:mt-0',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:scroll-m-20 [&_h2]:text-lg [&_h2]:font-semibold [&_h2:first-child]:mt-0',
  '[&_h3]:mt-3 [&_h3]:mb-1.5 [&_h3]:scroll-m-20 [&_h3]:text-base [&_h3]:font-semibold [&_h3:first-child]:mt-0',
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-medium [&_h4:first-child]:mt-0',
  // 列表
  '[&_ul]:my-2.5 [&_ul]:ms-5 [&_ul]:list-disc [&_ul]:marker:text-muted-foreground',
  '[&_ol]:my-2.5 [&_ol]:ms-5 [&_ol]:list-decimal [&_ol]:marker:text-muted-foreground',
  '[&_li]:my-1 [&_li]:leading-relaxed',
  '[&_ul:first-child]:mt-0 [&_ol:first-child]:mt-0 [&_ul:last-child]:mb-0 [&_ol:last-child]:mb-0',
  // 引用 / 分隔
  '[&_blockquote]:my-2.5 [&_blockquote]:border-s-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:ps-4 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-3 [&_hr]:border-border',
  // 链接
  '[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80',
  // 行内代码 / 代码块
  '[&_code]:rounded-md [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&_pre]:my-2.5 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-border/50 [&_pre]:bg-muted/30 [&_pre]:p-3.5 [&_pre]:text-[13px] [&_pre]:leading-relaxed',
  '[&_pre:first-child]:mt-0 [&_pre:last-child]:mb-0',
  // pre 内 code 去掉行内样式
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit',
  // 表格
  '[&_table]:my-2.5 [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:text-left',
  '[&_th]:bg-muted [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-start [&_th]:font-medium',
  '[&_td]:border-b [&_td]:border-muted-foreground/20 [&_td]:px-3 [&_td]:py-1.5',
  '[&_tr]:m-0 [&_tr]:border-b'
)

function StreamdownTextImpl({
  className
}: {
  className?: string
}): React.JSX.Element {
  return (
    <StreamdownTextPrimitive
      caret="block"
      // 流式时保持控件；完成后仍可复制代码块
      controls
      containerClassName={cn(MD_CLASS, className)}
    />
  )
}

export const StreamdownText = memo(StreamdownTextImpl)
