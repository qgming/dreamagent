import { v4 as uuidv4 } from 'uuid'

/**
 * 使用 uuid 生成带前缀的唯一 id
 * 例：proj_550e8400-e29b-41d4-a716-446655440000
 */
export function createId(prefix: string): string {
  return `${prefix}_${uuidv4()}`
}

/** 标题转安全文件夹名 / 文件名片段 */
export function toFolderName(title: string): string {
  const base = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '-')
    .replace(/\.+$/g, '')
    .slice(0, 40)
  return base || '未命名'
}

/** 从带前缀 id 取出 uuid 段 */
export function idToUuid(id: string): string {
  const idx = id.indexOf('_')
  return idx >= 0 ? id.slice(idx + 1) : id
}

/**
 * 可读文件名：名称-uuid.json（节点 / 实体共用）
 */
export function toNamedFileName(title: string, id: string, fallback = '未命名'): string {
  const name = toFolderName(title) || fallback
  return `${name}-${idToUuid(id)}.json`
}

/** @deprecated 使用 toNamedFileName */
export function toBeatFileName(title: string, beatId: string): string {
  return toNamedFileName(title, beatId, '未命名节点')
}

export function toEntityFileName(name: string, entityId: string): string {
  return toNamedFileName(name, entityId, '未命名实体')
}
