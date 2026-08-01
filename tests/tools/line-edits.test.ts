import { describe, expect, it } from 'vitest'
import {
  applyLineEdits,
  applyParagraphEdits
} from '../../src/main/services/graph-path'

describe('按行和段落编辑', () => {
  it('按行替换并保留原有换行', () => {
    const content = '第一行\n第二行\n\n第三行'
    const result = applyLineEdits(content, [
      { startLine: 2, expectedText: '第二行', newText: '替换后的第二行' }
    ])
    expect(result).toBe('第一行\n替换后的第二行\n\n第三行')
  })

  it('支持连续多行和 CRLF', () => {
    const content = '第一行\r\n第二行\r\n第三行'
    const result = applyLineEdits(content, [
      { startLine: 2, endLine: 3, expectedText: '第二行\n第三行', newText: '新二行\n新三行' }
    ])
    expect(result).toBe('第一行\r\n新二行\r\n新三行')
  })

  it('expectedText 不匹配时拒绝修改', () => {
    expect(() =>
      applyLineEdits('第一行\n第二行', [
        { startLine: 2, expectedText: '已经过期', newText: '新内容' }
      ])
    ).toThrow('expectedText 校验失败')
  })

  it('重叠行编辑会整体失败', () => {
    expect(() =>
      applyLineEdits('一\n二\n三', [
        { startLine: 1, endLine: 2, expectedText: '一\n二', newText: '甲' },
        { startLine: 2, expectedText: '二', newText: '乙' }
      ])
    ).toThrow('重叠区间')
  })

  it('按空行分隔的段落替换', () => {
    const content = '第一段\n第二行\n\n第二段'
    const result = applyParagraphEdits(content, [
      { paragraph: 2, expectedText: '第二段', newText: '修改后的第二段' }
    ])
    expect(result).toBe('第一段\n第二行\n\n修改后的第二段')
  })
})
