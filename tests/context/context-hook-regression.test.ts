/**
 * P0 回归测试：context hook 整体替换缺陷
 *
 * 复现（§4.2）：
 *   输入 [OLD USER, assistant(thinking+text), NEW USER]
 *   旧 hook 输出 [DYNAMIC] —— 历史、thinking、本轮输入全部丢失。
 *
 * 修复后：
 *   1. 不再注册 replacement context hook（transformContext 恒等）。
 *   2. pins / todo / 显式引用合入 systemPrompt 数据分区（每轮重建）。
 *   3. messages 原样保留：历史、thinking、toolCall/toolResult 邻接完整。
 */
import { describe, expect, it } from 'vitest'
import type { AgentMessage, SessionTreeEntry } from '@earendil-works/pi-agent-core'
import { ContextBuilder } from '../../src/main/services/context/context-builder'
import { buildSystemPromptV2 } from '../../src/main/services/context/system-prompt'
import { validateMessageChain } from '../../src/main/services/context/context-validator'
import { extractContextRefsFromText } from '../../src/shared/context-refs'

/** 最小 fake 项目快照 */
function fakeProject() {
  return {
    meta: { id: 'proj_1', title: '测试项目', description: '梗概文本' },
    index: {
      beats: { roots: ['beat_1'], children: { beat_1: [] } }
    },
    beats: {
      beat_1: { id: 'beat_1', title: '钉选节点', status: 'idea', content: '节点正文' }
    },
    entities: {
      ent_1: { id: 'ent_1', name: '钉选实体', status: 'active', content: '实体正文' }
    }
  }
}

function fakeBranchWithPins(): SessionTreeEntry[] {
  return [
    {
      type: 'custom',
      id: 'e_pins',
      parentId: null,
      timestamp: '2026-07-31T00:00:00.000Z',
      customType: 'pinned_beats',
      data: { ids: ['beat_1'] }
    } as unknown as SessionTreeEntry
  ]
}

function fakeServices() {
  return {
    projects: {
      openProject: async () => fakeProject()
    },
    sessions: {
      getActiveHistoryEntries: async () => fakeBranchWithPins()
    },
    todos: {
      load: async () => [
        { id: 'todo_1', content: '继续第三章', status: 'in_progress' }
      ]
    }
  }
}

/** 构造旧复现输入：OLD USER + assistant(thinking+text) + NEW USER */
function historyInput(): AgentMessage[] {
  return [
    { role: 'user', content: 'OLD USER', timestamp: 1 },
    {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'OLD THOUGHT' },
        { type: 'text', text: 'OLD ANSWER' }
      ],
      api: 'openai-completions',
      provider: 'test',
      model: 'test-model',
      usage: {},
      stopReason: 'end_turn',
      timestamp: 2
    },
    { role: 'user', content: 'NEW USER', timestamp: 3 }
  ] as unknown as AgentMessage[]
}

function builder() {
  const services = fakeServices()
  return new ContextBuilder(
    services.projects as never,
    services.sessions as never,
    services.todos as never
  )
}

