/**
 * 多供应商 LLM 设置：API Key 用 electron safeStorage 加密落盘
 */
import { app, net, safeStorage } from 'electron'
import path from 'path'
import { createId } from '../../../shared/ids'
import type {
  LlmAddProviderInput,
  LlmModelConfig,
  LlmModelStored,
  LlmProviderApiType,
  LlmProviderPublic,
  LlmProviderStored,
  LlmProvidersPublic,
  LlmRemoteModelInfo,
  LlmRuntimeSelection,
  LlmSelectableModel,
  LlmStoredSettings,
  LlmStoredSettingsV1,
  LlmThinkingLevel,
  LlmUpdateProviderInput
} from '../../../shared/llm-settings'
import {
  DEFAULT_THINKING_LEVEL,
  encodeModelKey,
  LLM_THINKING_LEVELS,
  modelSupportsImageInput
} from '../../../shared/llm-settings'
import { ensureDir, pathExists, readJsonFile, writeJsonAtomic } from '../utils/fs-utils'
import { cacheModelLogo, resolveModelInfo } from './model-catalog'

const PLAIN_PREFIX = 'plain:'
const API_TYPES: LlmProviderApiType[] = [
  'openai-completions',
  'openai-responses',
  'anthropic-messages'
]

function maskKey(key: string): string | undefined {
  const t = key.trim()
  if (!t) return undefined
  if (t.length <= 8) return '••••'
  return `${t.slice(0, 3)}••••${t.slice(-4)}`
}

function normalizeApiType(value: unknown): LlmProviderApiType {
  if (typeof value === 'string' && API_TYPES.includes(value as LlmProviderApiType)) {
    return value as LlmProviderApiType
  }
  return 'openai-completions'
}

function normalizeThinkingLevel(value: unknown): LlmThinkingLevel {
  if (
    typeof value === 'string' &&
    LLM_THINKING_LEVELS.includes(value as LlmThinkingLevel)
  ) {
    return value as LlmThinkingLevel
  }
  return DEFAULT_THINKING_LEVEL
}

function asThinkingLevels(raw: unknown): LlmThinkingLevel[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const allowed = new Set(LLM_THINKING_LEVELS)
  const levels = raw.filter(
    (v): v is LlmThinkingLevel =>
      typeof v === 'string' && allowed.has(v as LlmThinkingLevel)
  )
  return levels.length ? levels : undefined
}

function asModalities(
  raw: unknown
): import('../../../shared/llm-settings').LlmModelModality[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const allowed = new Set(['text', 'audio', 'image', 'video', 'pdf'])
  const mods = raw.filter(
    (v): v is import('../../../shared/llm-settings').LlmModelModality =>
      typeof v === 'string' && allowed.has(v)
  )
  return mods.length ? mods : undefined
}

function normalizeModels(raw: unknown): LlmModelStored[] {
  if (!Array.isArray(raw)) return []
  const out: LlmModelStored[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const m = item as Record<string, unknown>
    const id = typeof m.id === 'string' ? m.id.trim() : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    // 读取旧字段后仍走 enrich，补齐缺失的 effort/modalities
    out.push(
      enrichModel({
        id,
        name: typeof m.name === 'string' && m.name.trim() ? m.name.trim() : id,
        contextWindow:
          typeof m.contextWindow === 'number' && m.contextWindow > 0
            ? m.contextWindow
            : undefined,
        maxTokens:
          typeof m.maxTokens === 'number' && m.maxTokens > 0
            ? m.maxTokens
            : undefined,
        reasoning: typeof m.reasoning === 'boolean' ? m.reasoning : undefined,
        effortLevels: asThinkingLevels(m.effortLevels),
        inputModalities: asModalities(m.inputModalities),
        outputModalities: asModalities(m.outputModalities),
        attachment: typeof m.attachment === 'boolean' ? m.attachment : undefined,
        toolCall: typeof m.toolCall === 'boolean' ? m.toolCall : undefined,
        catalogId:
          typeof m.catalogId === 'string' && m.catalogId.trim()
            ? m.catalogId.trim()
            : undefined
      })
    )
  }
  return out
}

