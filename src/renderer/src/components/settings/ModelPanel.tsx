/**
 * 模型设置面板：多供应商 + 默认模型/思考强度
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bot,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  Plug,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
  ChevronDown,
  Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { PageTitle, SettingDropdown, SettingRow } from './settings-shared'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'
import type {
  LlmModelConfig,
  LlmModelModality,
  LlmProviderApiType,
  LlmProviderPublic,
  LlmProvidersPublic,
  LlmRemoteModelInfo,
  LlmThinkingLevel
} from '@shared/llm-settings'
import { encodeModelKey } from '@shared/llm-settings'

const API_TYPE_OPTIONS: Array<{ value: LlmProviderApiType; label: string }> = [
  { value: 'openai-completions', label: 'OpenAI Completions' },
  { value: 'openai-responses', label: 'OpenAI Responses' },
  { value: 'anthropic-messages', label: 'Anthropic Messages' }
]

const THINKING_LABELS: Record<LlmThinkingLevel, string> = {
  off: '关闭',
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '很高',
  max: '最大'
}

const MODALITY_LABEL: Record<LlmModelModality, string> = {
  text: '文本',
  image: '图像',
  audio: '音频',
  video: '视频',
  pdf: 'PDF'
}

function formatContext(n?: number): string {
  if (!n || n <= 0) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

/** 模型能力徽章 */
function ModelCaps({
  reasoning,
  effortLevels,
  inputModalities,
  contextWindow,
  maxTokens,
  attachment,
  toolCall
}: {
  reasoning?: boolean
  effortLevels?: LlmThinkingLevel[]
  inputModalities?: LlmModelModality[]
  contextWindow?: number
  maxTokens?: number
  attachment?: boolean
  toolCall?: boolean
}): React.JSX.Element {
  const mods = (inputModalities ?? ['text']).filter((m) => m !== 'text')
  const badges: Array<{ key: string; label: string; tone?: 'accent' | 'muted' }> =
    []
  if (reasoning) {
    const efforts =
      effortLevels && effortLevels.length
        ? effortLevels.map((e) => THINKING_LABELS[e] ?? e).join('/')
        : '低/中/高'
    badges.push({ key: 'reason', label: `推理 · ${efforts}`, tone: 'accent' })
  }
  if (mods.length) {
    badges.push({
      key: 'multi',
      label: `多模态 · ${mods.map((m) => MODALITY_LABEL[m] ?? m).join('+')}`,
      tone: 'accent'
    })
  }
  badges.push({
    key: 'ctx',
    label: `上下文 ${formatContext(contextWindow)}`,
    tone: 'muted'
  })
  if (maxTokens) {
    badges.push({
      key: 'out',
      label: `输出 ${formatContext(maxTokens)}`,
      tone: 'muted'
    })
  }
  if (toolCall !== false) {
    badges.push({ key: 'tool', label: '工具', tone: 'muted' })
  }
  if (attachment) {
    badges.push({ key: 'att', label: '附件', tone: 'muted' })
  }

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.key}
          className={cn(
            'rounded-md px-1.5 py-0.5 text-[10px] leading-none',
            b.tone === 'accent'
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {b.label}
        </span>
      ))}
    </div>
  )
}

/**
 * 模型设置右侧面板
 */
