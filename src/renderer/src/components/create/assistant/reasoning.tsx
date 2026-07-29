/**
 * 思考/推理块：可折叠，流式时默认展开
 */
import { useEffect, useState } from 'react'
import { ChevronRight, Brain } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 与 assistant-ui Reasoning part 对齐的最小 props */
type ReasoningPartProps = {
  text?: string
  status?: { type?: string }
}

export function ReasoningPart(props: ReasoningPartProps): React.JSX.Element | null {
  const text = props.text ?? ''
  const streaming = props.status?.type === 'running'
  const [open, setOpen] = useState(Boolean(streaming))

  useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])

  if (!text.trim() && !streaming) return null

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border/70 bg-muted/30 text-xs">
      <button
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Brain className="size-3.5 shrink-0" />
        <span className="font-medium">{streaming ? '思考中…' : '思考过程'}</span>
        {streaming ? (
          <span className="ml-1 inline-block size-1.5 animate-pulse rounded-full bg-primary" />
        ) : null}
        <ChevronRight
          className={cn('ml-auto size-3.5 transition-transform', open && 'rotate-90')}
        />
      </button>
      {open ? (
        <div className="border-t border-border/60 px-3 py-2 text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {text || '…'}
        </div>
      ) : null}
    </div>
  )
}
