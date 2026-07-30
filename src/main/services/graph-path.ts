/**
 * 图谱虚拟路径解析
 * beats | beats/{id} | beat:{id}
 * entities | entities/{id} | entity:{id}
 * chapters | chapters/{id} | chapter:{id}
 * folders | folders/{id} | folder:{id}   # 文章文件夹
 * outline
 */
import type { GraphResourceType } from '../../shared/agent-tools'

export type ParsedGraphPath =
  | { kind: 'collection'; type: 'beat' | 'entity' | 'chapter' | 'folder' }
  | { kind: 'item'; type: 'beat' | 'entity' | 'chapter' | 'folder'; id: string }
  | { kind: 'outline' }

export function parseGraphPath(raw: string): ParsedGraphPath {
  const input = String(raw || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  if (!input) throw new Error('path 不能为空')

  const lower = input.toLowerCase()
  if (lower === 'outline') return { kind: 'outline' }

  // type:id 别名
  const colon = input.match(/^(beat|entity|chapter|folder|fold|ent|chap)s?:(.+)$/i)
  if (colon) {
    const t = normalizeType(colon[1])
    const id = colon[2].trim()
    if (!id) throw new Error(`无效 path：${raw}`)
    return { kind: 'item', type: t, id }
  }

  const parts = input.split('/').filter(Boolean)
  if (parts.length === 1) {
    const t = normalizeCollection(parts[0])
    return { kind: 'collection', type: t }
  }
  if (parts.length === 2) {
    const t = normalizeCollection(parts[0])
    const id = parts[1].trim()
    if (!id) throw new Error(`无效 path：${raw}`)
    return { kind: 'item', type: t, id }
  }
  throw new Error(
    `无法解析 path：${raw}。示例：beats、beats/{id}、folders、folders/{id}、folder:{id}、outline`
  )
}

function normalizeCollection(seg: string): 'beat' | 'entity' | 'chapter' | 'folder' {
  const s = seg.toLowerCase()
  if (s === 'beat' || s === 'beats') return 'beat'
  if (s === 'entity' || s === 'entities' || s === 'ent' || s === 'ents') return 'entity'
  if (s === 'chapter' || s === 'chapters' || s === 'chap' || s === 'chaps') return 'chapter'
  if (s === 'folder' || s === 'folders' || s === 'fold' || s === 'folds') return 'folder'
  throw new Error(`未知集合：${seg}。请用 beats / entities / chapters / folders / outline`)
}

function normalizeType(seg: string): 'beat' | 'entity' | 'chapter' | 'folder' {
  const s = seg.toLowerCase()
  if (s.startsWith('beat')) return 'beat'
  if (s.startsWith('ent')) return 'entity'
  if (s.startsWith('chap')) return 'chapter'
  if (s.startsWith('fold')) return 'folder'
  throw new Error(`未知类型：${seg}`)
}

export function formatItemPath(type: GraphResourceType, id: string): string {
  if (type === 'outline') return 'outline'
  const plural =
    type === 'beat'
      ? 'beats'
      : type === 'entity'
        ? 'entities'
        : type === 'folder'
          ? 'folders'
          : 'chapters'
  return `${plural}/${id}`
}

/** 在 content 上应用一组互不重叠的精确替换（相对原文） */
export function applyExactEdits(
  content: string,
  edits: Array<{ oldText: string; newText: string }>
): string {
  if (!edits.length) return content
  let result = content
  // 从后往前替换，避免偏移；先校验唯一性基于原文
  const ranges: Array<{ start: number; end: number; newText: string }> = []
  for (const edit of edits) {
    const oldText = edit.oldText
    if (!oldText) throw new Error('edits.oldText 不能为空')
    const first = content.indexOf(oldText)
    if (first < 0) throw new Error(`找不到唯一匹配的 oldText：${oldText.slice(0, 40)}…`)
    const second = content.indexOf(oldText, first + 1)
    if (second >= 0) throw new Error(`oldText 在文件中不唯一：${oldText.slice(0, 40)}…`)
    ranges.push({ start: first, end: first + oldText.length, newText: edit.newText ?? '' })
  }
  ranges.sort((a, b) => b.start - a.start)
  // 重叠检测
  const ordered = [...ranges].sort((a, b) => a.start - b.start)
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].start < ordered[i - 1].end) {
      throw new Error('edits 存在重叠区间，请合并为一次替换')
    }
  }
  for (const r of ranges) {
    result = result.slice(0, r.start) + r.newText + result.slice(r.end)
  }
  return result
}

const CHAPTER_DUAL_LINK_RE = /\[@[^\]]+\]\((?:entity|beat):[^)]+\)/

export function assertNoChapterDualLinks(content: string): void {
  if (CHAPTER_DUAL_LINK_RE.test(content)) {
    throw new Error(
      '文章 content 禁止双链语法 [@…](entity|beat:…)。请用纯正文，关联写入 sourceBeatIds / entityRefs / beatRefs。'
    )
  }
}
