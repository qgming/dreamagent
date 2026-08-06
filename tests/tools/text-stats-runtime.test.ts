import { describe, expect, it } from 'vitest'
import { AgentToolRuntime } from '../../src/main/services/agent/agent-tool-runtime'

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

describe('Agent check_prose 与 hash 保护编辑', () => {
  it('可以直接分析 content，并按 path 读取文章检查', async () => {
    const { runtime } = makeRuntime()
    const direct = await runtime.execute('project_1', 'check_prose', {
      content: '说白了，这件事不复杂。'
    })
    expect(direct.ok).toBe(true)
    const data = direct.data as { failures: Array<{ message: string }>; hanCount: number }
    expect(data.hanCount).toBeGreaterThan(0)
    expect(data.failures.some((f) => f.message.includes('硬停'))).toBe(true)

    const chapter = await runtime.execute('project_1', 'check_prose', {
      path: 'chapters/chap_1'
    })
    expect(chapter.ok).toBe(true)
    expect((chapter.data as { hanCount: number }).hanCount).toBeGreaterThan(0)
  })

  it('path 与 content 必须二选一', async () => {
    const { runtime } = makeRuntime()
    const none = await runtime.execute('project_1', 'check_prose', {})
    expect(none.ok).toBe(false)
    expect(none.error).toBe('invalid_source')

    const both = await runtime.execute('project_1', 'check_prose', {
      path: 'chapters/chap_1',
      content: '正文。'
    })
    expect(both.ok).toBe(false)
    expect(both.error).toBe('invalid_source')
  })

  it('path 必须是 chapters/{id}', async () => {
    const { runtime } = makeRuntime()
    const bad = await runtime.execute('project_1', 'check_prose', {
      path: 'beats/beat_1'
    })
    expect(bad.ok).toBe(false)
    expect(bad.error).toBe('invalid_path')
  })

  it('可以读取文章行范围，并用 hash 保护行编辑', async () => {
    const { runtime, chapter } = makeRuntime()
    const range = await runtime.execute('project_1', 'read', {
      path: 'chapters/chap_1',
      startLine: 2,
      endLine: 2
    })
    expect(range.ok).toBe(true)
    expect((range.data as { content: string }).content).toBe('第二行。')

    // 用 expectedSourceHash（hashText 生成）保护编辑，防止基于旧版本误改
    const edited = await runtime.execute('project_1', 'edit', {
      path: 'chapters/chap_1',
      expectedSourceHash: 'stale-hash',
      lineEdits: [{ startLine: 2, expectedText: '第二行。', newText: '修改后的第二行。' }]
    })
    expect(edited.ok).toBe(false)
    expect(edited.error).toContain('expectedSourceHash 校验失败')
  })
})
