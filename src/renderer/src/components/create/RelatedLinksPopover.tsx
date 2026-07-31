import { useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDot,
  FileText,
  Link2,
  Unlink,
  Users
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { DetailTarget } from '@/stores/create-store'

export interface RelatedLinkItem {
  id: string
  label: string
  type: DetailTarget['type']
}

function relationType(type: RelatedLinkItem['type']): {
  icon: typeof CircleDot
  label: string
  iconClassName: string
} {
  switch (type) {
    case 'beat':
      return {
        icon: CircleDot,
        label: '节点',
        iconClassName: 'text-foreground'
      }
    case 'entity':
      return {
        icon: Users,
        label: '实体',
        iconClassName: 'text-muted-foreground'
      }
    case 'chapter':
      return {
        icon: FileText,
        label: '文章',
        iconClassName: 'text-foreground/70'
      }
  }
}

function RelationGroup({
  direction,
  items,
  onOpen
}: {
  direction: 'outgoing' | 'incoming'
  items: RelatedLinkItem[]
  onOpen: (item: RelatedLinkItem) => void
}): React.JSX.Element | null {
  if (items.length === 0) return null

  const DirectionIcon = direction === 'outgoing' ? ArrowUpRight : ArrowDownLeft
  const title = direction === 'outgoing' ? '主动关联' : '被引用'

  return (
    <section className="border-t border-border px-2 py-2.5 first:border-t-0">
      <div className="mb-1 flex items-center gap-1.5 px-1">
        <DirectionIcon aria-hidden className="size-3 text-muted-foreground" />
        <h4 className="text-[11px] font-medium text-foreground">{title}</h4>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-muted-foreground">
          {items.length}
        </span>
      </div>
      <div className="space-y-0.5">
        {items.map((item) => {
          const type = relationType(item.type)
          const TypeIcon = type.icon
          return (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring/35"
              key={`${direction}-${item.type}-${item.id}`}
              onClick={() => onOpen(item)}
              type="button"
            >
              <TypeIcon
                aria-hidden
                className={cn('size-3.5 shrink-0', type.iconClassName)}
              />
              <span className="min-w-0 flex-1 break-words text-xs leading-4 text-foreground">
                {item.label}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {type.label}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function RelatedLinksPopover({
  outgoing = [],
  incoming = [],
  onOpen
}: {
  outgoing?: RelatedLinkItem[]
  incoming?: RelatedLinkItem[]
  onOpen: (target: DetailTarget) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const total = outgoing.length + incoming.length

  const handleOpen = (item: RelatedLinkItem): void => {
    setOpen(false)
    onOpen({ type: item.type, id: item.id })
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={`查看关联内容，共 ${total} 项`}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] text-muted-foreground outline-none transition-colors',
            'hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35',
            'data-[state=open]:bg-muted data-[state=open]:text-foreground'
          )}
          type="button"
        >
          <Link2 aria-hidden className="size-3.5" />
          <span>关联</span>
          <span className="min-w-3 text-right font-mono text-[10px] tabular-nums">
            {total}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="app-scrollbar max-h-[min(22rem,calc(100dvh-5rem))] w-72 overflow-y-auto p-0"
        side="bottom"
        sideOffset={7}
      >
        <div className="flex items-center gap-2 px-3 py-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Link2 aria-hidden className="size-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-medium text-foreground">关联内容</h3>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              共 {total} 项
            </p>
          </div>
        </div>

        {total > 0 ? (
          <div className="border-t border-border">
            <RelationGroup
              direction="outgoing"
              items={outgoing}
              onOpen={handleOpen}
            />
            <RelationGroup
              direction="incoming"
              items={incoming}
              onOpen={handleOpen}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2 border-t border-border px-3 py-4 text-xs text-muted-foreground">
            <Unlink aria-hidden className="size-4 shrink-0 opacity-70" />
            暂无关联内容
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