describe('P0 context hook 回归', () => {
  it('pins/todo 激活时，历史与当前输入完整保留（不再替换为单条 DYNAMIC）', async () => {
    const messages = historyInput()
    const b = builder()
    const compiled = await b.compile({
      projectId: 'proj_1',
      sessionId: 'sess_1',
      runId: 'run_1',
      userMessage: 'NEW USER',
      contextRefs: [],
      model: {
        providerId: 'test',
        modelId: 'test-model',
        api: 'openai-completions',
        contextWindow: 128000,
        maxOutputTokens: 4096
      },
      thinkingLevel: 'medium',
      sessionMessages: messages,
      toolSchemas: [],
      skillsBlock: '',
      mcpBlock: ''
    })

    // 历史 3 条 + 当前 user（compile 输出 sessionMessages 原样）
    expect(compiled.messages.length).toBe(3)
    expect(compiled.messages[0]).toMatchObject({ role: 'user', content: 'OLD USER' })
    expect(compiled.messages[1].role).toBe('assistant')
    // thinking 仍在
    const assistant = compiled.messages[1] as unknown as {
      content: Array<{ type: string; thinking?: string }>
    }
    expect(assistant.content.some((blk) => blk.type === 'thinking')).toBe(true)
    expect(compiled.messages[2]).toMatchObject({ role: 'user', content: 'NEW USER' })
  })

  it('dynamic block 只出现在 systemPrompt 中，且只出现一次', async () => {
    const b = builder()
    const compiled = await b.compile({
      projectId: 'proj_1',
      sessionId: 'sess_1',
      runId: 'run_2',
      userMessage: '继续',
      contextRefs: [],
      model: {
        providerId: 'test',
        modelId: 'test-model',
        api: 'openai-completions',
        contextWindow: 128000,
        maxOutputTokens: 4096
      },
      thinkingLevel: 'medium',
      sessionMessages: historyInput(),
      toolSchemas: [],
      skillsBlock: '',
      mcpBlock: ''
    })

    const sys = compiled.systemPrompt
    // 钉选节点与 todo 都在 system prompt
    expect(sys).toContain('钉选节点')
    expect(sys).toContain('继续第三章')
    expect(sys).toContain('<active_workset')
    // 不含 replacement 单条 DYNAMIC
    expect(compiled.messages.some((m) => m.role === 'user' && typeof m.content === 'string' && m.content.includes('系统动态上下文'))).toBe(false)
  })

  it('todo tool 写入后下一次工具请求仍有完整 toolCall/toolResult 邻接', () => {
    const messages = [
      { role: 'user', content: '任务', timestamp: 1 },
      {
        role: 'assistant',
        content: [
          { type: 'toolCall', id: 'call_1', name: 'todo', arguments: { todos: [] } }
        ],
        api: 'openai-completions',
        provider: 'test',
        model: 'test-model',
        usage: {},
        stopReason: 'tool_use',
        timestamp: 2
      },
      {
        role: 'toolResult',
        toolCallId: 'call_1',
        toolName: 'todo',
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
        timestamp: 3
      }
    ] as unknown as AgentMessage[]
    const result = validateMessageChain(messages)
    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('toolCall 缺少 toolResult 时报错（不变量 4）', () => {
    const messages = [
      {
        role: 'assistant',
        content: [{ type: 'toolCall', id: 'call_x', name: 'write', arguments: {} }],
        api: 'openai-completions',
        provider: 'test',
        model: 'test-model',
        usage: {},
        stopReason: 'tool_use',
        timestamp: 1
      }
    ] as unknown as AgentMessage[]
    const result = validateMessageChain(messages)
    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('call_x'))).toBe(true)
  })
})

describe('SystemPrompt V2', () => {
  it('稳定规则包含版本与数据分区标记', () => {
    const { systemPrompt, promptHash } = buildSystemPromptV2({
      project: { title: 'P', summary: 'S', outlineLines: ['- [idea] B (b1)'] },
      workset: {
        pinnedBeats: ['### 节点「B」(b1)'],
        pinnedEntities: [],
        todos: [{ content: 't', status: 'in_progress' }],
        explicitRefs: []
      },
      manifest: {
        version: 'dreamagent.manifest.v1',
        estimatedInputTokens: 100,
        inputBudget: 1000,
        blockCount: 5,
        omittedCount: 0,
        roleSequence: ['user'],
        promptHash: 'sha256:x'
      },
      skillsBlock: '',
      mcpBlock: '',
      sessionId: 'sess_1'
    })
    expect(systemPrompt).toContain('<authority_order>')
    expect(systemPrompt).toContain('<context_contract>')
    expect(systemPrompt).toContain('dreamagent.manifest.v1')
    expect(promptHash).toMatch(/^sha256:/)
  })
})

describe('结构化 contextRefs（P2）', () => {
  it('从 composer 文本提取 directive mention', () => {
    const refs = extractContextRefsFromText(
      '继续写 :beat[第三章]{name=beat_3} 和 :entity[女主]{name=ent_9} 的内容'
    )
    expect(refs).toEqual([
      { type: 'beat', id: 'beat_3', label: '第三章' },
      { type: 'entity', id: 'ent_9', label: '女主' }
    ])
  })

  it('id 等于 label 时省略 {name=…} 也能解析', () => {
    const refs = extractContextRefsFromText('用 :skill[dreamagent-guide] 指导')
    expect(refs).toEqual([{ type: 'skill', id: 'dreamagent-guide', label: 'dreamagent-guide' }])
  })
})

/**
 * Harness 级集成回归（真实 AgentHarness + InMemorySessionRepo + faux provider）：
 * 直接验证 pi 的 transformContext 是否被 replacement context hook 整体替换。
 */
