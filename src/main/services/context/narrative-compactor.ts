/**
 * Narrative Compaction（P3）：NarrativeCheckpoint v1
 *
 * 原始 JSONL 永远是事实源。checkpoint 是派生数据：
 * - 每个事实、人物状态、时间线事件和伏笔必须有 sourceIds。
 * - sourceHash 与当前 branch 不匹配时自动失效。
 * - 用户明确否定、删除或更正的内容进入 rejectedDirections / hardConstraints。
 * - 生成失败时保留原始历史，不能写“空摘要”作为替代。
 */
import { createHash } from 'crypto'
import { CHECKPOINT_TYPE, CHECKPOINT_PROMPT_VERSION } from './types'

export interface CheckpointSourceRange {
  firstEntryId: string
  lastEntryId: string
  sourceHash: string
}

export interface CanonFact {
  fact: string
  sourceIds: string[]
  confidence: 'confirmed' | 'inferred'
}

export interface CharacterState {
  id: string
  state: string
  goal: string
  relationshipChanges: string[]
  sourceIds: string[]
}

export interface TimelineEvent {
  order: number
  event: string
  timeLabel: string
  sourceIds: string[]
}

export interface OpenThread {
  thread: string
  owner: string
  plannedPayoff: string
  sourceIds: string[]
}

export interface ToolEffect {
  tool: string
  resourceId: string
  result: string
  sourceMessageIds: string[]
}

export interface ReasoningDigest {
  decision: string
  evidence: string[]
  sourceMessageIds: string[]
}

export interface NarrativeCheckpoint {
  type: typeof CHECKPOINT_TYPE
  sessionId: string
  branchHeadId: string
  sourceRange: CheckpointSourceRange
  createdAt: string
  narrative: {
    userGoal: string
    deliverable: string
    hardConstraints: string[]
    rejectedDirections: string[]
    styleContract: {
      language: string
      pov: string
      tense: string
      tone: string[]
    }
    canonFacts: CanonFact[]
    characters: CharacterState[]
    timeline: TimelineEvent[]
    outlineState: {
      activeBeatIds: string[]
      completedBeatIds: string[]
      nextBeatIds: string[]
    }
    openThreads: OpenThread[]
    todoState: unknown[]
    toolEffects: ToolEffect[]
    reasoningDigest: ReasoningDigest[]
    unresolvedQuestions: string[]
  }
  retainedTail: {
    firstEntryId: string
    lastEntryId: string
  }
  generator: {
    model: string
    promptVersion: string
  }
}

export function checkpointSourceHash(range: {
  firstEntryId: string
  lastEntryId: string
  branchHeadId: string
}): string {
  return `sha256:${createHash('sha256')
    .update(`${range.branchHeadId}|${range.firstEntryId}|${range.lastEntryId}`, 'utf8')
    .digest('hex')}`
}

/** 压缩指令：面向长篇创作的结构化要求（替代通用 compaction 一句话） */
export function buildNarrativeCheckpointInstructions(): string {
  return `请把以上对话压缩为结构化叙事检查点（JSON，schema 见系统说明）。

必须覆盖：
- userGoal 用户当前目标；deliverable 交付物。
- hardConstraints 用户明确坚持的约束；rejectedDirections 用户明确否定/删除/更正的方向（不得只保留正向摘要）。
- styleContract：语言、视角、时态、基调。
- canonFacts：已确认事实，每一条都必须带 sourceIds；未确认的只能标 confidence=inferred。
- characters：人物状态、目标、关系变化，带 sourceIds。
- timeline：时间线事件（order 为顺序），带 sourceIds。
- outlineState：activeBeatIds / completedBeatIds / nextBeatIds。
- openThreads：未兑现伏笔，带 owner 与 plannedPayoff。
- toolEffects：write/edit/delete 等工具对资源的修改结果，带 sourceMessageIds。
- reasoningDigest：决策摘要（decision + evidence + sourceMessageIds），不输出逐字思维链。
- unresolvedQuestions：尚未解决的问题。

规则：
- 每个事实必须有来源；来源不明的内容写入 unresolvedQuestions。
- 用户明确否定过的方向必须进入 rejectedDirections。
- 压缩失败时保留原始历史，不要写“空摘要”。
- 输出必须是合法 JSON，使用 dreamagent.compaction.v1 的 schema。`
}

export interface CheckpointValidationResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/** 压缩质量守护（§13.3） */
export function validateCheckpoint(
  checkpoint: NarrativeCheckpoint
): CheckpointValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!checkpoint.type || checkpoint.type !== CHECKPOINT_TYPE) {
    errors.push('checkpoint.type 缺失或不匹配')
  }
  if (!checkpoint.branchHeadId) errors.push('checkpoint.branchHeadId 缺失')
  if (!checkpoint.sourceRange?.sourceHash) errors.push('checkpoint.sourceRange.sourceHash 缺失')
  if (!checkpoint.createdAt) errors.push('checkpoint.createdAt 缺失')
  if (!checkpoint.generator?.promptVersion) {
    errors.push('checkpoint.generator.promptVersion 缺失')
  }

  const n = checkpoint.narrative
  if (!n) {
    errors.push('checkpoint.narrative 缺失')
    return { ok: errors.length === 0, errors, warnings }
  }

  for (const fact of n.canonFacts ?? []) {
    if (!Array.isArray(fact.sourceIds) || fact.sourceIds.length === 0) {
      errors.push(`canonFact 缺少 sourceIds: ${fact.fact.slice(0, 60)}`)
    }
    if (fact.confidence !== 'confirmed' && fact.confidence !== 'inferred') {
      warnings.push(`canonFact confidence 非法: ${fact.fact.slice(0, 60)}`)
    }
  }
  for (const c of n.characters ?? []) {
    if (!Array.isArray(c.sourceIds) || c.sourceIds.length === 0) {
      warnings.push(`character ${c.id} 缺少 sourceIds`)
    }
  }
  for (const ev of n.timeline ?? []) {
    if (!Array.isArray(ev.sourceIds) || ev.sourceIds.length === 0) {
      warnings.push(`timeline event ${ev.event.slice(0, 40)} 缺少 sourceIds`)
    }
  }
  for (const t of n.openThreads ?? []) {
    if (!Array.isArray(t.sourceIds) || t.sourceIds.length === 0) {
      warnings.push(`openThread ${t.thread.slice(0, 40)} 缺少 sourceIds`)
    }
  }
  for (const e of n.toolEffects ?? []) {
    if (!Array.isArray(e.sourceMessageIds) || e.sourceMessageIds.length === 0) {
      warnings.push(`toolEffect ${e.tool}:${e.resourceId} 缺少 sourceMessageIds`)
    }
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** 分支 / 源消息被编辑后 checkpoint 自动失效 */
export function isCheckpointStale(
  checkpoint: NarrativeCheckpoint,
  currentBranchHeadId: string
): boolean {
  if (!checkpoint.branchHeadId) return true
  if (checkpoint.branchHeadId !== currentBranchHeadId) return true
  const expected = checkpointSourceHash({
    firstEntryId: checkpoint.sourceRange.firstEntryId,
    lastEntryId: checkpoint.sourceRange.lastEntryId,
    branchHeadId: checkpoint.branchHeadId
  })
  return checkpoint.sourceRange.sourceHash !== expected
}
