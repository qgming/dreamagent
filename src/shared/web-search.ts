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

/**
 * 内置公共 SearXNG 实例
 * - 前部：远程实测 format=json 可用（含 polaragent 清单验证通过的）
 * - 中部：polaragent 内置清单（可能部分未开 JSON，运行时回退）
 * - 后部：官方 searx-instances 公开清单补充
 * 注意：并非所有公共实例都开启 json 输出，运行时会按序跳过失败节点。
 */
export const DEFAULT_SEARXNG_INSTANCES: readonly string[] = [
  // —— 已验证 format=json 可用 ——
  'https://search.volmute.com',
  'https://google.thejot.org',
  'https://ddg.thejot.org',
  'https://search.thejot.org',
  'https://search.0x7c0.com',
  'https://search.corrently.cloud',
  'https://search.skyday.eu',
  'https://search.chgr.cc',
  'https://search.hirad.it',
  'https://search.jakespeed.org',
  'https://search.no-code.gdn',
  'https://search.notashelf.dev',
  'https://etsi.me',
  'https://searx.party',
  'https://search.mdosch.de',
  'https://search.mectov.my.id',
  // —— polaragent 内置（其余）——
  'https://noogle.maniworld31.com',
  'https://searxng.lmdr.io',
  'https://search.negrete.me',
  'https://seachx.lunarfire.home64.de',
  'https://rohsearch.com',
  'https://searxng.asudox.dev',
  'https://sousuo.emoe.top',
  'https://searxng.tobe2d.dscloud.me',
  'https://searx.voe.chainsawgaming.de',
  'https://so.houhoukang.com',
  'https://searxng-pilot.jitera.app',
  'https://search.stryder.cc',
  'https://searx.thejot.org',
  'https://searxng.josephzulick.com',
  'https://search.mixel.cloud',
  'https://searxng.ctrl.corpgroup.site',
  'https://search.privatevoid.net',
  'https://search.muellers-software.org',
  'https://search.jbtec.eu',
  'https://www.correns.co',
  'https://search.die-blahuts.de',
  'https://searxng.vyro.ai',
  'https://searxng.sbbz-ilvesheim.de',
  'https://searxng.pietro.in',
  'https://negativenull.com',
  'https://seek.nuer.cc',
  'https://search.lucathomas.de',
  // —— 官方公开清单补充 ——
  'https://searx.perennialte.ch',
  'https://search.rhscz.eu',
  'https://searx.rhscz.eu',
  'https://search.bladerunn.in',
  'https://searx.tiekoetter.com',
  'https://search.inetol.net',
  'https://search.hbubli.cc',
  'https://ooglester.com',
  'https://search.2b9t.xyz',
  'https://searxng.site',
  'https://baresearch.org',
  'https://opnxng.com',
  'https://paulgo.io',
  'https://priv.au',
  'https://search.sapti.me',
  'https://searx.ononoki.org',
  'https://searx.be',
  'https://search.ononoki.org'
] as const

export const DEFAULT_WEB_SEARCH_SETTINGS: WebSearchSettings = {
  provider: 'searxng',
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