export function ModelPanel(): React.JSX.Element {
  const [loading, setLoading] = useState(true)
  const [cfg, setCfg] = useState<LlmProvidersPublic | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const next = await window.api.settings.getLlm()
      setCfg(next)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const defaultOptions = useMemo(() => {
    if (!cfg) return []
    const list: Array<{ value: string; label: string }> = []
    for (const p of cfg.providers) {
      for (const m of p.models) {
        list.push({
          value: encodeModelKey(p.id, m.id),
          label: `${p.name} · ${m.name || m.id}`
        })
      }
    }
    return list
  }, [cfg])

  const currentDefault =
    cfg?.defaultProviderId && cfg.defaultModelId
      ? encodeModelKey(cfg.defaultProviderId, cfg.defaultModelId)
      : ''

  /** 当前默认模型的完整配置（用于思考档跟随） */
  const defaultModel = useMemo(() => {
    if (!cfg?.defaultProviderId || !cfg.defaultModelId) return null
    const provider = cfg.providers.find((p) => p.id === cfg.defaultProviderId)
    return provider?.models.find((m) => m.id === cfg.defaultModelId) ?? null
  }, [cfg])

  /** 仅展示该默认模型真实支持的思考档 */
  const thinkingOptions = useMemo(() => {
    if (!defaultModel?.reasoning) return []
    const levels =
      defaultModel.effortLevels && defaultModel.effortLevels.length > 0
        ? defaultModel.effortLevels
        : (['low', 'medium', 'high'] as LlmThinkingLevel[])
    return levels.map((l) => ({
      value: l,
      label: THINKING_LABELS[l] ?? l
    }))
  }, [defaultModel])

  // 默认模型切换后：若当前思考档不在新模型支持列表，自动纠正
  useEffect(() => {
    if (!cfg || !defaultModel) return
    if (!defaultModel.reasoning) return
    const levels =
      defaultModel.effortLevels && defaultModel.effortLevels.length > 0
        ? defaultModel.effortLevels
        : (['low', 'medium', 'high'] as LlmThinkingLevel[])
    if (levels.includes(cfg.defaultThinkingLevel)) return
    const nextLevel = levels.includes('medium')
      ? 'medium'
      : levels[Math.floor(levels.length / 2)] ?? levels[0]
    if (!nextLevel) return
    void window.api.settings
      .setThinkingLevel(nextLevel)
      .then(setCfg)
      .catch(() => undefined)
  }, [cfg, defaultModel])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载模型设置…
      </div>
    )
  }

  return (
    <section>
      <PageTitle
        title="模型"
        description="管理供应商、API Key 与默认对话模型。密钥仅保存在本机主进程。"
      />

      {error ? (
        <p className="mt-4 text-sm text-destructive">{error}</p>
      ) : null}

      <div className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
        <SettingRow
          title="默认模型"
          description="创作对话默认使用的模型。"
          control={
            defaultOptions.length > 0 ? (
              <SettingDropdown
                value={currentDefault}
                placeholder="选择默认模型"
                options={defaultOptions}
                onChange={(value) => {
                  const idx = value.indexOf('::')
                  if (idx <= 0) return
                  void window.api.settings
                    .setDefaultModel(value.slice(0, idx), value.slice(idx + 2))
                    .then(setCfg)
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : String(e))
                    )
                }}
              />
            ) : (
              <span className="text-xs text-muted-foreground">请先添加模型</span>
            )
          }
        />
        <SettingRow
          title="默认思考强度"
          description={
            !defaultModel
              ? '请先选择默认模型。'
              : defaultModel.reasoning
                ? '跟随当前默认模型的真实能力档位。'
                : '当前默认模型不支持推理，无需设置思考强度。'
          }
          control={
            thinkingOptions.length > 0 ? (
              <SettingDropdown
                value={
                  thinkingOptions.some(
                    (o) => o.value === cfg?.defaultThinkingLevel
                  )
                    ? (cfg?.defaultThinkingLevel ?? thinkingOptions[0].value)
                    : thinkingOptions[0].value
                }
                options={thinkingOptions}
                onChange={(value) => {
                  void window.api.settings
                    .setThinkingLevel(value as LlmThinkingLevel)
                    .then(setCfg)
                    .catch((e) =>
                      setError(e instanceof Error ? e.message : String(e))
                    )
                }}
              />
            ) : (
              <span className="text-xs text-muted-foreground">
                {defaultModel ? '不支持推理' : '—'}
              </span>
            )
          }
        />
      </div>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-sm font-semibold">模型服务</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" />
          添加服务
        </Button>
      </div>

      {cfg && cfg.providers.length > 0 ? (
        <div className="mt-4 space-y-3">
          {cfg.providers.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onChanged={setCfg}
              onRemove={() => setRemovingId(provider.id)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
          还没有模型服务。点击「添加服务」配置 Base URL 与 API Key。
        </div>
      )}

      {adding ? (
        <AddProviderDialog
          onClose={() => setAdding(false)}
          onCreated={(next) => {
            setCfg(next)
            setAdding(false)
          }}
        />
      ) : null}

      {removingId ? (
        <ConfirmRemoveDialog
          onCancel={() => setRemovingId(null)}
          onConfirm={async () => {
            try {
              const next = await window.api.settings.removeProvider(removingId)
              setCfg(next)
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e))
            } finally {
              setRemovingId(null)
            }
          }}
        />
      ) : null}
    </section>
  )
}

