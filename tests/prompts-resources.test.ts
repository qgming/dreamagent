import { promises as fs } from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { parsePromptCategoryResource, type PromptCategoryResource } from '../src/shared/prompts'

const resourcesRoot = path.resolve(process.cwd(), 'resources/prompts')

describe('内置提示词资源', () => {
  it('每个默认分类使用一个合法的 JSON 文件', async () => {
    const entries = await fs.readdir(resourcesRoot, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((left, right) => left.name.localeCompare(right.name))
    const categories: PromptCategoryResource[] = []

    for (const file of files) {
      const raw = JSON.parse(await fs.readFile(path.join(resourcesRoot, file.name), 'utf-8')) as unknown
      const category = parsePromptCategoryResource(raw, file.name)
      expect(category.id).toBe(path.basename(file.name, '.json'))
      categories.push(category)
    }

    expect(categories.map((category) => category.id)).toEqual([
      'characters',
      'plot',
      'review',
      'scene',
      'writing'
    ])
    expect(categories.flatMap((category) => category.prompts)).toHaveLength(6)
    expect(
      categories.flatMap((category) =>
        category.prompts.map((prompt) => `${prompt.id}:${category.id}`)
      )
    ).toEqual([
      'builtin-character-profile:characters',
      'builtin-plot-reversal:plot',
      'builtin-continuity-check:review',
      'builtin-scene-design:scene',
      'builtin-continue-writing:writing',
      'builtin-polish-prose:writing'
    ])
  })
})
