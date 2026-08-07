import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  type AttachmentAdapter
} from '@assistant-ui/react'
import type { LlmSelectableModel } from '@shared/llm-settings'

export const TEXT_ATTACHMENT_ACCEPT = [
  'text/*',
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/xml',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  '.txt',
  '.md',
  '.markdown',
  '.mdx',
  '.json',
  '.jsonc',
  '.csv',
  '.xml',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.conf',
  '.env',
  '.sql',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.sh',
  '.bat',
  '.ps1',
  '.log',
  '.srt',
  '.vtt'
].join(',')

export interface ModelAttachmentCapabilities {
  canAttach: boolean
  canAttachText: boolean
  canAttachImage: boolean
  accept: string
}

export interface AttachmentCapabilityOptions {
  /**
   * 已配置多模态桥接时，即使主模型不支持 image，
   * 也允许贴图（由主进程后台桥接处理）。
   */
  hasMultimodalBridge?: boolean
}

export function getModelAttachmentCapabilities(
  model: Pick<LlmSelectableModel, 'attachment' | 'inputModalities'> | null | undefined,
  options?: AttachmentCapabilityOptions
): ModelAttachmentCapabilities {
  // 主模型无附件能力时：若有视觉桥接仍可允许图片
  if (!model?.attachment) {
    if (options?.hasMultimodalBridge) {
      return {
        canAttach: true,
        canAttachText: false,
        canAttachImage: true,
        accept: 'image/*'
      }
    }
    return {
      canAttach: false,
      canAttachText: false,
      canAttachImage: false,
      accept: ''
    }
  }

  const modalities = new Set(
    model.inputModalities.length > 0 ? model.inputModalities : ['text']
  )
  const canAttachText = modalities.has('text')
  const canAttachImage =
    modalities.has('image') || Boolean(options?.hasMultimodalBridge)
  const accepts = [
    canAttachText ? TEXT_ATTACHMENT_ACCEPT : '',
    canAttachImage ? 'image/*' : ''
  ].filter(Boolean)

  return {
    canAttach: accepts.length > 0,
    canAttachText,
    canAttachImage,
    accept: accepts.join(',')
  }
}

export function createAttachmentAdapter(
  model: Pick<LlmSelectableModel, 'attachment' | 'inputModalities'> | null | undefined,
  options?: AttachmentCapabilityOptions
): AttachmentAdapter | undefined {
  const capabilities = getModelAttachmentCapabilities(model, options)
  if (!capabilities.canAttach) return undefined

  const adapters: AttachmentAdapter[] = []
  if (capabilities.canAttachImage) {
    adapters.push(new SimpleImageAttachmentAdapter())
  }
  if (capabilities.canAttachText) {
    const textAdapter = new SimpleTextAttachmentAdapter()
    textAdapter.accept = TEXT_ATTACHMENT_ACCEPT
    adapters.push(textAdapter)
  }
  return adapters.length > 0 ? new CompositeAttachmentAdapter(adapters) : undefined
}
