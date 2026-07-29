/**
 * 会话级待办（Agent todo 工具）
 */
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled'

export interface TodoItem {
  id: string
  content: string
  status: TodoStatus
}

export interface TodoListState {
  todos: TodoItem[]
  updatedAt: string
}
