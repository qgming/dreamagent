/**
 * 把已发现的云端 MCP tools 注册为 pi-agent AgentHarnessTool
 */
import { Type, type TSchema } from 'typebox'
import type { AgentHarnessTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import type { DreamToolContext } from './pi-agent-tools'
import type { McpDiscoveredTool, McpServerConfig } from '../../shared/mcp'
import { getMcpService } from './mcp-service'

type AnyMcpTool = AgentHarnessTool<DreamToolContext, TSchema, unknown>

function text(value: string): AgentToolResult<unknown>['content'] {
  return [{ type: 'text', text: value }]
}

/** pi 工具名：mcp__{serverId}__{remoteName}，避免与内置冲突 */
export function mcpPiToolName(serverId: string, remoteName: string): string {
  const safeServer = serverId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const safeTool = remoteName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)
  return `mcp__${safeServer}__${safeTool}`
}

function formatMcpResult(result: unknown): string {
  if (result == null) return '（无返回）'
  if (typeof result === 'string') return result
  try {
    // MCP CallToolResult 常见结构：{ content: [{type,text}...], isError? }
    if (typeof result === 'object' && result !== null && 'content' in result) {
      const content = (result as { content?: unknown }).content
      if (Array.isArray(content)) {
        const parts = content
          .map((c) => {
            if (c && typeof c === 'object' && 'text' in c) {
              return String((c as { text: unknown }).text ?? '')
            }
            return JSON.stringify(c)
          })
          .filter(Boolean)
        if (parts.length) return parts.join('\n\n')
      }
    }
    const json = JSON.stringify(result, null, 2)
    return json.length > 16000 ? `${json.slice(0, 16000)}…` : json
  } catch {
    return String(result)
  }
}

/**
 * 宽松参数 schema：MCP inputSchema 是 JSON Schema，pi 侧用 Type.Any 对象兜底，
 * 真正约束仍由远端 server 校验。
 */
function parametersFromRemote(_remote: McpDiscoveredTool): TSchema {
  return Type.Object(
    {},
    {
      additionalProperties: true,
      description: 'MCP 工具参数（键值对象，按远端 inputSchema 填写）'
    }
  )
}

function buildSingle(
  config: McpServerConfig,
  remote: McpDiscoveredTool
): AnyMcpTool {
  const piName = mcpPiToolName(config.id, remote.name)
  return {
    name: piName,
    label: `${config.name} · ${remote.title || remote.name}`,
    description:
      remote.description ||
      `调用云端 MCP「${config.name}」的 ${remote.name} 工具。`,
    parameters: parametersFromRemote(remote),
    executionMode: 'parallel',
    execute: async (_id, params) => {
      const argumentsObject =
        params && typeof params === 'object' && !Array.isArray(params)
          ? (params as Record<string, unknown>)
          : {}
      try {
        const result = await getMcpService().callTool({
          serverId: config.id,
          toolName: remote.name,
          arguments: argumentsObject
        })
        const body = formatMcpResult(result)
        const summary = `mcp · ${config.name} · ${remote.name}`
        return {
          content: text(`${summary}\n\n${body}`),
          details: {
            ok: true,
            summary,
            serverId: config.id,
            remoteToolName: remote.name,
            data: result
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
          content: text(`MCP 调用失败（${config.name}/${remote.name}）：${message}`),
          details: {
            ok: false,
            summary: message,
            error: message,
            serverId: config.id,
            remoteToolName: remote.name
          }
        }
      }
    }
  }
}

/** 从已启用且探测成功的 MCP server 构建 pi 工具列表 */
export function buildMcpTools(configs: McpServerConfig[]): AnyMcpTool[] {
  const tools: AnyMcpTool[] = []
  for (const config of configs) {
    if (!config.enabled) continue
    const disabled = new Set(config.disabledToolNames ?? [])
    for (const remote of config.discoveredTools ?? []) {
      if (disabled.has(remote.name)) continue
      tools.push(buildSingle(config, remote))
    }
  }
  return tools
}
