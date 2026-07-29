/**
 * 技能工具：list_skills / read_skill / read_skill_file / write_skill
 * 渐进式披露 — 系统提示仅清单，全文按需读取；写操作仅 custom
 */
import { Type, type Static, type TSchema } from 'typebox'
import {
  formatSkillInvocation,
  type AgentHarnessTool,
  type AgentToolResult,
  type Skill
} from '@earendil-works/pi-agent-core'
import { promises as fs } from 'fs'
import path from 'path'
import type { DreamToolContext } from './pi-agent-tools'

type AnySkillTool = AgentHarnessTool<DreamToolContext, TSchema, unknown>

const listSkillsParams = Type.Object({})

const readSkillParams = Type.Object({
  name: Type.String({ description: '要读取的技能名称，例如 deslop' })
})

const readSkillFileParams = Type.Object({
  name: Type.String({ description: '技能名称，例如 deslop' }),
  path: Type.String({
    description: '技能目录内的相对路径，例如 references/banned-words.md'
  })
})

const writeSkillParams = Type.Object({
  action: Type.Union(
    [
      Type.Literal('create', { description: '创建新自定义技能' }),
      Type.Literal('edit', { description: '全量覆盖 SKILL.md（仅 custom）' }),
      Type.Literal('write_file', {
        description: '写入技能内相对文件，如 references/foo.md（仅 custom）'
      }),
      Type.Literal('delete', { description: '删除自定义技能（需 confirm=true）' })
    ],
    { description: '操作类型' }
  ),
  name: Type.String({
    description: '技能 id（kebab-case）',
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  }),
  content: Type.Optional(
    Type.String({ description: 'create/edit 时的 SKILL.md 全文；write_file 时为文件内容' })
  ),
  description: Type.Optional(
    Type.String({ description: 'create 且未提供 content 时必填的简短描述' })
  ),
  displayName: Type.Optional(Type.String({ description: '可选中文展示名（create）' })),
  path: Type.Optional(
    Type.String({
      description: 'write_file 时相对路径，默认 SKILL.md；如 references/notes.md'
    })
  ),
  confirm: Type.Optional(Type.Boolean({ description: 'delete 时必须为 true' }))
})

const MAX_TREE_ENTRIES = 120
const MAX_TREE_DEPTH = 4

function text(value: string): AgentToolResult<unknown>['content'] {
  return [{ type: 'text', text: value }]
}

function availableSkills(ctx: DreamToolContext): Skill[] {
  return ctx.skills ?? []
}

function findSkill(ctx: DreamToolContext, name: string): Skill | undefined {
  const normalized = name.trim().toLowerCase()
  if (!normalized) return undefined
  return availableSkills(ctx).find((skill) => skill.name.toLowerCase() === normalized)
}

function skillRoot(skillFilePath: string): string {
  return path.dirname(skillFilePath)
}

function normalizeRelativePath(rel: string): string {
  const parts: string[] = []
  for (const raw of rel.replace(/\\/g, '/').split('/')) {
    const part = raw.trim()
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length === 0) throw new Error('技能文件路径不能包含越界的 .. 段')
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

function resolveSkillFilePath(skillFilePath: string, relativePath: string): string {
  const normalizedRelative = normalizeRelativePath(relativePath)
  if (!normalizedRelative) throw new Error('技能文件路径不能为空')
  if (/^([a-zA-Z]:[\\/]|[\\/])/.test(relativePath)) {
    throw new Error('技能文件路径必须是相对路径')
  }
  const root = skillRoot(skillFilePath)
  const target = path.resolve(root, ...normalizedRelative.split('/'))
  const rootResolved = path.resolve(root)
  if (target !== rootResolved && !target.startsWith(`${rootResolved}${path.sep}`)) {
    throw new Error('技能文件路径超出了技能目录范围')
  }
  return target
}

async function buildSkillTree(root: string): Promise<{ lines: string[]; truncated: boolean }> {
  const lines: string[] = []
  let count = 0
  let truncated = false

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (count >= MAX_TREE_ENTRIES || depth > MAX_TREE_DEPTH) {
      truncated = true
      return
    }
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      if (count >= MAX_TREE_ENTRIES) {
        truncated = true
        return
      }
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      lines.push(`${entry.isDirectory() ? '[dir] ' : '[file] '}${rel}`)
      count += 1
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), rel, depth + 1)
      }
    }
  }

  await walk(root, '', 1)
  return { lines, truncated }
}

async function formatSkillInvocationWithFiles(skill: Skill): Promise<string> {
  const root = skillRoot(skill.filePath)
  const tree = await buildSkillTree(root)
  const treeText = tree.lines.length > 0 ? tree.lines.join('\n') : '（没有发现其他文件）'
  const truncatedHint = tree.truncated
    ? '\n\n（目录树已截断；可根据已列出的相对路径继续调用 read_skill_file。）'
    : ''

  return `${formatSkillInvocation(skill)}\n\n<skill_files root="${root}">\n${treeText}${truncatedHint}\n</skill_files>\n\n可调用 read_skill_file({ name: "${skill.name}", path: "相对路径" }) 读取 references 或其他子文件。`
}

/**
 * 构建技能相关 harness 工具
 */
