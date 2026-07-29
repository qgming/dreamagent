import type { ProjectSnapshot } from '@shared/project-types'

export interface LinkItem {
  id: string
  label: string
}

/**
 * 从 snapshot 计算某目标的入链（O(n)，与主进程 runtime 一致）
 */
export function computeBacklinks(
  snapshot: ProjectSnapshot | null,
  targetType: 'beat' | 'entity',
  targetId: string
): {
  beats: LinkItem[]
  entities: LinkItem[]
  chapters: LinkItem[]
} {
  if (!snapshot) return { beats: [], entities: [], chapters: [] }

  const beats: LinkItem[] = []
  const entities: LinkItem[] = []
  const chapters: LinkItem[] = []

  for (const id of snapshot.index.beats.order) {
    const b = snapshot.beats[id]
    if (!b || b.id === targetId) continue
    const refs = targetType === 'beat' ? b.beatRefs : b.entityRefs
    if (refs?.includes(targetId)) {
      beats.push({ id: b.id, label: b.title || '未命名节点' })
    }
  }
  for (const id of snapshot.index.entities.order) {
    const e = snapshot.entities[id]
    if (!e || e.id === targetId) continue
    const refs = targetType === 'beat' ? e.beatRefs : e.entityRefs
    if (refs?.includes(targetId)) {
      entities.push({ id: e.id, label: e.name || '未命名实体' })
    }
  }
  for (const id of snapshot.index.chapters?.order ?? []) {
    const c = snapshot.chapters[id]
    if (!c) continue
    const refs = targetType === 'beat' ? c.beatRefs : c.entityRefs
    const asSource = targetType === 'beat' && c.sourceBeatIds?.includes(targetId)
    if (refs?.includes(targetId) || asSource) {
      chapters.push({ id: c.id, label: c.title || '未命名文章' })
    }
  }
  return { beats, entities, chapters }
}