function ProviderCard({
  provider,
  onChanged,
  onRemove
}: {
  provider: LlmProviderPublic
  onChanged: (cfg: LlmProvidersPublic) => void
  onRemove: () => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [baseURL, setBaseURL] = useState(provider.baseURL)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [name, setName] = useState(provider.name)
  const [type, setType] = useState<LlmProviderApiType>(provider.type)
  const [newModel, setNewModel] = useState('')
  const [newModelOpen, setNewModelOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [fetching, setFetching] = useState(false)
  const [remoteOpen, setRemoteOpen] = useState(false)
  const [remoteModels, setRemoteModels] = useState<LlmRemoteModelInfo[]>([])
  const [remoteSelected, setRemoteSelected] = useState<Set<string>>(new Set())
  const [remoteFilter, setRemoteFilter] = useState('')
  const [remoteSaving, setRemoteSaving] = useState(false)

  useEffect(() => {
    setBaseURL(provider.baseURL)
    setName(provider.name)
    setType(provider.type)
    setApiKey('')
  }, [provider.baseURL, provider.name, provider.type, provider.id])

  const saveConnection = async (): Promise<void> => {
    setSaving(true)
    setErr(null)
    setSaveMsg(null)
    try {
      const next = await window.api.settings.updateProvider(provider.id, {
        name,
        type,
        baseURL,
        apiKey: apiKey.trim() ? apiKey : undefined
      })
      onChanged(next)
      setApiKey('')
      setSaveMsg('已保存')
      window.setTimeout(() => setSaveMsg(null), 1200)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const persistModels = async (models: LlmModelConfig[]): Promise<void> => {
    setErr(null)
    try {
      const next = await window.api.settings.updateProvider(provider.id, {
        models
      })
      onChanged(next)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  const addModel = (): void => {
    const id = newModel.trim()
    if (!id || provider.models.some((m) => m.id === id)) return
    void persistModels([...provider.models, { id, name: id }])
    setNewModel('')
    setNewModelOpen(false)
  }

  const removeModel = (modelId: string): void => {
    void persistModels(provider.models.filter((m) => m.id !== modelId))
  }

  /** 从 /models 拉取，打开多选对话框 */
  const fetchRemote = async (): Promise<void> => {
    setFetching(true)
    setErr(null)
    try {
      const list = await window.api.settings.listRemoteModels({
        providerId: provider.id,
        baseURL: baseURL.trim() || undefined,
        apiKey: apiKey.trim() || undefined
      })
      if (list.length === 0) {
        setErr('远端未返回任何模型')
        return
      }
      const existing = new Set(provider.models.map((m) => m.id))
      setRemoteModels(list)
      // 默认勾选尚未本地保存的
      setRemoteSelected(new Set(list.filter((m) => !existing.has(m.id)).map((m) => m.id)))
      setRemoteFilter('')
      setRemoteOpen(true)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setFetching(false)
    }
  }

  const saveRemoteSelection = async (): Promise<void> => {
    setRemoteSaving(true)
    try {
      const byId = new Map(remoteModels.map((m) => [m.id, m]))
      const existingIds = new Set(provider.models.map((m) => m.id))
      // 保留未出现在远端列表中的本地模型 + 勾选的远端模型
      const keptLocal = provider.models.filter(
        (m) => !byId.has(m.id) || remoteSelected.has(m.id)
      )
      const added: LlmModelConfig[] = []
      for (const id of remoteSelected) {
        if (existingIds.has(id) && keptLocal.some((m) => m.id === id)) continue
        if (keptLocal.some((m) => m.id === id)) continue
        const remote = byId.get(id)
        if (!remote) continue
        added.push({
          id: remote.id,
          name: remote.name || remote.id,
          reasoning: remote.reasoning,
          effortLevels: remote.effortLevels,
          contextWindow: remote.contextWindow,
          maxTokens: remote.maxTokens,
          inputModalities: remote.inputModalities,
          outputModalities: remote.outputModalities,
          attachment: remote.attachment,
          toolCall: remote.toolCall
        })
      }
      // 对已有本地模型也用远端元数据刷新（若勾选）
      const refreshedLocal = keptLocal.map((m) => {
        const remote = byId.get(m.id)
        if (!remote || !remoteSelected.has(m.id)) return m
        return {
          ...m,
          name: m.name || remote.name,
          reasoning: remote.reasoning,
          effortLevels: remote.effortLevels,
          contextWindow: remote.contextWindow,
          maxTokens: remote.maxTokens,
          inputModalities: remote.inputModalities,
          outputModalities: remote.outputModalities,
          attachment: remote.attachment,
          toolCall: remote.toolCall
        }
      })
      await persistModels([...refreshedLocal, ...added])
      setRemoteOpen(false)
    } finally {
      setRemoteSaving(false)
    }
  }

  const filteredRemote = useMemo(() => {
    const q = remoteFilter.trim().toLowerCase()
    if (!q) return remoteModels
    return remoteModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.name || '').toLowerCase().includes(q)
    )
  }, [remoteModels, remoteFilter])

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <Bot className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{provider.name}</span>
            {!provider.hasApiKey ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                无 Key
              </span>
            ) : null}
            {!provider.enabled ? (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                未启用
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {provider.models.length} 个模型 · {provider.baseURL || '未设 Base URL'}
          </p>
        </div>
        <ChevronDown
          className={cn(
            'size-4 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-border px-4 py-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">名称</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              接口格式
            </span>
            <SettingDropdown
              value={type}
              options={API_TYPE_OPTIONS}
              onChange={(v) => setType(v as LlmProviderApiType)}
              className="w-full justify-between"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <Plug className="size-3" /> Base URL
            </span>
            <Input
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <KeyRound className="size-3" /> API Key
              {provider.hasApiKey ? (
                <span className="font-normal">
                  （已保存 {provider.apiKeyHint ?? '••••'}，留空不改）
                </span>
              ) : null}
            </span>
            <div className="relative">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={provider.hasApiKey ? '••••••••' : 'sk-…'}
                autoComplete="off"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowKey((v) => !v)}
                tabIndex={-1}
              >
                {showKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </label>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void saveConnection()}
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              保存连接
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="size-3.5" />
              删除服务
            </Button>
            {saveMsg ? (
              <span className="flex items-center gap-1 text-xs text-foreground">
                <Check className="size-3" />
                {saveMsg}
              </span>
            ) : null}
            {err ? <span className="text-xs text-destructive">{err}</span> : null}
          </div>

          <div className="pt-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">模型列表</p>
              <TooltipHint label="请求 Base URL /models 并选择保存">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={fetching || !baseURL.trim()}
                  onClick={() => void fetchRemote()}
                >
                  {fetching ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  从云端拉取
                </Button>
              </TooltipHint>
            </div>
            <div className="space-y-1.5">
              {provider.models.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  尚未添加模型，可手动输入或从云端拉取
                </span>
              ) : (
                provider.models.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-start gap-2 rounded-lg border border-border/70 bg-background px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {m.name || m.id}
                        </span>
                        {m.reasoning ? (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">
                            推理
                          </span>
                        ) : null}
                      </div>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {m.id}
                      </p>
                      <ModelCaps
                        reasoning={m.reasoning}
                        effortLevels={m.effortLevels}
                        inputModalities={m.inputModalities}
                        contextWindow={m.contextWindow}
                        maxTokens={m.maxTokens}
                        attachment={m.attachment}
                        toolCall={m.toolCall}
                      />
                    </div>
                    <TooltipHint label="移除">
                      <button
                        type="button"
                        className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeModel(m.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </TooltipHint>
                  </div>
                ))
              )}
            </div>
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setNewModelOpen(true)}
              >
                <Plus className="size-3.5" />
                添加模型
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog
        open={newModelOpen}
        onOpenChange={(open) => {
          setNewModelOpen(open)
          if (!open) setNewModel('')
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加模型</DialogTitle>
            <DialogDescription>输入服务端使用的模型 ID。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="new-model-id">模型 ID</Label>
            <Input
              id="new-model-id"
              autoFocus
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              placeholder="gpt-4o / claude-sonnet-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addModel()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setNewModelOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={addModel} disabled={!newModel.trim()}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {remoteOpen ? (
        <Dialog open onOpenChange={(o) => !o && setRemoteOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>选择要保存的模型</DialogTitle>
              <DialogDescription>
                来自 {baseURL.replace(/\/+$/, '')}/models，勾选后写入本地。
              </DialogDescription>
            </DialogHeader>
            <Input
              value={remoteFilter}
              onChange={(e) => setRemoteFilter(e.target.value)}
              placeholder="筛选模型…"
            />
            <div className="app-scrollbar mt-3 max-h-[320px] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {filteredRemote.map((m) => {
                const checked = remoteSelected.has(m.id)
                const already = provider.models.some((x) => x.id === m.id)
                return (
                  <label
                    key={m.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                      checked && 'bg-muted/60'
                    )}
                  >
                    <Checkbox
                      className="mt-1"
                      checked={checked}
                      onCheckedChange={() => {
                        setRemoteSelected((prev) => {
                          const next = new Set(prev)
                          if (next.has(m.id)) next.delete(m.id)
                          else next.add(m.id)
                          return next
                        })
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium">
                          {m.name || m.id}
                        </span>
                        {already ? (
                          <span className="shrink-0 text-[10px] font-normal text-muted-foreground">
                            已保存
                          </span>
                        ) : null}
                        {m.matched === false ? (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            未识别
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {m.id}
                      </span>
                      <ModelCaps
                        reasoning={m.reasoning}
                        effortLevels={m.effortLevels}
                        inputModalities={m.inputModalities}
                        contextWindow={m.contextWindow}
                        maxTokens={m.maxTokens}
                        attachment={m.attachment}
                        toolCall={m.toolCall}
                      />
                    </span>
                  </label>
                )
              })}
              {filteredRemote.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  无匹配模型
                </p>
              ) : null}
            </div>
            <DialogFooter className="items-center justify-between sm:justify-between">
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setRemoteSelected(new Set(filteredRemote.map((m) => m.id)))
                  }
                >
                  全选当前
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setRemoteSelected(new Set())}
                >
                  清空
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRemoteOpen(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  disabled={remoteSaving || remoteSelected.size === 0}
                  onClick={() => void saveRemoteSelection()}
                >
                  {remoteSaving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : null}
                  保存 {remoteSelected.size} 个
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

function AddProviderDialog({
  onClose,
  onCreated
}: {
  onClose: () => void
  onCreated: (cfg: LlmProvidersPublic) => void
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [type, setType] = useState<LlmProviderApiType>('openai-completions')
  const [baseURL, setBaseURL] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (): Promise<void> => {
    if (!name.trim() || !baseURL.trim()) return
    setCreating(true)
    setError(null)
    try {
      const next = await window.api.settings.addProvider({
        name: name.trim(),
        type,
        baseURL: baseURL.trim(),
        apiKey: apiKey.trim() || undefined,
        models: []
      })
      onCreated(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加模型服务</DialogTitle>
          <DialogDescription>配置兼容接口，创建后再选择可用模型。</DialogDescription>
        </DialogHeader>
        <div className="mt-4 space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="provider-name">名称</Label>
            <Input
              id="provider-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如 OpenRouter / DeepSeek"
            />
          </div>
          <div className="grid gap-2">
            <Label>接口格式</Label>
            <SettingDropdown
              value={type}
              options={API_TYPE_OPTIONS}
              onChange={(v) => setType(v as LlmProviderApiType)}
              className="w-full justify-between"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="provider-base-url">Base URL</Label>
            <Input
              id="provider-base-url"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              placeholder="https://api.deepseek.com"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="provider-api-key">API Key（可选，稍后可填）</Label>
            <Input
              id="provider-api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              autoComplete="off"
            />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button
              type="button"
              disabled={!name.trim() || !baseURL.trim() || creating}
              onClick={() => void submit()}
            >
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : null}
              <Settings2 className="size-3.5" />
              创建
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmRemoveDialog({
  onCancel,
  onConfirm
}: {
  onCancel: () => void
  onConfirm: () => void | Promise<void>
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)
  return (
    <AlertDialog open onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除模型服务</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除该服务及其全部模型配置？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>
            取消
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void Promise.resolve(onConfirm()).finally(() => setBusy(false))
            }}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
