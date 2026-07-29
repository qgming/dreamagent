/**
 * Agent 内置工具契约（UI / runtime / LLM 共用）
 * 图谱工具为路径式 list/read/write/edit/delete；另含 web_search / web_fetch
 */

import type { BeatStatus, ChapterStatus, EntityStatus } from './project-types'

export type AgentToolName =
  | 'list'
  | 'read'
  | 'write'
  | 'edit'
  | 'delete'
  | 'web_search'
  | 'web_fetch'
  | 'todo'

export type GraphResourceType = 'beat' | 'entity' | 'chapter' | 'outline'

export interface AgentToolDefinition {
  name: AgentToolName
  description: string
  inputSchema: Record<string, unknown>
}

export interface LinkRef {
  id: string
  label: string
}

export interface ReadBeatResult {
  id: string
  title: string
  status: BeatStatus
  content: string
  outbound: {
    entities: LinkRef[]
    beats: LinkRef[]
  }
  inbound: {
    beats: LinkRef[]
    entities: LinkRef[]
    chapters: LinkRef[]
  }
  suggestedReads: Array<{ type: 'beat' | 'entity'; id: string; label: string }>
}

export interface ReadEntityResult {
  id: string
  name: string
  status: EntityStatus
  content: string
  outbound: {
    entities: LinkRef[]
    beats: LinkRef[]
  }
  inbound: {
    beats: LinkRef[]
    entities: LinkRef[]
    chapters: LinkRef[]
  }
  suggestedReads: Array<{ type: 'beat' | 'entity'; id: string; label: string }>
}

export interface WriteChapterToolInput {
  title: string
  /** 纯正文，不要写入双链语法 */
  content: string
  sourceBeatIds?: string[]
  entityRefs?: string[]
  beatRefs?: string[]
  status?: ChapterStatus
  chapterId?: string
  conversationId?: string
}

export interface OutlineBeatItem {
  id: string
  title: string
  status: BeatStatus
  summary: string
}

export interface AgentToolResult<T = unknown> {
  ok: boolean
  summary: string
  data?: T
  error?: string
}

/** 图谱会变更的写工具（runner 用于刷新 snapshot） */
export const GRAPH_MUTATING_TOOLS: ReadonlySet<AgentToolName> = new Set([
  'write',
  'edit',
  'delete'
])

/** 供 agent:listTools 与 LLM 使用 */
export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: 'list',
    description:
      '列出图谱资源。path 为 beats / entities / chapters / outline（或 beats/ 等）。可按 status、query 过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'beats | entities | chapters | outline'
        },
        status: { type: 'string', description: '可选状态过滤' },
        query: { type: 'string', description: '标题/名称关键词' },
        limit: { type: 'number' }
      },
      required: ['path']
    }
  },
  {
    name: 'read',
    description:
      '读取对象全文。path 形如 beats/{id}、entities/{id}、chapters/{id}，或 beat:{id} / entity:{id} / chapter:{id}。节点/实体返回出入链。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '资源路径' }
      },
      required: ['path']
    }
  },
  {
    name: 'write',
    description:
      '创建或全量覆盖。创建：type=beat|entity|chapter + title/name + content。覆盖：path=beats/{id} 等。beat/entity 的 content 可含 [@名](entity|beat:真实id) 双链并自动同步 entityRefs/beatRefs；chapter content 必须纯正文，关联用 sourceBeatIds/entityRefs/beatRefs。返回完整对象含 id。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '有则覆盖已有对象' },
        type: {
          type: 'string',
          enum: ['beat', 'entity', 'chapter'],
          description: '创建时必填'
        },
        title: { type: 'string' },
        name: { type: 'string', description: '实体名称' },
        content: { type: 'string' },
        status: { type: 'string' },
        afterId: { type: 'string' },
        sourceBeatIds: { type: 'array', items: { type: 'string' } },
        entityRefs: { type: 'array', items: { type: 'string' } },
        beatRefs: { type: 'array', items: { type: 'string' } },
        conversationId: { type: 'string' }
      }
    }
  },
  {
    name: 'edit',
    description:
      '局部精确替换 content（及可选 status/title/name）。path 必填。edits 为 oldText→newText，每段须在原文中唯一。改 content 后 beat/entity 自动重算双链 refs；chapter 禁止双链语法。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oldText: { type: 'string' },
              newText: { type: 'string' }
            },
            required: ['oldText', 'newText']
          }
        },
        title: { type: 'string' },
        name: { type: 'string' },
        status: { type: 'string' },
        sourceBeatIds: { type: 'array', items: { type: 'string' } },
        entityRefs: { type: 'array', items: { type: 'string' } },
        beatRefs: { type: 'array', items: { type: 'string' } }
      },
      required: ['path']
    }
  },
  {
    name: 'delete',
    description: '删除资源。path=beats/{id}|entities/{id}|chapters/{id}。会清理相关双链。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        confirm: { type: 'boolean', description: '建议 true' }
      },
      required: ['path']
    }
  },
  {
    name: 'web_search',
    description:
      '在互联网上检索信息，返回标题、链接、摘要。需在设置中配置搜索服务商 API Key。',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        limit: { type: 'number', description: '1–10，默认 5' }
      },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description: '读取指定 URL 的网页正文（去噪纯文本）。',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        maxChars: { type: 'number', description: '默认 8000' }
      },
      required: ['url']
    }
  },
  {
    name: 'todo',
    description:
      '维护本会话任务待办。每次传入完整 todos 数组覆盖。status: pending|in_progress|completed|cancelled。多步任务用此跟踪进度。',
    inputSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              content: { type: 'string' },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'cancelled']
              }
            },
            required: ['content']
          }
        }
      },
      required: ['todos']
    }
  }
]
