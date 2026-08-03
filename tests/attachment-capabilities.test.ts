import { describe, expect, it } from 'vitest'
import { prepareComposerMessage } from '../src/renderer/src/components/assistant-ui/attachment-payload'
import { getModelAttachmentCapabilities } from '../src/renderer/src/components/assistant-ui/attachment-capabilities'
import { convertUiMessage } from '../src/renderer/src/components/create/assistant/convert-message'
import type { LlmSelectableModel } from '../src/shared/llm-settings'
import type { AppendMessage } from '@assistant-ui/react'

function model(
  patch: Partial<Pick<LlmSelectableModel, 'attachment' | 'inputModalities'>>
): Pick<LlmSelectableModel, 'attachment' | 'inputModalities'> {
  return {
    attachment: true,
    inputModalities: ['text'],
    ...patch
  }
}

describe('model attachment capabilities', () => {
  it('纯文本模型只允许文本附件', () => {
    const capabilities = getModelAttachmentCapabilities(model({}))

    expect(capabilities.canAttach).toBe(true)
    expect(capabilities.canAttachText).toBe(true)
    expect(capabilities.canAttachImage).toBe(false)
    expect(capabilities.accept).toContain('.md')
    expect(capabilities.accept).not.toContain('image/*')
  })

  it('支持图片的模型同时允许文本和图片', () => {
    const capabilities = getModelAttachmentCapabilities(
      model({ inputModalities: ['text', 'image'] })
    )

    expect(capabilities.canAttachText).toBe(true)
    expect(capabilities.canAttachImage).toBe(true)
    expect(capabilities.accept).toContain('image/*')
  })

  it('附件标记关闭时不允许任何附件', () => {
    const capabilities = getModelAttachmentCapabilities(model({ attachment: false }))

    expect(capabilities).toMatchObject({
      canAttach: false,
      canAttachText: false,
      canAttachImage: false,
      accept: ''
    })
  })
})

describe('prepareComposerMessage', () => {
  it('把文本附件加入用户正文，并把图片转换为 Agent 图片输入', () => {
    const attachments = [
      {
        id: 'text-1',
        type: 'document',
        name: 'notes.md',
        contentType: 'text/markdown',
        content: [{ type: 'text', text: '<attachment name=notes.md>内容</attachment>' }],
        status: { type: 'complete' }
      },
      {
        id: 'image-1',
        type: 'image',
        name: 'cover.png',
        contentType: 'image/png',
        content: [{ type: 'image', image: 'data:image/png;base64,QUJD' }],
        status: { type: 'complete' }
      }
    ] as NonNullable<AppendMessage['attachments']>

    const result = prepareComposerMessage(
      [{ type: 'text', text: '请检查附件' }],
      attachments
    )

    expect(result.text).toContain('请检查附件')
    expect(result.text).toContain('notes.md')
    expect(result.text).not.toContain('[附件:图片 cover.png]')
    expect(result.images).toEqual([
      { name: 'cover.png', data: 'QUJD', mimeType: 'image/png' }
    ])
  })

  it('把图片附件转换为用户消息中的可展示图片，并清理旧占位标记', () => {
    const message = convertUiMessage({
      id: 'msg-1',
      role: 'user',
      createdAt: '2026-08-03T00:00:00.000Z',
      parts: [{ type: 'text', text: '图片是什么\n[附件:图片 cover.png]' }],
      attachments: [{ name: 'cover.png', data: 'QUJD', mimeType: 'image/png' }],
      status: 'complete'
    })

    expect(message.content).toEqual([{ type: 'text', text: '图片是什么' }])
    expect(message.attachments).toMatchObject([
      {
        type: 'image',
        name: 'cover.png',
        contentType: 'image/png',
        content: [
          {
            type: 'image',
            image: 'data:image/png;base64,QUJD'
          }
        ]
      }
    ])
  })
})
