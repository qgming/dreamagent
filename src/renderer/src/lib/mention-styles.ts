/**
 * 双链芯片全局样式（三色）
 * 蓝=节点↔节点 · 红=实体↔实体 · 绿=跨类型
 */
export const mentionChipStyles = `
.mention-chip {
  display: inline;
  margin: 0 0.125rem;
  padding: 0.1rem 0.35rem;
  border-radius: 0.375rem;
  font-weight: 500;
  font-size: inherit;
  line-height: inherit;
  vertical-align: baseline;
  cursor: pointer;
  user-select: all;
}
.mention-chip--blue {
  background: color-mix(in oklab, #3b82f6 22%, transparent);
  color: #1d4ed8;
}
.dark .mention-chip--blue {
  background: color-mix(in oklab, #60a5fa 28%, transparent);
  color: #93c5fd;
}
.mention-chip--red {
  background: color-mix(in oklab, #ef4444 20%, transparent);
  color: #b91c1c;
}
.dark .mention-chip--red {
  background: color-mix(in oklab, #f87171 26%, transparent);
  color: #fca5a5;
}
.mention-chip--green {
  background: color-mix(in oklab, #22c55e 20%, transparent);
  color: #15803d;
}
.dark .mention-chip--green {
  background: color-mix(in oklab, #4ade80 26%, transparent);
  color: #86efac;
}
.mention-chip:hover {
  box-shadow: 0 0 0 1px color-mix(in oklab, var(--ring) 50%, transparent);
}
`

/** 底部反链色块：与正文 mention-chip 同量级（小内边距、继承字号） */
export const BACKLINK_CHIP = {
  beat:
    'inline max-w-full truncate rounded-md px-1 py-0.5 text-[13px] font-medium leading-5 align-baseline transition-shadow ' +
    'bg-[color-mix(in_oklab,#3b82f6_22%,transparent)] text-[#1d4ed8] ' +
    'dark:bg-[color-mix(in_oklab,#60a5fa_28%,transparent)] dark:text-[#93c5fd] ' +
    'hover:ring-1 hover:ring-ring/40',
  entity:
    'inline max-w-full truncate rounded-md px-1 py-0.5 text-[13px] font-medium leading-5 align-baseline transition-shadow ' +
    'bg-[color-mix(in_oklab,#ef4444_20%,transparent)] text-[#b91c1c] ' +
    'dark:bg-[color-mix(in_oklab,#f87171_26%,transparent)] dark:text-[#fca5a5] ' +
    'hover:ring-1 hover:ring-ring/40',
  cross:
    'inline max-w-full truncate rounded-md px-1 py-0.5 text-[13px] font-medium leading-5 align-baseline transition-shadow ' +
    'bg-[color-mix(in_oklab,#22c55e_20%,transparent)] text-[#15803d] ' +
    'dark:bg-[color-mix(in_oklab,#4ade80_26%,transparent)] dark:text-[#86efac] ' +
    'hover:ring-1 hover:ring-ring/40'
} as const