export function buildSkillTools(): AnySkillTool[] {
  return [
    {
      name: 'list_skills',
      label: '列出技能',
      description:
        '列出当前助手可用的技能。遇到任务可能匹配某个技能时，先调用此工具查看技能名称和适用场景，再用 read_skill 读取具体说明。',
      parameters: listSkillsParams,
      executionMode: 'parallel',
      execute: async (_id, _params, _signal, _onUpdate, ctx) => {
        const skills = availableSkills(ctx)
        if (skills.length === 0) {
          return {
            content: text('当前没有可用技能。'),
            details: { skills: [] }
          }
        }
        const lines = skills.map((skill) => `- ${skill.name}: ${skill.description}`)
        return {
          content: text(lines.join('\n')),
          details: {
            skills: skills.map((skill) => ({
              name: skill.name,
              description: skill.description,
              location: skill.filePath
            }))
          }
        }
      }
    },
    {
      name: 'read_skill',
      label: '读取技能',
      description:
        '读取某个可用技能的完整 SKILL.md 说明。只能读取 list_skills 列出的技能，用于在执行匹配任务前加载具体流程、约束和参考资料位置。',
      parameters: readSkillParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) => {
        const p = params as Static<typeof readSkillParams>
        const skill = findSkill(ctx, p.name)
        if (!skill) {
          const names = availableSkills(ctx)
            .map((item) => item.name)
            .join(', ')
          return {
            content: text(
              names
                ? `技能「${p.name}」不可用。当前可用技能：${names}`
                : `技能「${p.name}」不可用。当前没有可用技能。`
            ),
            details: { ok: false }
          }
        }
        const root = skillRoot(skill.filePath)
        const tree = await buildSkillTree(root)
        return {
          content: text(await formatSkillInvocationWithFiles(skill)),
          details: {
            name: skill.name,
            description: skill.description,
            location: skill.filePath,
            root,
            files: tree.lines,
            truncated: tree.truncated
          }
        }
      }
    },
    {
      name: 'read_skill_file',
      label: '读取技能文件',
      description:
        '读取某个可用技能目录内的子文件，例如 references 下的说明。路径必须是 read_skill 返回目录树中的相对路径，不能越过技能目录。',
      parameters: readSkillFileParams,
      executionMode: 'parallel',
      execute: async (_id, params, _signal, _onUpdate, ctx) => {
        const p = params as Static<typeof readSkillFileParams>
        const skill = findSkill(ctx, p.name)
        if (!skill) {
          const names = availableSkills(ctx)
            .map((item) => item.name)
            .join(', ')
          return {
            content: text(
              names
                ? `技能「${p.name}」不可用。当前可用技能：${names}`
                : `技能「${p.name}」不可用。当前没有可用技能。`
            ),
            details: { ok: false }
          }
        }
        try {
          const target = resolveSkillFilePath(skill.filePath, p.path)
          const content = await fs.readFile(target, 'utf-8')
          const rel = normalizeRelativePath(p.path)
          return {
            content: text(
              `<skill_file skill="${skill.name}" path="${rel}" location="${target}">\n${content}\n</skill_file>`
            ),
            details: {
              name: skill.name,
              path: rel,
              location: target,
              bytes: content.length
            }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            content: text(`读取技能文件失败: ${message}`),
            details: { ok: false, error: message }
          }
        }
      }
    },
    {
      name: 'write_skill',
      label: '写入技能',
      description:
        '创建、编辑或删除自定义技能（仅 custom，不能改内置）。' +
        'create: 新建技能目录与 SKILL.md；' +
        'edit: 全量覆盖 SKILL.md；' +
        'write_file: 写入相对路径文件（如 references/x.md）；' +
        'delete: 删除技能（confirm=true）。' +
        'SKILL.md 的 name 必须等于技能 id（kebab-case）。',
      parameters: writeSkillParams,
      execute: async (_id, params, _signal, _onUpdate, ctx) => {
        const p = params as Static<typeof writeSkillParams>
        const svc = ctx.skillService
        if (!svc) {
          return {
            content: text('技能写入服务不可用。'),
            details: { ok: false }
          }
        }
        const name = p.name.trim()
        try {
          switch (p.action) {
            case 'create': {
              if (!p.content?.trim() && !(p.description || '').trim()) {
                return {
                  content: text('create 需提供 content（完整 SKILL.md）或 description。'),
                  details: { ok: false }
                }
              }
              const result = await svc.createSkill({
                name,
                description: (p.description || '').trim() || '（待补充描述）',
                displayName: p.displayName,
                content: p.content
              })
              return {
                content: text(`${result.message}\n路径: ${result.path}`),
                details: { ok: true, ...result }
              }
            }
            case 'edit': {
              if (!p.content?.trim()) {
                return {
                  content: text('edit 必须提供 content（SKILL.md 全文）。'),
                  details: { ok: false }
                }
              }
              const result = await svc.writeSkillFile({
                id: name,
                relativePath: 'SKILL.md',
                content: p.content
              })
              return {
                content: text(`${result.message}\n路径: ${result.path}`),
                details: { ok: true, ...result }
              }
            }
            case 'write_file': {
              if (p.content === undefined) {
                return {
                  content: text('write_file 必须提供 content。'),
                  details: { ok: false }
                }
              }
              const rel = (p.path || 'SKILL.md').trim()
              const result = await svc.writeSkillFile({
                id: name,
                relativePath: rel,
                content: p.content
              })
              return {
                content: text(`${result.message}\n路径: ${result.path}`),
                details: { ok: true, ...result }
              }
            }
            case 'delete': {
              if (!p.confirm) {
                return {
                  content: text('删除需 confirm=true。内置技能不可删。'),
                  details: { ok: false }
                }
              }
              const result = await svc.uninstall(name)
              return {
                content: text(`技能「${result.id}」已删除。`),
                details: { ok: true, ...result }
              }
            }
            default:
              return {
                content: text(`未知 action`),
                details: { ok: false }
              }
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            content: text(`write_skill 失败: ${message}`),
            details: { ok: false, error: message }
          }
        }
      }
    }
  ]
}
