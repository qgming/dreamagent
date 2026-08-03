import { describe, expect, it } from 'vitest'
import {
  applyGoalAuditJsonMode,
  GOAL_AUDIT_SYSTEM_PROMPT
} from '../src/main/services/agent/goal-audit-prompts'

describe('goal audit response format', () => {
  it('documents the fixed multiline JSON shape', () => {
    expect(GOAL_AUDIT_SYSTEM_PROMPT).toContain('必须只返回一个合法 JSON 对象')
    expect(GOAL_AUDIT_SYSTEM_PROMPT).toContain('"status": "complete"')
    expect(GOAL_AUDIT_SYSTEM_PROMPT).toContain('"nextStep": ""')
    expect(GOAL_AUDIT_SYSTEM_PROMPT).toContain('"evidence": [')
  })

  it('enables JSON mode only for OpenAI Chat Completions payloads', () => {
    const payload = { model: 'audit-model', messages: [] }
    expect(applyGoalAuditJsonMode(payload, 'openai-completions')).toMatchObject({
      response_format: { type: 'json_object' }
    })
    expect(applyGoalAuditJsonMode(payload, 'anthropic-messages')).toBe(payload)
    expect(applyGoalAuditJsonMode(payload, 'openai-responses')).toBe(payload)
  })
})
