/** 会话上下文与累计用量，数据源为 pi Session / Models.dev。 */

export const AUTO_COMPACT_RATIO = 0.8

export interface ModelPriceInfo {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

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
  reasoning: boolean
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
  /** 下一次请求预计会携带的上下文 token。 */
  contextTokens: number
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
