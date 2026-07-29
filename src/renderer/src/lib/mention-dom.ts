/**
 * contenteditable ↔ 存盘正文
 */
import {
  formatMention,
  MENTION_CHIP_ATTR,
  MENTION_CHIP_TYPE_ATTR,
  type MentionTargetType
} from '@shared/mentions'

export function editorDomToContent(root: HTMLElement): string {
  return serializeNode(root)
}

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? ''
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ''

  const el = node as HTMLElement
  if (el.getAttribute?.(MENTION_CHIP_ATTR)) {
    const id = el.getAttribute(MENTION_CHIP_ATTR) ?? ''
    const type = (el.getAttribute(MENTION_CHIP_TYPE_ATTR) ?? 'entity') as MentionTargetType
    const label = (el.textContent ?? '').replace(/^@/, '').trim() || '未命名'
    return formatMention(label, type, id)
  }
  if (el.tagName === 'BR') return '\n'

  const isBlock = el.tagName === 'DIV' || el.tagName === 'P' || el.tagName === 'LI'
  let out = ''
  if (isBlock && el.previousSibling) out += '\n'
  for (const child of Array.from(el.childNodes)) {
    out += serializeNode(child)
  }
  return out
}
