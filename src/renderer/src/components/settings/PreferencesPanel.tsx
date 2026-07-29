import { PageTitle, SettingDropdown, SettingRow } from './settings-shared'
import { useSettingsStore, type ThemeMode } from '@/stores/settings-store'
import { useEffect, useState } from 'react'
import type { LlmPublicSettings } from '@shared/llm-settings'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

/**
 * 偏好设置面板：外观 + 模型
 */
export function PreferencesPanel(): React.JSX.Element {
  const theme = useSettingsStore((s) => s.settings.appearance.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  return (
    <section>
      <PageTitle title="偏好设置" description="管理外观与模型连接。" />

      <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
        <SettingRow
          title="主题亮暗"
          description="选择浅色、深色或跟随系统。"
          control={
            <SettingDropdown
              value={theme}
              onChange={(value) => setTheme(value as ThemeMode)}
              options={[
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
                { value: 'system', label: '跟随系统' }
              ]}
            />
          }
        />
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-semibold">模型（OpenAI 兼容）</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          API Key 仅保存在本机主进程（加密），不会写入项目文件。
        </p>
        <LlmSettingsForm />
      </div>
    </section>
  )
}

function LlmSettingsForm(): React.JSX.Element {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publicCfg, setPublicCfg] = useState<LlmPublicSettings | null>(null)
  const [baseURL, setBaseURL] = useState('')
  const [modelId, setModelId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await window.api.settings.getLlm()
        setPublicCfg(cfg)
        setBaseURL(cfg.baseURL)
        setModelId(cfg.modelId)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const save = async (): Promise<void> => {
    setSaving(true)
    setMessage(null)
    setError(null)
    try {
      const next = await window.api.settings.setLlm({
        baseURL,
        modelId,
        apiKey: apiKey.trim() ? apiKey : undefined
      })
      setPublicCfg(next)
      setApiKey('')
      setMessage('已保存')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        加载中…
      </div>
    )
  }

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border bg-card p-4">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Base URL</span>
        <input
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder="https://api.openai.com/v1"
          value={baseURL}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">Model ID</span>
        <input
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
          onChange={(e) => setModelId(e.target.value)}
          placeholder="gpt-4o-mini"
          value={modelId}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          API Key
          {publicCfg?.hasApiKey ? (
            <span className="ml-2 font-normal text-muted-foreground">
              （已保存 {publicCfg.apiKeyHint ?? '••••'}，留空则不修改）
            </span>
          ) : (
            <span className="ml-2 font-normal text-amber-600">（未配置）</span>
          )}
        </span>
        <input
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring"
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={publicCfg?.hasApiKey ? '••••••••' : 'sk-…'}
          type="password"
          value={apiKey}
        />
      </label>
      <div className="flex items-center gap-2 pt-1">
        <Button disabled={saving} onClick={() => void save()} size="sm" type="button">
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
          保存
        </Button>
        {message ? <span className="text-xs text-emerald-600">{message}</span> : null}
        {error ? <span className="text-xs text-destructive">{error}</span> : null}
      </div>
    </div>
  )
}