/** 用 models.dev 富化模型：reasoning / effort / 模态 / 上下文 */
function enrichModel(model: LlmModelConfig): LlmModelStored {
  const info = resolveModelInfo(model.id)
  const reasoning = model.reasoning ?? info.reasoning
  const effortLevels =
    model.effortLevels ??
    (info.effortLevels as LlmThinkingLevel[] | undefined) ??
    (reasoning ? (['low', 'medium', 'high'] as LlmThinkingLevel[]) : undefined)
  return {
    id: model.id.trim(),
    name: model.name?.trim() || info.name || model.id.trim(),
    contextWindow: model.contextWindow ?? info.contextWindow,
    maxTokens: model.maxTokens ?? info.maxOutputTokens,
    reasoning,
    effortLevels: reasoning ? effortLevels : undefined,
    inputModalities: model.inputModalities ?? info.inputModalities,
    outputModalities: model.outputModalities ?? info.outputModalities,
    attachment: model.attachment ?? info.attachment,
    toolCall: model.toolCall ?? info.toolCall,
    catalogId: model.catalogId ?? (info.matched ? info.id : undefined)
  }
}

/**
 * LLM 多供应商设置服务
 */
export class LlmSettingsService {
  private cache: LlmStoredSettings | null = null

  private filePath(): string {
    return path.join(app.getPath('userData'), 'llm-settings.json')
  }

