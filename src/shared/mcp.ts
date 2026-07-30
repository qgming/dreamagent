/**
 * 云端 MCP 配置共享类型（streamable-http / sse）
 */

/** 仅云端传输：HTTP 流式 与 SSE */
export type McpTransport = 'streamable-http' | 'sse'

export type McpInstallStatus = 'unknown' | 'checking' | 'installed' | 'failed'

export interface McpInstallCheck {
  status: McpInstallStatus
  checkedAt?: number
  message?: string
  toolCount?: number
}

export interface McpServerEndpoint {
  transport: McpTransport
  url: string
  headers?: Record<string, string>
}

export interface McpDiscoveredTool {
  name: string
  title?: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface McpServerConfig {
  id: string
  name: string
  description?: string
  /** 是否启用该 server（关闭后不注入 Agent 工具） */
  enabled: boolean
  server: McpServerEndpoint
  discoveredTools?: McpDiscoveredTool[]
  /** 禁用的远端工具名 */
  disabledToolNames?: string[]
  installCheck?: McpInstallCheck
  notes?: string
  updatedAt?: number
}

export interface McpServersFile {
  version: 1
  servers: McpServerConfig[]
}

export interface McpUpsertInput {
  id?: string
  name: string
  description?: string
  enabled?: boolean
  server: McpServerEndpoint
  notes?: string
  /** 保存时是否立刻探测 tools/list */
  discover?: boolean
}

export interface McpCallToolInput {
  serverId: string
  toolName: string
  arguments?: Record<string, unknown>
}

/** 标准 mcpServers JSON 片段（Claude Desktop / Cursor 风格） */
export interface McpServersJsonEnvelope {
  mcpServers: Record<
    string,
    {
      type?: string
      transport?: string
      url?: string
      headers?: Record<string, string>
      name?: string
      description?: string
      notes?: string
    }
  >
}
