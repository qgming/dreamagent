import { describe, expect, it } from 'vitest'
import { AgentToolRuntime } from '../../src/main/services/agent-tool-runtime'

function makeRuntime() {
  const chapter = {
    id: 'chap_1',
    title: '第一章',
    content: '第一行仿佛下雨了。\n第二行。\n\n第三行。',
    status: 'draft',
    updatedAt: '2026-08-02T00:00:00.000Z'
  }
  const projects = {
    getChapter: async () => chapter,
    updateChapter: async (_projectId: string, _chapterId: string, patch: Record<string, unknown>) => {
      Object.assign(chapter, patch)
      return { chapters: { [chapter.id]: chapter } }
    }
  }
  return { runtime: new AgentToolRuntime(projects as never), chapter }
}

describe('Agent text_stats 与范围读取', () => {
  it('可以直接分析 content，并按 path 读取文章统计', async () => {
    const { runtime } = makeRuntime()
    const direct = await runtime.execute('project_1', 'text_stats', {
      content: '仿佛下雨了。',
      terms: ['仿佛']
    })
    expect(direct.ok).toBe(true)
    expect((direct.data as { terms: Array<{ count: number }> }).terms[0]!.count).toBe(1)

    const chapter = await runtime.execute('project_1', 'text_stats', {
      path: 'chapters/chap_1',
      profile: 'story-humanizer'
    })
    expect(chapter.ok).toBe(true)
    expect((chapter.data as { source: { path: string } }).source.path).toBe('chapters/chap_1')
    expect((chapter.data as { profile: { score: number } }).profile.score).toBeTypeOf('number')
  })

  it('可以读取文章行范围，并用统计 hash 保护行编辑', async () => {
    const { runtime, chapter } = makeRuntime()
    const range = await runtime.execute('project_1', 'read', {
      path: 'chapters/chap_1',
      startLine: 2,
      endLine: 2
    })
    expect(range.ok).toBe(true)
    expect((range.data as { content: string }).content).toBe('第二行。')

    const stats = await runtime.execute('project_1', 'text_stats', { path: 'chapters/chap_1' })
    const sourceHash = (stats.data as { source: { sourceHash: string } }).source.sourceHash
    const edited = await runtime.execute('project_1', 'edit', {
      path: 'chapters/chap_1',
      expectedSourceHash: sourceHash,
      lineEdits: [{ startLine: 2, expectedText: '第二行。', newText: '修改后的第二行。' }]
    })
    expect(edited.ok).toBe(true)
    expect(chapter.content).toContain('修改后的第二行。')

    const stale = await runtime.execute('project_1', 'edit', {
      path: 'chapters/chap_1',
      expectedSourceHash: sourceHash,
      lineEdits: [{ startLine: 2, expectedText: '修改后的第二行。', newText: '再次修改。' }]
    })
    expect(stale.ok).toBe(false)
    expect(stale.error).toBe('正文版本已变化，expectedSourceHash 校验失败，请重新统计后再编辑')
  })

  it('支持参考文章比较、来源标签和参考样本上限', async () => {
    const { runtime } = makeRuntime()
    const report = await runtime.execute('project_1', 'text_stats', {
      content: '当前正文。',
      referenceContents: ['参考正文。'],
      referencePaths: ['chapters/chap_ref']
    })

    expect(report.ok).toBe(true)
    expect((report.data as { baseline: { sampleCount: number; labels: string[] } }).baseline).toMatchObject({
      sampleCount: 2,
      labels: ['referenceContents[1]', 'chapters/chap_1（第一章）']
    })

    const tooMany = await runtime.execute('project_1', 'text_stats', {
      content: '正文。',
      referenceContents: Array.from({ length: 21 }, () => '参考。')
    })
    expect(tooMany.ok).toBe(false)
    expect(tooMany.error).toBe('too_many_references')
  })

  it('提供 text_compare 运行时入口', async () => {
    const { runtime } = makeRuntime()
    const result = await runtime.execute('project_1', 'text_compare', {
      before: '林舟有20%的把握。',
      after: '林舟有10%的把握。',
      terms: ['林舟']
    })

    expect(result.ok).toBe(true)
    expect((result.data as { removedNumbers: string[] }).removedNumbers).toEqual(['20%'])
  })
})
