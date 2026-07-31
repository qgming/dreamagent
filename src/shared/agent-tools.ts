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

export type GraphResourceType = 'beat' | 'entity' | 'chapter' | 'folder' | 'outline'

export interface AgentToolDefinition {
  name: AgentToolName
  description: string
  inputSchema: Record<string, unknown>
}

export interface LinkRef {
  id: string
  label: string
}

/** 直接子级摘要（结构树，非双链） */
export interface ChildRef {
  id: string
  label: string
  status?: string
}

export interface ReadBeatResult {
  id: string
  title: string
  status: BeatStatus
  content: string
  /** 结构父节点；null = 根 */
  parentId: string | null
  /** 直接子节点（结构树） */
  children: ChildRef[]
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
  parentId: string | null
  children: ChildRef[]
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
  /** 所属文章文件夹 */
  folderId?: string | null
}

export interface OutlineBeatItem {
  id: string
  title: string
  status: BeatStatus
  summary: string
  parentId?: string | null
  /** 缩进深度（根=0），便于 Agent 读大纲树 */
  depth?: number
}

/**
 * list({ path: "chapters" }) 的结构化条目。
 * 用 kind 明确区分文件夹与文章，避免扁平混排难读。
 */
export type ChapterListEntry =
  | {
      kind: 'folder'
      id: string
      name: string
      parentId: string | null
      /** 相对 documents/chapters 的路径，如「卷一/上」 */
      relPath: string
      depth: number
      chapterCount: number
      childFolderCount: number
    }
  | {
      kind: 'chapter'
      id: string
      title: string
      status: string
      sourceBeatIds: string[]
      folderId: string | null
      /** 所属文件夹名称；根级文章为 null */
      folderName: string | null
      /** 所属文件夹 relPath；根级文章为 null */
      folderPath: string | null
      depth: number
    }

export interface ChapterListResult {
  items: ChapterListEntry[]
  folderCount: number
  chapterCount: number
}

export interface AgentToolResult<T = unknown> {
  ok: boolean
  summary: string
  data?: T
  error?: string
}

/** read({ path: "project" }) 返回的项目主要介绍。 */
export interface ReadProjectResult {
  id: string
  title: string
  summary: string
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
      '列出图谱资源。path 为 beats / entities / chapters / folders / outline。' +
      'chapters 返回结构化 { items, folderCount, chapterCount }：items 每项带 kind="folder"|"chapter" 区分；' +
      'folder 含 name/relPath/chapterCount；chapter 含 title/status/folderId/folderName/folderPath。' +
      '可按 status、query、parentId（节点/实体/文件夹的直接子级；空字符串=根）或 folderId（chapters：限定范围）过滤。',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'beats | entities | chapters | folders | outline'
        },
        status: { type: 'string', description: '可选状态过滤（文章/节点/实体）' },
        query: { type: 'string', description: '标题/名称关键词' },
        parentId: {
          type: 'string',
          description:
            '只列该父的直接子级（beats/entities/folders）；传空字符串表示只要根级'
        },
        folderId: {
          type: 'string',
          description:
            '仅 chapters：限定范围。省略=整棵树（夹+文，带 depth）；空字符串=仅根级夹与根级文；有值=该夹的直接子夹 + 夹内文章'
        },
        limit: { type: 'number' }
      },
      required: ['path']
    }
  },
  {
    name: 'read',
    description:
      '读取项目或对象全文。path=project 返回项目标题与梗概；其他路径形如 beats/{id}、entities/{id}、chapters/{id}、folders/{id}。节点/实体返回出入链与 children；文件夹返回 name/parentId/子文件夹与夹内文章清单。',
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
      '创建或全量覆盖。项目名称/梗概：write({ path:"project", title?, summary? })，至少传一项。创建：type=beat|entity|chapter|folder。folder 只需 name（可选 parentId 建子夹），如 write({ type:"folder", name:"卷一" })。chapter 可带 folderId 进夹。覆盖：path=beats/{id}|folders/{id} 等。beat/entity content 可含双链；chapter content 必须纯正文。',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '有则覆盖已有对象' },
        type: {
          type: 'string',
          enum: ['beat', 'entity', 'chapter', 'folder'],
          description: '创建时必填；folder=文章文件夹'
        },
        title: { type: 'string' },
        name: {
          type: 'string',
          description: '实体名称，或文件夹名称（type=folder 时用 name 或 title）'
        },
        content: { type: 'string' },
        summary: { type: 'string', description: 'path=project 时的项目梗概全文' },
        status: { type: 'string' },
        afterId: { type: 'string' },
        parentId: {
          type: 'string',
          description: '创建节点/实体/文件夹时的父 id；省略则挂到根'
        },
        folderId: {
          type: 'string',
          description: '创建/移动文章到的文件夹 id'
        },
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
      '局部精确替换 content 或项目梗概（及可选 status/title/name/parentId/folderId）。path 必填；path=project 时 title 修改项目名称，edits 作用于梗概，也可直接传 summary。edits 为 oldText→newText，每段须在原文中唯一。folders/{id} 可改 name / parentId。chapter 禁止双链语法。',
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
        summary: { type: 'string', description: 'path=project 时直接替换项目梗概全文' },
        status: { type: 'string' },
        parentId: {
          type: 'string',
          description: '改挂父（节点/实体/文件夹）'
        },
        folderId: {
          type: 'string',
          description: '移动文章到文件夹；空字符串移到根'
        },
        sourceBeatIds: { type: 'array', items: { type: 'string' } },
        entityRefs: { type: 'array', items: { type: 'string' } },
        beatRefs: { type: 'array', items: { type: 'string' } }
      },
      required: ['path']
    }
  },
  {
    name: 'delete',
    description:
      '删除资源。path=beats/{id}|entities/{id}|chapters/{id}|folders/{id}。删节点/实体会断双链且子项提升；删文件夹时文章与子夹提升到上一级，不级联删文。',
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
      '维护本会话任务待办（持久化，重开仍可见）。每次传入完整 todos 数组覆盖。status: pending|in_progress|completed|cancelled。多步任务用此跟踪进度。清理/清空只能由本工具完成（传精简列表或 []）；用户 UI 只读。',
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
