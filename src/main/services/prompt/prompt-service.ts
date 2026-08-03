/** 内置提示词资源读取服务。 */
import { promises as fs } from 'fs'
import path from 'path'
import { app } from 'electron'
import { parsePromptCategoryResource, type PromptCategoryResource } from '../../../shared/prompts'
import { pathExists } from '../utils/fs-utils'

export class PromptService {
  /** 兼容开发目录、asar 内 resources 和 electron-builder extraResources。 */
  private async resolveBuiltinSource(): Promise<string | null> {
    const candidates = [
      path.join(process.resourcesPath || '', 'prompts'),
      path.join(process.resourcesPath || '', 'resources', 'prompts'),
      path.join(app.getAppPath(), 'resources', 'prompts'),
      path.join(process.cwd(), 'resources', 'prompts')
    ]
    for (const candidate of candidates) {
      if (candidate && (await pathExists(candidate))) return candidate
    }
    return null
  }

  async listBuiltinPrompts(): Promise<PromptCategoryResource[]> {
    const source = await this.resolveBuiltinSource()
    if (!source) {
      throw new Error('未找到内置提示词资源目录，请确认 resources/prompts 已打包。')
    }

    const entries = await fs.readdir(source, { withFileTypes: true })
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.'))
      .sort((left, right) => left.name.localeCompare(right.name))

    if (files.length === 0) {
      throw new Error(`内置提示词资源目录为空: ${source}`)
    }

    const categoryIds = new Set<string>()
    const promptIds = new Set<string>()
    const categories: PromptCategoryResource[] = []
    for (const file of files) {
      const filePath = path.join(source, file.name)
      let parsed: unknown
      try {
        parsed = JSON.parse(await fs.readFile(filePath, 'utf-8'))
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`读取内置提示词资源失败 ${file.name}: ${message}`)
      }

      const category = parsePromptCategoryResource(parsed, file.name)
      const expectedId = path.basename(file.name, '.json')
      if (category.id !== expectedId) {
        throw new Error(`${file.name} 的 id 必须与文件名一致: ${expectedId}`)
      }
      if (categoryIds.has(category.id)) {
        throw new Error(`内置提示词分类 id 重复: ${category.id}`)
      }
      categoryIds.add(category.id)
      for (const prompt of category.prompts) {
        if (promptIds.has(prompt.id)) {
          throw new Error(`内置提示词 id 重复: ${prompt.id}`)
        }
        promptIds.add(prompt.id)
      }
      categories.push(category)
    }
    return categories
  }
}
