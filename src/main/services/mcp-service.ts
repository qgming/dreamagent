/**
 * 云端 MCP 服务：持久化配置 + listTools / callTool（主进程，无 CORS）
 */
import { app } from 'electron'
import path from 'path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type {
  McpCallToolInput,
  McpDiscoveredTool,
  McpInstallCheck,
  McpServerConfig,
  McpServerEndpoint,
  McpServersFile,
  McpTransport,
  McpUpsertInput
} from '../../shared/mcp'
import { ensureDir, readJsonFile, writeJsonAtomic } from './fs-utils'

const CLIENT_INFO = { name: 'DreamAgent', version: '0.1.0' }

function cleanHeaders(headers?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers ?? {}).filter(
      ([key, value]) => key.trim() !== '' && String(value).trim() !== ''
    )
  )
}

function normalizeTransport(raw: unknown): McpTransport {
  if (raw == null) return 'streamable-http'
  if (typeof raw !== 'string') {
    throw new Error('MCP transport 必须是字符串：streamable-http 或 sse')
  }
  const canonical = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (canonical === 'sse') return 'sse'
  if (
    canonical === 'streamablehttp' ||
    canonical === 'http' ||
    canonical === 'streamhttp'
  ) {
    return 'streamable-http'
  }
  throw new Error('MCP transport 仅支持 streamable-http / http / sse')
}

function sanitizeId(raw: string): string {
  const clean =
    raw
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'mcp-server'
  return clean
}

function uniqueId(base: string, existing: Set<string>): string {
  let id = sanitizeId(base)
  let n = 1
  while (existing.has(id)) {
    id = `${sanitizeId(base)}-${n++}`
  }
  return id
}

export class McpService {
  private cache: McpServerConfig[] | null = null

  private filePath(): string {
    return path.join(app.getPath('userData'), 'mcp-servers.json')
  }

  private async loadAll(): Promise<McpServerConfig[]> {
    if (this.cache) return this.cache
    const raw = (await readJsonFile<Partial<McpServersFile>>(this.filePath())) ?? {}
    const list = Array.isArray(raw.servers) ? raw.servers : []
    this.cache = list
      .filter((s) => s && typeof s === 'object' && s.id && s.server?.url)
      .map((s) => ({
        ...s,
        enabled: s.enabled !== false,
        server: {
          transport: normalizeTransport(s.server.transport),
          url: String(s.server.url || '').trim(),
          headers: cleanHeaders(s.server.headers)
        },
        discoveredTools: s.discoveredTools ?? [],
        disabledToolNames: s.disabledToolNames ?? []
      }))
    return this.cache
  }

  private async saveAll(servers: McpServerConfig[]): Promise<void> {
    const file = this.filePath()
    await ensureDir(path.dirname(file))
    const payload: McpServersFile = { version: 1, servers }
    await writeJsonAtomic(file, payload)
    this.cache = servers
  }

  async list(): Promise<McpServerConfig[]> {
    const all = await this.loadAll()
    return structuredClone(all)
  }

  async get(id: string): Promise<McpServerConfig | null> {
    const all = await this.loadAll()
    const found = all.find((s) => s.id === id)
    return found ? structuredClone(found) : null
  }

  /** 启用中的 server（供 Agent 装配工具） */
  async listEnabledForAgent(): Promise<McpServerConfig[]> {
    const all = await this.loadAll()
    return all.filter(
      (s) =>
        s.enabled &&
        (s.discoveredTools?.length ?? 0) > 0 &&
        s.installCheck?.status === 'installed'
    )
  }

  async upsert(input: McpUpsertInput): Promise<McpServerConfig> {
    const all = await this.loadAll()
    const ids = new Set(all.map((s) => s.id))
    const name = String(input.name || '').trim()
    if (!name) throw new Error('MCP 名称不能为空')
    const url = String(input.server?.url || '').trim()
    if (!url) throw new Error('云端 MCP 需要填写 URL')
    const transport = normalizeTransport(input.server.transport)
    const endpoint: McpServerEndpoint = {
      transport,
      url,
      headers: cleanHeaders(input.server.headers)
    }

    let next: McpServerConfig
    if (input.id && ids.has(input.id)) {
      const prev = all.find((s) => s.id === input.id)!
      next = {
        ...prev,
        name,
        description: input.description?.trim() || prev.description,
        enabled: input.enabled ?? prev.enabled,
        server: endpoint,
        notes: input.notes?.trim() || prev.notes,
        updatedAt: Date.now()
      }
      const idx = all.findIndex((s) => s.id === input.id)
      all[idx] = next
    } else {
      const id = uniqueId(input.id || name, ids)
      next = {
        id,
        name,
        description: input.description?.trim() || `${name} MCP server`,
        enabled: input.enabled !== false,
        server: endpoint,
        discoveredTools: [],
        disabledToolNames: [],
        installCheck: { status: 'unknown' },
        notes: input.notes?.trim(),
        updatedAt: Date.now()
      }
      all.push(next)
    }

    if (input.discover !== false) {
      next = await this.discoverAndMerge(next)
      const idx = all.findIndex((s) => s.id === next.id)
      if (idx >= 0) all[idx] = next
    }

    await this.saveAll(all)
    return structuredClone(next)
  }

