/**
 * 确定性检索评分（§10.5）
 *
 * 首次实现不引入随机选择：
 *   score = 1.00*explicitMention + 0.95*pin + 0.80*activeDocumentRelation
 *         + 0.55*graphRelation + 0.45*semanticRelevance + 0.25*recency
 *         + 0.20*canonicalImportance + 0.15*unresolvedThread
 * 所有分数在 [0,1]，按 sourceId 作为最终稳定排序键。
 * 每次命中必须保存 query、score、evidenceIds 和 selectedReason。
 */

export interface RetrievalCandidate {
  sourceId: string
  explicitMention?: boolean
  pin?: boolean
  activeDocumentRelation?: boolean
  graphRelation?: number
  semanticRelevance?: number
  recency?: number
  canonicalImportance?: number
  unresolvedThread?: boolean
}

export interface RetrievalHit {
  sourceId: string
  score: number
  evidenceIds: string[]
  selectedReason: string
}

export function scoreCandidate(c: RetrievalCandidate): number {
  const w = {
    explicitMention: 1.0,
    pin: 0.95,
    activeDocumentRelation: 0.8,
    graphRelation: 0.55,
    semanticRelevance: 0.45,
    recency: 0.25,
    canonicalImportance: 0.2,
    unresolvedThread: 0.15
  }
  const clamp = (v: number | undefined): number =>
    v === undefined ? 0 : Math.max(0, Math.min(1, v))
  return (
    (c.explicitMention ? w.explicitMention : 0) +
    (c.pin ? w.pin : 0) +
    (c.activeDocumentRelation ? w.activeDocumentRelation : 0) +
    w.graphRelation * clamp(c.graphRelation) +
    w.semanticRelevance * clamp(c.semanticRelevance) +
    w.recency * clamp(c.recency) +
    w.canonicalImportance * clamp(c.canonicalImportance) +
    (c.unresolvedThread ? w.unresolvedThread : 0)
  )
}

/** 向量检索先过取 10 倍候选，再用上述分数重排；按 sourceId 稳定排序 */
export function rankCandidates(
  candidates: RetrievalCandidate[],
  options: { topK?: number; query: string }
): RetrievalHit[] {
  const ranked = candidates
    .map((c) => {
      const score = scoreCandidate(c)
      const evidenceIds: string[] = []
      if (c.explicitMention) evidenceIds.push(`explicit:${c.sourceId}`)
      if (c.pin) evidenceIds.push(`pin:${c.sourceId}`)
      if (c.activeDocumentRelation) evidenceIds.push(`active_doc:${c.sourceId}`)
      if ((c.graphRelation ?? 0) > 0) evidenceIds.push(`graph:${c.sourceId}`)
      if ((c.semanticRelevance ?? 0) > 0) evidenceIds.push(`semantic:${c.sourceId}`)
      return {
        sourceId: c.sourceId,
        score,
        evidenceIds,
        selectedReason: describeSelection(c, score)
      }
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return a.sourceId.localeCompare(b.sourceId)
    })
  const topK = Math.max(1, options.topK ?? 10)
  return ranked.slice(0, topK)
}

function describeSelection(c: RetrievalCandidate, score: number): string {
  const parts: string[] = []
  if (c.explicitMention) parts.push('explicit')
  if (c.pin) parts.push('pin')
  if (c.activeDocumentRelation) parts.push('active-doc')
  if ((c.graphRelation ?? 0) > 0) parts.push(`graph=${c.graphRelation?.toFixed(2)}`)
  if ((c.semanticRelevance ?? 0) > 0) parts.push(`semantic=${c.semanticRelevance?.toFixed(2)}`)
  if ((c.recency ?? 0) > 0) parts.push(`recency=${c.recency?.toFixed(2)}`)
  return parts.length ? `score=${score.toFixed(2)} via ${parts.join('+')}` : `score=${score.toFixed(2)}`
}
