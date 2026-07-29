/**
 * pi-ai Models 适配：单 OpenAI 兼容 Provider
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
import type { LlmSettingsService } from './llm-settings-service'

const PROVIDER_ID = 'openai-compatible'

const openaiStreams: ProviderStreams = {
  stream: openaiCompletionsStream,
  streamSimple: openaiCompletionsStreamSimple
}

/**
 * 根据当前 LLM 设置构建 pi Models，并解析默认 Model
 */
export class PiModelsService {
  private cached: { sig: string; models: Models; model: Model<Api> } | null = null

  constructor(private readonly llm: LlmSettingsService) {}

  reset(): void {
    this.cached = null
  }

  async getModelsAndDefault(): Promise<{ models: Models; model: Model<Api> }> {
    const cfg = await this.llm.getRuntimeConfig()
    if (!cfg.apiKey) throw new Error('尚未配置 API Key，请到设置 → 模型 中填写')
    if (!cfg.baseURL) throw new Error('尚未配置 Base URL')
    if (!cfg.modelId) throw new Error('尚未配置模型 ID')

    const sig = JSON.stringify({
      baseURL: cfg.baseURL,
      modelId: cfg.modelId,
      key: cfg.apiKey ? 'set' : ''
    })
    if (this.cached && this.cached.sig === sig) {
      return { models: this.cached.models, model: this.cached.model }
    }

    const model: Model<Api> = {
      id: cfg.modelId,
      name: cfg.modelId,
      api: 'openai-completions',
      provider: PROVIDER_ID,
      baseUrl: cfg.baseURL,
      // 允许推理模型返回 thinking 块；普通模型无 thinking 时无影响
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      // 提高上限，避免 thinking + 工具参数阶段过早截断看起来像「思考中断」
      maxTokens: 32768
    }

    const models = createModels() as MutableModels
    const apiKey = cfg.apiKey
    const baseUrl = cfg.baseURL

    const provider = createProvider({
      id: PROVIDER_ID,
      name: 'OpenAI Compatible',
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
      models: [model],
      api: openaiStreams
    })

    models.setProvider(provider as Provider<Api>)
    this.cached = { sig, models, model }
    return { models, model }
  }
}