  /**
   * 从标准 mcpServers JSON 批量导入
   * 例：{ "mcpServers": { "github": { "type": "http", "url": "https://..." } } }
   */
  async importJson(jsonText: string, discover = true): Promise<McpServerConfig[]> {
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch (error) {
      throw new Error(`JSON 格式错误：${error instanceof Error ? error.message : String(error)}`)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('MCP 配置必须是 JSON 对象')
    }
    const record = parsed as Record<string, unknown>
    const mcpServers = record.mcpServers
    if (!mcpServers || typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
      throw new Error('需要 mcpServers 对象字段')
    }
    const entries = Object.entries(mcpServers as Record<string, unknown>)
    if (entries.length === 0) throw new Error('mcpServers 至少需要一个 server')

    const saved: McpServerConfig[] = []
    for (const [id, raw] of entries) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        throw new Error(`mcpServers.${id} 必须是对象`)
      }
      const s = raw as Record<string, unknown>
      const typeRaw = s.type ?? s.transport
      const transport = normalizeTransport(typeRaw ?? 'streamable-http')
      const url = typeof s.url === 'string' ? s.url.trim() : ''
      if (!url) throw new Error(`mcpServers.${id} 缺少 url`)
      const name = typeof s.name === 'string' && s.name.trim() ? s.name.trim() : id
      const item = await this.upsert({
        id,
        name,
        description: typeof s.description === 'string' ? s.description : undefined,
        notes: typeof s.notes === 'string' ? s.notes : undefined,
        server: {
          transport,
          url,
          headers:
            s.headers && typeof s.headers === 'object' && !Array.isArray(s.headers)
              ? (s.headers as Record<string, string>)
              : undefined
        },
        discover
      })
      saved.push(item)
    }
    return saved
  }

  async remove(id: string): Promise<void> {
    const all = await this.loadAll()
    const next = all.filter((s) => s.id !== id)
    if (next.length === all.length) throw new Error(`未找到 MCP server：${id}`)
    await this.saveAll(next)
  }

  async setEnabled(id: string, enabled: boolean): Promise<McpServerConfig> {
    const all = await this.loadAll()
    const idx = all.findIndex((s) => s.id === id)
    if (idx < 0) throw new Error(`未找到 MCP server：${id}`)
    all[idx] = { ...all[idx], enabled, updatedAt: Date.now() }
    await this.saveAll(all)
    return structuredClone(all[idx])
  }

  async toggleRemoteTool(
    serverId: string,
    toolName: string,
    enabled: boolean
  ): Promise<McpServerConfig> {
    const all = await this.loadAll()
    const idx = all.findIndex((s) => s.id === serverId)
    if (idx < 0) throw new Error(`未找到 MCP server：${serverId}`)
    const disabled = new Set(all[idx].disabledToolNames ?? [])
    if (enabled) disabled.delete(toolName)
    else disabled.add(toolName)
    all[idx] = {
      ...all[idx],
      disabledToolNames: Array.from(disabled).sort(),
      updatedAt: Date.now()
    }
    await this.saveAll(all)
    return structuredClone(all[idx])
  }

  async discover(id: string): Promise<McpServerConfig> {
    const all = await this.loadAll()
    const idx = all.findIndex((s) => s.id === id)
    if (idx < 0) throw new Error(`未找到 MCP server：${id}`)
    const next = await this.discoverAndMerge(all[idx])
    all[idx] = next
    await this.saveAll(all)
    return structuredClone(next)
  }

  private async discoverAndMerge(config: McpServerConfig): Promise<McpServerConfig> {
    const check = await this.checkInstall(config.server)
    return {
      ...config,
      discoveredTools: check.tools,
      installCheck: {
        status: check.status,
        checkedAt: check.checkedAt,
        message: check.message,
        toolCount: check.toolCount
      },
      updatedAt: Date.now()
    }
  }

  async checkInstall(
    endpoint: McpServerEndpoint
  ): Promise<McpInstallCheck & { tools: McpDiscoveredTool[] }> {
    try {
      const tools = await this.listTools(endpoint)
      return {
        status: 'installed',
        checkedAt: Date.now(),
        message:
          tools.length > 0
            ? `检测成功，发现 ${tools.length} 个工具。`
            : '检测成功，但未发现可用工具。',
        toolCount: tools.length,
        tools
      }
    } catch (error) {
      return {
        status: 'failed',
        checkedAt: Date.now(),
        message: error instanceof Error ? error.message : String(error),
        toolCount: 0,
        tools: []
      }
    }
  }

  async listTools(endpoint: McpServerEndpoint): Promise<McpDiscoveredTool[]> {
    return this.withClient(endpoint, async (client) => {
      const result = await client.listTools()
      return (result.tools ?? []).map((tool) => ({
        name: tool.name,
        title: tool.title || tool.name,
        description: tool.description,
        inputSchema: (tool.inputSchema as Record<string, unknown> | undefined) ?? {
          type: 'object',
          properties: {}
        }
      }))
    })
  }

  async callTool(input: McpCallToolInput): Promise<unknown> {
    const cfg = await this.get(input.serverId)
    if (!cfg) throw new Error(`未找到 MCP server：${input.serverId}`)
    return this.withClient(cfg.server, async (client) => {
      return client.callTool({
        name: input.toolName,
        arguments: input.arguments ?? {}
      })
    })
  }

  private async withClient<T>(
    endpoint: McpServerEndpoint,
    run: (client: Client) => Promise<T>
  ): Promise<T> {
    const url = endpoint.url?.trim()
    if (!url) throw new Error('MCP server 缺少 URL')
    const client = new Client(CLIENT_INFO, { capabilities: {} })
    const headers = cleanHeaders(endpoint.headers)
    const transport =
      endpoint.transport === 'sse'
        ? new SSEClientTransport(new URL(url), {
            requestInit: { headers }
          })
        : new StreamableHTTPClientTransport(new URL(url), {
            requestInit: { headers }
          })

    await client.connect(transport)
    try {
      return await run(client)
    } finally {
      await client.close().catch(() => undefined)
    }
  }
}

let singleton: McpService | null = null
export function getMcpService(): McpService {
  if (!singleton) singleton = new McpService()
  return singleton
}
