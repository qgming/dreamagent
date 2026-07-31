/**
 * Context 策略与校验测试（P3）
 *
 * - validateRoleSequence：角色序列邻接
 * - 确定性检索评分（explicit > pin > graph > semantic）
 * - NarrativeCheckpoint 校验与分支失效
 * - ReasoningReplayPolicy 跨模型策略
 */
import { describe, expect, it } from 'vitest'
import { validateRoleSequence } from '../../src/main/services/context/context-validator'
import {
  rankCandidates,
  scoreCandidate
} from '../../src/main/services/context/context-retriever'
import {
  validateCheckpoint,
  isCheckpointStale,
  checkpointSourceHash,
  type NarrativeCheckpoint
} from '../../src/main/services/context/narrative-compactor'
import {
  resolveReasoningReplayPolicy,
  modelKey
} from '../../src/main/services/context/reasoning-replay'

describe('validateRoleSequence', () => {
  it('toolResult 配对顺序正确', () => {
    expect(validateRoleSequence(['user', 'assistant', 'toolResult', 'user']).ok).toBe(true)
  })
})

describe('确定性检索评分（P3）', () => {
  it('显式引用 > pin > 图谱 > 语义', () => {
    expect(scoreCandidate({ sourceId: 'a', explicitMention: true })).toBeGreaterThan(
      scoreCandidate({ sourceId: 'b', pin: true })
    )
    expect(scoreCandidate({ sourceId: 'b', pin: true })).toBeGreaterThan(
      scoreCandidate({ sourceId: 'c', graphRelation: 1 })
    )
    expect(scoreCandidate({ sourceId: 'c', graphRelation: 1 })).toBeGreaterThan(
      scoreCandidate({ sourceId: 'd', semanticRelevance: 1 })
    )
  })

  it('同分按 sourceId 稳定排序', () => {
    const hits = rankCandidates(
      [
        { sourceId: 'b', semanticRelevance: 0.5 },
        { sourceId: 'a', semanticRelevance: 0.5 }
      ],
      { query: 'q' }
    )
    expect(hits[0]!.sourceId).toBe('a')
    expect(hits[1]!.sourceId).toBe('b')
  })
})

describe('NarrativeCheckpoint（P3）', () => {
  const checkpoint: NarrativeCheckpoint = {
    type: 'dreamagent.narrative_checkpoint.v1',
    sessionId: 'sess_1',
    branchHeadId: 'e_9',
    sourceRange: {
      firstEntryId: 'e_1',
      lastEntryId: 'e_9',
      sourceHash: checkpointSourceHash({ firstEntryId: 'e_1', lastEntryId: 'e_9', branchHeadId: 'e_9' })
    },
    createdAt: '2026-07-31T00:00:00.000Z',
    narrative: {
      userGoal: '写完第三章',
      deliverable: 'chapters/c_3',
      hardConstraints: ['不引入新角色'],
      rejectedDirections: ['废弃侦探线'],
      styleContract: { language: 'zh-CN', pov: '第三人称', tense: '过去时', tone: ['悬疑'] },
      canonFacts: [
        { fact: '主角叫林晚', sourceIds: ['entity:e_1'], confidence: 'confirmed' }
      ],
      characters: [
        { id: 'entity:e_1', state: '受困', goal: '逃出', relationshipChanges: [], sourceIds: ['m_1'] }
      ],
      timeline: [{ order: 1, event: '暴雨', timeLabel: '第三章开头', sourceIds: ['m_2'] }],
      outlineState: { activeBeatIds: ['beat_3'], completedBeatIds: ['beat_2'], nextBeatIds: ['beat_4'] },
      openThreads: [
        { thread: '神秘信件', owner: 'entity:e_2', plannedPayoff: '第四章揭示', sourceIds: ['m_3'] }
      ],
      todoState: [],
      toolEffects: [{ tool: 'write', resourceId: 'chapter:c_3', result: 'updated', sourceMessageIds: ['m_4'] }],
      reasoningDigest: [{ decision: '继续写第三章', evidence: ['m_2'], sourceMessageIds: ['m_2'] }],
      unresolvedQuestions: ['信件是谁寄的']
    },
    retainedTail: { firstEntryId: 'e_6', lastEntryId: 'e_9' },
    generator: { model: 'test', promptVersion: 'dreamagent.compaction.v1' }
  }

  it('校验通过：全部事实带 sourceIds', () => {
    const r = validateCheckpoint(checkpoint)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it('分支切换后 checkpoint 失效', () => {
    expect(isCheckpointStale(checkpoint, 'e_9')).toBe(false)
    expect(isCheckpointStale(checkpoint, 'e_10')).toBe(true)
  })

  it('缺失 sourceIds 的事实导致校验失败', () => {
    const bad = structuredClone(checkpoint)
    bad.narrative.canonFacts = [
      { fact: '无来源事实', sourceIds: [], confidence: 'confirmed' }
    ]
    const r = validateCheckpoint(bad)
    expect(r.ok).toBe(false)
  })
})

describe('ReasoningReplayPolicy（P3）', () => {
  it('同模型有 signature → native_same_model', () => {
    const key = modelKey('p', 'openai-completions', 'm')
    const p = resolveReasoningReplayPolicy({
      previousModelKey: key,
      currentModelKey: key,
      hasValidSignature: true
    })
    expect(p.mode).toBe('native_same_model')
    expect(p.includeSignatures).toBe(true)
  })

  it('跨模型 → decision_summary_cross_model，不发送不兼容 signature', () => {
    const p = resolveReasoningReplayPolicy({
      previousModelKey: modelKey('a', 'openai-completions', 'm1'),
      currentModelKey: modelKey('b', 'anthropic-messages', 'm2'),
      hasValidSignature: true
    })
    expect(p.mode).toBe('decision_summary_cross_model')
    expect(p.includeSignatures).toBe(false)
  })

  it('error/aborted 前一轮 → omit', () => {
    const key = modelKey('p', 'openai-completions', 'm')
    const p = resolveReasoningReplayPolicy({
      previousModelKey: key,
      currentModelKey: key,
      hasValidSignature: true,
      previousTurnFailed: true
    })
    expect(p.mode).toBe('omit')
  })
})
