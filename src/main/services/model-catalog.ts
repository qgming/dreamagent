import { app, net } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { models, providers } from '@opencode-ai/models/snapshot'
import type {
  Model as CatalogModel,
  ModelMetadata,
  Provider as CatalogProvider,
  ReasoningOption
} from '@opencode-ai/models'
import type {
  ModelEffortLevel,
  ModelModality,
  ResolvedModelInfo
} from '../../shared/context-usage'

const DEFAULT_CONTEXT_WINDOW = 200_000
const DEFAULT_MAX_OUTPUT = 32_768
const MODELS_DEV_LOGO_BASE_URL = 'https://models.dev/logos'
const MAX_LOGO_BYTES = 256 * 1024
interface CachedLogo {
  dataUrl: string
  monochrome: boolean
}

const logoCache = new Map<string, Promise<CachedLogo | undefined>>()

function logoCachePath(providerId: string): string {
  const safeId = providerId.replace(/[^a-z0-9_-]/gi, '')
  return path.join(app.getPath('userData'), 'cache', 'model-logos', `${safeId}.svg`)
}

function isSvg(data: Buffer): boolean {
  return (
    data.length > 0 &&
    data.length <= MAX_LOGO_BYTES &&
    data.subarray(0, 512).toString('utf8').includes('<svg')
  )
}

function svgDataUrl(data: Buffer): string {
  return `data:image/svg+xml;base64,${data.toString('base64')}`
}

function cachedLogo(data: Buffer): CachedLogo {
  const source = data.toString('utf8')
  const hasExplicitColor = /#[0-9a-f]{3,8}\b|(?:rgb|hsl)a?\(|url\(#/i.test(source)
  return {
    dataUrl: svgDataUrl(data),
    monochrome: /currentcolor/i.test(source) && !hasExplicitColor
  }
}

