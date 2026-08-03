/** 会话标题辅助逻辑：清理 AI 标题，并提供输入前 20 字符兜底。 */

export const SESSION_TITLE_MAX_LENGTH = 20

function limitTitle(input: string): string {
  return Array.from(input).slice(0, SESSION_TITLE_MAX_LENGTH).join('')
}

/** 清理 AI 返回的标题，兼容“标题：xxx”或 Markdown 引号。 */
export function normalizeSessionTitle(input: string): string {
  const firstLine = input
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (!firstLine) return ''

  const withoutLabel = firstLine.replace(/^(?:会话标题|标题|title)\s*[:：-]\s*/i, '')
  return limitTitle(withoutLabel.trim())
}

/** AI 标题生成失败时，直接使用首条用户输入的前 20 个字符。 */
export function fallbackSessionTitle(input: string): string {
  return limitTitle(input.trim())
}
