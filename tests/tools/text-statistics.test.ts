import { describe, expect, it } from 'vitest'
import { analyzeText, compareText } from '../../src/shared/text-statistics'

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
    expect(driving.profile?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'dialogue-ratio-low-soft', severity: 'info' })
      ])
    )
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

  it('返回句长和段落长度分布，而不是只有平均值', () => {
    const report = analyzeText('甲乙。甲乙丙丁。甲乙丙丁戊己。\n\n短段。', {
      profile: 'basic'
    })

    expect(report.summary.sentenceLength).toMatchObject({
      average: 4.5,
      median: 4,
      p10: 3,
      p90: 6.4
    })
    expect(report.summary.paragraphLength).toMatchObject({
      average: 9,
      median: 9,
      p10: 4.2,
      p90: 13.8
    })
    expect(report.paragraphs.map((paragraph) => paragraph.visibleCharCount)).toEqual([15, 3])
  })

  it('能定位重复句和句首重复，但不把它们自动变成扣分项', () => {
    const report = analyzeText('他看向了那扇门。他看向了那扇门。他看向了那扇门。', {
      profile: 'story-humanizer'
    })

    expect(report.summary.exactRepeatedSentenceCount).toBe(2)
    expect(report.summary.sentenceStartRepeatRatio).toBe(0.667)
    expect(report.profile?.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'repeated-sentences', severity: 'info' }),
        expect.objectContaining({ code: 'sentence-start-repetition', severity: 'info' })
      ])
    )
    expect(report.profile?.structureScore).toBe(100)
  })

  it('用作者参考样本返回中位数、范围和来源标签', () => {
    const report = analyzeText('短句。', {
      referenceTexts: ['短句。稍长一点。', '短句。'],
      referenceLabels: ['认可章节 A', '认可章节 B']
    })

    expect(report.baseline).toMatchObject({
      sampleCount: 2,
      labels: ['认可章节 A', '认可章节 B']
    })
    expect(report.baseline?.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'sentenceEndDensityPerThousand' })
      ])
    )
  })

  it('比较修改前后数字、保护词和对白变化', () => {
    const before = '第3章，林舟在七号楼等候。\n“我有20%的把握。”'
    const after = '第3章，林舟在七号楼等候。\n“我有10%的把握。”'
    const changedNumber = compareText(before, after, ['林舟', '七号楼'])

    expect(changedNumber.preserved).toBe(false)
    expect(changedNumber.removedNumbers).toEqual(['20%'])
    expect(changedNumber.addedNumbers).toEqual(['10%'])
    expect(changedNumber.removedDialogueCount).toBe(0)
    expect(changedNumber.findings.map((finding) => finding.code)).toContain('protected-number-removed')

    const removedTerm = compareText('林舟去了七号楼。', '他去了楼下。', ['林舟', '七号楼'])
    expect(removedTerm.findings.map((finding) => finding.code)).toContain('protected-term-removed')

    const removedDialogue = compareText('“走。”他说。', '他说。')
    expect(removedDialogue.removedDialogueCount).toBe(1)
    expect(removedDialogue.findings.map((finding) => finding.code)).toContain('dialogue-removed')
  })
})
