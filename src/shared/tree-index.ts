/**
 * 树形索引工具：节点/实体 parentId 树、文章文件夹树的兄弟序操作
 * 与双链 mention 正交，只管结构归属。
 */

/** 同类型对象的树序（根 + 按父分组的子序） */
export interface TreeOrderIndex {
  /** 根级有序 id */
  roots: string[]
  /** parentId → 直接子级有序 id */
  children: Record<string, string[]>
}

/** 空树 */
export function emptyTreeOrder(): TreeOrderIndex {
  return { roots: [], children: {} }
}

/** 深拷贝树序，避免就地污染 */
export function cloneTreeOrder(tree: TreeOrderIndex): TreeOrderIndex {
  const children: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(tree.children ?? {})) {
    children[k] = [...v]
  }
  return { roots: [...(tree.roots ?? [])], children }
}

/** 取某父下的直接子 id（parentId 为 null/undefined 时取根） */
export function getChildIds(tree: TreeOrderIndex, parentId?: string | null): string[] {
  if (!parentId) return [...(tree.roots ?? [])]
  return [...(tree.children?.[parentId] ?? [])]
}

/** 前序 DFS 扁平化（用于兼容旧「全局 order」消费方） */
export function flattenTreeOrder(tree: TreeOrderIndex): string[] {
  const result: string[] = []
  const visit = (ids: string[]): void => {
    for (const id of ids) {
      result.push(id)
      visit(tree.children?.[id] ?? [])
    }
  }
  visit(tree.roots ?? [])
  return result
}

/** 从扁平 order 建全根树（v2→v3 迁移） */
export function treeFromFlatOrder(order: string[]): TreeOrderIndex {
  return { roots: [...order], children: {} }
}

/**
 * 收集某节点的全部子孙 id（不含自身）
 */
export function collectDescendantIds(tree: TreeOrderIndex, id: string): string[] {
  const out: string[] = []
  const stack = [...(tree.children?.[id] ?? [])]
  while (stack.length) {
    const cur = stack.pop()!
    out.push(cur)
    const kids = tree.children?.[cur]
    if (kids?.length) stack.push(...kids)
  }
  return out
}

/**
 * 若把 nodeId 挂到 newParentId 下会成环则 true
 * parentOf：从对象读 parentId；也可用 tree 反查
 */
export function wouldCreateCycle(
  nodeId: string,
  newParentId: string | null | undefined,
  parentOf: (id: string) => string | null | undefined
): boolean {
  if (!newParentId) return false
  if (newParentId === nodeId) return true
  let cur: string | null | undefined = newParentId
  const seen = new Set<string>()
  while (cur) {
    if (cur === nodeId) return true
    if (seen.has(cur)) return true
    seen.add(cur)
    cur = parentOf(cur) ?? null
  }
  return false
}

/** 从树中移除 id（不碰其子；调用方负责提升子） */
export function removeFromTree(tree: TreeOrderIndex, id: string, parentId?: string | null): void {
  const pid = parentId ?? null
  if (!pid) {
    tree.roots = tree.roots.filter((x) => x !== id)
  } else {
    const list = tree.children[pid]
    if (list) {
      tree.children[pid] = list.filter((x) => x !== id)
      if (tree.children[pid].length === 0) delete tree.children[pid]
    }
  }
}

/**
 * 将 id 插入某父下（先从旧位置摘掉）
 * afterId：插在该兄弟之后；缺省则追加末尾
 */
export function insertIntoTree(
  tree: TreeOrderIndex,
  id: string,
  parentId: string | null | undefined,
  afterId?: string | null
): void {
  // 先从所有位置摘掉（防重复）
  tree.roots = tree.roots.filter((x) => x !== id)
  for (const key of Object.keys(tree.children)) {
    tree.children[key] = tree.children[key].filter((x) => x !== id)
    if (tree.children[key].length === 0) delete tree.children[key]
  }

  const pid = parentId || null
  if (!pid) {
    const list = [...tree.roots]
    if (afterId && list.includes(afterId)) {
      list.splice(list.indexOf(afterId) + 1, 0, id)
    } else {
      list.push(id)
    }
    tree.roots = list
    return
  }

  const list = [...(tree.children[pid] ?? [])]
  if (afterId && list.includes(afterId)) {
    list.splice(list.indexOf(afterId) + 1, 0, id)
  } else {
    list.push(id)
  }
  tree.children[pid] = list
}

