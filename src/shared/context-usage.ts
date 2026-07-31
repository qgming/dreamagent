/** 会话上下文与累计用量，数据源为 pi Session / Models.dev。 */

export const AUTO_COMPACT_RATIO = 0.8

export interface ModelPriceInfo {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/** 模型支持的输入/输出模态 */
export type ModelModality = 'text' | 'audio' | 'image' | 'video' | 'pdf'

/** 该模型可用的思考档（来自 models.dev reasoning_options） */
export type ModelEffortLevel =
  | 'off'
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export interface ResolvedModelInfo {
  configuredId: string
  id: string
  name: string
  providerId: string
  providerName: string
  /** Models.dev 中模型归属方的官方标识。 */
  logoUrl?: string
  /** 单色标识可在深色模式下反相；彩色标识始终保留原色。 */
  logoMonochrome?: boolean
  contextWindow: number
  maxOutputTokens: number
  /** 是否为推理模型；未匹配时为 false */
  reasoning: boolean
  /** 该模型实际支持的思考档；无则 undefined */
  effortLevels?: ModelEffortLevel[]
  /** 输入模态 */
  inputModalities: ModelModality[]
  /** 输出模态 */
  outputModalities: ModelModality[]
  /** 支持附件/多模态文件 */
  attachment: boolean
  /** 支持工具调用 */
  toolCall: boolean
  price: ModelPriceInfo
  /** false 表示 Models.dev 未匹配，使用保守默认值。 */
  matched: boolean
}

export interface TokenUsageBreakdown {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  total: number
  cost: number
}

export interface SessionContextUsage {
  model: ResolvedModelInfo
  /** 下一次请求预计会携带的上下文 token（仅 Session 消息部分）。 */
  contextTokens: number
  /**
   * 最终 Provider payload 估算：system + tools + 动态块 + current user + 历史。
   * 无 trace 时退化为 contextTokens + 基线 system/tool 估算。
   */
  providerPayloadTokens: number
  contextPercent: number
  autoCompactThreshold: number
  /** 当前上下文是否包含估算值（压缩后、下一次模型响应前会出现）。 */
  estimated: boolean
  /** 整个会话产生的模型请求累计用量，包括压缩请求。 */
  cumulative: TokenUsageBreakdown
  compactionCount: number
  lastCompactedAt?: string
}

export type ContextCompactionState = 'idle' | 'compacting' | 'error'
