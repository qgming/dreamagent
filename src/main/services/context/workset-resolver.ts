/**
 * WorksetResolver：显式引用 / 钉选 / 活动文档 / todo → 结构化工作集
 *
 * 优先级（§8.1）：显式 mention、pin 和当前打开文章比相似度检索更高。
 * 每个条目都以 reference 级别展示（ID + 摘要 + 说明），细节靠 read 工具。
 */
import type { ProjectSnapshot } from '../../../shared/project-types'
import type { ContextRef, ActiveDocumentRef } from '../../../shared/context-refs'
import type { TodoItem } from '../../../shared/todos'

export interface ResolvedWorkset {
  explicitRefs: string[]
  pinnedBeats: string[]
  pinnedEntities: string[]
  activeDocument?: string
  todos: TodoItem[]
}

const SNIPPET_LIMIT = 400

function snippet(content: string | undefined): string {
  return (content || '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_LIMIT)
}

export function resolveWorkset(input: {
  snapshot: ProjectSnapshot
  pins: { pinnedBeatIds: string[]; pinnedEntityIds: string[] }
  contextRefs: ContextRef[]
  activeDocument?: ActiveDocumentRef
  todos: TodoItem[]
}): ResolvedWorkset {
  const { snapshot, pins } = input
  const explicitRefs: string[] = []
  const pinnedBeats: string[] = []
  const pinnedEntities: string[] = []

  const beatIds = new Set<string>([...pins.pinnedBeatIds])
  const entityIds = new Set<string>([...pins.pinnedEntityIds])
  const explicitIds = new Set<string>()

  for (const ref of input.contextRefs) {
    const id = ref.id
    explicitIds.add(id)
    if (ref.type === 'beat') {
      const b = snapshot.beats[id]
      if (b) {
        explicitRefs.push(`### 节点「${b.title}」(${b.id}) [${b.status}]\n${snippet(b.content) || '（空）'}`)
        beatIds.add(id)
      }
    } else if (ref.type === 'entity') {
      const e = snapshot.entities[id]
      if (e) {
        explicitRefs.push(`### 实体「${e.name}」(${e.id}) [${e.status}]\n${snippet(e.content) || '（空）'}`)
        entityIds.add(id)
      }
    } else if (ref.type === 'chapter') {
      const c = snapshot.chapters[id]
      if (c) {
        explicitRefs.push(`### 文章「${c.title}」(${c.id}) [${c.status}]\n${snippet(c.content) || '（空）'}`)
      }
    }
    // skill 引用由调用方处理（SkillService），这里不展开
  }

  for (const id of pins.pinnedBeatIds) {
    if (explicitIds.has(id)) continue
    const b = snapshot.beats[id]
    if (b) {
      pinnedBeats.push(`### 节点「${b.title}」(${b.id}) [${b.status}]\n${snippet(b.content) || '（空）'}`)
    }
  }
  for (const id of pins.pinnedEntityIds) {
    if (explicitIds.has(id)) continue
    const e = snapshot.entities[id]
    if (e) {
      pinnedEntities.push(`### 实体「${e.name}」(${e.id}) [${e.status}]\n${snippet(e.content) || '（空）'}`)
    }
  }

  let activeDocument: string | undefined
  if (input.activeDocument) {
    const doc = input.activeDocument
    const resource =
      doc.type === 'chapter'
        ? snapshot.chapters[doc.id]
        : doc.type === 'beat'
          ? snapshot.beats[doc.id]
          : snapshot.entities[doc.id]
    if (resource) {
      const label =
        doc.type === 'entity'
          ? (resource as { name?: string }).name ?? '未命名实体'
          : (resource as { title?: string }).title ?? '未命名'
      const body = snippet((resource as { content?: string }).content)
      activeDocument = `${label} (${doc.id})${doc.cursor != null ? ` cursor=${doc.cursor}` : ''}\n${body || '（空）'}`
    }
  }

  const openTodos = input.todos.filter(
    (t) => t.status !== 'completed' && t.status !== 'cancelled'
  )

  return {
    explicitRefs,
    pinnedBeats,
    pinnedEntities,
    activeDocument,
    todos: openTodos
  }
}
