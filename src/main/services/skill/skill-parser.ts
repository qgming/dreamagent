/**
 * SKILL.md 轻量 frontmatter 解析（Agent Skills 标准）
 */

export interface ParsedSkillMd {
  name: string
  description: string
  displayName?: string
  version?: string
  body: string
  raw: string
  errors: string[]
}

/**
 * 解析 SKILL.md 内容。
 * 允许缺 frontmatter 时降级：name 由调用方补目录名。
 */
export function parseSkillMd(raw: string, fallbackName = ''): ParsedSkillMd {
  const normalized = raw.replace(/\r\n/g, '\n')
  const errors: string[] = []

  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!match) {
    errors.push('缺少 YAML frontmatter（--- ... ---）')
    const body = normalized.trim()
    const name = fallbackName || 'skill'
    return {
      name,
      description: firstMeaningfulLine(body) || '未提供技能描述',
      body,
      raw: normalized,
      errors
    }
  }

  const [, yamlText, bodyRaw] = match
  const body = bodyRaw.trim()
  const fm = parseSimpleYaml(yamlText)

  const name =
    (typeof fm.name === 'string' && fm.name.trim()) || fallbackName || 'skill'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
    errors.push(`技能 name 不合法：${name}（需 kebab-case）`)
  }

  let description = ''
  if (typeof fm.description === 'string') {
    description = fm.description.trim()
  }
  if (!description) {
    errors.push('缺少 description')
    description = firstMeaningfulLine(body) || '未提供技能描述'
  }

  const metadata =
    fm.metadata && typeof fm.metadata === 'object' && !Array.isArray(fm.metadata)
      ? (fm.metadata as Record<string, unknown>)
      : undefined

  const displayName =
    (typeof metadata?.displayName === 'string' && metadata.displayName.trim()) ||
    (typeof fm.displayName === 'string' && fm.displayName.trim()) ||
    undefined

  const version =
    (typeof metadata?.version === 'string' && metadata.version.trim()) ||
    (typeof fm.version === 'string' && fm.version.trim()) ||
    undefined

  return {
    name,
    description,
    displayName,
    version,
    body,
    raw: normalized,
    errors
  }
}

function firstMeaningfulLine(text: string): string {
  for (const line of text.split('\n')) {
    const t = line.trim().replace(/^#+\s*/, '')
    if (t) return t
  }
  return ''
}

/**
 * 极简 YAML：支持 key: value、|/> 块标量、一层嵌套对象。
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')
  let currentObject: Record<string, string> | null = null
  let currentObjectKey: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // 对象键：metadata:
    if (trimmed.endsWith(':') && !trimmed.slice(0, -1).includes(':') && !trimmed.includes(' ')) {
      currentObject = {}
      currentObjectKey = trimmed.slice(0, -1)
      result[currentObjectKey] = currentObject
      continue
    }

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex <= 0) continue

    const key = trimmed.slice(0, colonIndex).trim()
    let value = trimmed.slice(colonIndex + 1).trim()

    // 块标量 | 或 >
    if (/^[>|][+-]?$/.test(value)) {
      const isFolded = value.startsWith('>')
      const blockLines: string[] = []
      const baseIndent = line.length - line.trimStart().length
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j]
        if (next.trim() === '') {
          blockLines.push('')
          i = j
          continue
        }
        const indent = next.length - next.trimStart().length
        if (indent <= baseIndent) break
        blockLines.push(next.slice(baseIndent + 2) || next.trim())
        i = j
      }
      value = isFolded
        ? blockLines.map((l) => l.trim()).join(' ').replace(/\s+/g, ' ').trim()
        : blockLines.join('\n').trimEnd()
    } else if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    // 嵌套对象字段（缩进 2+）
    if (currentObject && line.startsWith('  ') && currentObjectKey) {
      currentObject[key] = value
    } else {
      result[key] = value
      currentObject = null
      currentObjectKey = null
    }
  }

  return result
}
