/**
 * 会话待办服务：内存 + session custom entry 持久化
 * 写入路径仅限 Agent todo 工具；UI 只读展示，不可手动清理。
 */
import type { TodoItem, TodoListState, TodoStatus } from '../../../shared/todos'
import { SESSION_ENTRY } from '../../../shared/agent-events'
import type { PiSessionService } from '../session/pi-session-service'
import { readLastCustomData } from '../session/pi-session-parser'

function key(projectId: string, sessionId: string): string {
  return `${projectId}::${sessionId}`
}

function nowIso(): string {
  return new Date().toISOString()
}

const VALID: ReadonlySet<TodoStatus> = new Set([
  'pending',
  'in_progress',
  'completed',
  'cancelled'
])

export class TodoService {
  private cache = new Map<string, TodoListState>()

  constructor(private readonly sessions: PiSessionService) {}

  getCached(projectId: string, sessionId: string): TodoItem[] {
    return this.cache.get(key(projectId, sessionId))?.todos ?? []
  }

  async load(projectId: string, sessionId: string): Promise<TodoItem[]> {
    const k = key(projectId, sessionId)
    const hit = this.cache.get(k)
    if (hit) return hit.todos

    try {
      const session = await this.sessions.openSessionObject(projectId, sessionId)
      const branch = await session.getBranch().catch(() => [])
      const data = readLastCustomData<{ todos?: TodoItem[] }>(branch, SESSION_ENTRY.todos)
      const todos = Array.isArray(data?.todos) ? data!.todos.filter(isTodoItem) : []
      this.cache.set(k, { todos, updatedAt: nowIso() })
      return todos
    } catch {
      this.cache.set(k, { todos: [], updatedAt: nowIso() })
      return []
    }
  }

  /**
   * 全量覆盖待办（Claude Code TodoWrite 风格，模型最好用）
   */
  async replace(
    projectId: string,
    sessionId: string,
    rawTodos: Array<{ id?: string; content?: string; status?: string }>
  ): Promise<TodoItem[]> {
    const todos: TodoItem[] = rawTodos.map((t, i) => {
      const content = String(t.content ?? '').trim() || '未命名'
      const status = (VALID.has(t.status as TodoStatus)
        ? t.status
        : 'pending') as TodoStatus
      const id =
        typeof t.id === 'string' && t.id.trim()
          ? t.id.trim()
          : `todo_${i + 1}`
      return { id, content, status }
    })
    return this.persist(projectId, sessionId, todos)
  }

  clearCache(projectId: string, sessionId?: string): void {
    if (!sessionId) {
      for (const k of [...this.cache.keys()]) {
        if (k.startsWith(`${projectId}::`)) this.cache.delete(k)
      }
      return
    }
    this.cache.delete(key(projectId, sessionId))
  }

  private async persist(
    projectId: string,
    sessionId: string,
    todos: TodoItem[]
  ): Promise<TodoItem[]> {
    const state: TodoListState = { todos, updatedAt: nowIso() }
    this.cache.set(key(projectId, sessionId), state)
    try {
      const session = await this.sessions.openSessionObject(projectId, sessionId)
      await session.appendCustomEntry(SESSION_ENTRY.todos, { todos, updatedAt: state.updatedAt })
    } catch (error) {
      console.warn('[todo-service] 持久化失败（仍保留内存）', error)
    }
    return todos
  }
}

function isTodoItem(x: unknown): x is TodoItem {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.content === 'string' &&
    typeof o.status === 'string' &&
    VALID.has(o.status as TodoStatus)
  )
}

export function formatTodoList(todos: TodoItem[]): string {
  if (todos.length === 0) return '（空清单）'
  const icon = (s: TodoStatus): string => {
    switch (s) {
      case 'completed':
        return '[x]'
      case 'in_progress':
        return '[~]'
      case 'cancelled':
        return '[-]'
      default:
        return '[ ]'
    }
  }
  return todos.map((t) => `${icon(t.status)} ${t.id}: ${t.content}`).join('\n')
}

export function todoSummary(todos: TodoItem[]): string {
  const done = todos.filter((t) => t.status === 'completed').length
  const active = todos.filter((t) => t.status === 'in_progress').length
  return `todo · ${todos.length} 项（完成 ${done} · 进行中 ${active}）`
}
