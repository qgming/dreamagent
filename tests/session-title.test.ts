import { describe, expect, it, vi } from 'vitest'
import {
  fallbackSessionTitle,
  normalizeSessionTitle,
  SESSION_TITLE_MAX_LENGTH
} from '../src/main/services/session/session-title'
import { SessionTitleService } from '../src/main/services/session/session-title-service'
import type { PiModelsService } from '../src/main/services/llm/pi-models'

describe('session title helpers', () => {
  it('uses the first 20 user characters as the fallback', () => {
    expect(fallbackSessionTitle('请分析第三章的人物动机，以及后续内容还有更多')).toBe(
      '请分析第三章的人物动机，以及后续内容还有'
    )
  })

  it('cleans AI output and enforces the 20-character limit', () => {
    expect(normalizeSessionTitle('标题：网络小说口语化优化\n这里不应出现')).toBe('网络小说口语化优化')
    expect(normalizeSessionTitle(`标题：${'很长的标题'.repeat(10)}`)).toHaveLength(
      SESSION_TITLE_MAX_LENGTH
    )
  })

  it('counts Unicode code points and trims only the input boundary', () => {
    expect(fallbackSessionTitle('  😀一二三四五六七八九十')).toBe('😀一二三四五六七八九十')
    expect(fallbackSessionTitle('  \n\t ')).toBe('')
  })

  it('uses one independent non-streaming call and falls back to the input on failure', async () => {
    const completeSimple = vi.fn().mockRejectedValue(new Error('offline'))
    const model = { id: 'title-model' }
    const models = { completeSimple }
    const modelService = {
      getModelsAndDefault: vi.fn().mockResolvedValue({ models, model })
    } as unknown as PiModelsService

    const input = '请把这段网络小说改得更口语、更适合听书播放，还有后续要求'
    const title = await new SessionTitleService(modelService).generate(input)

    expect(title).toBe(fallbackSessionTitle(input))
    expect(completeSimple).toHaveBeenCalledTimes(1)
    expect(completeSimple).toHaveBeenCalledWith(
      model,
      expect.objectContaining({
        systemPrompt: expect.any(String),
        messages: [{ role: 'user', content: expect.stringContaining(input), timestamp: expect.any(Number) }]
      }),
      expect.objectContaining({ maxRetries: 0, metadata: { purpose: 'session-title' } })
    )
  })

  it('falls back when the completion resolves with an error response', async () => {
    const completeSimple = vi.fn().mockResolvedValue({
      role: 'assistant',
      content: [{ type: 'text', text: '残缺标题' }],
      stopReason: 'error',
      errorMessage: 'Stream ended without finish_reason'
    })
    const model = { id: 'title-model' }
    const modelService = {
      getModelsAndDefault: vi.fn().mockResolvedValue({
        models: { completeSimple },
        model
      })
    } as unknown as PiModelsService

    const input = '请把这段网络小说改得更口语，并检查听书时是否流畅'
    await expect(new SessionTitleService(modelService).generate(input)).resolves.toBe(
      fallbackSessionTitle(input)
    )
  })
})
