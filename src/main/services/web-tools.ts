/**
 * Agent 网络工具：web_search / web_fetch
 */
import { Type, type Static, type TSchema } from 'typebox'
import type { AgentHarnessTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import type { DreamToolContext } from './pi-agent-tools'
import { getNetworkService } from './network-service'

type AnyNetTool = AgentHarnessTool<DreamToolContext, TSchema, unknown>

function text(value: string): AgentToolResult<unknown>['content'] {
  return [{ type: 'text', text: value }]
}

const webSearchParams = Type.Object({
  query: Type.String({ description: '搜索关键词，尽量具体' }),
  limit: Type.Optional(
    Type.Number({ description: '返回条数 1–10，默认 5', minimum: 1, maximum: 10 })
  )
})

const webFetchParams = Type.Object({
  url: Type.String({ description: '要读取的网页 URL（http/https）' }),
  maxChars: Type.Optional(
    Type.Number({
      description: '正文最大字符数，默认 8000，范围 500–20000',
      minimum: 500,
      maximum: 20000
    })
  )
})

export function buildWebTools(): AnyNetTool[] {
  return [
    {
      name: 'web_search',
      label: 'web_search',
      description:
        '在互联网上检索信息，返回标题、链接、摘要。用于最新资讯、核实事实、查找资料。默认使用 SearXNG 公共实例（免 Key）；也可在设置中切换 Tavily/Exa 等。',
      parameters: webSearchParams,
      executionMode: 'parallel',
      execute: async (_id, params) => {
        const p = params as Static<typeof webSearchParams>
        const network = getNetworkService()
        try {
          const response = await network.searchWithSettings(p.query, p.limit ?? 5)
          if (!response.success || response.results.length === 0) {
            return {
              content: text('未检索到结果。'),
              details: { ok: true, summary: '无结果', data: response }
            }
          }
          const lines = response.results.map(
            (r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`
          )
          const answer = response.answer ? `\n\nAI 摘要：${response.answer}` : ''
          const summary = `web_search · ${response.provider} · ${response.results.length} 条`
          return {
            content: text(`${summary}\n\n${lines.join('\n\n')}${answer}`),
            details: { ok: true, summary, data: response }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            content: text(message),
            details: { ok: false, summary: message, error: message }
          }
        }
      }
    },
    {
      name: 'web_fetch',
      label: 'web_fetch',
      description:
        '读取指定 URL 的网页正文（去噪后的纯文本）。用于打开搜索结果或已知链接深入阅读。',
      parameters: webFetchParams,
      executionMode: 'parallel',
      execute: async (_id, params) => {
        const p = params as Static<typeof webFetchParams>
        const network = getNetworkService()
        const maxChars = Math.min(Math.max(Number(p.maxChars || 8000), 500), 20000)
        const page = await network.fetchPage(p.url, maxChars)
        if (!page.success) {
          const msg = page.error || '网页读取失败'
          return {
            content: text(msg),
            details: { ok: false, summary: msg, error: msg, data: page }
          }
        }
        const summary = `web_fetch · ${page.title} · ${page.textLength} 字${page.truncated ? '（已截断）' : ''}`
        return {
          content: text(`${summary}\nURL: ${page.url}\n\n${page.content}`),
          details: { ok: true, summary, data: page }
        }
      }
    }
  ]
}
