/** 会话目标模式的持久化契约。目标属于会话，不属于项目全局。 */
export type SessionGoalStatus = 'active' | 'paused' | 'blocked' | 'complete'

export const SESSION_GOAL_OBJECTIVE_LIMIT = 5000
export const SESSION_GOAL_NOTE_LIMIT = 1200

export interface SessionGoal {
  id: string
  objective: string
  status: SessionGoalStatus
  note: string
  statusReason: string
  createdAt: string
  updatedAt: string
}

const STATUSES = new Set<SessionGoalStatus>([
  'active',
  'paused',
  'blocked',
  'complete'
])

/** 从 custom entry 读取时做容错，避免损坏数据进入 system prompt。 */
export function normalizeSessionGoal(value: unknown): SessionGoal | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const objective = typeof raw.objective === 'string' ? raw.objective.trim() : ''
  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const status = raw.status
  if (!id || !objective || typeof status !== 'string' || !STATUSES.has(status as SessionGoalStatus)) {
    return null
  }

  const now = new Date().toISOString()
  return {
    id,
    objective: objective.slice(0, SESSION_GOAL_OBJECTIVE_LIMIT),
    status: status as SessionGoalStatus,
    note: typeof raw.note === 'string' ? raw.note.slice(0, SESSION_GOAL_NOTE_LIMIT) : '',
    statusReason: typeof raw.statusReason === 'string' ? raw.statusReason.slice(0, 280) : '',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  }
}

export interface SessionGoalAuditDecision {
  status: 'complete' | 'continue'
  progress: string
  nextStep: string
  evidence: string[]
}

/** 审计 harness 只接受明确的 complete / continue 结果。 */
export function normalizeSessionGoalAudit(value: unknown): SessionGoalAuditDecision | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.status !== 'complete' && raw.status !== 'continue') return null
  const progress = typeof raw.progress === 'string' ? raw.progress.trim() : ''
  const nextStep = typeof raw.nextStep === 'string' ? raw.nextStep.trim() : ''
  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8)
    : []
  if (!progress || (raw.status === 'continue' && !nextStep)) return null
  return {
    status: raw.status,
    progress: progress.slice(0, SESSION_GOAL_NOTE_LIMIT),
    nextStep: nextStep.slice(0, SESSION_GOAL_NOTE_LIMIT),
    evidence: evidence.map((item) => item.slice(0, 500))
  }
}

export function createSessionGoal(objective: string, now = new Date()): SessionGoal {
  const timestamp = now.toISOString()
  return {
    id: `goal_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    objective: objective.trim().slice(0, SESSION_GOAL_OBJECTIVE_LIMIT),
    status: 'active',
    note: '',
    statusReason: '',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

/** 目标正文是用户数据，注入 XML 数据分区前必须转义结构字符。 */
export function escapeSessionGoalText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
