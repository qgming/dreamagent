import type { ProjectSnapshot } from '../../../shared/project-types'
import type { UiChatMessage } from '../../../shared/ui-chat'

export const GOAL_AUDIT_SYSTEM_PROMPT = `你是会话目标审计器。

## 判断规则
- 原始目标是唯一验收标准；最后一条会话消息只用于判断实际进展和对话为何结束，不得把它改成新目标。
- 可以调用只读工具 list、read、text_stats 核验项目事实。必要时先读取，不要只凭项目快照或最后消息的概括猜测，工具读取结果优先于快照。
- 禁止调用任何写入、编辑、删除、网络或其他未提供的工具，不要修改项目。
- 不要把计划、准备完成或一句“已完成”当成完成。
- 只有原始目标全部完成且有证据才返回 complete；如果失败、报错、中止、等待用户或证据不足，返回 continue。

## 固定返回格式
必须只返回一个合法 JSON 对象，不要 Markdown 代码块、解释、前后缀、多个对象或额外字段。字段必须完整保留：

{
  "status": "complete",
  "progress": "已完成目标要求，并已核验结果。",
  "nextStep": "",
  "evidence": ["读取到的具体项目证据"]
}

未完成时使用同样的字段格式，把 status 改为 continue，并填写最小下一步：

{
  "status": "continue",
  "progress": "已完成部分工作，但还有一项结果没有验证。",
  "nextStep": "读取并核验目标要求的最终资源。",
  "evidence": ["当前已确认的具体事实"]
}

约束：status 只能是 complete 或 continue；progress、nextStep 必须是字符串；evidence 必须是字符串数组。complete 时 nextStep 使用空字符串，continue 时 nextStep 不得为空。`

/** OpenAI Chat Completions 的 JSON 模式；其他协议使用上面的提示和本地字段校验。 */
export function applyGoalAuditJsonMode(payload: unknown, api: string): unknown {
  if (api !== 'openai-completions') return payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload
  return {
    ...(payload as Record<string, unknown>),
    response_format: { type: 'json_object' }
  }
}

function clipAuditText(value: string, limit: number): string {
  const text = value.trim()
  return text.length <= limit ? text : `${text.slice(0, limit)}…`
}

function auditSnapshot(snapshot: ProjectSnapshot): Record<string, unknown> {
  const summarize = (item: Record<string, unknown>): Record<string, unknown> => {
    const result = { ...item }
    if (typeof result.content === 'string') result.content = clipAuditText(result.content, 8_000)
    delete result.fileName
    delete result.createdAt
    delete result.updatedAt
    return result
  }

  return {
    meta: {
      title: snapshot.meta.title,
      description: snapshot.meta.description,
      version: snapshot.meta.version
    },
    beats: Object.values(snapshot.beats).map((item) => summarize(item as unknown as Record<string, unknown>)),
    entities: Object.values(snapshot.entities).map((item) => summarize(item as unknown as Record<string, unknown>)),
    chapters: Object.values(snapshot.chapters).map((item) => summarize(item as unknown as Record<string, unknown>))
  }
}

export function formatGoalAuditLastMessage(message: UiChatMessage | undefined): string {
  if (!message) return '无可读取的最后消息。'

  const status = message.status ?? 'unknown'
  const parts = message.parts
    .map((part) => {
      if (part.type === 'text') return part.text.trim()
      if (part.type === 'tool-call') {
        const resultStatus = part.isError || part.status === 'error'
          ? '失败'
          : part.status === 'running'
            ? '执行中'
            : '完成'
        return `工具 ${part.toolName}（${resultStatus}）：${part.summary?.trim() || '无摘要'}`
      }
      // 不把私有思考过程送入审计，只保留可见回复和工具结果。
      return ''
    })
    .filter(Boolean)

  return [
    `角色：${message.role === 'assistant' ? '助手' : '用户'}`,
    `状态：${status}`,
    `内容：${clipAuditText(parts.join('\n'), 12_000) || '无可见文本'}`
  ].join('\n')
}

export function buildGoalAuditPrompt(input: {
  objective: string
  lastMessage: UiChatMessage | undefined
  snapshot: ProjectSnapshot
  snapshotCharBudget: number
}): string {
  const snapshotText = clipAuditText(
    JSON.stringify(auditSnapshot(input.snapshot), null, 2),
    input.snapshotCharBudget
  )

  return [
    '请审查当前会话是否完成用户最初设定的目标。',
    `原始目标：${clipAuditText(input.objective, 5_000)}`,
    '',
    '会话最后一条消息（用于判断实际做了什么、为何结束）：',
    formatGoalAuditLastMessage(input.lastMessage),
    '',
    '项目快照（用于核对结果是否真实存在）：',
    snapshotText,
    '',
    '只看与原始目标直接相关的事实。必要时调用只读工具核验项目资源，工具读取结果优先于快照概括；不要因为最后消息声称完成就直接判定完成。最后消息若显示报错、中止、等待输入或只给出计划，不能判定完成。最终只返回固定格式的 JSON 对象。'
  ].join('\n')
}
