/**
 * 双链芯片样式（节点/实体正文 + 反链）
 * 与 directive 胶囊统一：无边框、深背景、同色浅字
 * 蓝=节点↔节点 · 红=实体↔实体 · 绿=跨类型
 */
import { chipClassName, chipToneClass } from '@/components/assistant-ui/directive-chip'

/**
 * contenteditable 内 mention 的全局 CSS
 * 背景深、文字同色更浅（非纯白）
 */
export const mentionChipStyles = `
.mention-chip {
  display: inline;
  margin: 0 0.1em;
  padding: 0 0.35em;
  border-radius: 0.3em;
  border: none;
  font-weight: 500;
  font-size: inherit;
  line-height: inherit;
  vertical-align: baseline;
  cursor: pointer;
  user-select: all;
}
/* 节点↔节点 · 蓝：深蓝底 + 浅蓝字 */
.mention-chip--blue {
  background: #2563eb;
  color: #bfdbfe;
}
.dark .mention-chip--blue {
  background: #3b82f6;
  color: #dbeafe;
}
/* 实体↔实体 · 红 */
.mention-chip--red {
  background: #e11d48;
  color: #fecdd3;
}
.dark .mention-chip--red {
  background: #f43f5e;
  color: #ffe4e6;
}
/* 跨类型 · 绿 */
.mention-chip--green {
  background: #059669;
  color: #a7f3d0;
}
.dark .mention-chip--green {
  background: #10b981;
  color: #d1fae5;
}
.mention-chip:hover {
  filter: brightness(1.06);
}
.dark .mention-chip:hover {
  filter: brightness(1.08);
}
`

/**
 * 底部反链色块：与正文 mention / directive 同色系
 * beat=蓝 · entity=红 · cross=绿
 */
export const BACKLINK_CHIP = {
  beat: cnBacklink('link-beat'),
  entity: cnBacklink('link-entity'),
  cross: cnBacklink('link-cross'),
  /** 文章引用（出/入链里的 chapter） */
  article: cnBacklinkArticle()
} as const

function cnBacklink(
  tone: 'link-beat' | 'link-entity' | 'link-cross'
): string {
  return chipClassName(tone, {
    surface: 'surface',
    className:
      'inline max-w-full cursor-pointer truncate text-[13px] leading-5 transition-[filter] hover:brightness-110'
  })
}

function cnBacklinkArticle(): string {
  return chipClassName('article', {
    surface: 'surface',
    className:
      'inline max-w-full cursor-pointer truncate text-[13px] leading-5 transition-[filter] hover:brightness-110'
  })
}

export { chipToneClass }
