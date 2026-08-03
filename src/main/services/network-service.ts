/**
 * 主进程网络服务：corsFetch / webSearch / HTML 正文抽取
 * 参考 polaragent electron/ipc/network.cjs，TypeScript 精简移植
 */
import { net, app, safeStorage } from 'electron'
import path from 'path'
import type {
  CorsFetchRequest,
  CorsFetchResponse,
  WebSearchProvider,
  WebSearchPublicSettings,
  WebSearchRequest,
  WebSearchResponse,
  WebSearchSettings,
  WebSearchSettingsPatch
} from '../../shared/web-search'
import {
  DEFAULT_SEARXNG_INSTANCES,
  DEFAULT_WEB_SEARCH_SETTINGS
} from '../../shared/web-search'
import { ensureDir, readJsonFile, writeJsonAtomic } from './fs-utils'

const DEFAULT_TIMEOUT_MS = 120_000
const MIN_TIMEOUT_MS = 3_000
const CORS_MAX_TIMEOUT_MS = 1_800_000
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024
const PLAIN_PREFIX = 'plain:'

function clampTimeout(value: unknown, max = CORS_MAX_TIMEOUT_MS): number {
  const num = Number(value)
  const base = Number.isFinite(num) && num > 0 ? num : DEFAULT_TIMEOUT_MS
  return Math.min(Math.max(base, MIN_TIMEOUT_MS), max)
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(String(url))
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return String(url).split('?')[0]
  }
}

function normalizeWebUrl(input: string): string {
  const trimmed = String(input || '').trim()
  if (!trimmed) throw new Error('url 不能为空')
  const url = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  if (!/^https?:\/\//i.test(url)) throw new Error('仅支持 http/https URL')
  return url
}

function maskKey(key: string): string | undefined {
  const t = key.trim()
  if (!t) return undefined
  if (t.length <= 8) return '••••'
  return `${t.slice(0, 3)}••••${t.slice(-4)}`
}

/** 每次搜索随机打散候选，避免固定命中同一个公共实例。 */
function shuffleList<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

interface ElectronHttpResponse {
  status: number
  statusText: string
  headers: Record<string, string | string[]>
  body: Buffer
}

function electronRequest(
  url: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string | Buffer
    timeoutMs?: number
    maxResponseBytes?: number
  } = {}
): Promise<ElectronHttpResponse> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      url: String(url),
      method: options.method || 'GET',
      redirect: 'follow'
    })
    const headers = options.headers || {}
    for (const [key, value] of Object.entries(headers)) {
      if (value !== undefined && value !== null) request.setHeader(key, String(value))
    }

    let settled = false
    const timeoutMs = clampTimeout(options.timeoutMs)
    const maxBytes =
      Number(options.maxResponseBytes) > 0
        ? Number(options.maxResponseBytes)
        : MAX_RESPONSE_BYTES
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      request.abort()
      reject(new Error(`请求超时（${timeoutMs}ms）：${redactUrl(url)}`))
    }, timeoutMs)

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      fn()
    }

    request.on('response', (response) => {
      const chunks: Buffer[] = []
      let received = 0
      response.on('data', (chunk) => {
        if (settled) return
        const buf = Buffer.from(chunk)
        received += buf.length
        if (received > maxBytes) {
          finish(() =>
            reject(new Error(`响应体超过大小上限（${maxBytes} 字节）：${redactUrl(url)}`))
          )
          request.abort()
          return
        }
        chunks.push(buf)
      })
      response.on('end', () => {
        finish(() =>
          resolve({
            status: response.statusCode || 0,
            statusText: response.statusMessage || '',
            headers: (response.headers || {}) as Record<string, string | string[]>,
            body: Buffer.concat(chunks)
          })
        )
      })
      response.on('error', (error) => finish(() => reject(error)))
    })
    request.on('error', (error) => finish(() => reject(error)))

    if (options.body !== undefined && options.body !== null) request.write(options.body)
    request.end()
  })
}

function responseHeadersArray(
  headers: Record<string, string | string[]>
): Array<[string, string]> {
  return Object.entries(headers || {})
    .filter(([key]) => !['content-length', 'transfer-encoding'].includes(key.toLowerCase()))
    .map(([key, value]) => [
      key,
      Array.isArray(value) ? value.join(', ') : String(value)
    ])
}

