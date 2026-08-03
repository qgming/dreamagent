/**
 * 技能服务：内置同步、扫描、ZIP 导入、启用偏好、转 pi Skill
 */
import { app, dialog } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import JSZip from 'jszip'
import type { Skill as PiSkill } from '@earendil-works/pi-agent-core'
import type {
  CreateSkillInput,
  ImportSkillZipResult,
  SkillDetail,
  SkillPreferences,
  SkillSourceKind,
  SkillSummary,
  SkillWriteResult,
  UninstallSkillResult,
  WriteSkillFileInput
} from '../../../shared/skills'
import {
  ensureDir,
  listSubdirNames,
  pathExists,
  readJsonFile,
  removeDir,
  writeJsonAtomic
} from '../utils/fs-utils'
import { parseSkillMd } from './skill-parser'

const MAX_ARCHIVE_ENTRIES = 200
const MAX_ARCHIVE_FILE_SIZE = 5 * 1024 * 1024
const MAX_ARCHIVE_TOTAL_SIZE = 20 * 1024 * 1024
const MAX_ARCHIVE_DEPTH = 8
const BLOCKED_EXTENSIONS = new Set([
  'exe',
  'dll',
  'bat',
  'cmd',
  'sh',
  'ps1',
  'msi',
  'com',
  'scr',
  'js'
])

interface LoadedSkill {
  summary: SkillSummary
  body: string
  rawMarkdown: string
  content: string
}

/**
 * 技能存储与加载
 */
export class SkillService {
  private cache: LoadedSkill[] | null = null

  private skillsRoot(): string {
    return path.join(app.getPath('userData'), 'skills')
  }

  private builtinRoot(): string {
    return path.join(this.skillsRoot(), 'builtin')
  }

  private customRoot(): string {
    return path.join(this.skillsRoot(), 'custom')
  }

  private prefsPath(): string {
    return path.join(this.skillsRoot(), 'preferences.json')
  }

  /** 解析打包内的内置技能源目录 */
  private async resolveBuiltinSource(): Promise<string | null> {
    const candidates = [
      // extraResources → resourcesPath/skills
      path.join(process.resourcesPath || '', 'skills'),
      // asar / 开发包内 resources/skills
      path.join(process.resourcesPath || '', 'resources', 'skills'),
      path.join(app.getAppPath(), 'resources', 'skills'),
      path.join(process.cwd(), 'resources', 'skills')
    ]
    for (const c of candidates) {
      if (c && (await pathExists(c))) return c
    }
    return null
  }

  /**
   * 启动时：建目录 + 同步内置技能
   */
  async ensureReady(): Promise<void> {
    await ensureDir(this.builtinRoot())
    await ensureDir(this.customRoot())
    await this.syncBuiltinSkills()
    this.cache = null
  }

  /** 全量覆盖同步内置技能（用户内容只放 custom） */
  private async syncBuiltinSkills(): Promise<void> {
    const source = await this.resolveBuiltinSource()
    if (!source) {
      console.warn('[skill-service] 未找到内置技能资源目录')
      return
    }
    const target = this.builtinRoot()
    // 安全：仅允许 userData 下
    const base = path.resolve(this.skillsRoot())
    const resolvedTarget = path.resolve(target)
    if (resolvedTarget !== base && !resolvedTarget.startsWith(`${base}${path.sep}`)) {
      throw new Error(`拒绝写入 userData 之外的路径: ${resolvedTarget}`)
    }
    await removeDir(target)
    await this.copyDir(source, target)
    console.log(`[skill-service] 已同步内置技能: ${source} → ${target}`)
  }

  private async copyDir(source: string, target: string): Promise<void> {
    await ensureDir(target)
    const entries = await fs.readdir(source, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const from = path.join(source, entry.name)
      const to = path.join(target, entry.name)
      if (entry.isDirectory()) {
        await this.copyDir(from, to)
      } else if (entry.isFile()) {
        await ensureDir(path.dirname(to))
        await fs.copyFile(from, to)
      }
    }
  }

  private async readPreferences(): Promise<SkillPreferences> {
    const raw = await readJsonFile<Partial<SkillPreferences>>(this.prefsPath())
    const enabledById =
      raw?.enabledById && typeof raw.enabledById === 'object' ? raw.enabledById : {}
    return { enabledById: { ...enabledById } }
  }

  private async writePreferences(prefs: SkillPreferences): Promise<void> {
    await writeJsonAtomic(this.prefsPath(), prefs)
  }

