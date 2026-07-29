/**
 * OpenAI 兼容 LLM 设置（共享类型；密钥不进渲染进程明文）
 */

export type LlmProviderKind = 'openai-compatible'

/** 可安全回传渲染进程的 LLM 公开配置 */
export interface LlmPublicSettings {
  provider: LlmProviderKind
  baseURL: string
  modelId: string
  /** 是否已保存 API Key（不回传明文） */
  hasApiKey: boolean
  /** 掩码后的 key 提示，如 sk-••••1234 */
  apiKeyHint?: string
}

/** 渲染进程提交的写入补丁；apiKey 空串表示保留原值 */
export interface LlmSettingsPatch {
  provider?: LlmProviderKind
  baseURL?: string
  modelId?: string
  /** 非空则更新；undefined 表示不改；空串也表示不改 */
  apiKey?: string
}

/** 主进程内部完整配置 */
export interface LlmStoredSettings {
  provider: LlmProviderKind
  baseURL: string
  modelId: string
  /** safeStorage 加密后的 base64；未加密环境可能是明文标记前缀 */
  apiKeyEnc?: string
}

export const DEFAULT_LLM_PUBLIC: LlmPublicSettings = {
  provider: 'openai-compatible',
  baseURL: 'https://api.openai.com/v1',
  modelId: 'gpt-4o-mini',
  hasApiKey: false
}