function responseText(response: ElectronHttpResponse): string {
  return response.body.toString('utf8')
}

function responseJson(response: ElectronHttpResponse, label: string): Record<string, unknown> {
  const text = responseText(response)
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error(
      `${label} 返回了非 JSON 内容（HTTP ${response.status}）：${text.slice(0, 300)}`
    )
  }
}

/** 主进程可用的轻量 HTML→正文抽取（无 DOMParser） */
export function extractWebPageText(
  html: string,
  maxChars = 8000
): { title: string; content: string; textLength: number; truncated: boolean } {
  let raw = String(html || '')
  // 去 script/style/noscript
  raw = raw.replace(/<script[\s\S]*?<\/script>/gi, ' ')
  raw = raw.replace(/<style[\s\S]*?<\/style>/gi, ' ')
  raw = raw.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  raw = raw.replace(/<!--[\s\S]*?-->/g, ' ')

  let title = '未命名网页'
  const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch?.[1]) {
    title = decodeEntities(stripTags(titleMatch[1])).replace(/\s+/g, ' ').trim() || title
  }
  const og = raw.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i
  )
  if (og?.[1]) title = decodeEntities(og[1]).trim() || title

  // 优先 article/main 片段
  let body = raw
  const article =
    raw.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    raw.match(/<main[\s\S]*?<\/main>/i)?.[0] ||
    raw.match(/<body[\s\S]*?<\/body>/i)?.[0] ||
    raw

  body = article
  // 块级换行
  body = body.replace(/<\/(p|div|h[1-6]|li|tr|br|blockquote|pre)[^>]*>/gi, '\n')
  body = body.replace(/<br\s*\/?>/gi, '\n')
  body = stripTags(body)
  body = decodeEntities(body)
  body = body
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 1)
    .join('\n')
  // 合并过多空行
  body = body.replace(/\n{3,}/g, '\n\n').trim()

  const truncated = body.length > maxChars
  const content = truncated ? `${body.slice(0, maxChars)}…` : body
  return { title, content, textLength: body.length, truncated }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

export class NetworkService {
  private settingsCache: WebSearchSettings | null = null

  private settingsPath(): string {
    return path.join(app.getPath('userData'), 'web-search-settings.json')
  }