  private encryptKey(plain: string): string {
    if (!plain) return ''
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.encryptString(plain).toString('base64')
      }
    } catch (error) {
      console.warn('[llm-settings] safeStorage 加密失败，回退明文标记', error)
    }
    return `${PLAIN_PREFIX}${plain}`
  }

  private decryptKey(enc?: string): string {
    if (!enc) return ''
    if (enc.startsWith(PLAIN_PREFIX)) return enc.slice(PLAIN_PREFIX.length)
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(Buffer.from(enc, 'base64'))
      }
    } catch (error) {
      console.warn('[llm-settings] safeStorage 解密失败', error)
    }
    return ''
  }

  /** 识别并迁移旧版 v1 单点配置 */
  private migrateFromV1(raw: LlmStoredSettingsV1): LlmStoredSettings {
    const baseURL =
      typeof raw.baseURL === 'string' && raw.baseURL.trim()
        ? raw.baseURL.trim().replace(/\/+$/, '')
        : 'https://api.openai.com/v1'
    const modelId =
      typeof raw.modelId === 'string' && raw.modelId.trim()
        ? raw.modelId.trim()
        : 'gpt-4o-mini'
    const info = resolveModelInfo(modelId)
    const providerId = createId('prov')
    const provider: LlmProviderStored = {
      id: providerId,
      name: '默认服务',
      type: 'openai-completions',
      enabled: true,
      baseURL,
      apiKeyEnc: typeof raw.apiKeyEnc === 'string' ? raw.apiKeyEnc : undefined,
      models: [enrichModel({ id: modelId, name: info.name || modelId })]
    }
    return {
      version: 2,
      providers: [provider],
      defaultProviderId: providerId,
      defaultModelId: modelId,
      multimodalProviderId: '',
      multimodalModelId: '',
      defaultThinkingLevel: DEFAULT_THINKING_LEVEL
    }
  }

  private emptySettings(): LlmStoredSettings {
    return {
      version: 2,
      providers: [],
      defaultProviderId: '',
      defaultModelId: '',
      multimodalProviderId: '',
      multimodalModelId: '',
      defaultThinkingLevel: DEFAULT_THINKING_LEVEL
    }
  }

  /**
   * 校验多模态桥接模型仍存在且支持图片输入；否则清空。
   */
  private sanitizeMultimodalSelection(
    providers: LlmProviderStored[],
    providerId: string,
    modelId: string
  ): { multimodalProviderId: string; multimodalModelId: string } {
    if (!providerId || !modelId) {
      return { multimodalProviderId: '', multimodalModelId: '' }
    }
    const provider = providers.find((p) => p.id === providerId)
    const model = provider?.models.find((m) => m.id === modelId)
    if (!model) {
      return { multimodalProviderId: '', multimodalModelId: '' }
    }
    const enriched = enrichModel(model)
    if (!modelSupportsImageInput(enriched.inputModalities)) {
      return { multimodalProviderId: '', multimodalModelId: '' }
    }
    return { multimodalProviderId: providerId, multimodalModelId: modelId }
  }

  private normalizeStored(raw: Record<string, unknown>): LlmStoredSettings {
    // v2
    if (raw.version === 2 && Array.isArray(raw.providers)) {
      const providers: LlmProviderStored[] = []
      for (const item of raw.providers) {
        if (!item || typeof item !== 'object') continue
        const p = item as Record<string, unknown>
        const id = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : createId('prov')
        const baseURL =
          typeof p.baseURL === 'string' && p.baseURL.trim()
            ? p.baseURL.trim().replace(/\/+$/, '')
            : ''
        providers.push({
          id,
          name:
            typeof p.name === 'string' && p.name.trim() ? p.name.trim() : '未命名服务',
          type: normalizeApiType(p.type),
          enabled: p.enabled !== false,
          baseURL,
          apiKeyEnc: typeof p.apiKeyEnc === 'string' ? p.apiKeyEnc : undefined,
          models: normalizeModels(p.models)
        })
      }
      let defaultProviderId =
        typeof raw.defaultProviderId === 'string' ? raw.defaultProviderId : ''
      let defaultModelId =
        typeof raw.defaultModelId === 'string' ? raw.defaultModelId : ''

      // 校验默认值仍存在
      const defProv = providers.find((p) => p.id === defaultProviderId)
      if (!defProv) {
        defaultProviderId = providers[0]?.id ?? ''
        defaultModelId = providers[0]?.models[0]?.id ?? ''
      } else if (!defProv.models.some((m) => m.id === defaultModelId)) {
        defaultModelId = defProv.models[0]?.id ?? ''
      }

      const multimodal = this.sanitizeMultimodalSelection(
        providers,
        typeof raw.multimodalProviderId === 'string' ? raw.multimodalProviderId : '',
        typeof raw.multimodalModelId === 'string' ? raw.multimodalModelId : ''
      )

      return {
        version: 2,
        providers,
        defaultProviderId,
        defaultModelId,
        multimodalProviderId: multimodal.multimodalProviderId,
        multimodalModelId: multimodal.multimodalModelId,
        defaultThinkingLevel: normalizeThinkingLevel(raw.defaultThinkingLevel)
      }
    }

    // v1 单点
    if (
      typeof raw.baseURL === 'string' ||
      typeof raw.modelId === 'string' ||
      typeof raw.apiKeyEnc === 'string'
    ) {
      return this.migrateFromV1(raw as LlmStoredSettingsV1)
    }

    return this.emptySettings()
  }

  private async load(): Promise<LlmStoredSettings> {
    if (this.cache) return this.cache
    const file = this.filePath()
    const raw = (await readJsonFile<Record<string, unknown>>(file)) ?? {}
    const next = this.normalizeStored(raw)
    // 若从 v1 迁出，立即落盘，避免反复迁移
    if (raw.version !== 2 && (raw.baseURL || raw.modelId || raw.apiKeyEnc)) {
      await this.save(next)
    } else {
      this.cache = next
    }
    return this.cache!
  }

  private async save(next: LlmStoredSettings): Promise<void> {
    const file = this.filePath()
    await ensureDir(path.dirname(file))
    await writeJsonAtomic(file, next)
    this.cache = next
  }

  private toPublic(stored: LlmStoredSettings): LlmProvidersPublic {
    const providers: LlmProviderPublic[] = stored.providers.map((p) => {
      const key = this.decryptKey(p.apiKeyEnc)
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        enabled: p.enabled,
        baseURL: p.baseURL,
        hasApiKey: Boolean(key),
        apiKeyHint: maskKey(key),
        models: p.models.map((m) => ({ ...m }))
      }
    })
    return {
      providers,
      defaultProviderId: stored.defaultProviderId,
      defaultModelId: stored.defaultModelId,
      multimodalProviderId: stored.multimodalProviderId,
      multimodalModelId: stored.multimodalModelId,
      defaultThinkingLevel: stored.defaultThinkingLevel
    }
  }

  async getPublic(): Promise<LlmProvidersPublic> {
    return this.toPublic(await this.load())
  }

  async addProvider(input: LlmAddProviderInput): Promise<LlmProvidersPublic> {
    const stored = await this.load()
    const baseURL = (input.baseURL || '').trim().replace(/\/+$/, '')
    if (!baseURL) throw new Error('Base URL 不能为空')
    const name = (input.name || '').trim() || '未命名服务'
    const models = (input.models ?? []).map(enrichModel)
    const id = createId('prov')
    const provider: LlmProviderStored = {
      id,
      name,
      type: normalizeApiType(input.type),
      enabled: Boolean(baseURL && (input.apiKey?.trim() || models.length)),
      baseURL,
      apiKeyEnc: input.apiKey?.trim()
        ? this.encryptKey(input.apiKey.trim())
        : undefined,
      models
    }
    const next: LlmStoredSettings = {
      ...stored,
      providers: [...stored.providers, provider]
    }
    // 若尚无默认，设为第一个模型
    if (!next.defaultProviderId && models[0]) {
      next.defaultProviderId = id
      next.defaultModelId = models[0].id
    }
    await this.save(next)
    return this.toPublic(next)
  }

  async updateProvider(
    providerId: string,
    patch: LlmUpdateProviderInput
  ): Promise<LlmProvidersPublic> {
    const stored = await this.load()
    const idx = stored.providers.findIndex((p) => p.id === providerId)
    if (idx < 0) throw new Error(`供应商不存在: ${providerId}`)
    const prev = stored.providers[idx]
    const nextProvider: LlmProviderStored = { ...prev }

    if (typeof patch.name === 'string' && patch.name.trim()) {
      nextProvider.name = patch.name.trim()
    }
    if (patch.type) nextProvider.type = normalizeApiType(patch.type)
    if (typeof patch.baseURL === 'string' && patch.baseURL.trim()) {
      nextProvider.baseURL = patch.baseURL.trim().replace(/\/+$/, '')
    }
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
      nextProvider.apiKeyEnc = this.encryptKey(patch.apiKey.trim())
    }
    if (Array.isArray(patch.models)) {
      nextProvider.models = patch.models.map(enrichModel)
    }
    if (typeof patch.enabled === 'boolean') {
      nextProvider.enabled = patch.enabled
    } else {
      // 有 key + baseURL + 至少一个模型才算启用
      const key = this.decryptKey(nextProvider.apiKeyEnc)
      nextProvider.enabled = Boolean(
        nextProvider.baseURL && key && nextProvider.models.length > 0
      )
    }

    const providers = [...stored.providers]
    providers[idx] = nextProvider

    let { defaultProviderId, defaultModelId } = stored
    if (defaultProviderId === providerId) {
      if (!nextProvider.models.some((m) => m.id === defaultModelId)) {
        defaultModelId = nextProvider.models[0]?.id ?? ''
      }
      if (!defaultModelId) {
        const other = providers.find((p) => p.id !== providerId && p.models[0])
        defaultProviderId = other?.id ?? ''
        defaultModelId = other?.models[0]?.id ?? ''
      }
    }

    const multimodal = this.sanitizeMultimodalSelection(
      providers,
      stored.multimodalProviderId,
      stored.multimodalModelId
    )

    const next: LlmStoredSettings = {
      ...stored,
      providers,
      defaultProviderId,
      defaultModelId,
      multimodalProviderId: multimodal.multimodalProviderId,
      multimodalModelId: multimodal.multimodalModelId
    }
    await this.save(next)
    return this.toPublic(next)
  }

  async removeProvider(providerId: string): Promise<LlmProvidersPublic> {
    const stored = await this.load()
    const providers = stored.providers.filter((p) => p.id !== providerId)
    let { defaultProviderId, defaultModelId } = stored
    if (defaultProviderId === providerId) {
      defaultProviderId = providers[0]?.id ?? ''
      defaultModelId = providers[0]?.models[0]?.id ?? ''
    }
    const multimodal = this.sanitizeMultimodalSelection(
      providers,
      stored.multimodalProviderId,
      stored.multimodalModelId
    )

    const next: LlmStoredSettings = {
      ...stored,
      providers,
      defaultProviderId,
      defaultModelId,
      multimodalProviderId: multimodal.multimodalProviderId,
      multimodalModelId: multimodal.multimodalModelId
    }
    await this.save(next)
    return this.toPublic(next)
  }

  async setDefaultModel(
    providerId: string,
    modelId: string
  ): Promise<LlmProvidersPublic> {
    const stored = await this.load()
    const provider = stored.providers.find((p) => p.id === providerId)
    if (!provider) throw new Error(`供应商不存在: ${providerId}`)
    if (!provider.models.some((m) => m.id === modelId)) {
      throw new Error(`模型不存在: ${modelId}`)
    }
    const next: LlmStoredSettings = {
      ...stored,
      defaultProviderId: providerId,
      defaultModelId: modelId
    }
    await this.save(next)
    return this.toPublic(next)
  }

  async setThinkingLevel(level: LlmThinkingLevel): Promise<LlmProvidersPublic> {
    const stored = await this.load()
    const next: LlmStoredSettings = {
      ...stored,
      defaultThinkingLevel: normalizeThinkingLevel(level)
    }
    await this.save(next)
    return this.toPublic(next)
  }

  /** 设置多模态桥接模型。传空值清空。 */
  async setMultimodalModel(
    providerId: string,
    modelId: string
  ): Promise<LlmProvidersPublic> {
    const stored = await this.load()
    const next: LlmStoredSettings = { ...stored }

    if (!providerId || !modelId) {
      next.multimodalProviderId = ''
      next.multimodalModelId = ''
    } else {
      const provider = stored.providers.find((p) => p.id === providerId)
      if (!provider) throw new Error(`供应商不存在: ${providerId}`)
      const model = provider.models.find((m) => m.id === modelId)
      if (!model) throw new Error(`模型不存在: ${modelId}`)
      const enriched = enrichModel(model)
      if (!modelSupportsImageInput(enriched.inputModalities)) {
        throw new Error(
          `模型 ${modelId} 不支持图片输入，不能作为多模态桥接`
        )
      }
      next.multimodalProviderId = providerId
      next.multimodalModelId = modelId
    }

    await this.save(next)
    return this.toPublic(next)
  }

  /**
   * 解析运行时选用；可传入会话覆盖的 provider/model/thinking
   */
  async getRuntimeSelection(override?: {
    providerId?: string
    modelId?: string
    thinkingLevel?: LlmThinkingLevel
  }): Promise<LlmRuntimeSelection> {
    const stored = await this.load()
    const providerId = override?.providerId || stored.defaultProviderId
    const modelId = override?.modelId || stored.defaultModelId
    const provider = stored.providers.find((p) => p.id === providerId)
    if (!provider) {
      throw new Error('尚未配置模型服务，请到设置 → 模型 中添加')
    }
    const model = provider.models.find((m) => m.id === modelId) ?? provider.models[0]
    if (!model) {
      throw new Error('该服务尚未添加模型')
    }
    const apiKey = this.decryptKey(provider.apiKeyEnc)
    if (!apiKey) throw new Error('尚未配置 API Key，请到设置 → 模型 中填写')
    if (!provider.baseURL) throw new Error('尚未配置 Base URL')

    const info = resolveModelInfo(model.id)
    return {
      providerId: provider.id,
      providerName: provider.name,
      type: provider.type,
      baseURL: provider.baseURL.replace(/\/+$/, ''),
      modelId: model.id,
      modelName: model.name || info.name || model.id,
      apiKey,
      contextWindow: model.contextWindow ?? info.contextWindow,
      maxTokens: model.maxTokens ?? info.maxOutputTokens,
      reasoning: model.reasoning ?? info.reasoning,
      thinkingLevel: normalizeThinkingLevel(
        override?.thinkingLevel ?? stored.defaultThinkingLevel
      )
    }
  }

  /** Composer 用扁平可选模型（含 logo） */
  async listSelectableModels(): Promise<LlmSelectableModel[]> {
    const stored = await this.load()
    const out: LlmSelectableModel[] = []
    for (const provider of stored.providers) {
      const hasKey = Boolean(this.decryptKey(provider.apiKeyEnc))
      for (const model of provider.models) {
        const enriched = enrichModel(model)
        const info = await cacheModelLogo(resolveModelInfo(model.id))
        const reasoning = enriched.reasoning ?? false
        out.push({
          key: encodeModelKey(provider.id, model.id),
          providerId: provider.id,
          providerName: provider.name,
          modelId: model.id,
          modelName: enriched.name || info.name || model.id,
          reasoning,
          effortLevels: reasoning
            ? enriched.effortLevels ?? ['low', 'medium', 'high']
            : [],
          contextWindow: enriched.contextWindow ?? info.contextWindow,
          maxTokens: enriched.maxTokens ?? info.maxOutputTokens,
          inputModalities: enriched.inputModalities ?? info.inputModalities,
          outputModalities: enriched.outputModalities ?? info.outputModalities,
          attachment: enriched.attachment ?? info.attachment,
          toolCall: enriched.toolCall ?? info.toolCall,
          logoUrl: info.logoUrl,
          logoMonochrome: info.logoMonochrome,
          disabled: !provider.enabled || !hasKey || !provider.baseURL
        })
      }
    }
    return out
  }

  /**
   * 从 OpenAI 兼容 /models 拉取远程模型列表。
   * 可传 draft baseURL/apiKey（设置页未保存的编辑值）；否则用已存供应商。
   */
  async listRemoteModels(input: {
    providerId?: string
    baseURL?: string
    apiKey?: string
  }): Promise<LlmRemoteModelInfo[]> {
    let baseURL = (input.baseURL || '').trim().replace(/\/+$/, '')
    let apiKey = (input.apiKey || '').trim()

    if (input.providerId) {
      const stored = await this.load()
      const provider = stored.providers.find((p) => p.id === input.providerId)
      if (!provider) throw new Error(`供应商不存在: ${input.providerId}`)
      if (!baseURL) baseURL = provider.baseURL
      if (!apiKey) apiKey = this.decryptKey(provider.apiKeyEnc)
    }

    if (!baseURL) throw new Error('Base URL 不能为空')
    if (!apiKey) throw new Error('需要 API Key 才能拉取模型')

    const url = `${baseURL.replace(/\/+$/, '')}/models`
    const response = await net.fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(30_000)
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(
        `拉取模型失败 HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ''}`
      )
    }

    const json = (await response.json()) as unknown
    const rows = extractRemoteModelRows(json)
    return rows.map((row) => {
      const info = resolveModelInfo(row.id)
      return {
        id: row.id,
        name: row.name || info.name || row.id,
        reasoning: info.reasoning,
        effortLevels: info.effortLevels as LlmThinkingLevel[] | undefined,
        contextWindow: info.contextWindow,
        maxTokens: info.maxOutputTokens,
        inputModalities: info.inputModalities,
        outputModalities: info.outputModalities,
        attachment: info.attachment,
        toolCall: info.toolCall,
        matched: info.matched
      }
    })
  }

  async assertConfigured(): Promise<void> {
    await this.getRuntimeSelection()
  }

  /** 内部：全部已启用且有 key 的供应商（供 pi-models 一次注册） */
  async listEnabledProvidersForRuntime(): Promise<
    Array<{
      id: string
      name: string
      type: LlmProviderApiType
      baseURL: string
      apiKey: string
      models: LlmModelStored[]
    }>
  > {
    const stored = await this.load()
    const out: Array<{
      id: string
      name: string
      type: LlmProviderApiType
      baseURL: string
      apiKey: string
      models: LlmModelStored[]
    }> = []
    for (const p of stored.providers) {
      const apiKey = this.decryptKey(p.apiKeyEnc)
      if (!p.enabled || !apiKey || !p.baseURL || p.models.length === 0) continue
      out.push({
        id: p.id,
        name: p.name,
        type: p.type,
        baseURL: p.baseURL.replace(/\/+$/, ''),
        apiKey,
        models: p.models
      })
    }
    return out
  }

  async exists(): Promise<boolean> {
    return pathExists(this.filePath())
  }
}

/** 解析 OpenAI / models.dev 风格的 models 列表响应 */
function extractRemoteModelRows(json: unknown): Array<{ id: string; name?: string }> {
  const out: Array<{ id: string; name?: string }> = []
  const seen = new Set<string>()

  const push = (idRaw: unknown, nameRaw?: unknown): void => {
    const id = typeof idRaw === 'string' ? idRaw.trim() : ''
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push({
      id,
      name: typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : undefined
    })
  }

  if (Array.isArray(json)) {
    for (const item of json) {
      if (typeof item === 'string') push(item)
      else if (item && typeof item === 'object') {
        const row = item as Record<string, unknown>
        push(row.id ?? row.model, row.name ?? row.owned_by)
      }
    }
    return out
  }

  if (json && typeof json === 'object') {
    const root = json as Record<string, unknown>
    const data = root.data ?? root.models ?? root.items
    if (Array.isArray(data)) {
      for (const item of data) {
        if (typeof item === 'string') push(item)
        else if (item && typeof item === 'object') {
          const row = item as Record<string, unknown>
          push(row.id ?? row.model, row.name)
        }
      }
    }
  }
  return out
}