async function loadOrDownloadLogo(
  providerId: string,
  sourceUrl: string
): Promise<CachedLogo | undefined> {
  const filePath = logoCachePath(providerId)

  try {
    const cached = await fs.readFile(filePath)
    if (isSvg(cached)) return cachedLogo(cached)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[model-catalog] 读取模型 logo 缓存失败: ${filePath}`, error)
    }
  }

  try {
    const response = await net.fetch(sourceUrl, {
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)

    const data = Buffer.from(await response.arrayBuffer())
    if (!isSvg(data)) throw new Error('响应不是有效的 SVG 或文件过大')

    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, data)
    return cachedLogo(data)
  } catch (error) {
    console.warn(`[model-catalog] 获取模型 logo 失败: ${sourceUrl}`, error)
    return undefined
  }
}

function cleanId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^models\//, '')
    .replace(/[?#].*$/, '')
    .replace(/:(?:free|exacto|extended)$/i, '')
    .replace(/@[^/]+$/, '')
}

function compactId(value: string): string {
  return cleanId(value).replace(/[^a-z0-9]+/g, '')
}

function versionlessId(value: string): string {
  return cleanId(value)
    .replace(/[-_.]?(?:19|20)\d{6}(?=$|[-_.])/g, '')
    .replace(/[-_.](?:latest|preview|experimental|beta|alpha|stable)$/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/** provider/model、网关/models/provider/model 等前缀均逐层剥离参与匹配。 */
function idCandidates(modelId: string): string[] {
  const cleaned = cleanId(modelId)
  const parts = cleaned.split('/').filter(Boolean)
  const values = new Set<string>([cleaned])
  for (let i = 1; i < parts.length; i += 1) {
    values.add(parts.slice(i).join('/'))
  }
  values.add(cleaned.replace(/^(?:openai|anthropic|google|meta|mistral|deepseek)[.:_-]+/, ''))
  return [...values].filter(Boolean)
}

function modelIdScore(configuredId: string, catalogId: string): number {
  const requested = idCandidates(configuredId)
  const catalog = idCandidates(catalogId)
  let best = 0

  for (const candidate of requested) {
    for (const target of catalog) {
      if (candidate === target) best = Math.max(best, 100)

      const candidateCompact = compactId(candidate)
      const targetCompact = compactId(target)
      if (candidateCompact === targetCompact) best = Math.max(best, 92)
      if (
        candidateCompact.endsWith(targetCompact) &&
        targetCompact.length >= 8
      ) {
        best = Math.max(best, 82)
      }
      if (
        versionlessId(candidate) === versionlessId(target) &&
        versionlessId(target).length >= 8
      ) {
        best = Math.max(best, 76)
      }
    }
  }
  return best
}

function findMetadata(modelId: string): ModelMetadata | undefined {
  let best: { score: number; model: ModelMetadata } | undefined
  for (const model of Object.values(models)) {
    const score = modelIdScore(modelId, model.id)
    if (score === 0) continue
    if (!best || score > best.score) best = { score, model }
  }
  return best?.model
}

function findOffering(metadata: ModelMetadata): {
  provider?: CatalogProvider
  model?: CatalogModel
} {
  const [ownerId, ...modelParts] = metadata.id.split('/')
  const scopedId = modelParts.join('/')
  const owner = providers[ownerId]
  const direct = owner?.models[scopedId]
  if (direct) return { provider: owner, model: direct }

  // 某些旧模型只在聚合目录保留价格；这里只补价格，不改变模型匹配结果。
  let best: { score: number; provider: CatalogProvider; model: CatalogModel } | undefined
  for (const provider of Object.values(providers)) {
    for (const model of Object.values(provider.models)) {
      const score = modelIdScore(scopedId, model.id)
      if (score === 0) continue
      if (!best || score > best.score) best = { score, provider, model }
    }
  }
  return best ?? {}
}

/** 将 models.dev reasoning_options 归一为可选思考档 */
function effortLevelsFromOptions(
  options: ReasoningOption[] | undefined,
  reasoning: boolean
): ModelEffortLevel[] | undefined {
  if (!reasoning) return undefined

  const levels = new Set<ModelEffortLevel>()
  let hasEffort = false
  let hasToggleOrBudget = false

  for (const opt of options ?? []) {
    if (opt.type === 'effort' && Array.isArray(opt.values)) {
      hasEffort = true
      for (const value of opt.values) {
        if (value === null || value === 'none') levels.add('off')
        else if (
          value === 'minimal' ||
          value === 'low' ||
          value === 'medium' ||
          value === 'high' ||
          value === 'xhigh' ||
          value === 'max'
        ) {
          levels.add(value)
        } else if (value === 'default') {
          levels.add('medium')
        }
      }
    } else if (opt.type === 'toggle' || opt.type === 'budget_tokens') {
      hasToggleOrBudget = true
    }
  }

  if (hasEffort && levels.size > 0) {
    return [...levels]
  }
  if (hasToggleOrBudget || reasoning) {
    // 无具名 effort 时：官方默认 low/med/high（efforts: true）
    return ['low', 'medium', 'high']
  }
  return undefined
}

function modalitiesOf(
  metadata: ModelMetadata,
  offering?: CatalogModel
): { input: ModelModality[]; output: ModelModality[] } {
  const input = (offering?.modalities?.input ??
    metadata.modalities?.input ?? ['text']) as ModelModality[]
  const output = (offering?.modalities?.output ??
    metadata.modalities?.output ?? ['text']) as ModelModality[]
  return {
    input: input.length ? input : ['text'],
    output: output.length ? output : ['text']
  }
}

function infoFromMetadata(
  configuredId: string,
  metadata: ModelMetadata
): ResolvedModelInfo {
  const [ownerId] = metadata.id.split('/')
  const owner = providers[ownerId]
  const offering = findOffering(metadata)
  const cost = offering.model?.cost
  const reasoning = Boolean(
    offering.model?.reasoning ?? metadata.reasoning ?? false
  )
  const mods = modalitiesOf(metadata, offering.model)
  return {
    configuredId,
    id: metadata.id,
    name: metadata.name || metadata.id,
    providerId: ownerId,
    providerName: owner?.name ?? ownerId,
    logoUrl: `${MODELS_DEV_LOGO_BASE_URL}/${encodeURIComponent(ownerId)}.svg`,
    contextWindow:
      metadata.limit?.context ||
      offering.model?.limit.context ||
      DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens:
      metadata.limit?.output ||
      offering.model?.limit.output ||
      DEFAULT_MAX_OUTPUT,
    reasoning,
    effortLevels: effortLevelsFromOptions(
      offering.model?.reasoning_options,
      reasoning
    ),
    inputModalities: mods.input,
    outputModalities: mods.output,
    attachment: Boolean(
      offering.model?.attachment ?? metadata.attachment ?? false
    ),
    toolCall: Boolean(
      offering.model?.tool_call ?? metadata.tool_call ?? true
    ),
    price: {
      input: cost?.input ?? 0,
      output: cost?.output ?? 0,
      cacheRead: cost?.cache_read ?? 0,
      cacheWrite: cost?.cache_write ?? 0
    },
    matched: true
  }
}

/**
 * 仅按模型 ID 匹配 Models.dev；baseURL 保留在签名中以兼容现有调用方，但不参与匹配。
 * 未命中时 reasoning=false，避免所有未知模型都显示思考档。
 */
export function resolveModelInfo(
  modelId: string,
  _baseURL?: string
): ResolvedModelInfo {
  const metadata = findMetadata(modelId)
  if (metadata) return infoFromMetadata(modelId, metadata)

  return {
    configuredId: modelId,
    id: modelId,
    name: modelId,
    providerId: 'unknown',
    providerName: '未识别模型',
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxOutputTokens: DEFAULT_MAX_OUTPUT,
    reasoning: false,
    effortLevels: undefined,
    inputModalities: ['text'],
    outputModalities: ['text'],
    attachment: false,
    toolCall: true,
    price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    matched: false
  }
}

/** 将 Models.dev logo 持久化到 userData，并返回无需联网即可显示的数据 URL。 */
export async function cacheModelLogo(
  info: ResolvedModelInfo
): Promise<ResolvedModelInfo> {
  if (!info.logoUrl || !info.matched) return info

  let pending = logoCache.get(info.providerId)
  if (!pending) {
    pending = loadOrDownloadLogo(info.providerId, info.logoUrl)
    logoCache.set(info.providerId, pending)
  }

  const logo = await pending
  return {
    ...info,
    logoUrl: logo?.dataUrl,
    logoMonochrome: logo?.monochrome
  }
}
