/**
 * 多供应商 LLM 设置（共享类型；密钥不进渲染进程明文）
 */

/** pi-ai 兼容的接口格式 */
export type LlmProviderApiType =
  | 'openai-completions'
  | 'openai-responses'
  | 'anthropic-messages'

/** 思考强度（对齐 pi ThinkingLevel） */
export type LlmThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max'

export const LLM_THINKING_LEVELS: LlmThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
]

/** 模型输入/输出模态 */
export type LlmModelModality = 'text' | 'audio' | 'image' | 'video' | 'pdf'

/** 供应商下的单个模型（含 models.dev 富化字段） */
export interface LlmModelConfig {
  id: string
  name: string
  /** Models.dev 匹配后可覆盖 */
  contextWindow?: number
  maxTokens?: number
  /** 是否推理模型；未识别时视为 false */
  reasoning?: boolean
  /** 该模型支持的思考档；非推理模型为 undefined/[] */
  effortLevels?: LlmThinkingLevel[]
  inputModalities?: LlmModelModality[]
  outputModalities?: LlmModelModality[]
  attachment?: boolean
  toolCall?: boolean
  /** models.dev 命中的规范 id */
  catalogId?: string
  logoUrl?: string
  logoMonochrome?: boolean
}

/** 渲染进程可见的供应商（无明文 key） */
export interface LlmProviderPublic {
  id: string
  name: string
  type: LlmProviderApiType
  enabled: boolean
  baseURL: string
  hasApiKey: boolean
  apiKeyHint?: string
  models: LlmModelConfig[]
}

/** 渲染进程完整公开配置 */
export interface LlmProvidersPublic {
  providers: LlmProviderPublic[]
  defaultProviderId: string
  defaultModelId: string
  defaultThinkingLevel: LlmThinkingLevel
}

/** 主进程落盘的模型 */
export interface LlmModelStored {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  reasoning?: boolean
  effortLevels?: LlmThinkingLevel[]
  inputModalities?: LlmModelModality[]
  outputModalities?: LlmModelModality[]
  attachment?: boolean
  toolCall?: boolean
  catalogId?: string
}

/** 主进程落盘的供应商 */
export interface LlmProviderStored {
  id: string
  name: string
  type: LlmProviderApiType
  enabled: boolean
  baseURL: string
  /** safeStorage 加密后的 base64；未加密环境可能是 plain: 前缀 */
  apiKeyEnc?: string
  models: LlmModelStored[]
}

/** 主进程完整存储 */
export interface LlmStoredSettings {
  version: 2
  providers: LlmProviderStored[]
  defaultProviderId: string
  defaultModelId: string
  defaultThinkingLevel: LlmThinkingLevel
}

/** 旧版 v1 单点配置（迁移用） */
export interface LlmStoredSettingsV1 {
  provider?: string
  baseURL?: string
  modelId?: string
  apiKeyEnc?: string
}

/** 新增供应商输入 */
export interface LlmAddProviderInput {
  name: string
  type?: LlmProviderApiType
  baseURL: string
  apiKey?: string
  models?: LlmModelConfig[]
}

/** 更新供应商补丁；apiKey 空/undefined 表示不改 */
export interface LlmUpdateProviderInput {
  name?: string
  type?: LlmProviderApiType
  enabled?: boolean
  baseURL?: string
  apiKey?: string
  models?: LlmModelConfig[]
}

/** Composer / 选择器扁平模型项 */
export interface LlmSelectableModel {
  /** providerId::modelId */
  key: string
  providerId: string
  providerName: string
  modelId: string
  modelName: string
  reasoning: boolean
  /** 该模型可用思考档；空/无则选择器不显示思考 */
  effortLevels: LlmThinkingLevel[]
  contextWindow: number
  maxTokens: number
  inputModalities: LlmModelModality[]
  outputModalities: LlmModelModality[]
  attachment: boolean
  toolCall: boolean
  logoUrl?: string
  logoMonochrome?: boolean
  disabled?: boolean
}

/** 云端 /models 拉取结果（已用 models.dev 富化） */
export interface LlmRemoteModelInfo {
  id: string
  name: string
  reasoning: boolean
  effortLevels?: LlmThinkingLevel[]
  contextWindow: number
  maxTokens: number
  inputModalities: LlmModelModality[]
  outputModalities: LlmModelModality[]
  attachment: boolean
  toolCall: boolean
  matched: boolean
}

/** 运行时解析出的当前选用 */
export interface LlmRuntimeSelection {
  providerId: string
  providerName: string
  type: LlmProviderApiType
  baseURL: string
  modelId: string
  modelName: string
  apiKey: string
  contextWindow: number
  maxTokens: number
  reasoning: boolean
  thinkingLevel: LlmThinkingLevel
}

export const DEFAULT_THINKING_LEVEL: LlmThinkingLevel = 'medium'

export const DEFAULT_LLM_PROVIDERS_PUBLIC: LlmProvidersPublic = {
  providers: [],
  defaultProviderId: '',
  defaultModelId: '',
  defaultThinkingLevel: DEFAULT_THINKING_LEVEL
}

/** 编码选择器 key */
export function encodeModelKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`
}

/** 解码选择器 key */
export function decodeModelKey(
  key: string
): { providerId: string; modelId: string } | null {
  const idx = key.indexOf('::')
  if (idx <= 0) return null
  const providerId = key.slice(0, idx)
  const modelId = key.slice(idx + 2)
  if (!providerId || !modelId) return null
  return { providerId, modelId }
}

// ── 向后兼容别名（旧单点 API，迁移期仍可能被引用） ──

/** @deprecated 使用 LlmProvidersPublic */
export type LlmProviderKind = 'openai-compatible'

/** @deprecated 使用 LlmProvidersPublic */
export interface LlmPublicSettings {
  provider: LlmProviderKind
  baseURL: string
  modelId: string
  hasApiKey: boolean
  apiKeyHint?: string
}

/** @deprecated 使用多供应商 CRUD */
export interface LlmSettingsPatch {
  provider?: LlmProviderKind
  baseURL?: string
  modelId?: string
  apiKey?: string
}

/** @deprecated */
export const DEFAULT_LLM_PUBLIC: LlmPublicSettings = {
  provider: 'openai-compatible',
  baseURL: 'https://api.openai.com/v1',
  modelId: 'gpt-4o-mini',
  hasApiKey: false
}
