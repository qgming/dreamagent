/**
 * 网络搜索 / 网页读取 共享类型
 */

export type WebSearchProvider = 'tavily' | 'exa' | 'serper' | 'searxng' | 'brave'

export interface WebSearchProviderConfig {
  apiKey?: string
  // tavily
  searchDepth?: 'basic' | 'advanced'
  includeAnswer?: boolean
  // serper
  gl?: string
  hl?: string
  // searxng
  instances?: string
  // brave
  country?: string
  searchLang?: string
  // exa
  type?: 'neural' | 'keyword'
}

export interface WebSearchSettings {
  provider: WebSearchProvider
  tavily: WebSearchProviderConfig
  exa: WebSearchProviderConfig
  serper: WebSearchProviderConfig
  searxng: WebSearchProviderConfig
  brave: WebSearchProviderConfig
}

export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  provider: 'tavily',
  tavily: { apiKey: '', searchDepth: 'basic', includeAnswer: false },
  exa: { apiKey: '', type: 'neural' },
  serper: { apiKey: '', gl: 'cn', hl: 'zh-cn' },
  searxng: { instances: '' },
  brave: { apiKey: '' }
}

/** 回传渲染进程：密钥掩码 */
export interface WebSearchPublicSettings {
  provider: WebSearchProvider
  tavily: { hasApiKey: boolean; apiKeyHint?: string; searchDepth?: string; includeAnswer?: boolean }
  exa: { hasApiKey: boolean; apiKeyHint?: string; type?: string }
  serper: { hasApiKey: boolean; apiKeyHint?: string; gl?: string; hl?: string }
  searxng: { instances: string }
  brave: { hasApiKey: boolean; apiKeyHint?: string }
}

export interface WebSearchSettingsPatch {
  provider?: WebSearchProvider
  tavily?: Partial<WebSearchProviderConfig>
  exa?: Partial<WebSearchProviderConfig>
  serper?: Partial<WebSearchProviderConfig>
  searxng?: Partial<WebSearchProviderConfig>
  brave?: Partial<WebSearchProviderConfig>
}

export interface CorsFetchRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  timeoutMs?: number
}

export interface CorsFetchResponse {
  status: number
  statusText: string
  headers: Array<[string, string]>
  body: string
}

export interface WebSearchRequest {
  provider: WebSearchProvider
  query: string
  limit?: number
  apiKey?: string
  searchDepth?: 'basic' | 'advanced'
  includeAnswer?: boolean
  includeDomains?: string
  excludeDomains?: string
  type?: 'neural' | 'keyword'
  gl?: string
  hl?: string
  instances?: string
  country?: string
  searchLang?: string
}

export interface WebSearchResultItem {
  title: string
  url: string
  snippet: string
  score?: number
  rawContent?: string
  text?: string
  highlights?: string[]
  summary?: string
}

export interface WebSearchResponse {
  success: boolean
  provider: string
  instance?: string
  results: WebSearchResultItem[]
  answer?: string
}
