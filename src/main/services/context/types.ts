/**
 * 上下文工程核心类型
 *
 * 设计目标：
 * - 每个被发送、摘要或省略的块都可解释（ContextManifest）。
 * - 完整上下文能放下时全部发送；超预算才进入降级流程。
 * - payload trace 只记录脱敏信息，不记录 API key / Authorization / MCP 凭据。
 */
import type { AgentMessage, AgentTool } from '@earendil-works/pi-agent-core'
import type { Model, Api } from '@earendil-works/pi-ai'
import type { LlmThinkingLevel } from '../../../shared/llm-settings'
import type { ContextRef, ActiveDocumentRef } from '../../../shared/context-refs'

export const PROMPT_VERSION = 'dreamagent.system.v2'
export const PROMPT_VERSION_MANIFEST = 'dreamagent.manifest.v1'
export const CHECKPOINT_TYPE = 'dreamagent.narrative_checkpoint.v1'
export const CHECKPOINT_PROMPT_VERSION = 'dreamagent.compaction.v1'

export type ContextFidelity = 'verbatim' | 'summary' | 'reference' | 'omitted'

export type ContextBlockKind =
  | 'system_policy'
  | 'project_contract'
  | 'project_outline'
  | 'explicit_reference'
  | 'pin'
  | 'active_document'
  | 'todo'
  | 'narrative_checkpoint'
  | 'retrieved_memory'
  | 'conversation_turn'
  | 'reasoning_state'
  | 'tool_chain'
  | 'current_user'
  | 'skills'
  | 'mcp'

export interface ContextProvenance {
  sourceType:
    | 'session_entry'
    | 'project'
    | 'beat'
    | 'entity'
    | 'chapter'
    | 'custom_entry'
    | 'derived_memory'
  sourceIds: string[]
  sourceHash: string
  branchHeadId?: string
  createdAt?: string
}

export interface ContextBlock {
  id: string
  kind: ContextBlockKind
  authority: 'system' | 'user_data' | 'conversation' | 'tool'
  trust: 'trusted_policy' | 'local_project_data' | 'external_untrusted'
  required: boolean
  priority: number
  /** 纯文本块的内容；conversation/tool 链可用 messages 表达 */
  content?: string
  messages?: AgentMessage[]
  tokenCount: number
  fidelity: ContextFidelity
  provenance: ContextProvenance
  /** omitted 原因：budget / stale / branch_mismatch / provider_incompatible / duplicate / invalid */
  reason?: string
}

export interface ContextManifest {
  version: 1
  runId: string
  sessionId: string
  branchHeadId: string
  providerId: string
  modelId: string
  api: string
  promptVersion: string
  promptHash: string
  contextWindow: number
  outputReserve: number
  safetyReserve: number
  inputBudget: number
  estimatedInputTokens: number
  roleSequence: string[]
  sourceMessageCount: number
  outputMessageCount: number
  blocks: ContextBlock[]
  validation: {
    ok: boolean
    errors: string[]
    warnings: string[]
  }
}

export interface CompiledContext {
  systemPrompt: string
  messages: AgentMessage[]
  activeTools: AgentTool[]
  manifest: ContextManifest
}

export interface ContextRequest {
  projectId: string
  sessionId: string
  runId: string
  userMessage: string
  contextRefs: ContextRef[]
  activeDocument?: ActiveDocumentRef
  model: {
    providerId: string
    modelId: string
    api: Api | string
    contextWindow: number
    maxOutputTokens: number
  }
  thinkingLevel: LlmThinkingLevel
  branchHeadId: string
  sessionMessages: AgentMessage[]
  toolSchemas: AgentTool[]
}

export interface ContextOverflow {
  code: 'context_overflow'
  requiredTokens: number
  availableTokens: number
  blockingBlocks: string[]
  suggestedActions: string[]
}

export type { AgentMessage, AgentTool, Model }
