import type { Beat, Entity } from './project-types'

/** 双链目标类型 */
export type MentionTargetType = 'beat' | 'entity'

/**
 * 正文双链：
 *   [@显示名](entity:id)  — 实体
 *   [@显示名](beat:id)    — 节点
 */
export const MENTION_RE = /\[@([^\]]+)\]\((entity|beat):([^)]+)\)/g

/** contenteditable 芯片 */
export const MENTION_CHIP_ATTR = 'data-mention-id'
export const MENTION_CHIP_TYPE_ATTR = 'data-mention-type'
export const MENTION_CHIP_CLASS = 'mention-chip'

export interface Mention {
  raw: string
  label: string
  targetType: MentionTargetType
  targetId: string
  start: number
  end: number
}

export function parseMentions(content: string): Mention[] {
  const result: Mention[] = []
  const re = new RegExp(MENTION_RE.source, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    result.push({
      raw: m[0],
      label: m[1],
      targetType: m[2] as MentionTargetType,
      targetId: m[3],
      start: m.index,
      end: m.index + m[0].length
    })
  }
  return result
}

/** 从正文提取去重 id；按类型过滤 */
export function extractRefIds(
  content: string,
  targetType: MentionTargetType,
  excludeId?: string
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const m of parseMentions(content)) {
    if (m.targetType !== targetType) continue
    if (excludeId && m.targetId === excludeId) continue
    if (seen.has(m.targetId)) continue
    seen.add(m.targetId)
    ids.push(m.targetId)
  }
  return ids
}

export function formatMention(
  label: string,
  targetType: MentionTargetType,
  targetId: string
): string {
  const safeLabel = label.replace(/[\[\]]/g, '').trim() || '未命名'
  return `[@${safeLabel}](${targetType}:${targetId})`
}

export function breakLinksInContent(
  content: string,
  targetType: MentionTargetType,
  targetId: string
): string {
  const re = new RegExp(
    `\\[@([^\\]]+)\\]\\(${targetType}:${escapeRegExp(targetId)}\\)`,
    'g'
  )
  return content.replace(re, '@$1')
}

export function renameLinksInContent(
  content: string,
  targetType: MentionTargetType,
  targetId: string,
  newName: string
): string {
  const re = new RegExp(
    `\\[@([^\\]]+)\\]\\(${targetType}:${escapeRegExp(targetId)}\\)`,
    'g'
  )
  const safe = newName.replace(/[\[\]]/g, '').trim() || '未命名'
  return content.replace(re, `[@${safe}](${targetType}:${targetId})`)
}

export function filterByQuery<T extends { id: string; name?: string; title?: string }>(
  items: T[],
  query: string,
  excludeId?: string,
  nameOf: (item: T) => string = (item) => item.name ?? item.title ?? ''
): T[] {
  const list = excludeId ? items.filter((i) => i.id !== excludeId) : items
  const q = query.trim().toLowerCase()
  if (!q) return list
  return list.filter((i) => nameOf(i).toLowerCase().includes(q))
}

export function filterEntitiesByQuery(
  entities: Entity[],
  query: string,
  excludeId?: string
): Entity[] {
  return filterByQuery(entities, query, excludeId, (e) => e.name)
}

export function filterBeatsByQuery(
  beats: Beat[],
  query: string,
  excludeId?: string
): Beat[] {
  return filterByQuery(beats, query, excludeId, (b) => b.title)
}

/**
 * 芯片颜色语义（三色）：
 * - 节点→节点：蓝
 * - 实体→实体：红
 * - 跨类型（节点↔实体）：绿
 */
export type MentionColor = 'blue' | 'red' | 'green'

export function mentionColor(
  sourceType: MentionTargetType,
  targetType: MentionTargetType
): MentionColor {
  if (sourceType === targetType) {
    return sourceType === 'beat' ? 'blue' : 'red'
  }
  return 'green'
}

export function mentionColorClass(color: MentionColor): string {
  switch (color) {
    case 'blue':
      return 'mention-chip--blue'
    case 'red':
      return 'mention-chip--red'
    case 'green':
      return 'mention-chip--green'
  }
}

/** 存盘正文 → contenteditable HTML */
export function contentToEditorHtml(
  content: string,
  sourceType: MentionTargetType
): string {
  if (!content) return ''
  const mentions = parseMentions(content)
  if (mentions.length === 0) {
    return escapeHtml(content).replace(/\n/g, '<br>')
  }

  let html = ''
  let cursor = 0
  for (const m of mentions) {
    if (m.start > cursor) {
      html += escapeHtml(content.slice(cursor, m.start)).replace(/\n/g, '<br>')
    }
    const label = escapeHtml(m.label)
    const id = escapeHtml(m.targetId)
    const type = escapeHtml(m.targetType)
    const color = mentionColorClass(mentionColor(sourceType, m.targetType))
    html +=
      `<span class="${MENTION_CHIP_CLASS} ${color}" ${MENTION_CHIP_ATTR}="${id}" ${MENTION_CHIP_TYPE_ATTR}="${type}" contenteditable="false">@${label}</span>`
    cursor = m.end
  }
  if (cursor < content.length) {
    html += escapeHtml(content.slice(cursor)).replace(/\n/g, '<br>')
  }
  return html
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
