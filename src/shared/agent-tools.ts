/**
 * Agent 内置工具契约（UI / runtime / LLM 共用）
 */

import type { BeatStatus, ChapterStatus, EntityStatus } from './project-types'

export type AgentToolName =
  | 'list_beats'
  | 'read_beat'
  | 'create_beat'
  | 'update_beat'
  | 'delete_beat'
  | 'list_entities'
  | 'read_entity'
  | 'create_entity'
  | 'update_entity'
  | 'delete_entity'
  | 'update_beat_status'
  | 'write_chapter'
  | 'list_chapters'
  | 'read_chapter'
  | 'update_chapter'
  | 'delete_chapter'
  | 'get_project_outline'

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
  /** 关联实体 id 列表（元数据） */
  entityRefs?: string[]
  /** 关联节点 id 列表（元数据） */
  beatRefs?: string[]
  status?: ChapterStatus
  /** 有则更新已有文章 */
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
  'create_beat',
  'update_beat',
  'delete_beat',
  'create_entity',
  'update_entity',
  'delete_entity',
  'update_beat_status',
  'write_chapter',
  'update_chapter',
  'delete_chapter'
])

/** 供 agent:listTools 与 LLM 使用 */
export const AGENT_TOOL_DEFINITIONS: AgentToolDefinition[] = [
  {
    name: 'list_beats',
    description: '列出项目节点目录（可按状态过滤）。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['idea', 'outline', 'draft', 'final'],
          description: '可选状态过滤'
        }
      }
    }
  },
  {
    name: 'read_beat',
    description:
      '读取节点全文，并返回出链与入链清单（含文章），便于继续深入读取相关内容。',
    inputSchema: {
      type: 'object',
      properties: {
        beatId: { type: 'string', description: '节点 id' }
      },
      required: ['beatId']
    }
  },
  {
    name: 'create_beat',
    description:
      '新建节点。可写标题、正文（可含 [@名](entity:id) / [@名](beat:id) 双链）、初始状态。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '节点标题' },
        content: { type: 'string', description: '节点正文，可含双链' },
        status: {
          type: 'string',
          enum: ['idea', 'outline', 'draft', 'final'],
          description: '默认 idea'
        },
        afterId: {
          type: 'string',
          description: '插入到该节点之后；省略则追加末尾'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'update_beat',
    description:
      '更新节点标题/正文/状态。改写 content 时双链会自动解析为 entityRefs/beatRefs。',
    inputSchema: {
      type: 'object',
      properties: {
        beatId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        status: {
          type: 'string',
          enum: ['idea', 'outline', 'draft', 'final']
        }
      },
      required: ['beatId']
    }
  },
  {
    name: 'delete_beat',
    description: '删除节点。会清理其他内容中的相关双链引用。',
    inputSchema: {
      type: 'object',
      properties: {
        beatId: { type: 'string' }
      },
      required: ['beatId']
    }
  },
  {
    name: 'list_entities',
    description: '列出项目实体目录（可按状态过滤）。',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['active', 'dormant', 'archived']
        }
      }
    }
  },
  {
    name: 'read_entity',
    description: '读取实体全文及出链/入链清单。',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' }
      },
      required: ['entityId']
    }
  },
  {
    name: 'create_entity',
    description: '新建实体（人物/地点/物品等设定）。可写名称、正文（可含双链）、状态。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '实体名称' },
        content: { type: 'string', description: '设定正文，可含双链' },
        status: {
          type: 'string',
          enum: ['active', 'dormant', 'archived'],
          description: '默认 active'
        }
      },
      required: ['name']
    }
  },
  {
    name: 'update_entity',
    description: '更新实体名称/正文/状态。',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' },
        name: { type: 'string' },
        content: { type: 'string' },
        status: {
          type: 'string',
          enum: ['active', 'dormant', 'archived']
        }
      },
      required: ['entityId']
    }
  },
  {
    name: 'delete_entity',
    description: '删除实体。会清理其他内容中的相关双链引用。',
    inputSchema: {
      type: 'object',
      properties: {
        entityId: { type: 'string' }
      },
      required: ['entityId']
    }
  },
  {
    name: 'update_beat_status',
    description: '仅更新节点写作成熟度（idea→outline→draft→final）。不改写节点正文。',
    inputSchema: {
      type: 'object',
      properties: {
        beatId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['idea', 'outline', 'draft', 'final']
        }
      },
      required: ['beatId', 'status']
    }
  },
  {
    name: 'write_chapter',
    description:
      '创建或覆盖文章（documents/chapters）。content 必须是纯正文，禁止双链语法；关联节点/实体通过 sourceBeatIds、entityRefs、beatRefs 元数据传递。不回写 beat.content。',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string', description: '纯正文，无双链' },
        sourceBeatIds: { type: 'array', items: { type: 'string' } },
        entityRefs: { type: 'array', items: { type: 'string' } },
        beatRefs: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: ['draft', 'final'] },
        chapterId: { type: 'string', description: '有则更新' },
        conversationId: { type: 'string' }
      },
      required: ['title', 'content']
    }
  },
  {
    name: 'list_chapters',
    description: '列出已有文章（有序）。',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'read_chapter',
    description: '读取文章全文与关联元数据。',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: { type: 'string' }
      },
      required: ['chapterId']
    }
  },
  {
    name: 'update_chapter',
    description: '更新文章标题/正文/状态/关联节点与实体。',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'final'] },
        sourceBeatIds: { type: 'array', items: { type: 'string' } },
        entityRefs: { type: 'array', items: { type: 'string' } },
        beatRefs: { type: 'array', items: { type: 'string' } }
      },
      required: ['chapterId']
    }
  },
  {
    name: 'delete_chapter',
    description: '删除文章。',
    inputSchema: {
      type: 'object',
      properties: {
        chapterId: { type: 'string' }
      },
      required: ['chapterId']
    }
  },
  {
    name: 'get_project_outline',
    description: '返回有序节点列表（标题 + 状态 + 内容摘要），便于规划多章写作。',
    inputSchema: { type: 'object', properties: {} }
  }
]
