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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 原子写入 JSON。
 * Windows 上 rename 覆盖/并发极易 EPERM/ENOENT，采用：
 * 写临时文件 → 多次 rename 重试 → 仍失败则 copyFile 覆盖 + 删临时文件。
 */
export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })

  const tmp = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  )
  const text = `${JSON.stringify(data, null, 2)}\n`
  await fs.writeFile(tmp, text, 'utf-8')

  const maxAttempts = 8
  let lastError: unknown

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Node 16.9+：Windows 上 overwrite 更稳
      await fs.rename(tmp, filePath)
      return
    } catch (error) {
      lastError = error
      const code = (error as NodeJS.ErrnoException).code
      // 目标被占用 / 并发写入：稍等再试
      if (
        code === 'EPERM' ||
        code === 'EACCES' ||
        code === 'EEXIST' ||
        code === 'EBUSY' ||
        code === 'ENOENT'
      ) {
        try {
          await fs.unlink(filePath)
        } catch {
          // 目标本就不存在或仍被锁
        }
        await sleep(15 * (attempt + 1))
        continue
      }
      break
    }
  }

  // 回退：直接覆盖写目标，再删临时文件
  try {
    await fs.copyFile(tmp, filePath)
    try {
      await fs.unlink(tmp)
    } catch {
      // 忽略临时文件清理失败
    }
    return
  } catch (copyError) {
    try {
      await fs.unlink(tmp)
    } catch {
      // 忽略
    }
    throw copyError ?? lastError
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
