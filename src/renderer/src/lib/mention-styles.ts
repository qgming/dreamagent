/**
 * 双链芯片样式（节点/实体正文 + 反链）
 * 与 directive 胶囊统一：无边框、深背景、同色浅字。
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
.mention-chip--blue {
  background: var(--mention-blue-surface);
  color: var(--mention-blue-foreground);
}
.dark .mention-chip--blue {
  background: var(--mention-blue-surface);
  color: var(--mention-blue-foreground);
}
.mention-chip--red {
  background: var(--link-red-surface);
  color: var(--link-red-foreground);
}
.dark .mention-chip--red {
  background: var(--link-red-surface);
  color: var(--link-red-foreground);
}
.mention-chip--green {
  background: var(--link-green-surface);
  color: var(--link-green-foreground);
}
.dark .mention-chip--green {
  background: var(--link-green-surface);
  color: var(--link-green-foreground);
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
