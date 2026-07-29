/**
 * 创作工具 → pi AgentHarnessTool（0.82：execute 第 5 参为 context）
 */
import { Type, type Static, type TSchema } from 'typebox'
import type { AgentToolResult } from '@earendil-works/pi-agent-core'
import type { AgentHarnessTool } from '@earendil-works/pi-agent-core'
import type { AgentToolRuntime } from './agent-tool-runtime'
import type { AgentToolName } from '../../shared/agent-tools'

/** 每轮注入的工具上下文 */
export interface DreamToolContext {
  projectId: string
  sessionId: string
  runtime: AgentToolRuntime
}

function text(value: string): AgentToolResult<unknown>['content'] {
  return [{ type: 'text', text: value }]
}

function toModelText(summary: string, data?: unknown): string {
  if (data === undefined) return summary
  try {
    const json = JSON.stringify(data)
    const clipped = json.length > 12000 ? `${json.slice(0, 12000)}…` : json
    return `${summary}\n\n${clipped}`
  } catch {
    return summary
  }
}

async function runRuntime(
  ctx: DreamToolContext,
  name: AgentToolName,
  params: Record<string, unknown>
): Promise<AgentToolResult<unknown>> {
  const result = await ctx.runtime.execute(ctx.projectId, name, {
    ...params,
    conversationId:
      name === 'write_chapter'
        ? (params.conversationId ?? ctx.sessionId)
        : params.conversationId
  })
  if (!result.ok) {
    return {
      content: text(result.summary || result.error || `工具失败: ${name}`),
      details: result
    }
  }
  return {
    content: text(toModelText(result.summary, result.data)),
    details: result
  }
}

type AnyHarnessTool = AgentHarnessTool<DreamToolContext, TSchema, unknown>

const emptyParams = Type.Object({})

const beatStatusEnum = Type.Union([
  Type.Literal('idea'),
  Type.Literal('outline'),
  Type.Literal('draft'),
  Type.Literal('final')
])

const entityStatusEnum = Type.Union([
  Type.Literal('active'),
  Type.Literal('dormant'),
  Type.Literal('archived')
])

const listBeatsParams = Type.Object({
  status: Type.Optional(beatStatusEnum)
})

const readBeatParams = Type.Object({
  beatId: Type.String({ description: '节点 id' })
})

const createBeatParams = Type.Object({
  title: Type.String({ description: '节点标题' }),
  content: Type.Optional(Type.String({ description: '节点正文，可含双链' })),
  status: Type.Optional(beatStatusEnum),
  afterId: Type.Optional(Type.String({ description: '插入到该节点之后' }))
})

const updateBeatParams = Type.Object({
  beatId: Type.String(),
  title: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  status: Type.Optional(beatStatusEnum)
})

const deleteBeatParams = Type.Object({
  beatId: Type.String()
})

const listEntitiesParams = Type.Object({
  status: Type.Optional(entityStatusEnum)
})

const readEntityParams = Type.Object({
  entityId: Type.String({ description: '实体 id' })
})

const createEntityParams = Type.Object({
  name: Type.String({ description: '实体名称' }),
  content: Type.Optional(Type.String({ description: '设定正文，可含双链' })),
  status: Type.Optional(entityStatusEnum)
})

const updateEntityParams = Type.Object({
  entityId: Type.String(),
  name: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  status: Type.Optional(entityStatusEnum)
})

const deleteEntityParams = Type.Object({
  entityId: Type.String()
})

const updateBeatStatusParams = Type.Object({
  beatId: Type.String(),
  status: beatStatusEnum
})

const writeChapterParams = Type.Object({
  title: Type.String({ description: '文章标题' }),
  content: Type.String({ description: '纯正文，禁止双链语法' }),
  sourceBeatIds: Type.Optional(Type.Array(Type.String())),
  entityRefs: Type.Optional(Type.Array(Type.String())),
  beatRefs: Type.Optional(Type.Array(Type.String())),
  status: Type.Optional(Type.Union([Type.Literal('draft'), Type.Literal('final')])),
  chapterId: Type.Optional(Type.String({ description: '有则更新已有文章' })),
  conversationId: Type.Optional(Type.String())
})

const readChapterParams = Type.Object({
  chapterId: Type.String()
})

const updateChapterParams = Type.Object({
  chapterId: Type.String(),
  title: Type.Optional(Type.String()),
  content: Type.Optional(Type.String()),
  status: Type.Optional(Type.Union([Type.Literal('draft'), Type.Literal('final')])),
  sourceBeatIds: Type.Optional(Type.Array(Type.String())),
  entityRefs: Type.Optional(Type.Array(Type.String())),
  beatRefs: Type.Optional(Type.Array(Type.String()))
})

const deleteChapterParams = Type.Object({
  chapterId: Type.String()
})

/**
 * 装配造梦师创作 Agent 工具列表（Harness 版）
 */
