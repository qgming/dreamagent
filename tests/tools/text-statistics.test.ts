import { describe, expect, it } from 'vitest'
import { analyzeText } from '../../src/shared/text-statistics'

describe('text_stats 文本统计', () => {
  it('统计行、段、句子和查询词位置', () => {
    const report = analyzeText('第一行的文字。\n第二行仿佛下雨了。\n\n“你来了？”他说。', {
      terms: ['仿佛', '的'],
      includeContext: true
    })

    expect(report.summary.lineCount).toBe(4)
    expect(report.summary.paragraphCount).toBe(2)
    expect(report.summary.sentenceCount).toBe(4)
    expect(report.summary.deCount).toBe(1)
    expect(report.paragraphs[0]).toMatchObject({
      paragraph: 1,
      startLine: 1,
      endLine: 2,
      sentenceCount: 2
    })

    const term = report.terms.find((item) => item.term === '仿佛')!
    expect(term.count).toBe(1)
    expect(term.lineHits[0]).toMatchObject({ line: 2, paragraph: 1, count: 1 })
    expect(term.lineHits[0]!.contexts?.[0]).toContain('仿佛')
  })

  it('按段返回查询词计数，并排除引号本身的对话字符', () => {
    const report = analyzeText('他说：“好。”\n\n她说：“不好。”', {
      terms: ['说', '好'],
      includeParagraphTermCounts: true
    })

    expect(report.paragraphs[0]!.termCounts).toEqual({ 说: 1, 好: 1 })
    expect(report.paragraphs[1]!.termCounts).toEqual({ 说: 1, 好: 1 })
    expect(report.summary.dialogueCharCount).toBe(5)
    expect(report.summary.dialogueRatio).toBeGreaterThan(0)
  })

  it('story-humanizer profile 返回确定性风险和分段结果', () => {
    const report = analyzeText('他突然抬头——窗外很安静。', {
      profile: 'story-humanizer',
      terms: ['突然'],
      segmentCount: 3
    })

    expect(report.profile?.ruleVersion).toBe('story-humanizer-v2')
    expect(report.profile?.segments).toHaveLength(1)
    expect(report.profile?.findings.some((item) => item.code === 'dash-present')).toBe(true)
    expect(report.terms.some((item) => item.term === '突然' && item.count === 1)).toBe(true)
    expect(report.profile?.findings.some((item) => item.code === 'dialogue-ratio-low')).toBe(false)
  })

  it('不会把普通词语自动当作禁词', () => {
    const report = analyzeText('他突然抬头，仿佛听见了什么。', {
      profile: 'story-humanizer'
    })

    expect(report.terms).toEqual([])
  })

  it('对话要求按章节类型放宽', () => {
    const text = '他走过长廊。灯坏了。门也锁着。'
    const none = analyzeText(text, {
      profile: 'story-humanizer',
      dialogueExpectation: 'none'
    })
    const some = analyzeText(text, {
      profile: 'story-humanizer',
      dialogueExpectation: 'some'
    })
    const driving = analyzeText(text, {
      profile: 'story-humanizer',
      dialogueExpectation: 'driving'
    })

    expect(none.profile?.findings.some((item) => item.code === 'dialogue-absent')).toBe(false)
    expect(none.profile?.findings.some((item) => item.code === 'long-narration-runs')).toBe(false)
    expect(some.profile?.findings.some((item) => item.code === 'dialogue-absent')).toBe(true)
    expect(driving.profile?.findings.some((item) => item.code === 'dialogue-ratio-low-soft')).toBe(true)
  })

  it('some 只要求出现对话，不因叙述跨度扣分', () => {
    const text = '他走过长廊。灯坏了。门也锁着。\n\n“有人吗？”门里传来声音。'
    const some = analyzeText(text, {
      profile: 'story-humanizer',
      dialogueExpectation: 'some'
    })

    expect(some.profile?.findings.some((item) => item.code === 'dialogue-absent')).toBe(false)
    expect(some.profile?.findings.some((item) => item.code === 'long-narration-runs')).toBe(false)
  })

  it('限制高频词的样本位置，但保留完整次数', () => {
    const report = analyzeText('的的的的的', {
      terms: ['的'],
      maxMatches: 2
    })

    expect(report.terms[0]!.count).toBe(5)
    expect(report.terms[0]!.lineHits[0]!.count).toBe(5)
    expect(report.terms[0]!.lineHits[0]!.columns).toHaveLength(2)
    expect(report.terms[0]!.truncated).toBe(true)
  })
})
