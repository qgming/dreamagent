/**
 * 创作工具 → pi AgentHarnessTool（路径式 list/read/write/edit/delete）
 */
import { Type, type Static, type TSchema } from 'typebox'
import type { AgentToolResult } from '@earendil-works/pi-agent-core'
import type { AgentHarnessTool } from '@earendil-works/pi-agent-core'
import type { Skill } from '@earendil-works/pi-agent-core'
import type { AgentToolRuntime } from './agent-tool-runtime'
import type { SkillService } from './skill-service'
import type { TodoService } from './todo-service'
import type { AgentToolName } from '../../shared/agent-tools'

/** 每轮注入的工具上下文 */
export interface DreamToolContext {
  projectId: string
  sessionId: string
  runtime: AgentToolRuntime
  skills?: Skill[]
  skillService?: SkillService
  todoService?: TodoService
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
  // write 创建 chapter 时补 conversationId
  const enriched = { ...params }
  if (
    name === 'write' &&
    !enriched.conversationId &&
    (String(enriched.type || '').toLowerCase() === 'chapter' ||
      (typeof enriched.path === 'string' && /chapter/i.test(enriched.path)))
  ) {
    enriched.conversationId = ctx.sessionId
  }
  const result = await ctx.runtime.execute(ctx.projectId, name, enriched)
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

const listParams = Type.Object({
  path: Type.String({
    description: 'beats | entities | chapters | outline（可带尾 /）'
  }),
  status: Type.Optional(Type.String({ description: '可选状态过滤' })),
  query: Type.Optional(Type.String({ description: '标题/名称关键词' })),
  limit: Type.Optional(Type.Number())
})

const readParams = Type.Object({
  path: Type.String({
    description:
      'beats/{id} | entities/{id} | chapters/{id} | beat:{id} | entity:{id} | outline'
  })
})

const writeParams = Type.Object({
  path: Type.Optional(
    Type.String({ description: '有则全量覆盖该对象，如 beats/{id}' })
  ),
  type: Type.Optional(
    Type.Union([Type.Literal('beat'), Type.Literal('entity'), Type.Literal('chapter')], {
      description: '创建时必填'
    })
  ),
  title: Type.Optional(Type.String()),
  name: Type.Optional(Type.String({ description: '实体名称' })),
  content: Type.Optional(
    Type.String({
      description:
        'beat/entity 可含 [@显示名](entity|beat:真实id)；chapter 必须纯正文无双链'
    })
  ),
  status: Type.Optional(Type.String()),
  afterId: Type.Optional(Type.String()),
  sourceBeatIds: Type.Optional(Type.Array(Type.String())),
  entityRefs: Type.Optional(Type.Array(Type.String())),
  beatRefs: Type.Optional(Type.Array(Type.String())),
  conversationId: Type.Optional(Type.String())
})

const editParams = Type.Object({
  path: Type.String({ description: 'beats/{id} 等' }),
  edits: Type.Optional(
    Type.Array(
      Type.Object({
        oldText: Type.String(),
        newText: Type.String()
      }),
      { description: '精确替换；每段 oldText 须在原文唯一' }
    )
  ),
  title: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  content: Type.Optional(Type.String({ description: '也可直接给全文（少用）' })),
  sourceBeatIds: Type.Optional(Type.Array(Type.String())),
  entityRefs: Type.Optional(Type.Array(Type.String())),
  beatRefs: Type.Optional(Type.Array(Type.String()))
})

const deleteParams = Type.Object({
  path: Type.String(),
  confirm: Type.Optional(Type.Boolean())
})

/**
 * 装配造梦师创作 Agent 工具列表（路径式）
 */
export function buildDreamAgentTools(): AnyHarnessTool[] {
  return [
    {
      name: 'list',
      label: 'list',
      description:
        '列出图谱资源。path=beats|entities|chapters|outline。可选 status、query、limit。',
      parameters: listParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'list', { ...(params as Static<typeof listParams>) })
    },
    {
      name: 'read',
      label: 'read',
      description:
        '读取对象全文与出入链。path=beats/{id}|entities/{id}|chapters/{id} 或 beat:{id}。',
      parameters: readParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'read', { ...(params as Static<typeof readParams>) })
    },
    {
      name: 'write',
      label: 'write',
      description:
        '创建或全量覆盖。创建：type+title/name+content；覆盖：path。beat/entity 双链自动同步 refs；chapter 禁止双链。返回含 id 的完整对象。',
      parameters: writeParams,
      executionMode: 'sequential',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'write', { ...(params as Static<typeof writeParams>) })
    },
    {
      name: 'edit',
      label: 'edit',
      description:
        '局部精确替换 content（edits）或改 title/name/status。path 必填。chapter 禁止双链。',
      parameters: editParams,
      executionMode: 'sequential',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'edit', { ...(params as Static<typeof editParams>) })
    },
    {
      name: 'delete',
      label: 'delete',
      description: '删除资源 path=beats/{id}|entities/{id}|chapters/{id}，并清理双链。',
      parameters: deleteParams,
      executionMode: 'sequential',
      execute: async (_id, params, _signal, _onUpdate, ctx) =>
        runRuntime(ctx, 'delete', { ...(params as Static<typeof deleteParams>) })
    }
  ]
}

/** 默认系统提示 */
export const DREAM_AGENT_BASE_PROMPT = `你是「造梦师」的创作助手，帮助用户基于项目中的节点与实体（设定）进行长文创作。

## 工作方式
1. 先 list path=outline|beats|entities 了解项目；需要细节再 read path=beats/{id} 等。
2. 不要编造未读取的设定；顺着 read 返回的出入链继续深入。
3. 创建：write({ type:"entity", name, content }) / write({ type:"beat", title, content }) / write({ type:"chapter", title, content, sourceBeatIds, entityRefs })。
4. 覆盖：write({ path:"beats/{id}", content|title|status })；局部改用 edit({ path, edits:[{oldText,newText}] })。
5. 删除：delete({ path:"entities/{id}" })。
6. 用中文回复用户；工具按需调用。
7. 回复可用 Markdown。
8. 不熟悉工具/双链时，先 read_skill「dreamagent-guide」。

## 路径约定
- 集合：beats / entities / chapters / outline
- 对象：beats/{id}、entities/{id}、chapters/{id}（也可用 beat:{id}）

## 双链（硬规则）
- 唯一合法语法：\`[@显示名](entity:真实id)\` 或 \`[@显示名](beat:真实id)\`
- **禁止**只写 \`@名字\`、\`[[名字]]\`
- 流程：write 创建 → 从 data.id 取真实 id → write/edit 把双链写入 beat/entity 的 content
- 双链只出现在节点/实体 content；文章 content 禁止双链，关联用 sourceBeatIds / entityRefs / beatRefs
- 系统自动维护 entityRefs/beatRefs；摘要含「实体链 N · 节点链 M」；「无双链」表示语法无效

## 网络
- web_search 检索互联网；web_fetch 读 URL 正文。
- 搜索需在「设置 > 网络搜索」配置 API Key。

## 待办
- 多步任务用 todo 工具维护完整清单（每次覆盖提交全量 todos）。
- status: pending / in_progress / completed / cancelled；同时最多一个 in_progress。
- 完成一步就更新清单，不要只在心里记。

## 技能
- 系统提示仅技能清单；任务匹配时 list_skills → read_skill → read_skill_file。
- write_skill 仅用于自定义技能。

## 约束
- 文章与节点分离：成稿进 chapters，不回写 beat.content。
- 删除不可恢复，执行前确认用户意图。
`
