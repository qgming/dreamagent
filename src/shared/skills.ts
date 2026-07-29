/**
 * 技能系统共享类型（UI / preload / main 共用）
 */

/** 技能来源 */
export type SkillSourceKind = 'builtin' | 'custom'

/** 技能列表项（页面对齐） */
export interface SkillSummary {
  /** = frontmatter.name = 目录名 */
  id: string
  name: string
  /** 中文展示名（metadata.displayName） */
  displayName?: string
  description: string
  version?: string
  sourceKind: SkillSourceKind
  enabled: boolean
  /** 技能根目录绝对路径 */
  installPath: string
  /** SKILL.md 绝对路径 */
  skillFilePath: string
  isValid: boolean
  errors: string[]
}

/** 技能详情 */
export interface SkillDetail extends SkillSummary {
  body: string
  rawMarkdown: string
  references: Array<{ name: string; path: string }>
}

/** 启用偏好（与内容解耦） */
export interface SkillPreferences {
  enabledById: Record<string, boolean>
}

/** 设置启用状态输入 */
export interface SetSkillEnabledInput {
  id: string
  enabled: boolean
}

/** 导入 ZIP 结果 */
export interface ImportSkillZipResult {
  id: string
  installPath: string
}

/** 卸载结果 */
export interface UninstallSkillResult {
  id: string
  removed: boolean
}

/** 新建技能输入 */
export interface CreateSkillInput {
  /** kebab-case id，= 目录名 = frontmatter name */
  name: string
  description: string
  displayName?: string
  /** 可选完整 SKILL.md；省略则按模板生成 */
  content?: string
}

/** 写入技能文件输入 */
export interface WriteSkillFileInput {
  id: string
  /** 相对技能根路径，如 SKILL.md 或 references/foo.md */
  relativePath: string
  content: string
}

/** 写入/创建结果 */
export interface SkillWriteResult {
  id: string
  path: string
  message: string
}