  private invalidate(): void {
    this.cache = null
  }

  /**
   * 扫描全部技能
   */
  async listSkills(): Promise<SkillSummary[]> {
    const loaded = await this.loadAll()
    return loaded.map((s) => s.summary)
  }

  async getDetail(id: string): Promise<SkillDetail> {
    const loaded = await this.loadAll()
    const hit = loaded.find((s) => s.summary.id === id)
    if (!hit) throw new Error(`技能不存在: ${id}`)

    const references = await this.listReferences(hit.summary.installPath)
    return {
      ...hit.summary,
      body: hit.body,
      rawMarkdown: hit.rawMarkdown,
      references
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<SkillSummary[]> {
    const loaded = await this.loadAll()
    if (!loaded.some((s) => s.summary.id === id)) {
      throw new Error(`技能不存在: ${id}`)
    }
    const prefs = await this.readPreferences()
    prefs.enabledById[id] = enabled
    await this.writePreferences(prefs)
    this.invalidate()
    return this.listSkills()
  }

  async uninstall(id: string): Promise<UninstallSkillResult> {
    const loaded = await this.loadAll()
    const hit = loaded.find((s) => s.summary.id === id)
    if (!hit) throw new Error(`技能不存在: ${id}`)
    if (hit.summary.sourceKind === 'builtin') {
      throw new Error('无法删除内置技能')
    }
    await removeDir(hit.summary.installPath)
    const prefs = await this.readPreferences()
    delete prefs.enabledById[id]
    await this.writePreferences(prefs)
    this.invalidate()
    return { id, removed: true }
  }

  /**
   * 新建自定义技能（custom 目录）
   */
  async createSkill(input: CreateSkillInput): Promise<SkillWriteResult> {
    const name = sanitizeSlug(String(input.name || ''))
    validateSkillId(name)
    const description = String(input.description || '').trim()
    if (!description) throw new Error('技能 description 不能为空')

    const customDir = this.customRoot()
    await ensureDir(customDir)
    const target = path.join(customDir, name)
    if (await pathExists(target)) {
      throw new Error(`技能已存在: ${name}`)
    }

    // 与 builtin 同名时允许创建 custom（扫描时 custom 覆盖 builtin）
    const content =
      input.content?.trim() ||
      buildDefaultSkillMd({
        name,
        description,
        displayName: input.displayName?.trim()
      })

    const parsed = parseSkillMd(content, name)
    if (parsed.errors.length > 0 && !parsed.description) {
      throw new Error(`SKILL.md 无效: ${parsed.errors.join('; ')}`)
    }
    // frontmatter name 必须与目录一致
    if (parsed.name !== name) {
      throw new Error(`SKILL.md 的 name「${parsed.name}」必须等于 id「${name}」`)
    }

    await ensureDir(target)
    await ensureDir(path.join(target, 'references'))
    const skillMdPath = path.join(target, 'SKILL.md')
    await fs.writeFile(skillMdPath, ensureTrailingNewline(content), 'utf-8')

    const prefs = await this.readPreferences()
    prefs.enabledById[name] = true
    await this.writePreferences(prefs)
    this.invalidate()

    return {
      id: name,
      path: skillMdPath,
      message: `技能「${name}」已创建`
    }
  }

  /**
   * 写入技能内文件（仅 custom；默认写 SKILL.md）
   */
  async writeSkillFile(input: WriteSkillFileInput): Promise<SkillWriteResult> {
    const id = sanitizeSlug(String(input.id || ''))
    validateSkillId(id)
    const relativePath = String(input.relativePath || 'SKILL.md').replace(/\\/g, '/').trim()
    if (!relativePath) throw new Error('relativePath 不能为空')
    if (relativePath.includes('..') || path.isAbsolute(relativePath)) {
      throw new Error('relativePath 不合法')
    }
    const content = String(input.content ?? '')
    if (!content.trim() && relativePath.toLowerCase() === 'skill.md') {
      throw new Error('SKILL.md 内容不能为空')
    }

    const hit = await this.requireCustomSkill(id)
    const abs = resolveInside(hit.summary.installPath, relativePath)

    // 写 SKILL.md 时校验
    if (path.basename(relativePath).toLowerCase() === 'skill.md') {
      const parsed = parseSkillMd(content, id)
      if (parsed.errors.length > 0 && !parsed.description) {
        throw new Error(`SKILL.md 无效: ${parsed.errors.join('; ')}`)
      }
      if (parsed.name !== id) {
        throw new Error(`SKILL.md 的 name「${parsed.name}」必须等于 id「${id}」`)
      }
      await this.backupSkillMd(hit.summary.skillFilePath)
    }

    await ensureDir(path.dirname(abs))
    await fs.writeFile(abs, ensureTrailingNewline(content), 'utf-8')
    this.invalidate()
    return {
      id,
      path: abs,
      message: `已写入 ${relativePath}`
    }
  }

  /**
   * 读取技能内相对文件（不要求 enabled；供 UI/编辑）
   */
  async readSkillFileContent(id: string, relativePath: string): Promise<string> {
    const loaded = await this.loadAll()
    const hit = loaded.find((s) => s.summary.id === id)
    if (!hit) throw new Error(`技能不存在: ${id}`)
    const abs = resolveInside(hit.summary.installPath, relativePath)
    return fs.readFile(abs, 'utf-8')
  }

  /** 仅 custom 可写 */
  private async requireCustomSkill(id: string): Promise<LoadedSkill> {
    const loaded = await this.loadAll()
    const hit = loaded.find((s) => s.summary.id === id)
    if (!hit) throw new Error(`技能不存在: ${id}`)
    // 若 id 同时存在 builtin，custom 覆盖后 sourceKind 为 custom
    if (hit.summary.sourceKind === 'builtin') {
      throw new Error('无法修改内置技能；请新建自定义技能或导入 ZIP')
    }
    // 双重确认路径在 custom 下
    const customRoot = path.resolve(this.customRoot())
    const install = path.resolve(hit.summary.installPath)
    if (install !== customRoot && !install.startsWith(`${customRoot}${path.sep}`)) {
      throw new Error('只能修改 custom 目录下的技能')
    }
    return hit
  }

  /** SKILL.md 简单备份（最多 10 个） */
  private async backupSkillMd(skillMdPath: string): Promise<void> {
    if (!(await pathExists(skillMdPath))) return
    const dir = path.dirname(skillMdPath)
    const bakDir = path.join(dir, '.bak')
    await ensureDir(bakDir)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const bakPath = path.join(bakDir, `SKILL.md.${stamp}.bak`)
    await fs.copyFile(skillMdPath, bakPath)
    // 清理旧备份
    try {
      const files = (await fs.readdir(bakDir))
        .filter((n) => n.startsWith('SKILL.md.') && n.endsWith('.bak'))
        .sort()
      while (files.length > 10) {
        const old = files.shift()
        if (old) await fs.unlink(path.join(bakDir, old)).catch(() => undefined)
      }
    } catch {
      // ignore
    }
  }

  /**
   * 弹窗选择 ZIP 并安装
   */
  async importZipFromDialog(): Promise<ImportSkillZipResult | null> {
    const result = await dialog.showOpenDialog({
      title: '导入技能 ZIP',
      properties: ['openFile'],
      filters: [{ name: 'ZIP 技能包', extensions: ['zip'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return this.importZip(result.filePaths[0])
  }

  async importZip(zipPath: string): Promise<ImportSkillZipResult> {
    const source = String(zipPath || '').trim()
    if (!source || !(await pathExists(source))) {
      throw new Error('压缩包文件不存在')
    }
    if (!source.toLowerCase().endsWith('.zip')) {
      throw new Error('仅支持 .zip 格式')
    }

    const customDir = this.customRoot()
    await ensureDir(customDir)
    const tmpRoot = path.join(this.skillsRoot(), '.tmp-install')
    await ensureDir(tmpRoot)
    const baseSlug = sanitizeSlug(path.basename(source, '.zip'))
    const tempDir = await uniqueChild(tmpRoot, baseSlug)
    await ensureDir(tempDir)

    try {
      const zipData = await fs.readFile(source)
      const zip = await JSZip.loadAsync(zipData)
      const entries = Object.values(zip.files).filter((e) => !e.dir)
      if (entries.length === 0) throw new Error('压缩包为空')
      if (entries.length > MAX_ARCHIVE_ENTRIES) {
        throw new Error(`压缩包文件过多（>${MAX_ARCHIVE_ENTRIES}）`)
      }

      let total = 0
      for (const entry of entries) {
        const rel = entry.name.replace(/\\/g, '/')
        if (rel.includes('..') || path.isAbsolute(rel)) {
          throw new Error(`非法路径: ${rel}`)
        }
        const depth = rel.split('/').filter(Boolean).length
        if (depth > MAX_ARCHIVE_DEPTH) {
          throw new Error(`路径过深: ${rel}`)
        }
        const ext = path.extname(rel).slice(1).toLowerCase()
        if (BLOCKED_EXTENSIONS.has(ext)) {
          throw new Error(`禁止的文件类型: .${ext}`)
        }
        const content = await entry.async('nodebuffer')
        if (content.byteLength > MAX_ARCHIVE_FILE_SIZE) {
          throw new Error(`单文件过大: ${rel}`)
        }
        total += content.byteLength
        if (total > MAX_ARCHIVE_TOTAL_SIZE) {
          throw new Error('压缩包总大小超限')
        }
        const targetPath = path.join(tempDir, rel)
        await ensureDir(path.dirname(targetPath))
        await fs.writeFile(targetPath, content)
      }

      const skillRoot = await findInstallableSkillRoot(tempDir)
      const slug = sanitizeSlug(path.basename(skillRoot) || baseSlug)
      // 校验 SKILL.md
      const skillMd = await fs.readFile(path.join(skillRoot, 'SKILL.md'), 'utf-8')
      const parsed = parseSkillMd(skillMd, slug)
      if (parsed.errors.length && !parsed.description) {
        throw new Error(`SKILL.md 无效: ${parsed.errors.join('; ')}`)
      }
      const finalSlug = sanitizeSlug(parsed.name || slug)
      const target = await uniqueChild(customDir, finalSlug)
      await this.copyDir(skillRoot, target)
      this.invalidate()
      return { id: path.basename(target), installPath: target }
    } finally {
      await removeDir(tempDir).catch(() => undefined)
    }
  }

  async reload(): Promise<SkillSummary[]> {
    await this.ensureReady()
    return this.listSkills()
  }

  /**
   * 启用技能 → pi Skill[]
   */
  async getEnabledPiSkills(): Promise<PiSkill[]> {
    const loaded = await this.loadAll()
    return loaded
      .filter((s) => s.summary.enabled && s.summary.isValid)
      .map((s) => ({
        name: s.summary.id,
        description: s.summary.description,
        content: s.content,
        filePath: s.summary.skillFilePath
      }))
  }

  /** 启用 id 列表（签名用） */
  async getEnabledSkillIds(): Promise<string[]> {
    const loaded = await this.loadAll()
    return loaded.filter((s) => s.summary.enabled && s.summary.isValid).map((s) => s.summary.id)
  }

  /**
   * 沙箱读取技能内相对文件（agent：需启用）
   */
  async readSkillRelativeFile(skillId: string, relativePath: string): Promise<string> {
    const loaded = await this.loadAll()
    const hit = loaded.find((s) => s.summary.id === skillId)
    if (!hit || !hit.summary.enabled) {
      throw new Error(`技能不可用: ${skillId}`)
    }
    const abs = resolveInside(hit.summary.installPath, relativePath)
    return fs.readFile(abs, 'utf-8')
  }

  private async loadAll(): Promise<LoadedSkill[]> {
    if (this.cache) return this.cache
    const prefs = await this.readPreferences()
    const builtin = await this.scanRoot(this.builtinRoot(), 'builtin', prefs)
    const custom = await this.scanRoot(this.customRoot(), 'custom', prefs)

    // id 冲突：custom 覆盖 builtin
    const map = new Map<string, LoadedSkill>()
    for (const s of builtin) map.set(s.summary.id, s)
    for (const s of custom) map.set(s.summary.id, s)

    const list = Array.from(map.values()).sort((a, b) =>
      (a.summary.displayName || a.summary.name).localeCompare(
        b.summary.displayName || b.summary.name,
        'zh-CN'
      )
    )
    this.cache = list
    return list
  }

  private async scanRoot(
    root: string,
    sourceKind: SkillSourceKind,
    prefs: SkillPreferences
  ): Promise<LoadedSkill[]> {
    const dirs = await listSubdirNames(root)
    const out: LoadedSkill[] = []
    for (const dir of dirs) {
      if (dir.startsWith('.')) continue
      const installPath = path.join(root, dir)
      const skillFilePath = path.join(installPath, 'SKILL.md')
      if (!(await pathExists(skillFilePath))) continue
      try {
        const raw = await fs.readFile(skillFilePath, 'utf-8')
        const parsed = parseSkillMd(raw, dir)
        const id = parsed.name || dir
        const isValid = parsed.errors.length === 0
        // 无偏好时：校验通过则默认启用（内置与新导入的 custom 均可见）
        const defaultEnabled = isValid
        const explicit = prefs.enabledById[id]
        const enabled = typeof explicit === 'boolean' ? explicit : defaultEnabled

        out.push({
          summary: {
            id,
            name: id,
            displayName: parsed.displayName,
            description: parsed.description,
            version: parsed.version,
            sourceKind,
            enabled,
            installPath,
            skillFilePath,
            isValid,
            errors: parsed.errors
          },
          body: parsed.body,
          rawMarkdown: parsed.raw,
          content: parsed.body
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        out.push({
          summary: {
            id: dir,
            name: dir,
            description: '解析失败',
            sourceKind,
            enabled: false,
            installPath,
            skillFilePath,
            isValid: false,
            errors: [message]
          },
          body: '',
          rawMarkdown: '',
          content: ''
        })
      }
    }
    return out
  }

  private async listReferences(
    installPath: string
  ): Promise<Array<{ name: string; path: string }>> {
    const refDir = path.join(installPath, 'references')
    if (!(await pathExists(refDir))) return []
    const names = await fs.readdir(refDir)
    return names
      .filter((n) => !n.startsWith('.') && n.toLowerCase().endsWith('.md'))
      .map((n) => ({ name: n, path: `references/${n}` }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
  }
}

function sanitizeSlug(input: string): string {
  return (
    String(input)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'skill'
  )
}

function validateSkillId(id: string): void {
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 64) {
    throw new Error(
      `技能 id「${id}」无效：需 kebab-case（小写字母、数字、连字符），长度 1–64`
    )
  }
}

function ensureTrailingNewline(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n')
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`
}

function buildDefaultSkillMd(opts: {
  name: string
  description: string
  displayName?: string
}): string {
  const display = opts.displayName || opts.name
  const desc = opts.description.includes('\n')
    ? opts.description
        .split('\n')
        .map((l) => `  ${l}`)
        .join('\n')
    : `  ${opts.description}`
  return `---
name: ${opts.name}
description: |
${desc}
metadata:
  displayName: ${display}
  version: "1.0.0"
---

# ${opts.name}

## Use When

- （补充触发场景）

## Inputs To Read

1. \`get_project_outline\` / 相关 \`read_beat\` / \`read_entity\` / \`read_chapter\`

## Procedure

1. （按步骤写清动作与工具）

## Quality Gates

- [ ] （可检查标准）

## Outputs / Write-Back

- 结构 → beats；设定 → entities；正文 → chapters（文章 content 禁止双链）
`
}

async function uniqueChild(parent: string, slug: string): Promise<string> {
  let candidate = path.join(parent, slug)
  let suffix = 1
  while (await pathExists(candidate)) {
    candidate = path.join(parent, `${slug}-${suffix++}`)
  }
  return candidate
}

async function findInstallableSkillRoot(root: string): Promise<string> {
  const matches = await collectSkillRoots(root)
  if (matches.length === 1) return matches[0]
  if (matches.length === 0) throw new Error('未找到 SKILL.md，无法安装为技能')
  throw new Error('压缩包包含多个 SKILL.md，请只打包单个技能目录')
}

async function collectSkillRoots(
  root: string,
  depth = 0,
  matches: string[] = []
): Promise<string[]> {
  if (depth > 4 || !(await pathExists(root))) return matches
  if (await pathExists(path.join(root, 'SKILL.md'))) {
    matches.push(root)
    return matches
  }
  const skillsDir = path.join(root, 'skills')
  const scanRoot =
    depth === 0 && (await pathExists(skillsDir)) ? skillsDir : root
  const entries = await fs.readdir(scanRoot, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue
    }
    await collectSkillRoots(path.join(scanRoot, entry.name), depth + 1, matches)
  }
  return matches
}

function resolveInside(root: string, relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/')
  if (!normalized || path.isAbsolute(normalized) || normalized.includes('\0')) {
    throw new Error('技能文件路径不合法')
  }
  const parts: string[] = []
  for (const raw of normalized.split('/')) {
    const part = raw.trim()
    if (!part || part === '.') continue
    if (part === '..') throw new Error('技能文件路径不能包含 ..')
    parts.push(part)
  }
  const abs = path.resolve(root, ...parts)
  const rootResolved = path.resolve(root)
  if (abs !== rootResolved && !abs.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error('技能文件路径越界')
  }
  return abs
}
