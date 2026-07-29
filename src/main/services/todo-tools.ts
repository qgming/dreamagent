/**
 * Agent todo 工具：会话级待办清单（全量覆盖，对齐 Claude Code TodoWrite）
 */
import { Type, type Static, type TSchema } from 'typebox'
import type { AgentHarnessTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import type { DreamToolContext } from './pi-agent-tools'
import { formatTodoList, todoSummary } from './todo-service'

type AnyTodoTool = AgentHarnessTool<DreamToolContext, TSchema, unknown>

function text(value: string): AgentToolResult<unknown>['content'] {
  return [{ type: 'text', text: value }]
}

const todoStatus = Type.Union([
  Type.Literal('pending'),
  Type.Literal('in_progress'),
  Type.Literal('completed'),
  Type.Literal('cancelled')
])

const todoParams = Type.Object({
  todos: Type.Array(
    Type.Object({
      id: Type.Optional(Type.String({ description: '稳定 id，建议 todo_1 形式' })),
      content: Type.String({ description: '待办内容' }),
      status: Type.Optional(todoStatus)
    }),
    {
      description:
        '完整待办列表（每次调用应提交当前完整清单，而非增量）。多步任务开始时列出，完成一项就改 status。'
    }
  )
})

export function buildTodoTools(): AnyTodoTool[] {
  return [
    {
      name: 'todo',
      label: 'todo',
      description:
        '维护本会话任务待办清单。每次传入完整 todos 数组覆盖旧清单。status: pending | in_progress | completed | cancelled。复杂多步任务开始时先写清单，推进时更新；同时最多一个 in_progress。',
      parameters: todoParams,
      executionMode: 'sequential',
      execute: async (_id, params, _signal, _onUpdate, ctx) => {
        const p = params as Static<typeof todoParams>
        if (!ctx.todoService) {
          return {
            content: text('todo 服务不可用'),
            details: { ok: false, summary: 'todo 服务不可用', error: 'no_todo_service' }
          }
        }
        const todos = await ctx.todoService.replace(
          ctx.projectId,
          ctx.sessionId,
          (p.todos || []).map((t) => ({
            id: t.id,
            content: t.content,
            status: t.status
          }))
        )
        const summary = todoSummary(todos)
        const body = formatTodoList(todos)
        return {
          content: text(`${summary}\n\n${body}`),
          details: { ok: true, summary, data: { todos } }
        }
      }
    }
  ]
}
