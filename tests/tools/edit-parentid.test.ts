
/**
 * Agent edit 工具：parentId 支持（移动节点/实体到新父级或根）
 */
import { describe, expect, it } from 'vitest'
import { AgentToolRuntime } from '../../src/main/services/agent/agent-tool-runtime'

interface FakeBeat {
  id: string
  title: string
  content: string
  status: string
  parentId: string | null
}

function makeRuntime() {
  const beats: Record<string, FakeBeat> = {
    beat_1: { id: 'beat_1', title: '第一卷', content: '开头', status: 'idea', parentId: null },
    beat_2: { id: 'beat_2', title: '第一章', content: '', status: 'idea', parentId: 'beat_1' },
    beat_3: { id: 'beat_3', title: '第二章', content: '', status: 'idea', parentId: 'beat_1' }
  }
  const calls: Array<{ id: string; patch: Record<string, unknown> }> = []

  const projects = {
    openProject: async () => ({
      meta: { id: 'proj_1', title: 'P' },
      beats,
      entities: {},
      chapters: {},
      index: { beats: { roots: ['beat_1'], children: { beat_1: ['beat_2', 'beat_3'] } } }
    }),
    updateBeat: async (_projectId: string, id: string, patch: Record<string, unknown>) => {
      calls.push({ id, patch })
      Object.assign(beats[id]!, patch)
      return { beats: { ...beats } }
    }
  }

  const runtime = new AgentToolRuntime(projects as never)
  return { runtime, beats, calls }
}

describe('edit 工具 parentId', () => {
  it('edit({ path: "beats/{id}", parentId }) 会调用 updateBeat 并传入新父级', async () => {
    const { runtime, calls } = makeRuntime()
    const result = await runtime.execute('proj_1', 'edit', {
      path: 'beats/beat_2',
      parentId: 'beat_3'
    })
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.id).toBe('beat_2')
    expect(calls[0]!.patch.parentId).toBe('beat_3')
  })

  it('edit({ path, parentId: null }) 表示移到根', async () => {
    const { runtime, calls } = makeRuntime()
    const result = await runtime.execute('proj_1', 'edit', {
      path: 'beats/beat_2',
      parentId: null
    })
    expect(result.ok).toBe(true)
    expect(calls[0]!.patch.parentId).toBeNull()
  })

  it('edit({ path, parentId: "" }) 同样表示移到根', async () => {
    const { runtime, calls } = makeRuntime()
    const result = await runtime.execute('proj_1', 'edit', {
      path: 'beats/beat_2',
      parentId: ''
    })
    expect(result.ok).toBe(true)
    expect(calls[0]!.patch.parentId).toBeNull()
  })

  it('只传 parentId 时不会报 empty_patch', async () => {
    const { runtime, calls } = makeRuntime()
    const result = await runtime.execute('proj_1', 'edit', {
      path: 'beats/beat_2',
      parentId: 'beat_1'
    })
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.patch.parentId).toBe('beat_1')
  })

  it('同时改 status 与 parentId 时走完整更新（reparent 不被状态摘要吞掉）', async () => {
    const { runtime, calls } = makeRuntime()
    const result = await runtime.execute('proj_1', 'edit', {
      path: 'beats/beat_2',
      status: 'draft',
      parentId: 'beat_3'
    })
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.patch.status).toBe('draft')
    expect(calls[0]!.patch.parentId).toBe('beat_3')
  })
})

describe('edit/write 工具 refs 字段（可直接写入 JSON 属性）', () => {
  it('edit 节点直接传 entityRefs / beatRefs（正文无双链）也会写入', async () => {
    const { runtime, calls, beats } = makeRuntime()
    const result = await runtime.execute('proj_1', 'edit', {
      path: 'beats/beat_2',
      entityRefs: ['ent_1', 'ent_2'],
      beatRefs: ['beat_3']
    })
    expect(result.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.patch.entityRefs).toEqual(['ent_1', 'ent_2'])
    expect(calls[0]!.patch.beatRefs).toEqual(['beat_3'])
    expect(beats.beat_2!.entityRefs).toEqual(['ent_1', 'ent_2'])
  })

  it('edit 实体直接传 beatRefs 也会写入', async () => {
    const entities: Record<string, { id: string; name: string; content: string; status: string; parentId: string | null }> = {
      ent_1: { id: 'ent_1', name: '女主', content: '', status: 'active', parentId: null }
    }
    const calls: Array<{ id: string; patch: Record<string, unknown> }> = []
    const projects = {
      openProject: async () => ({
        meta: { id: 'proj_1', title: 'P' },
        beats: {},
        entities,
        chapters: {},
        index: { entities: { roots: ['ent_1'], children: {} } }
      }),
      updateEntity: async (_pid: string, id: string, patch: Record<string, unknown>) => {
        calls.push({ id, patch })
        Object.assign(entities[id]!, patch)
        return { entities: { ...entities } }
      }
    }
    const runtime = new AgentToolRuntime(projects as never)
    const result = await runtime.execute('proj_1', 'edit', {
      path: 'entities/ent_1',
      beatRefs: ['beat_1', 'beat_2']
    })
    expect(result.ok).toBe(true)
    expect(calls[0]!.patch.beatRefs).toEqual(['beat_1', 'beat_2'])
    expect(entities.ent_1!.beatRefs).toEqual(['beat_1', 'beat_2'])
  })

  it('write 覆盖节点时也可直接写 entityRefs', async () => {
    const { runtime, calls } = makeRuntime()
    const result = await runtime.execute('proj_1', 'write', {
      path: 'beats/beat_2',
      entityRefs: ['ent_9']
    })
    expect(result.ok).toBe(true)
    expect(calls[0]!.patch.entityRefs).toEqual(['ent_9'])
  })
})