/**
 * 重排同一父下的兄弟；orderedIds 必须与当前兄弟集合完全一致
 */
export function reorderSiblings(
  tree: TreeOrderIndex,
  parentId: string | null | undefined,
  orderedIds: string[]
): void {
  const current = getChildIds(tree, parentId)
  const curSet = new Set(current)
  const nextSet = new Set(orderedIds)
  if (curSet.size !== nextSet.size || [...curSet].some((id) => !nextSet.has(id))) {
    throw new Error('重排失败：有序 id 列表与当前兄弟集合不一致')
  }
  const pid = parentId || null
  if (!pid) {
    tree.roots = [...orderedIds]
  } else {
    tree.children[pid] = [...orderedIds]
  }
}

/**
 * 删除节点时把直接子提升到 deleted 的父下（保持原子序）
 * 返回提升后的新 parentId（null=根）
 */
export function promoteChildrenOnDelete(
  tree: TreeOrderIndex,
  deletedId: string,
  deletedParentId: string | null | undefined
): string | null {
  const kids = [...(tree.children?.[deletedId] ?? [])]
  removeFromTree(tree, deletedId, deletedParentId)
  delete tree.children[deletedId]

  const newParent = deletedParentId || null
  // 按原顺序插入到被删位置附近：追加到新父的子列表（紧跟原兄弟之后更复杂，简化为末尾按序）
  // 更稳：插在 deleted 原位置
  if (!newParent) {
    // 找到 deleted 在 roots 中已不在；把 kids 接到 roots 末尾会丢位置。
    // 调用方应在 remove 前记住 index；此处在 remove 后只能 append。
    // 改进：remove 时记录 index
  }
  for (const kid of kids) {
    insertIntoTree(tree, kid, newParent)
  }
  return newParent
}

/**
 * 删除并提升：在指定插入点把子接到父的兄弟列表中（保持相对顺序）
 */
export function deleteAndPromote(
  tree: TreeOrderIndex,
  deletedId: string,
  deletedParentId: string | null | undefined
): void {
  const kids = [...(tree.children?.[deletedId] ?? [])]
  const pid = deletedParentId || null
  const siblings = getChildIds(tree, pid)
  const idx = siblings.indexOf(deletedId)

  // 从父列表去掉自己
  removeFromTree(tree, deletedId, pid)
  delete tree.children[deletedId]

  if (kids.length === 0) return

  // 在原位置插入全部直接子
  if (!pid) {
    const roots = [...tree.roots]
    const at = idx >= 0 ? idx : roots.length
    roots.splice(at, 0, ...kids)
    // 去重（kids 可能曾残留）
    const seen = new Set<string>()
    tree.roots = roots.filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  } else {
    const list = [...(tree.children[pid] ?? [])]
    const at = idx >= 0 ? idx : list.length
    list.splice(at, 0, ...kids)
    const seen = new Set<string>()
    tree.children[pid] = list.filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }
}

/** 用 parentOf 映射重建整棵树（校验/修复 index） */
export function rebuildTreeFromParents(
  allIds: string[],
  parentOf: (id: string) => string | null | undefined,
  preferredOrder?: string[]
): TreeOrderIndex {
  const idSet = new Set(allIds)
  const tree = emptyTreeOrder()
  const childrenMap: Record<string, string[]> = {}

  const orderHint = preferredOrder?.length
    ? preferredOrder.filter((id) => idSet.has(id))
    : allIds
  // 补全缺失
  for (const id of allIds) {
    if (!orderHint.includes(id)) orderHint.push(id)
  }

  for (const id of orderHint) {
    let p = parentOf(id) ?? null
    // 父不存在则升为根
    if (p && !idSet.has(p)) p = null
    // 自指升为根
    if (p === id) p = null
    if (!p) {
      if (!tree.roots.includes(id)) tree.roots.push(id)
    } else {
      if (!childrenMap[p]) childrenMap[p] = []
      if (!childrenMap[p].includes(id)) childrenMap[p].push(id)
    }
  }

  // 破环：若某 id 的祖先链含自己，升为根
  const parentMap = new Map<string, string | null>()
  for (const id of allIds) {
    parentMap.set(id, null)
  }
  for (const id of tree.roots) parentMap.set(id, null)
  for (const [p, kids] of Object.entries(childrenMap)) {
    for (const k of kids) parentMap.set(k, p)
  }
  for (const id of allIds) {
    if (wouldCreateCycle(id, parentMap.get(id) ?? null, (x) => parentMap.get(x))) {
      // 从 children 摘掉，放根
      const p = parentMap.get(id)
      if (p && childrenMap[p]) {
        childrenMap[p] = childrenMap[p].filter((x) => x !== id)
      }
      if (!tree.roots.includes(id)) tree.roots.push(id)
      parentMap.set(id, null)
    }
  }

  tree.children = childrenMap
  return tree
}

