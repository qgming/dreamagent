/**
 * 网络搜索设置：服务商 + API Key
 */
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { PageTitle, SettingDropdown, SettingRow } from './settings-shared'
import { Button } from '@/components/ui/button'
import type {
  WebSearchProvider,
  WebSearchPublicSettings
} from '@shared/web-search'

const PROVIDERS: Array<{ value: WebSearchProvider; label: string }> = [
  { value: 'searxng', label: 'SearXNG（默认·免 Key）' },
  { value: 'tavily', label: 'Tavily' },
  { value: 'exa', label: 'Exa' },
  { value: 'serper', label: 'Serper' },
  { value: 'brave', label: 'Brave' }
]

export function WebSearchPanel(): React.JSX.Element {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [cfg, setCfg] = useState<WebSearchPublicSettings | null>(null)
  const [provider, setProvider] = useState<WebSearchProvider>('searxng')
  const [apiKey, setApiKey] = useState('')
  const [instances, setInstances] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const next = await window.api.settings.getWebSearch()
        setCfg(next)
        setProvider(next.provider)
        setInstances(next.searxng.instances || '')
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
      const patch: import('@shared/web-search').WebSearchSettingsPatch = {
        provider
      }
      if (provider === 'searxng') {
        patch.searxng = { instances }
      } else if (apiKey.trim()) {
        patch[provider] = { apiKey: apiKey.trim() }
      }
      const next = await window.api.settings.setWebSearch(patch)
      setCfg(next)
      setApiKey('')
      setMessage('已保存网络搜索配置')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        加载中…
      </div>
    )
  }

  const currentHasKey =
    provider === 'searxng'
      ? Boolean(instances.trim() || cfg?.searxng.instances)
      : Boolean(cfg?.[provider]?.hasApiKey)

  return (
    <section>
      <PageTitle
        title="网络搜索"
        description="配置 Agent 的 web_search / web_fetch。密钥仅保存在本机主进程。"
      />

      <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
        <SettingRow
          title="服务商"
          description="默认 SearXNG（内置数十个公共实例，免 Key）；也可换 Tavily/Exa 等。"
          control={
            <SettingDropdown
              value={provider}
              onChange={(v) => setProvider(v as WebSearchProvider)}
              options={PROVIDERS}
            />
          }
        />
      </div>

      <div className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
        {provider === 'searxng' ? (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              SearXNG 实例（换行或逗号分隔；留空则使用内置 80+ 公共实例，自动 format=json 回退）
            </label>
            <textarea
              className="min-h-[88px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
              value={instances}
              onChange={(e) => setInstances(e.target.value)}
              placeholder={'https://etsi.me\nhttps://searx.party\nhttps://search.mdosch.de'}
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              API Key
              {cfg?.[provider]?.hasApiKey
                ? `（已保存 ${cfg[provider].apiKeyHint ?? '••••'}，留空则保留）`
                : '（未配置）'}
            </label>
            <input
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={currentHasKey ? '输入新 Key 以覆盖' : '粘贴 API Key'}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button disabled={saving} onClick={() => void save()} size="sm">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            保存
          </Button>
          {message ? (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">{message}</span>
          ) : null}
          {error ? <span className="text-xs text-destructive">{error}</span> : null}
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Agent 工具：`web_search` 按当前服务商检索；`web_fetch` 读取网页正文，无需 Key。
      </p>
    </section>
  )
}
