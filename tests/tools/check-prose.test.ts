import { describe, it, expect } from 'vitest'
import { checkProse, hanCount, totalCharCount } from '../../src/shared/check-prose'

describe('checkProse 硬禁令检查', () => {
  it('统计汉字数', () => {
    expect(hanCount('你好世界')).toBe(4)
    expect(hanCount('abc 123')).toBe(0)
  })

  it('统计总字数（非空白字符）', () => {
    expect(totalCharCount('你好世界')).toBe(4)
    expect(totalCharCount('你好，世界。abc 123')).toBe(12)
    expect(totalCharCount('  你好 世界\n')).toBe(4)
    expect(totalCharCount('')).toBe(0)
  })

  it('checkProse 返回总字数与汉字数', () => {
    const result = checkProse('你好世界，abc 123。')
    expect(result.totalCount).toBeGreaterThan(result.hanCount)
    expect(result.totalCount).toBe(12)
    expect(result.hanCount).toBe(4)
    expect(result.counts.totalCount).toBe(12)
  })

  it('识别禁用冒号（非引语）', () => {
    const result = checkProse('一句话总结：这是重点。')
    expect(result.failures.some((f) => f.message.includes('冒号'))).toBe(true)
    expect(result.pass).toBe(false)
  })

  it('允许引出原话的冒号', () => {
    const result = checkProse('他说：“好。”\n\n她说：“不好。”')
    const colonFailure = result.failures.filter((f) => f.message.includes('冒号'))
    expect(colonFailure.length).toBe(0)
  })

  it('识别破折号', () => {
    const result = checkProse('他突然抬头——窗外很安静。')
    expect(result.failures.some((f) => f.message.includes('破折号'))).toBe(true)
  })

  it('识别翻案句', () => {
    const result = checkProse('这不是运气，而是实力。')
    expect(result.failures.some((f) => f.message.includes('翻案'))).toBe(true)
  })

  it('识别硬黑话', () => {
    const result = checkProse('我们要赋能团队，打造商业闭环。')
    expect(result.failures.some((f) => f.message.includes('黑话'))).toBe(true)
  })

  it('识别模型路标', () => {
    const result = checkProse('值得注意的是，这件事很重要。')
    expect(result.failures.some((f) => f.message.includes('路标'))).toBe(true)
  })

  it('识别硬停词', () => {
    const result = checkProse('说白了，这件事不复杂。')
    expect(result.failures.some((f) => f.message.includes('硬停'))).toBe(true)
  })

  it('无违规时 pass 为 true', () => {
    const result = checkProse('他毕业后离开上海，去了成都。那套量化程序已经跑过一段时间，他觉得可以全职试试。')
    expect(result.pass).toBe(true)
  })

  it('屏蔽代码块与网址', () => {
    const result = checkProse('正文内容：\n\n```python\nprint("你好")\n```\n\nhttps://example.com\n\n正常文字继续。')
    // 代码块里的 print("你好") 冒号位于代码块内，不应单独触发检查
    const codeColon = result.failures.filter((f) => f.message.includes('冒号') && f.line >= 3 && f.line <= 5)
    expect(codeColon).toHaveLength(0)
  })

  it('识别名词化句式', () => {
    const result = checkProse('我们对流程进行了优化。')
    expect(result.warnings.some((w) => w.message.includes('名词化'))).toBe(true)
  })

  it('识别同构排比', () => {
    const result = checkProse('为什么出发，为什么放弃，为什么坚持，为什么离开。')
    expect(result.warnings.some((w) => w.message.includes('排比'))).toBe(true)
  })

  it('识别抒情词', () => {
    const result = checkProse('微光落在褶皱里，丰盈而滚烫。')
    expect(result.warnings.some((w) => w.message.includes('抒情'))).toBe(true)
  })

  it('识别借喻簇', () => {
    const result = checkProse('战场上响起枪响，引擎轰鸣，浪潮拍岸，仓库的门锁锈死了。')
    expect(result.warnings.some((w) => w.message.includes('借喻'))).toBe(true)
  })

  it('空文本返回无汉字', () => {
    const result = checkProse('')
    expect(result.hanCount).toBe(0)
    expect(result.totalCount).toBe(0)
    expect(result.counts.totalCount).toBe(0)
  })
})

