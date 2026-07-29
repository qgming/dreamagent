import { promises as fs } from 'fs'
import path from 'path'

/**
 * 判断路径是否存在
 */
export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

/**
 * 原子写入 JSON：先写临时文件再替换，避免半截文件
 */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const tmp = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  const text = `${JSON.stringify(data, null, 2)}\n`

  await fs.writeFile(tmp, text, 'utf-8')

  try {
    // Windows 上目标存在时 rename 可能失败，先尝试直接替换
    await fs.rename(tmp, filePath)
  } catch {
    try {
      await fs.unlink(filePath)
    } catch {
      // 目标本就不存在
    }
    await fs.rename(tmp, filePath)
  }
}

/**
 * 读取 JSON 文件；不存在则返回 null
 */
export async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const text = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(text) as T
  } catch (error) {
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw error
  }
}

/**
 * 递归删除目录
 */
export async function removeDir(target: string): Promise<void> {
  await fs.rm(target, { recursive: true, force: true })
}

/**
 * 确保目录存在
 */
export async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true })
}

/**
 * 列出目录下的直接子目录名
 */
export async function listSubdirNames(dir: string): Promise<string[]> {
  if (!(await pathExists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries.filter((e) => e.isDirectory()).map((e) => e.name)
}

/**
 * 列出目录下匹配扩展名的文件名（不含路径）
 */
export async function listFileNames(dir: string, ext = '.json'): Promise<string[]> {
  if (!(await pathExists(dir))) return []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(ext) && !e.name.startsWith('.'))
    .map((e) => e.name)
}
