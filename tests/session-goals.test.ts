import { describe, expect, it } from 'vitest'
import type { SessionTreeEntry } from '@earendil-works/pi-agent-core'
import { parseSessionBranch, readGoalFromBranch } from '../src/main/services/session/pi-session-parser'
import { buildSystemPromptV2 } from '../src/main/services/context/system-prompt'
import { createSessionGoal } from '../src/shared/session-goals'
import { normalizeSessionGoalAudit } from '../src/shared/session-goals'

function customGoal(data: unknown, id: string): SessionTreeEntry {
  return {
    type: 'custom',
    id,
    parentId: null,
    timestamp: '2026-08-03T00:00:00.000Z',
    customType: 'session_goal',
    data
  } as unknown as SessionTreeEntry
}

function messageEntry(message: unknown, id = 'message_1'): SessionTreeEntry {
  return {
    type: 'message',
    id,
    parentId: null,
    timestamp: '2026-08-03T00:00:00.000Z',
    message
  } as unknown as SessionTreeEntry
}

describe('session goal mode', () => {
  it('loads the latest valid goal snapshot from the active branch', () => {
    const first = createSessionGoal('完成第一稿', new Date('2026-08-03T00:00:00.000Z'))
    const second = { ...first, status: 'paused' as const, statusReason: '用户暂停' }
    expect(readGoalFromBranch([customGoal(first, 'goal_1'), customGoal(second, 'goal_2')])).toMatchObject({
      objective: '完成第一稿',
      status: 'paused',
      statusReason: '用户暂停'
    })
  })

  it('ignores malformed goal entries', () => {
    expect(readGoalFromBranch([customGoal({ id: 'bad', status: 'active' }, 'goal_bad')])).toBeNull()
  })

  it('injects active goals into the system prompt as local project data', () => {
    const goal = createSessionGoal('完成第三章并验证人物状态', new Date('2026-08-03T00:00:00.000Z'))
    const result = buildSystemPromptV2({
      project: { title: '测试项目', summary: '梗概', outlineLines: [] },
      workset: {
        pinnedBeats: [],
        pinnedEntities: [],
        todos: [],
        explicitRefs: [],
        goal
      },
      skillsBlock: '',
      mcpBlock: '',
      sessionId: 'sess_1'
    })
    expect(result.systemPrompt).toContain('<session_goal trust="local_project_data" status="active">')
    expect(result.systemPrompt).toContain('完成第三章并验证人物状态')
    expect(result.systemPrompt).toContain('已完成、已验证、待完成')
  })

  it('accepts only explicit audit decisions', () => {
    expect(normalizeSessionGoalAudit({
      status: 'continue',
      progress: '已完成文件写入',
      nextStep: '运行验证',
      evidence: ['章节已存在']
    })).toMatchObject({ status: 'continue', nextStep: '运行验证' })
    expect(normalizeSessionGoalAudit({ status: 'complete', progress: '已验证', evidence: [] }))
      .toMatchObject({ status: 'complete' })
    expect(normalizeSessionGoalAudit({ status: 'complete', progress: '' })).toBeNull()
    expect(normalizeSessionGoalAudit({ status: 'continue', progress: '还没完' })).toBeNull()
  })

  it('preserves aborted assistant turns for goal audit context', () => {
    const messages = parseSessionBranch([
      messageEntry({
        role: 'assistant',
        content: [{ type: 'text', text: '执行到一半被中止' }],
        stopReason: 'aborted',
        timestamp: Date.now()
      })
    ])
    expect(messages[0]).toMatchObject({ role: 'assistant', status: 'aborted' })
  })
})