// ── 文章：根文章 + 按 folder 分组 ──────────────────────────

export interface ChapterOrderIndex {
  /** 未入夹文章有序 id */
  roots: string[]
  /** folderId → 文章有序 id */
  byFolder: Record<string, string[]>
}

export function emptyChapterOrder(): ChapterOrderIndex {
  return { roots: [], byFolder: {} }
}

export function cloneChapterOrder(c: ChapterOrderIndex): ChapterOrderIndex {
  const byFolder: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(c.byFolder ?? {})) {
    byFolder[k] = [...v]
  }
  return { roots: [...(c.roots ?? [])], byFolder }
}

export function flattenChapterOrder(c: ChapterOrderIndex): string[] {
  const result = [...(c.roots ?? [])]
  for (const ids of Object.values(c.byFolder ?? {})) {
    result.push(...ids)
  }
  return result
}

export function getChapterIdsInFolder(
  c: ChapterOrderIndex,
  folderId?: string | null
): string[] {
  if (!folderId) return [...(c.roots ?? [])]
  return [...(c.byFolder?.[folderId] ?? [])]
}

export function removeChapterFromOrder(
  c: ChapterOrderIndex,
  chapterId: string,
  folderId?: string | null
): void {
  if (!folderId) {
    c.roots = c.roots.filter((x) => x !== chapterId)
  } else if (c.byFolder[folderId]) {
    c.byFolder[folderId] = c.byFolder[folderId].filter((x) => x !== chapterId)
    if (c.byFolder[folderId].length === 0) delete c.byFolder[folderId]
  }
  // 兜底：从所有桶摘掉
  c.roots = c.roots.filter((x) => x !== chapterId)
  for (const key of Object.keys(c.byFolder)) {
    c.byFolder[key] = c.byFolder[key].filter((x) => x !== chapterId)
    if (c.byFolder[key].length === 0) delete c.byFolder[key]
  }
}

export function insertChapterIntoOrder(
  c: ChapterOrderIndex,
  chapterId: string,
  folderId?: string | null,
  afterId?: string | null
): void {
  removeChapterFromOrder(c, chapterId)
  const fid = folderId || null
  if (!fid) {
    const list = [...c.roots]
    if (afterId && list.includes(afterId)) {
      list.splice(list.indexOf(afterId) + 1, 0, chapterId)
    } else {
      list.push(chapterId)
    }
    c.roots = list
    return
  }
  const list = [...(c.byFolder[fid] ?? [])]
  if (afterId && list.includes(afterId)) {
    list.splice(list.indexOf(afterId) + 1, 0, chapterId)
  } else {
    list.push(chapterId)
  }
  c.byFolder[fid] = list
}

export function reorderChaptersInFolder(
  c: ChapterOrderIndex,
  folderId: string | null | undefined,
  orderedIds: string[]
): void {
  const current = getChapterIdsInFolder(c, folderId)
  const curSet = new Set(current)
  const nextSet = new Set(orderedIds)
  if (curSet.size !== nextSet.size || [...curSet].some((id) => !nextSet.has(id))) {
    throw new Error('重排失败：文章有序 id 列表与当前文件夹集合不一致')
  }
  if (!folderId) {
    c.roots = [...orderedIds]
  } else {
    c.byFolder[folderId] = [...orderedIds]
  }
}

export function chapterOrderFromFlat(order: string[]): ChapterOrderIndex {
  return { roots: [...order], byFolder: {} }
}
