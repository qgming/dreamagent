/**
 * 请求前不变量校验（§8.2）
 *
 * 生产环境遇到 validation error 时不得继续发送“可能缺历史”的请求：
 * 记录结构化 error trace → 尝试一次安全降级 → 仍失败则返回可读错误。
 */
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { CompiledContext, ContextRequest } from './types'

export interface ValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/** 提取消息里的 toolCall / toolResult 块，便于配对检查 */
export function extractToolBlocks(message: AgentMessage): {
  toolCalls: Array<{ id: string; name?: string }>
} {
  const toolCalls: Array<{ id: string; name?: string }> = []
  const m = message as { content?: unknown; role?: string }
  const content = m.content
  if (Array.isArray(content)) {
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as { type?: string; id?: string; name?: string }
      if (b.type === 'toolCall' && typeof b.id === 'string') {
        toolCalls.push({ id: b.id, name: b.name })
      }
    }
  }
  return { toolCalls }
}

function messageHasErrorStop(message: AgentMessage): boolean {
  const m = message as { stopReason?: string }
  return m.stopReason === 'error' || m.stopReason === 'aborted'
}

function toolCallIdsInMessages(messages: AgentMessage[]): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    const m = message as { role?: string }
    if (m.role !== 'assistant') continue
    const { toolCalls } = extractToolBlocks(message)
    for (const tc of toolCalls) ids.add(tc.id)
  }
  return ids
}

function toolResultIdsInMessages(messages: AgentMessage[]): Set<string> {
  const ids = new Set<string>()
  for (const message of messages) {
    const m = message as { role?: string }
    if (m.role !== 'toolResult') continue
    const tr = message as { toolCallId?: string }
    if (typeof tr.toolCallId === 'string') ids.add(tr.toolCallId)
  }
  return ids
}

/** 校验最终消息序列的工具链邻接关系 */
export function validateMessageChain(messages: AgentMessage[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const callIds = toolCallIdsInMessages(messages)
  const resultIds = toolResultIdsInMessages(messages)

  for (const id of callIds) {
    if (!resultIds.has(id)) {
      errors.push(`toolCall ${id} 缺少对应 toolResult`)
    }
  }
  for (const id of resultIds) {
    if (!callIds.has(id)) {
      errors.push(`toolResult ${id} 缺少对应 toolCall`)
    }
  }

  // 顺序：同 ID 的 toolResult 必须出现在对应 toolCall 之后
  const seen = new Set<string>()
  for (const message of messages) {
    const m = message as { role?: string }
    if (m.role === 'assistant') {
      for (const tc of extractToolBlocks(message).toolCalls) {
        if (resultIds.has(tc.id)) seen.add(tc.id)
      }
    } else if (m.role === 'toolResult') {
      const tr = message as { toolCallId?: string }
      if (typeof tr.toolCallId === 'string' && callIds.has(tr.toolCallId) && !seen.has(tr.toolCallId)) {
        errors.push(`toolResult ${tr.toolCallId} 出现在其 toolCall 之前`)
      }
    }
  }

  // error / aborted assistant 不得作为正常历史重放
  for (const message of messages) {
    const m = message as { role?: string }
    if (m.role === 'assistant' && messageHasErrorStop(message)) {
      warnings.push('存在 stopReason=error/aborted 的 assistant 消息被重放')
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** 校验 CompiledContext（含 manifest 块级不变量） */
export function validateCompiledContext(
  compiled: CompiledContext,
  request: ContextRequest
): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  // 1. systemPrompt 非空并包含版本/hash
  if (!compiled.systemPrompt || compiled.systemPrompt.trim().length === 0) {
    errors.push('systemPrompt 为空')
  }
  if (!compiled.manifest.promptVersion) {
    errors.push('systemPrompt 缺少 promptVersion')
  }
  if (!compiled.manifest.promptHash) {
    errors.push('systemPrompt 缺少 promptHash')
  }

  // 2. 当前用户消息：编译期 messages 不含当前 user（pi 在 createTurnState 之后追加），
  //    因此校验 manifest 中的 current_user 块；实际 payload 由 trace 钩子复核。
  const currentUserBlock = compiled.manifest.blocks.find((b) => b.kind === 'current_user')
  if (!request.userMessage.trim()) {
    warnings.push('本轮 userMessage 为空')
  } else if (!currentUserBlock || currentUserBlock.fidelity === 'omitted') {
    errors.push('当前用户消息未进入最终上下文（缺少 current_user 块）')
  }
  const userMessages = compiled.messages.filter((m) => {
    const mm = m as { role?: string }
    return mm.role === 'user'
  })
  if (userMessages.length === 0) {
    warnings.push('编译期 messages 不含历史 user 消息（当前 user 由 pi 在请求前追加）')
  }

  // 4/5. 工具链邻接
  const chain = validateMessageChain(compiled.messages)
  errors.push(...chain.errors)
  warnings.push(...chain.warnings)

  // 6. 活动分支之外的消息不得进入 —— 由 Session buildContext 保证；此处核对 manifest.branchHeadId
  if (!compiled.manifest.branchHeadId) {
    warnings.push('manifest 缺少 branchHeadId')
  }

  // 8. 预算
  const totalInput = compiled.manifest.estimatedInputTokens
  const total =
    totalInput + compiled.manifest.outputReserve + compiled.manifest.safetyReserve
  if (total > compiled.manifest.contextWindow) {
    errors.push(
      `estimatedInput(${totalInput}) + outputReserve(${compiled.manifest.outputReserve}) + safetyReserve(${compiled.manifest.safetyReserve}) > contextWindow(${compiled.manifest.contextWindow})`
    )
  }

  // 9/10. 每个 block 有 fidelity；omitted 必须有 reason
  for (const block of compiled.manifest.blocks) {
    if (!block.fidelity) {
      errors.push(`block ${block.id} 缺少 fidelity`)
    }
    if (block.fidelity === 'omitted' && !block.reason) {
      errors.push(`block ${block.id} 被 omitted 但缺少 reason`)
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** 校验 role sequence 的 toolCall/toolResult 邻接（用于 payload trace） */
export function validateRoleSequence(roles: string[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  let openToolCalls = 0
  for (const role of roles) {
    if (role === 'toolResult') {
      if (openToolCalls <= 0) {
        warnings.push('toolResult 出现在没有进行中 assistant 工具轮的位置')
      } else {
        openToolCalls -= 1
      }
    }
    if (role === 'toolCall') openToolCalls += 1
  }
  return { ok: errors.length === 0, errors, warnings }
}

/** 合并多个校验结果 */
export function mergeValidation(...results: ValidationResult[]): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  for (const r of results) {
    errors.push(...r.errors)
    warnings.push(...r.warnings)
  }
  return { ok: errors.length === 0, errors, warnings }
}
