import type { AppendMessage } from '@assistant-ui/react'
import type { UiImageAttachment } from '@shared/ui-chat'

type ComposerAttachment = NonNullable<AppendMessage['attachments']>[number]

export interface PreparedComposerMessage {
  text: string
  images: UiImageAttachment[]
}

function parseImageDataUrl(
  value: string,
  fallbackMimeType: string
): { data: string; mimeType: string } | null {
  const match = value.match(/^data:([^;,]+)?;base64,(.*)$/s)
  if (!match?.[2]) return null
  return {
    data: match[2],
    mimeType: match[1] || fallbackMimeType || 'image/png'
  }
}

export function prepareComposerMessage(
  content: AppendMessage['content'],
  attachments: readonly ComposerAttachment[] = []
): PreparedComposerMessage {
  const textParts = content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
  const attachmentTexts: string[] = []
  const images: UiImageAttachment[] = []

  for (const attachment of attachments) {
    if (attachment.type === 'image') {
      const imagePart = attachment.content?.find(
        (part): part is { type: 'image'; image: string } => part.type === 'image'
      )
      const parsed = imagePart
        ? parseImageDataUrl(imagePart.image, attachment.contentType ?? '')
        : null
      if (parsed) {
        images.push({
          name: attachment.name,
          data: parsed.data,
          mimeType: parsed.mimeType
        })
      }
      continue
    }

    const text = attachment.content
      ?.filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
    if (text?.trim()) attachmentTexts.push(text)
    else attachmentTexts.push(`[附件:文件 ${attachment.name}]`)
  }

  return {
    text: [...textParts, ...attachmentTexts].filter(Boolean).join('\n').trim(),
    images
  }
}