import { AgentHarness, InMemorySessionRepo } from '@earendil-works/pi-agent-core'
import type { AgentMessage, Session } from '@earendil-works/pi-agent-core'
import { createModels, fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai'
import type { Context } from '@earendil-works/pi-ai'

async function makeRealHarness(hook: boolean) {
  const repo = new InMemorySessionRepo()
  const session = (await repo.create({ id: 'sess_1' })) as Session
  await session.appendMessage({
    role: 'user',
    content: 'OLD USER',
    timestamp: 1
  } as AgentMessage)
  await session.appendMessage({
    role: 'assistant',
    content: [
      { type: 'thinking', thinking: 'OLD THOUGHT' },
      { type: 'text', text: 'OLD ANSWER' }
    ],
    api: 'faux',
    provider: 'faux',
    model: 'faux-1',
    usage: {},
    stopReason: 'end_turn',
    timestamp: 2
  } as unknown as AgentMessage)

  const contexts: Array<{ systemPrompt?: string; messages: unknown[] }> = []
  const faux = fauxProvider({
    models: [{ id: 'faux-1', contextWindow: 128000, maxTokens: 4096 }]
  })
  const models = createModels()
  models.setProvider(faux.provider)
  faux.setResponses([
    (context: Context) => {
      contexts.push({ systemPrompt: context.systemPrompt, messages: context.messages })
      return fauxAssistantMessage('OK')
    }
  ])

  const harness = new AgentHarness<undefined>({
    session,
    models: models as never,
    model: faux.getModel() as never,
    tools: [],
    systemPrompt: 'base-system',
    thinkingLevel: 'off'
  })
  if (hook) {
    // 复现旧缺陷：replacement context hook 返回单条动态消息
    harness.on('context', async () => ({
      messages: [{ role: 'user', content: 'DYNAMIC', timestamp: Date.now() }]
    }))
  }
  return { harness, contexts }
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const b = content[0] as { type?: string; text?: string } | undefined
    return b?.type === 'text' && typeof b.text === 'string' ? b.text : ''
  }
  return ''
}

describe('P0 harness 级集成回归（AgentHarness + InMemorySessionRepo + faux provider）', () => {
  it('复现缺陷：replacement context hook 会把历史整体替换为单条 DYNAMIC', async () => {
    const { harness, contexts } = await makeRealHarness(true)
    await harness.prompt('NEW USER')
    const sent = contexts[contexts.length - 1]!.messages
    expect(sent.length).toBe(1)
    expect(contentText((sent[0] as { content?: unknown }).content)).toBe('DYNAMIC')
  })

  it('修复后：无 hook 时历史、thinking 与当前 user 全部进入 Provider context', async () => {
    const { harness, contexts } = await makeRealHarness(false)
    await harness.prompt('NEW USER')
    const sent = contexts[contexts.length - 1]!.messages as Array<{
      role: string
      content?: unknown
    }>
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(contentText(sent[0]!.content)).toBe('OLD USER')
    expect(contentText(sent[2]!.content)).toBe('NEW USER')
    const assistant = sent[1] as { content?: Array<{ type: string }> }
    expect(assistant.content?.some((b) => b.type === 'thinking')).toBe(true)
    expect(contexts[contexts.length - 1]!.systemPrompt).toBe('base-system')
  })
})

describe('项目快照缓存（P2 性能修复）', () => {
  it('同一编译周期内复用快照；beginCycle 后重新读盘', async () => {
    let openCount = 0
    const services = {
      projects: {
        openProject: async () => {
          openCount += 1
          return fakeProject()
        }
      },
      sessions: {
        getActiveHistoryEntries: async () => [] as SessionTreeEntry[]
      },
      todos: {
        load: async () => []
      }
    }
    const b = new ContextBuilder(
      services.projects as never,
      services.sessions as never,
      services.todos as never
    )
    const input = {
      projectId: 'proj_1',
      sessionId: 'sess_1',
      runId: 'run_1',
      userMessage: 'hi',
      contextRefs: [],
      model: {
        providerId: 'p',
        modelId: 'm',
        api: 'openai-completions',
        contextWindow: 128000,
        maxOutputTokens: 4096
      },
      thinkingLevel: 'medium' as const,
      sessionMessages: [],
      toolSchemas: [],
      skillsBlock: '',
      mcpBlock: ''
    }
    await b.compile(input)
    await b.compile(input)
    expect(openCount).toBe(1)
    b.beginCycle('proj_1')
    await b.compile(input)
    expect(openCount).toBe(2)
  })
})
