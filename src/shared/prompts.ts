/**
 * 内置提示词资源格式（resources/prompts/*.json）。
 * 资源只描述默认内容，用户编辑后的覆盖值由 renderer 本地持久化保存。
 */
export interface PromptResourceItem {
  id: string
  title: string
  description: string
  content: string
  createdAt?: string
  updatedAt?: string
}

export interface PromptCategoryResource {
  id: string
  label: string
  prompts: PromptResourceItem[]
}

function asNonEmptyString(value: unknown, field: string, sourceName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${sourceName} 的 ${field} 必须是非空字符串`)
  }
  return value.trim()
}

/** 严格校验一个提示词分类资源，避免坏资源静默进入提示词库。 */
export function parsePromptCategoryResource(
  value: unknown,
  sourceName = '提示词资源'
): PromptCategoryResource {
  if (!value || typeof value !== 'object') {
    throw new Error(`${sourceName} 必须是 JSON 对象`)
  }

  const raw = value as Record<string, unknown>
  const id = asNonEmptyString(raw.id, 'id', sourceName)
  const label = asNonEmptyString(raw.label, 'label', sourceName)
  if (!Array.isArray(raw.prompts)) {
    throw new Error(`${sourceName} 的 prompts 必须是数组`)
  }

  const ids = new Set<string>()
  const prompts = raw.prompts.map((item, index): PromptResourceItem => {
    const itemName = `${sourceName} 的 prompts[${index}]`
    if (!item || typeof item !== 'object') {
      throw new Error(`${itemName} 必须是 JSON 对象`)
    }
    const prompt = item as Record<string, unknown>
    const promptId = asNonEmptyString(prompt.id, 'id', itemName)
    if (ids.has(promptId)) {
      throw new Error(`${sourceName} 中存在重复的提示词 id: ${promptId}`)
    }
    ids.add(promptId)
    return {
      id: promptId,
      title: asNonEmptyString(prompt.title, 'title', itemName),
      description: typeof prompt.description === 'string' ? prompt.description.trim() : '',
      content: asNonEmptyString(prompt.content, 'content', itemName),
      ...(typeof prompt.createdAt === 'string' ? { createdAt: prompt.createdAt } : {}),
      ...(typeof prompt.updatedAt === 'string' ? { updatedAt: prompt.updatedAt } : {})
    }
  })

  return { id, label, prompts }
}
