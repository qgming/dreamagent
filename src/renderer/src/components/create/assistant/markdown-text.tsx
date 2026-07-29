/**
 * 流式 Markdown 文本（assistant-ui MarkdownTextPrimitive + remark-gfm）
 * 不依赖 @tailwindcss/typography，自带基础 md 样式。
 */
import { memo } from 'react'
import { MarkdownTextPrimitive } from '@assistant-ui/react-markdown'
import remarkGfm from 'remark-gfm'

function MarkdownTextImpl(): React.JSX.Element {
  return (
    <MarkdownTextPrimitive
      className="aui-md text-sm leading-relaxed [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5 [&_h1]:mb-2 [&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-2 [&_h3]:text-sm [&_h3]:font-medium [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/5 [&_pre]:p-3 dark:[&_pre]:bg-white/5 [&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 dark:[&_code]:bg-white/10 [&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_hr]:my-3 [&_hr]:border-border [&_table]:my-2 [&_table]:w-full [&_table]:text-left [&_th]:border-b [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border-b [&_td]:border-border/60 [&_td]:px-2 [&_td]:py-1"
      remarkPlugins={[remarkGfm]}
      smooth
    />
  )
}

export const MarkdownText = memo(MarkdownTextImpl)