  private encryptKey(plain: string): string {
    if (!plain) return ''
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(plain).toString('base64')
      }
    } catch {
      // fallthrough
    }
    return `${PLAIN_PREFIX}${plain}`
  }

  private decryptKey(enc?: string): string {
    if (!enc) return ''
    if (enc.startsWith(PLAIN_PREFIX)) return enc.slice(PLAIN_PREFIX.length)
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(enc, 'base64'))
      }
    } catch {
      // fallthrough
    }
    return ''
  }

  private async loadSettings(): Promise<WebSearchSettings> {
    if (this.settingsCache) return this.settingsCache
    const raw =
      (await readJsonFile<Partial<WebSearchSettings> & Record<string, unknown>>(
        this.settingsPath()
      )) ?? {}
    const base = structuredClone(DEFAULT_WEB_SEARCH_SETTINGS)
    const provider = (raw.provider as WebSearchProvider) || base.provider
    const mergeProv = (
      key: keyof Omit<WebSearchSettings, 'provider'>,
      encField: string
    ): void => {
      const src = (raw[key] as Record<string, unknown> | undefined) ?? {}
      const enc = typeof src[encField] === 'string' ? (src[encField] as string) : undefined
      const apiKey =
        typeof src.apiKey === 'string' && src.apiKey
          ? src.apiKey
          : this.decryptKey(enc)
      base[key] = {
        ...base[key],
        ...src,
        apiKey
      }
      delete (base[key] as Record<string, unknown>)[encField]
    }
    mergeProv('tavily', 'apiKeyEnc')
    mergeProv('exa', 'apiKeyEnc')
    mergeProv('serper', 'apiKeyEnc')
    mergeProv('searxng', 'apiKeyEnc')
    mergeProv('brave', 'apiKeyEnc')
    if (typeof (raw.searxng as { instances?: string } | undefined)?.instances === 'string') {
      base.searxng.instances = (raw.searxng as { instances: string }).instances
    }
    base.provider = provider
    this.settingsCache = base
    return base
  }

  private async saveSettings(next: WebSearchSettings): Promise<void> {
    const file = this.settingsPath()
    await ensureDir(path.dirname(file))
    // 落盘加密 apiKey
    const toStore: Record<string, unknown> = {
      provider: next.provider
    }
    for (const key of ['tavily', 'exa', 'serper', 'searxng', 'brave'] as const) {
      const cfg = { ...next[key] }
      const apiKey = cfg.apiKey || ''
      delete cfg.apiKey
      toStore[key] = {
        ...cfg,
        apiKeyEnc: apiKey ? this.encryptKey(apiKey) : undefined
      }
    }
    await writeJsonAtomic(file, toStore)
    this.settingsCache = next
  }

  async getPublicSettings(): Promise<WebSearchPublicSettings> {
    const s = await this.loadSettings()
    const pub = (apiKey?: string) => ({
      hasApiKey: Boolean(apiKey?.trim()),
      apiKeyHint: maskKey(apiKey || '')
    })
    return {
      provider: s.provider,
      tavily: {
        ...pub(s.tavily.apiKey),
        searchDepth: s.tavily.searchDepth,
        includeAnswer: s.tavily.includeAnswer
      },
      exa: { ...pub(s.exa.apiKey), type: s.exa.type },
      serper: { ...pub(s.serper.apiKey), gl: s.serper.gl, hl: s.serper.hl },
      searxng: { instances: s.searxng.instances || '' },
      brave: { ...pub(s.brave.apiKey) }
    }
  }

  async setSettings(patch: WebSearchSettingsPatch): Promise<WebSearchPublicSettings> {
    const cur = await this.loadSettings()
    const next: WebSearchSettings = structuredClone(cur)
    if (patch.provider) next.provider = patch.provider
    for (const key of ['tavily', 'exa', 'serper', 'searxng', 'brave'] as const) {
      const p = patch[key]
      if (!p) continue
      const apiKey =
        typeof p.apiKey === 'string' && p.apiKey.trim()
          ? p.apiKey.trim()
          : next[key].apiKey
      next[key] = { ...next[key], ...p, apiKey }
    }
    await this.saveSettings(next)
    return this.getPublicSettings()
  }

  async getSettingsForAgent(): Promise<WebSearchSettings> {
    return this.loadSettings()
  }

  async corsFetch(request: CorsFetchRequest): Promise<CorsFetchResponse> {
    const url = normalizeWebUrl(request.url)
    const method = String(request.method || 'GET').toUpperCase()
    if (!['GET', 'POST', 'DELETE', 'PUT', 'PATCH', 'OPTIONS'].includes(method)) {
      throw new Error(`跨域代理不支持的 HTTP 方法：${method}`)
    }
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(request.headers || {})) {
      const lower = key.toLowerCase()
      if (
        !['host', 'connection', 'content-length', 'transfer-encoding', 'origin', 'referer'].includes(
          lower
        )
      ) {
        headers[key] = value
      }
    }
    try {
      const response = await electronRequest(url, {
        method,
        headers,
        body: request.body,
        timeoutMs: Math.min(
          Math.max(Number(request.timeoutMs || 120000), 3000),
          CORS_MAX_TIMEOUT_MS
        )
      })
      return {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeadersArray(response.headers),
        body: response.body.toString('utf8')
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`跨域代理请求失败（${method} ${redactUrl(url)}）：${message}`)
    }
  }

  async webSearch(request: WebSearchRequest): Promise<WebSearchResponse> {
    const provider = String(request.provider || 'tavily') as WebSearchProvider
    const query = String(request.query || '').trim()
    if (!query) throw new Error('缺少搜索关键词。')

    switch (provider) {
      case 'tavily':
        return this.tavilySearch(request)
      case 'exa':
        return this.exaSearch(request)
      case 'serper':
        return this.serperSearch(request)
      case 'searxng':
        return this.searxngSearch(request)
      case 'brave':
        return this.braveSearch(request)
      default:
        throw new Error(`不支持的搜索服务商：${provider}`)
    }
  }

  /** 用当前设置构造搜索请求并执行 */
  async searchWithSettings(query: string, limit?: number): Promise<WebSearchResponse> {
    const settings = await this.loadSettings()
    const provider = settings.provider
    const cfg = settings[provider]
    const request: WebSearchRequest = {
      provider,
      query,
      limit,
      apiKey: cfg.apiKey,
      searchDepth: cfg.searchDepth,
      includeAnswer: cfg.includeAnswer,
      type: cfg.type,
      gl: cfg.gl,
      hl: cfg.hl,
      instances: cfg.instances,
      country: cfg.country,
      searchLang: cfg.searchLang
    }
    return this.webSearch(request)
  }

  private async tavilySearch(request: WebSearchRequest): Promise<WebSearchResponse> {
    const apiKey = String(request.apiKey || '').trim()
    if (!apiKey) throw new Error('Tavily API Key 未配置。请在设置 > 网络搜索中填写。')
    const body: Record<string, unknown> = {
      api_key: apiKey,
      query: request.query,
      search_depth: request.searchDepth || 'basic',
      max_results: Math.min(Math.max(Number(request.limit || 5), 1), 10)
    }
    if (request.includeAnswer) body.include_answer = true
    if (request.includeDomains) {
      body.include_domains = request.includeDomains
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
    }
    if (request.excludeDomains) {
      body.exclude_domains = request.excludeDomains
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean)
    }
    const response = await electronRequest('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeoutMs: 30000
    })
    const data = responseJson(response, 'Tavily 搜索')
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Tavily 搜索失败（${response.status}）：${String(data.error || data.message || '未知错误')}`
      )
    }
    const results = ((data.results as Array<Record<string, unknown>>) || []).map((item) => ({
      title: String(item.title || ''),
      url: String(item.url || ''),
      snippet: String(item.content || ''),
      score: typeof item.score === 'number' ? item.score : undefined,
      rawContent: item.raw_content ? String(item.raw_content) : undefined
    }))
    return {
      success: true,
      provider: 'tavily',
      results,
      answer: data.answer ? String(data.answer) : undefined
    }
  }

  private async exaSearch(request: WebSearchRequest): Promise<WebSearchResponse> {
    const apiKey = String(request.apiKey || '').trim()
    if (!apiKey) throw new Error('Exa API Key 未配置。请在设置 > 网络搜索中填写。')
    const body: Record<string, unknown> = {
      query: request.query,
      num_results: Math.min(Math.max(Number(request.limit || 5), 1), 10),
      type: request.type || 'neural'
    }
    const response = await electronRequest('https://api.exa.ai/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body),
      timeoutMs: 30000
    })
    const data = responseJson(response, 'Exa 搜索')
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Exa 搜索失败（${response.status}）：${String(data.error || data.message || '未知错误')}`
      )
    }
    const results = ((data.results as Array<Record<string, unknown>>) || []).map((item) => ({
      title: String(item.title || ''),
      url: String(item.url || ''),
      snippet: String(item.snippet || item.text || ''),
      score: typeof item.score === 'number' ? item.score : undefined,
      text: item.text ? String(item.text) : undefined
    }))
    return { success: true, provider: 'exa', results }
  }

  private async serperSearch(request: WebSearchRequest): Promise<WebSearchResponse> {
    const apiKey = String(request.apiKey || '').trim()
    if (!apiKey) throw new Error('Serper API Key 未配置。请在设置 > 网络搜索中填写。')
    const body: Record<string, unknown> = {
      q: request.query,
      num: Math.min(Math.max(Number(request.limit || 5), 1), 10)
    }
    if (request.gl) body.gl = request.gl
    if (request.hl) body.hl = request.hl
    const response = await electronRequest('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify(body),
      timeoutMs: 30000
    })
    const data = responseJson(response, 'Serper 搜索')
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Serper 搜索失败（${response.status}）：${String(data.error || data.message || '未知错误')}`
      )
    }
    const results = ((data.organic as Array<Record<string, unknown>>) || []).map((item) => ({
      title: String(item.title || ''),
      url: String(item.link || ''),
      snippet: String(item.snippet || '')
    }))
    return { success: true, provider: 'serper', results }
  }

  private async searxngSearch(request: WebSearchRequest): Promise<WebSearchResponse> {
    const custom = (request.instances || '')
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter(Boolean)
    const uniqueCustom = [...new Set(custom)]
    // 自定义实例优先，但单个自定义节点失败时仍回退到其他公共实例。
    const customSet = new Set(uniqueCustom)
    const fallback = DEFAULT_SEARXNG_INSTANCES.filter((instance) => !customSet.has(instance))
    const targetInstances = [...shuffleList(uniqueCustom), ...shuffleList(fallback)]
    const limit = Math.min(Math.max(Number(request.limit || 5), 1), 10)
    let lastError: unknown = null
    const maxAttempts = Math.min(targetInstances.length, 3)
    for (let i = 0; i < maxAttempts; i++) {
      const instance = targetInstances[i]
      try {
        const url = new URL('/search', instance)
        url.searchParams.set('q', request.query)
        url.searchParams.set('format', 'json')
        url.searchParams.set('pageno', '1')
        const response = await electronRequest(url.toString(), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
          },
          timeoutMs: 12_000
        })
        if (response.status < 200 || response.status >= 300) {
          lastError = new Error(`HTTP ${response.status}`)
          continue
        }
        const data = responseJson(response, 'SearXNG 搜索')
        const rawResults = data.results
        if (!Array.isArray(rawResults)) {
          // 多数公共实例默认未开启 json，会回 HTML 或空结构，继续试下一个
          lastError = new Error('响应无 results 字段（可能未开启 format=json）')
          continue
        }
        const results = (rawResults as Array<Record<string, unknown>>).slice(0, limit).map((item) => ({
          title: String(item.title || ''),
          url: String(item.url || ''),
          snippet: String(item.content || '')
        }))
        if (results.length === 0) {
          lastError = new Error('结果为空')
          continue
        }
        return { success: true, provider: 'searxng', instance, results }
      } catch (error) {
        lastError = error
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError || '')
    throw new Error(`SearXNG 连续尝试 ${maxAttempts} 个实例仍失败${msg ? `：${msg}` : ''}`)
  }

  private async braveSearch(request: WebSearchRequest): Promise<WebSearchResponse> {
    const apiKey = String(request.apiKey || '').trim()
    if (!apiKey) throw new Error('Brave Search API Key 未配置。请在设置 > 网络搜索中填写。')
    const url = new URL('https://api.search.brave.com/res/v1/web/search')
    url.searchParams.set('q', request.query)
    url.searchParams.set(
      'count',
      String(Math.min(Math.max(Number(request.limit || 5), 1), 20))
    )
    if (request.country) url.searchParams.set('country', request.country)
    if (request.searchLang) url.searchParams.set('search_lang', request.searchLang)
    const response = await electronRequest(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey
      },
      timeoutMs: 30000
    })
    const data = responseJson(response, 'Brave 搜索')
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `Brave 搜索失败（${response.status}）：${String(data.error || data.message || '未知错误')}`
      )
    }
    const web = data.web as { results?: Array<Record<string, unknown>> } | undefined
    const results = (web?.results || []).map((item) => ({
      title: String(item.title || ''),
      url: String(item.url || ''),
      snippet: String(item.description || '')
    }))
    return { success: true, provider: 'brave', results }
  }

  async fetchPage(
    url: string,
    maxChars = 8000
  ): Promise<{
    success: boolean
    url: string
    title: string
    content: string
    textLength: number
    truncated: boolean
    error?: string
  }> {
    try {
      const normalized = normalizeWebUrl(url)
      const response = await this.corsFetch({
        url: normalized,
        method: 'GET',
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeoutMs: 30000
      })
      if (response.status < 200 || response.status >= 300) {
        return {
          success: false,
          url: normalized,
          title: '',
          content: '',
          textLength: 0,
          truncated: false,
          error: `HTTP ${response.status}`
        }
      }
      const extracted = extractWebPageText(response.body, maxChars)
      if (!extracted.content) {
        return {
          success: false,
          url: normalized,
          title: extracted.title,
          content: '',
          textLength: 0,
          truncated: false,
          error: '网页正文提取失败或内容为空'
        }
      }
      return {
        success: true,
        url: normalized,
        title: extracted.title,
        content: extracted.content,
        textLength: extracted.textLength,
        truncated: extracted.truncated
      }
    } catch (error) {
      return {
        success: false,
        url,
        title: '',
        content: '',
        textLength: 0,
        truncated: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

// 单例：Agent 与 IPC 共用
let singleton: NetworkService | null = null
export function getNetworkService(): NetworkService {
  if (!singleton) singleton = new NetworkService()
  return singleton
}
