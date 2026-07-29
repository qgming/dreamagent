/**
 * 创作 Composer 上下文：技能 / 节点 / 实体
 * 拼进发给 AI 的文本；用户气泡再解析回 chip 展示
 */

export type ComposerContextKind = 'skill' | 'beat' | 'entity'

export interface ComposerContextItem {
  kind: ComposerContextKind
  id: string
  label: string
}

const BLOCK_START = '[上下文]'
const BLOCK_END = '[用户]'

/** 把上下文 + 用户正文拼成发给模型的完整文本 */
export function formatComposerPayload(
  userText: string,
  items: ComposerContextItem[]
): string {
  const body = userText.trim()
  if (items.length === 0) return body

  const lines = items.map((item) => {
    switch (item.kind) {
      case 'skill':
        return `- 技能：${item.label}（${item.id}）`
      case 'beat':
        return `- 节点：${item.label}（${item.id}）`
      case 'entity':
        return `- 实体：${item.label}（${item.id}）`
    }
  })

  return `${BLOCK_START}\n${lines.join('\n')}\n\n${BLOCK_END}\n${body}`
}

export interface ParsedUserMessage {
  /** 展示用正文（去掉上下文块） */
  body: string
  items: ComposerContextItem[]
  /** 是否含可识别上下文块 */
  hasContext: boolean
}

const LINE_RE =
  /^-\s*(技能|节点|实体)：(.+?)（([^）]+)）\s*$/

/** 从用户消息文本解析上下文 chip + 正文 */
export function parseUserMessage(text: string): ParsedUserMessage {
  const raw = text ?? ''
  const start = raw.indexOf(BLOCK_START)
  const end = raw.indexOf(BLOCK_END)
  if (start < 0 || end < 0 || end <= start) {
    return { body: raw, items: [], hasContext: false }
  }

  const block = raw.slice(start + BLOCK_START.length, end).trim()
  const body = raw.slice(end + BLOCK_END.length).replace(/^\n+/, '')
  const items: ComposerContextItem[] = []

  for (const line of block.split('\n')) {
    const m = line.trim().match(LINE_RE)
    if (!m) continue
    const kindLabel = m[1]
    const label = m[2].trim()
    const id = m[3].trim()
    const kind: ComposerContextKind =
      kindLabel === '技能' ? 'skill' : kindLabel === '节点' ? 'beat' : 'entity'
    if (!id) continue
    items.push({ kind, id, label: label || id })
  }

  return {
    body: body || raw,
    items,
    hasContext: items.length > 0
  }
}

export function contextKindLabel(kind: ComposerContextKind): string {
  switch (kind) {
    case 'skill':
      return '技能'
    case 'beat':
      return '节点'
    case 'entity':
      return '实体'
  }
}
