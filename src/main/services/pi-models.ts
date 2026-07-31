/**
 * pi-ai Models 适配：多供应商，按 api 类型映射真实 wire adapter
 */
import {
  createModels,
  createProvider,
  type Api,
  type Model,
  type Models,
  type MutableModels,
  type Provider,
  type ProviderStreams
} from '@earendil-works/pi-ai'
import {
  stream as openaiCompletionsStream,
  streamSimple as openaiCompletionsStreamSimple
} from '@earendil-works/pi-ai/api/openai-completions'
import {
  stream as openaiResponsesStream,
  streamSimple as openaiResponsesStreamSimple
} from '@earendil-works/pi-ai/api/openai-responses'
import {
  stream as anthropicMessagesStream,
  streamSimple as anthropicMessagesStreamSimple
} from '@earendil-works/pi-ai/api/anthropic-messages'
import type { LlmSettingsService } from './llm-settings-service'
import type { LlmRuntimeSelection, LlmThinkingLevel } from '../../shared/llm-settings'
import type { ResolvedModelInfo } from '../../shared/context-usage'
import { cacheModelLogo, resolveModelInfo } from './model-catalog'

const openaiCompletionsStreams: ProviderStreams = {
  stream: openaiCompletionsStream,
  streamSimple: openaiCompletionsStreamSimple
}

const openaiResponsesStreams: ProviderStreams = {
  stream: openaiResponsesStream,
  streamSimple: openaiResponsesStreamSimple
}

const anthropicMessagesStreams: ProviderStreams = {
  stream: anthropicMessagesStream,
  streamSimple: anthropicMessagesStreamSimple
}

/** 按 api type 取真实 stream 实现（P1：三种协议一一对应） */
export function streamsForType(type: string): ProviderStreams {
  switch (type) {
    case 'openai-responses':
      return openaiResponsesStreams
    case 'anthropic-messages':
      return anthropicMessagesStreams
    case 'openai-completions':
    default:
      return openaiCompletionsStreams
  }
}

function toPiApi(type: string): Api {
  if (type === 'openai-responses') return 'openai-responses' as Api
  if (type === 'anthropic-messages') return 'anthropic-messages' as Api
  return 'openai-completions'
}

/**
 * 根据当前 LLM 多供应商设置构建 pi Models，并解析默认 / 覆盖 Model
 */
export class PiModelsService {
  private cached: {
    sig: string
    models: Models
  } | null = null

  constructor(private readonly llm: LlmSettingsService) {}

  reset(): void {
    this.cached = null
  }

  async getCurrentModelInfo(
    override?: { providerId?: string; modelId?: string }
  ): Promise<ResolvedModelInfo> {
    try {
      const sel = await this.llm.getRuntimeSelection(override)
      return cacheModelLogo(resolveModelInfo(sel.modelId, sel.baseURL))
    } catch {
      return cacheModelLogo(resolveModelInfo('unknown'))
    }
  }

  /**
   * 构建（或复用）已注册全部启用供应商的 Models 集合，并返回当前选用 Model
   */
  async getModelsAndDefault(override?: {
    providerId?: string
    modelId?: string
    thinkingLevel?: LlmThinkingLevel
  }): Promise<{
    models: Models
    model: Model<Api>
    selection: LlmRuntimeSelection
  }> {
    const selection = await this.llm.getRuntimeSelection(override)
    const enabled = await this.llm.listEnabledProvidersForRuntime()
    if (enabled.length === 0) {
      throw new Error('尚未配置可用的模型服务，请到设置 → 模型 中添加')
    }

    const sig = JSON.stringify(
      enabled.map((p) => ({
        id: p.id,
        baseURL: p.baseURL,
        type: p.type,
        key: p.apiKey ? 'set' : '',
        models: p.models.map((m) => m.id)
      }))
    )

    let modelsCollection: Models
    if (this.cached && this.cached.sig === sig) {
      modelsCollection = this.cached.models
    } else {
      const models = createModels() as MutableModels
      for (const p of enabled) {
        const piModels: Model<Api>[] = p.models.map((m) => {
          const info = resolveModelInfo(m.id, p.baseURL)
          return {
            id: m.id,
            name: m.name || info.name,
            api: toPiApi(p.type),
            provider: p.id,
            baseUrl: p.baseURL,
            reasoning: m.reasoning ?? info.reasoning,
            input: ['text'],
            cost: info.price,
            contextWindow: m.contextWindow ?? info.contextWindow,
            // 输出上限取 models.dev 的真实上限（不再硬编码 32k）；pi-ai 内部还会按
            // contextWindow - 输入 二次钳制，避免超出窗口。
            maxTokens: m.maxTokens ?? info.maxOutputTokens
          }
        })

        const apiKey = p.apiKey
        const baseUrl = p.baseURL
        const provider = createProvider({
          id: p.id,
          name: p.name,
          baseUrl,
          auth: {
            apiKey: {
              name: 'API Key',
              resolve: async () => ({
                auth: { apiKey, baseUrl },
                source: 'dreamagent-settings'
              })
            }
          },
          models: piModels,
          api: streamsForType(p.type)
        })
        models.setProvider(provider as Provider<Api>)
      }
      this.cached = { sig, models }
      modelsCollection = models
    }

    // 从集合取当前 model；若不在集合（未启用）则现场构造
    let model = modelsCollection.getModel(selection.providerId, selection.modelId) as
      | Model<Api>
      | undefined
    if (!model) {
      const info = resolveModelInfo(selection.modelId, selection.baseURL)
      model = {
        id: selection.modelId,
        name: selection.modelName || info.name,
        api: toPiApi(selection.type),
        provider: selection.providerId,
        baseUrl: selection.baseURL,
        reasoning: selection.reasoning,
        input: ['text'],
        cost: info.price,
        contextWindow: selection.contextWindow,
        maxTokens: selection.maxTokens
      }
    }

    return { models: modelsCollection, model, selection }
  }
}
