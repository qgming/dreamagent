/**
 * LLM 设置服务：API Key 用 electron safeStorage 加密落盘
 */
import { app, safeStorage } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import type {
  LlmPublicSettings,
  LlmSettingsPatch,
  LlmStoredSettings
} from '../../shared/llm-settings'
import { DEFAULT_LLM_PUBLIC } from '../../shared/llm-settings'
import { ensureDir, pathExists, readJsonFile, writeJsonAtomic } from './fs-utils'

const PLAIN_PREFIX = 'plain:'

function maskKey(key: string): string | undefined {
  const t = key.trim()
  if (!t) return undefined
  if (t.length <= 8) return '••••'
  return `${t.slice(0, 3)}••••${t.slice(-4)}`
}

export class LlmSettingsService {
  private cache: LlmStoredSettings | null = null

  private filePath(): string {
    return path.join(app.getPath('userData'), 'llm-settings.json')
  }

  private async load(): Promise<LlmStoredSettings> {
    if (this.cache) return this.cache
    const file = this.filePath()
    const raw = (await readJsonFile<Partial<LlmStoredSettings>>(file)) ?? {}
    this.cache = {
      provider: raw.provider === 'openai-compatible' ? raw.provider : 'openai-compatible',
      baseURL: typeof raw.baseURL === 'string' && raw.baseURL.trim() ? raw.baseURL.trim() : DEFAULT_LLM_PUBLIC.baseURL,
      modelId: typeof raw.modelId === 'string' && raw.modelId.trim() ? raw.modelId.trim() : DEFAULT_LLM_PUBLIC.modelId,
      apiKeyEnc: typeof raw.apiKeyEnc === 'string' ? raw.apiKeyEnc : undefined
    }
    return this.cache
  }

  private async save(next: LlmStoredSettings): Promise<void> {
    const file = this.filePath()
    await ensureDir(path.dirname(file))
    await writeJsonAtomic(file, next)
    this.cache = next
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

  async getPublic(): Promise<LlmPublicSettings> {
    const stored = await this.load()
    const key = this.decryptKey(stored.apiKeyEnc)
    return {
      provider: stored.provider,
      baseURL: stored.baseURL,
      modelId: stored.modelId,
      hasApiKey: Boolean(key),
      apiKeyHint: maskKey(key)
    }
  }

  /** 主进程内部：取明文 key（禁止 IPC 回传） */
  async getApiKey(): Promise<string> {
    const stored = await this.load()
    return this.decryptKey(stored.apiKeyEnc)
  }

  async getRuntimeConfig(): Promise<{
    provider: LlmStoredSettings['provider']
    baseURL: string
    modelId: string
    apiKey: string
  }> {
    const stored = await this.load()
    return {
      provider: stored.provider,
      baseURL: stored.baseURL.replace(/\/+$/, ''),
      modelId: stored.modelId,
      apiKey: this.decryptKey(stored.apiKeyEnc)
    }
  }

  async set(patch: LlmSettingsPatch): Promise<LlmPublicSettings> {
    const stored = await this.load()
    const next: LlmStoredSettings = { ...stored }

    if (patch.provider) next.provider = patch.provider
    if (typeof patch.baseURL === 'string' && patch.baseURL.trim()) {
      next.baseURL = patch.baseURL.trim().replace(/\/+$/, '')
    }
    if (typeof patch.modelId === 'string' && patch.modelId.trim()) {
      next.modelId = patch.modelId.trim()
    }
    if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
      next.apiKeyEnc = this.encryptKey(patch.apiKey.trim())
    }

    await this.save(next)
    return this.getPublic()
  }

  async assertConfigured(): Promise<void> {
    const cfg = await this.getRuntimeConfig()
    if (!cfg.apiKey) throw new Error('尚未配置 API Key，请到设置 → 模型 中填写')
    if (!cfg.baseURL) throw new Error('尚未配置 Base URL')
    if (!cfg.modelId) throw new Error('尚未配置模型 ID')
  }

  /** 开发辅助：确认文件存在 */
  async exists(): Promise<boolean> {
    return pathExists(this.filePath())
  }
}
