/**
 * 结构化上下文引用（contextRefs）
 *
 * 渲染层把 Composer 里的显式 directive mention 序列化为结构化引用，
 * 主进程 WorksetResolver 再重新读取对应资源并校验 projectId / 资源类型。
 * 文本中的普通 @ 仍是文本，不会自动扩大工作集。
 */

export type ContextRefType = 'beat' | 'entity' | 'chapter' | 'skill'

export interface ContextRef {
  type: ContextRefType
  id: string
  /** 展示名（可选，仅审计用） */
  label?: string
}

export type ActiveDocumentType = 'chapter' | 'beat' | 'entity'

export interface ActiveDocumentRef {
  type: ActiveDocumentType
  id: string
  cursor?: number
}

/** assistant-ui directive 语法：:type[label]{name=id} */
const DIRECTIVE_RE = /:([\w-]{1,64})\[([^\]\n]{1,1024})\](?:\{name=([^}\n]{1,1024})\})?/gu

const REF_TYPE_MAP: Record<string, ContextRefType> = {
  beat: 'beat',
  entity: 'entity',
  article: 'chapter',
  chapter: 'chapter',
  skill: 'skill'
}

/**
 * 从 composer 文本中提取结构化 contextRefs。
 * 只认 directive mention；纯文本 / 普通 @ 不解析。
 */
export function extractContextRefsFromText(text: string): ContextRef[] {
  const out: ContextRef[] = []
  const seen = new Set<string>()
  const re = new RegExp(DIRECTIVE_RE.source, 'gu')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const type = REF_TYPE_MAP[m[1]!]
    if (!type) continue
    const id = (m[3] ?? m[2] ?? '').trim()
    if (!id) continue
    const key = `${type}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ type, id, label: m[2]?.trim() })
  }
  return out
}

/** 去重合并 refs（后者优先级更高，同一 id 只保留一条） */
export function mergeContextRefs(...groups: Array<ContextRef[] | undefined>): ContextRef[] {
  const map = new Map<string, ContextRef>()
  for (const group of groups) {
    for (const ref of group ?? []) {
      map.set(`${ref.type}:${ref.id}`, ref)
    }
  }
  return [...map.values()]
}
