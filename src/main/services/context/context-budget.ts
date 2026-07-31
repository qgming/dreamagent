/**
 * 上下文预算器
 *
 * 公式（§10.3）：
 *   C = model.contextWindow
 *   O = outputReserve
 *   R = safetyReserve
 *   I = C - O - R
 *   F = system + tools + current user + active tool chain
 *   B = I - F
 *
 * 完整候选放得下时全部发送；B < 0 时返回结构化 ContextOverflow，
 * 不得静默删除当前用户或系统规则。
 */
import type { AgentMessage } from '@earendil-works/pi-agent-core'

/** 中文字符、全角标点按 1 token；其余按 4 字符 ≈ 1 token */
const CJK_RE = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef\u2014\u2018\u2019\u201c\u201d\u2026]/g

export function estimateTextTokens(text: string): number {
  if (!text) return 0
  const cjk = text.match(CJK_RE)?.length ?? 0
  const rest = Math.max(0, text.length - cjk)
  return Math.max(1, Math.ceil(cjk * 1.0 + rest / 4))
}

/** 预估 JSON 工具 schema 的 token */
export function estimateSchemaTokens(schemaText: string): number {
  if (!schemaText) return 0
  const raw = estimateTextTokens(schemaText)
  return Math.max(1, Math.round(raw * 1.0))
}

export function estimateMessagesTokens(messages: AgentMessage[]): number {
  let total = 0
  for (const message of messages) {
    total += estimateAgentMessageTokens(message)
  }
  return total
}

/** AgentMessage 可能是 pi-ai Message 或自定义消息（BashExecutionMessage 等），统一按最小形状读取 */
export function estimateAgentMessageTokens(message: AgentMessage): number {
  const m = message as { content?: unknown; role?: string }
  const content = m.content
  if (typeof content === 'string') return estimateTextTokens(content)
  if (Array.isArray(content)) {
    let total = 0
    for (const block of content) {
      if (!block || typeof block !== 'object') continue
      const b = block as { type?: string; text?: string; thinking?: string; name?: string; arguments?: unknown }
      if (b.type === 'text' && typeof b.text === 'string') total += estimateTextTokens(b.text)
      else if (b.type === 'thinking' && typeof b.thinking === 'string') {
        total += estimateTextTokens(b.thinking)
      } else if (b.type === 'toolCall' && typeof b.name === 'string') {
        total += estimateTextTokens(b.name)
        if (b.arguments !== undefined) {
          try {
            total += estimateTextTokens(JSON.stringify(b.arguments))
          } catch {
            // ignore
          }
        }
      }
    }
    return total
  }
  return 0
}

export interface BudgetResult {
  contextWindow: number
  outputReserve: number
  safetyReserve: number
  inputBudget: number
  /** 必选块（system + tools + current user + tool chain）占用的 token */
  fixedTokens: number
  /** 可分配给历史 / 工作集 / 检索的剩余 token */
  availableForHistory: number
}

export function computeBudget(model: {
  contextWindow: number
  maxOutputTokens: number
}, configuredMaxOutput?: number): BudgetResult {
  const C = Math.max(1, model.contextWindow)
  const maxOut = model.maxOutputTokens > 0 ? model.maxOutputTokens : 8192
  const O = clampOutputReserve(C, configuredMaxOutput ?? maxOut, maxOut)
  const R = Math.max(1024, Math.ceil(C * 0.03))
  const inputBudget = Math.max(1, C - O - R)
  return {
    contextWindow: C,
    outputReserve: O,
    safetyReserve: R,
    inputBudget,
    fixedTokens: 0,
    availableForHistory: inputBudget
  }
}

function clampOutputReserve(
  C: number,
  configured: number,
  maxOutput: number
): number {
  // 输出预留与模型真实输出上限对齐（不再硬编码 32k）；
  // 同时不超过上下文窗口的一半，避免小窗口被输出预留占满。
  const cap = Math.min(maxOutput, Math.floor(C * 0.5))
  const target = Math.max(2048, Math.min(configured || 2048, cap))
  return Math.min(target, Math.max(1, C - 2048))
}

export function isOverBudget(
  estimatedInput: number,
  budget: BudgetResult
): boolean {
  return estimatedInput > budget.inputBudget
}

export interface OverflowInput {
  estimatedInput: number
  budget: BudgetResult
  requiredBlocks: string[]
}

export function buildOverflow(input: OverflowInput): {
  code: 'context_overflow'
  requiredTokens: number
  availableTokens: number
  blockingBlocks: string[]
  suggestedActions: string[]
} {
  return {
    code: 'context_overflow',
    requiredTokens: input.estimatedInput,
    availableTokens: input.budget.inputBudget,
    blockingBlocks: input.requiredBlocks,
    suggestedActions: [
      'reduce_tool_set',
      'lower_output_reserve',
      'compact'
    ]
  }
}
