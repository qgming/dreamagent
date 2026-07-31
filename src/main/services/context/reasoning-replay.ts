/**
 * ReasoningReplayPolicy（§12.2）
 *
 * - 同 provider、同 api、同 model，存在有效 signature → native_same_model
 * - 同模型但无 signature → 按 adapter compat 决定；否则 decisionSummary
 * - 跨 provider / 跨 api → decision_summary_cross_model
 * - 用户显式打开“回放最近可见 reasoning” → recent_visible_reasoning
 * - error / aborted assistant → omit
 */

export type ReasoningReplayMode =
  | 'native_same_model'
  | 'decision_summary_cross_model'
  | 'recent_visible_reasoning'
  | 'omit'

export interface ReasoningReplayPolicy {
  mode: ReasoningReplayMode
  maxRecentTurns: number
  includeSignatures: boolean
  includeRawThinkingText: boolean
  reason: string
}

export interface ReasoningReplayContext {
  /** 上一轮 providerId::api::modelId（可缺失） */
  previousModelKey?: string
  currentModelKey: string
  /** 是否存在可回放的有效 thinkingSignature */
  hasValidSignature: boolean
  /** 用户是否显式开启最近可见 reasoning 回放 */
  replayRecentVisible?: boolean
  /** 上一轮是否以 error / aborted 结束 */
  previousTurnFailed?: boolean
}

export function modelKey(providerId: string, api: string, modelId: string): string {
  return `${providerId}::${api}::${modelId}`
}

export function resolveReasoningReplayPolicy(
  ctx: ReasoningReplayContext
): ReasoningReplayPolicy {
  if (ctx.previousTurnFailed) {
    return {
      mode: 'omit',
      maxRecentTurns: 0,
      includeSignatures: false,
      includeRawThinkingText: false,
      reason: 'previous_turn_failed'
    }
  }

  const sameModel =
    !!ctx.previousModelKey && ctx.previousModelKey === ctx.currentModelKey

  if (sameModel && ctx.hasValidSignature) {
    return {
      mode: 'native_same_model',
      maxRecentTurns: 0,
      includeSignatures: true,
      includeRawThinkingText: true,
      reason: 'same_model_signature'
    }
  }

  if (sameModel && !ctx.hasValidSignature) {
    return {
      mode: 'decision_summary_cross_model',
      maxRecentTurns: 3,
      includeSignatures: false,
      includeRawThinkingText: false,
      reason: 'same_model_without_signature'
    }
  }

  if (ctx.replayRecentVisible) {
    return {
      mode: 'recent_visible_reasoning',
      maxRecentTurns: 3,
      includeSignatures: false,
      includeRawThinkingText: true,
      reason: 'user_requested_recent_reasoning'
    }
  }

  return {
    mode: 'decision_summary_cross_model',
    maxRecentTurns: 3,
    includeSignatures: false,
    includeRawThinkingText: false,
    reason: 'cross_model'
  }
}

/** 决策摘要：跨模型 / 长期记忆首选的结构化可审计结果 */
export interface DecisionSummary {
  decision: string
  reasons: string[]
  constraintsApplied: string[]
  uncertainties: string[]
  sourceMessageIds: string[]
}

export function formatDecisionSummary(summary: DecisionSummary): string {
  const lines = [
    `决策：${summary.decision || '（未记录）'}`
  ]
  if (summary.reasons.length) {
    lines.push(`依据：\n${summary.reasons.map((r) => `- ${r}`).join('\n')}`)
  }
  if (summary.constraintsApplied.length) {
    lines.push(`已应用约束：\n${summary.constraintsApplied.map((c) => `- ${c}`).join('\n')}`)
  }
  if (summary.uncertainties.length) {
    lines.push(`不确定：\n${summary.uncertainties.map((u) => `- ${u}`).join('\n')}`)
  }
  if (summary.sourceMessageIds.length) {
    lines.push(`来源消息：${summary.sourceMessageIds.join(', ')}`)
  }
  return lines.join('\n')
}