export function buildDreamAgentTools(): AnyHarnessTool[] {
  const tools: AnyHarnessTool[] = [
    {
      name: 'list_beats',
      label: '列出节点',
      description: '列出项目节点目录（可按状态过滤）。',
      parameters: listBeatsParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'list_beats', { ...(params as Static<typeof listBeatsParams>) })
    },
    {
      name: 'read_beat',
      label: '读取节点',
      description:
        '读取节点全文，并返回出链与入链清单（含文章），便于继续深入读取相关内容。',
      parameters: readBeatParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'read_beat', { ...(params as Static<typeof readBeatParams>) })
    },
    {
      name: 'create_beat',
      label: '创建节点',
      description:
        '新建节点。可写标题、正文（可含双链）、初始状态。',
      parameters: createBeatParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'create_beat', { ...(params as Static<typeof createBeatParams>) })
    },
    {
      name: 'update_beat',
      label: '更新节点',
      description: '更新节点标题/正文/状态。改写 content 时双链会自动解析。',
      parameters: updateBeatParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'update_beat', { ...(params as Static<typeof updateBeatParams>) })
    },
    {
      name: 'delete_beat',
      label: '删除节点',
      description: '删除节点，并清理相关双链引用。',
      parameters: deleteBeatParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'delete_beat', { ...(params as Static<typeof deleteBeatParams>) })
    },
    {
      name: 'list_entities',
      label: '列出实体',
      description: '列出项目实体目录（可按状态过滤）。',
      parameters: listEntitiesParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'list_entities', { ...(params as Static<typeof listEntitiesParams>) })
    },
    {
      name: 'read_entity',
      label: '读取实体',
      description: '读取实体全文及出链/入链清单。',
      parameters: readEntityParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'read_entity', { ...(params as Static<typeof readEntityParams>) })
    },
    {
      name: 'create_entity',
      label: '创建实体',
      description: '新建实体（人物/地点/物品等设定）。',
      parameters: createEntityParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'create_entity', { ...(params as Static<typeof createEntityParams>) })
    },
    {
      name: 'update_entity',
      label: '更新实体',
      description: '更新实体名称/正文/状态。',
      parameters: updateEntityParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'update_entity', { ...(params as Static<typeof updateEntityParams>) })
    },
    {
      name: 'delete_entity',
      label: '删除实体',
      description: '删除实体，并清理相关双链引用。',
      parameters: deleteEntityParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'delete_entity', { ...(params as Static<typeof deleteEntityParams>) })
    },
    {
      name: 'update_beat_status',
      label: '更新节点状态',
      description: '仅更新节点写作成熟度（idea→outline→draft→final）。不改写节点正文。',
      parameters: updateBeatStatusParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'update_beat_status', {
          ...(params as Static<typeof updateBeatStatusParams>)
        })
    },
    {
      name: 'write_chapter',
      label: '写文章',
      description:
        '创建或覆盖文章。content 必须是纯正文，禁止双链语法；关联节点/实体通过 sourceBeatIds、entityRefs、beatRefs 元数据传递。不回写 beat.content。',
      parameters: writeChapterParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'write_chapter', { ...(params as Static<typeof writeChapterParams>) })
    },
    {
      name: 'list_chapters',
      label: '列出文章',
      description: '列出已有文章（有序）。',
      parameters: emptyParams,
      executionMode: 'parallel',
      execute: async (_id, _params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'list_chapters', {})
    },
    {
      name: 'read_chapter',
      label: '读取文章',
      description: '读取文章全文与关联元数据。',
      parameters: readChapterParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'read_chapter', { ...(params as Static<typeof readChapterParams>) })
    },
    {
      name: 'update_chapter',
      label: '更新文章',
      description: '更新文章标题/正文/状态/关联节点与实体。',
      parameters: updateChapterParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'update_chapter', { ...(params as Static<typeof updateChapterParams>) })
    },
    {
      name: 'delete_chapter',
      label: '删除文章',
      description: '删除文章。',
      parameters: deleteChapterParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'delete_chapter', { ...(params as Static<typeof deleteChapterParams>) })
    },
    {
      name: 'get_project_outline',
      label: '项目节点',
      description: '返回有序节点列表（标题 + 状态 + 内容摘要），便于规划多章写作。',
      parameters: emptyParams,
      executionMode: 'parallel',
      execute: async (_id, _params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'get_project_outline', {})
    }
  ]

  return tools
}

/** 默认系统提示（动态段由 runner 拼接） */
export const DREAM_AGENT_BASE_PROMPT = `你是「造梦师」的创作助手，帮助用户基于项目中的节点与实体（设定）进行长文创作。

## 工作方式
1. 先用工具了解项目：get_project_outline / list_beats / list_entities。
2. 需要细节时再 read_beat / read_entity，不要编造未读取的设定。
3. 可用 create_beat / update_beat / delete_beat 管理节点；create_entity / update_entity / delete_entity 管理实体。
4. 写文章时用 write_chapter：content 必须是纯正文，禁止写入 [@…](beat|entity:…) 双链；关联用 sourceBeatIds / entityRefs / beatRefs。
5. 写完后如源节点尚未 draft/final，可用 update_beat_status 推进到 draft。
6. 用中文回复用户；工具调用按需进行，不要无意义循环。
7. 回复可用 Markdown（标题、列表、加粗、引用等）提升可读性。

## 约束
- 节点/实体正文可含双链；文章正文必须是纯文本。
- 文章与节点分离：产出在 documents/chapters，不回写 beat.content。
- 删除操作不可恢复，执行前应确认用户意图。
`
