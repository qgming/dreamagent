/**
 * 云端 MCP 管理页：添加 / 探测 / 启停 HTTP·SSE MCP server
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  CircleGauge,
  FileJson,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wrench
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { useMcpStore } from '@/stores/mcp-store'
import type { McpServerConfig, McpTransport, McpUpsertInput } from '@shared/mcp'

const EXAMPLE_JSON = `{
  "mcpServers": {
    "example-http": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      },
      "name": "示例 HTTP MCP",
      "description": "云端 Streamable HTTP MCP"
    }
  }
}`

export function McpPage(): React.JSX.Element {
  const servers = useMcpStore((s) => s.servers)
  const status = useMcpStore((s) => s.status)
  const errorMessage = useMcpStore((s) => s.errorMessage)
  const busyId = useMcpStore((s) => s.busyId)
  const load = useMcpStore((s) => s.load)
  const reload = useMcpStore((s) => s.reload)
  const importJson = useMcpStore((s) => s.importJson)
  const upsert = useMcpStore((s) => s.upsert)
  const remove = useMcpStore((s) => s.remove)
  const setEnabled = useMcpStore((s) => s.setEnabled)
  const toggleRemoteTool = useMcpStore((s) => s.toggleRemoteTool)
  const discover = useMcpStore((s) => s.discover)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detailSection, setDetailSection] = useState<'overview' | 'tools' | 'config'>(
    'overview'
  )
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'form' | 'json'>('json')
  const [jsonText, setJsonText] = useState(EXAMPLE_JSON)
  const [formName, setFormName] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formTransport, setFormTransport] = useState<McpTransport>('streamable-http')
  const [formHeaders, setFormHeaders] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (status === 'idle') void load()
  }, [status, load])

  const sorted = useMemo(
    () => [...servers].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    [servers]
  )

  const selectedServer = selectedId
    ? servers.find((server) => server.id === selectedId) ?? null
    : null

  const openCreate = (): void => {
    setEditorMode('json')
    setJsonText(EXAMPLE_JSON)
    setFormName('')
    setFormUrl('')
    setFormTransport('streamable-http')
    setFormHeaders('')
    setFormError(null)
    setEditorOpen(true)
  }

  const submitEditor = async (): Promise<void> => {
    setSaving(true)
    setFormError(null)
    try {
      if (editorMode === 'json') {
        await importJson(jsonText)
      } else {
        let headers: Record<string, string> | undefined
        if (formHeaders.trim()) {
          try {
            const parsed = JSON.parse(formHeaders) as unknown
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              throw new Error('headers 必须是 JSON 对象')
            }
            headers = parsed as Record<string, string>
          } catch (e) {
            throw new Error(
              `headers JSON 无效：${e instanceof Error ? e.message : String(e)}`
            )
          }
        }
        await upsert({
          name: formName.trim() || 'mcp-server',
          server: {
            transport: formTransport,
            url: formUrl.trim(),
            headers
          },
          discover: true
        })
      }
      setEditorOpen(false)
    } catch (error) {
      setFormError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (server: McpServerConfig): void => {
    void (async () => {
      const ok = await confirmDelete({
        title: '删除 MCP',
        description: `确定删除「${server.name}」？配置与探测缓存都会移除。`
      })
      if (!ok) return
      await remove(server.id)
      setSelectedId(null)
    })()
  }

  return (
    <div className="app-scrollbar h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">MCP SERVERS</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">云端 MCP</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              管理通过 HTTP 或 SSE 连接并向创作助手提供工具的远程服务。
            </p>
          </div>
          <div className="flex items-center gap-2">
          <Button
            disabled={status === 'loading'}
            onClick={() => void reload()}
            size="sm"
            variant="outline"
          >
            {status === 'loading' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            刷新
          </Button>
          <Button onClick={openCreate} size="sm">
            <Plus className="size-4" />
            添加 MCP
          </Button>
        </div>
        </header>

        {errorMessage ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        {status === 'loading' && sorted.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中…
          </div>
        ) : null}

        {status === 'ready' && sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
            <Plug className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">还没有云端 MCP</p>
              <p className="mt-1 text-xs text-muted-foreground">
                粘贴 mcpServers JSON，或填写 URL 添加 HTTP/SSE 服务。
              </p>
            </div>
            <Button onClick={openCreate} size="sm">
              <Plus className="size-4" />
              添加第一个
            </Button>
          </div>
        ) : null}

        <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {sorted.map((server) => {
            const busy = busyId === server.id
            const tools = server.discoveredTools ?? []
            const statusLabel =
              server.installCheck?.status === 'installed'
                ? `已探测 · ${server.installCheck.toolCount ?? tools.length} 工具`
                : server.installCheck?.status === 'failed'
                  ? '探测失败'
                  : '未探测'

            return (
              <article
                className={cn(
                  'group flex min-h-[96px] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/35',
                  !server.enabled && 'opacity-80'
                )}
                key={server.id}
              >
                <button
                  className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onClick={() => {
                    setDetailSection('overview')
                    setSelectedId(server.id)
                  }}
                  type="button"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-semibold">{server.name}</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {transportLabel(server.server.transport)}
                    </span>
                    <Badge
                      tone={
                        server.installCheck?.status === 'installed'
                          ? 'ok'
                          : server.installCheck?.status === 'failed'
                            ? 'bad'
                            : 'muted'
                      }
                    >
                      {statusLabel}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {server.server.url}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  <Switch
                    checked={server.enabled}
                    disabled={busy}
                    aria-label={`启用 ${server.name}`}
                    onCheckedChange={(v) => void setEnabled(server.id, v)}
                  />
                  <Button
                    aria-label={`查看 ${server.name} 详情`}
                    onClick={() => {
                      setDetailSection('overview')
                      setSelectedId(server.id)
                    }}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      </div>

      <McpDetailDialog
        busy={selectedServer ? busyId === selectedServer.id : false}
        onDelete={handleDelete}
        onDiscover={(id) => void discover(id)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onSaveConfig={(input) => upsert(input)}
        onSectionChange={setDetailSection}
        onToggleServer={(id, enabled) => void setEnabled(id, enabled)}
        onToggleTool={(id, toolName, enabled) =>
          void toggleRemoteTool(id, toolName, enabled)
        }
        section={detailSection}
        server={selectedServer}
      />

      <Dialog onOpenChange={setEditorOpen} open={editorOpen}>
        <DialogContent className="max-h-[calc(100vh-3rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>添加云端 MCP</DialogTitle>
            <DialogDescription>
              导入兼容配置，或手动填写远程服务地址。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                onClick={() => setEditorMode('json')}
                size="sm"
                variant={editorMode === 'json' ? 'default' : 'outline'}
              >
                JSON 导入
              </Button>
              <Button
                onClick={() => setEditorMode('form')}
                size="sm"
                variant={editorMode === 'form' ? 'default' : 'outline'}
              >
                表单
              </Button>
            </div>

            {editorMode === 'json' ? (
              <div>
                <p className="mb-2 text-xs text-muted-foreground">
                  兼容 Claude Desktop / Cursor 的 mcpServers 结构（仅 http / sse）。
                </p>
                <Textarea
                  className="min-h-[280px] resize-y font-mono text-xs leading-5"
                  onChange={(e) => {
                    setJsonText(e.target.value)
                    if (formError) setFormError(null)
                  }}
                  spellCheck={false}
                  value={jsonText}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <Field label="名称">
                  <Input
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="my-mcp"
                    value={formName}
                  />
                </Field>
                <Field label="传输">
                  <Select
                    onValueChange={(value) => setFormTransport(value as McpTransport)}
                    value={formTransport}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="streamable-http">Streamable HTTP</SelectItem>
                      <SelectItem value="sse">SSE</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="URL">
                  <Input
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://mcp.example.com/mcp"
                    value={formUrl}
                  />
                </Field>
                <Field label="Headers（可选，JSON 对象）">
                  <Textarea
                    className="min-h-[88px] font-mono text-xs"
                    onChange={(e) => setFormHeaders(e.target.value)}
                    placeholder='{"Authorization":"Bearer ..."}'
                    spellCheck={false}
                    value={formHeaders}
                  />
                </Field>
              </div>
            )}

            {formError ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button disabled={saving} onClick={() => setEditorOpen(false)} variant="outline">
              取消
            </Button>
            <Button disabled={saving} onClick={() => void submitEditor()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              保存并探测
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function McpDetailDialog({
  busy,
  onDelete,
  onDiscover,
  onOpenChange,
  onSaveConfig,
  onSectionChange,
  onToggleServer,
  onToggleTool,
  section,
  server
}: {
  busy: boolean
  onDelete: (server: McpServerConfig) => void
  onDiscover: (id: string) => void
  onOpenChange: (open: boolean) => void
  onSaveConfig: (input: McpUpsertInput) => Promise<McpServerConfig>
  onSectionChange: (section: 'overview' | 'tools' | 'config') => void
  onToggleServer: (id: string, enabled: boolean) => void
  onToggleTool: (id: string, toolName: string, enabled: boolean) => void
  section: 'overview' | 'tools' | 'config'
  server: McpServerConfig | null
}): React.JSX.Element {
  const [rawConfig, setRawConfig] = useState('')
  const [configSaving, setConfigSaving] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)
  const [configMessage, setConfigMessage] = useState<string | null>(null)
  const tools = server?.discoveredTools ?? []
  const disabledTools = new Set(server?.disabledToolNames ?? [])
  const statusLabel =
    server?.installCheck?.status === 'installed'
      ? '连接正常'
      : server?.installCheck?.status === 'failed'
        ? '连接失败'
        : '尚未探测'

  useEffect(() => {
    if (!server) return
    setRawConfig(formatRawMcpConfig(server))
    setConfigError(null)
    setConfigMessage(null)
  }, [server?.id, server?.updatedAt])

  const saveRawConfig = async (): Promise<void> => {
    if (!server) return
    setConfigSaving(true)
    setConfigError(null)
    setConfigMessage(null)
    try {
      const input = parseRawMcpConfig(server, rawConfig)
      await onSaveConfig(input)
      setConfigMessage('配置已保存，工具列表已重新探测。')
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : String(error))
    } finally {
      setConfigSaving(false)
    }
  }

  return (
    <Dialog open={server !== null} onOpenChange={onOpenChange}>
      <DialogContent className="h-[min(760px,calc(100vh-3rem))] w-[min(960px,calc(100vw-3rem))] max-w-none overflow-hidden p-0 sm:max-w-none">
        <DialogTitle className="sr-only">MCP 详情</DialogTitle>
        {server ? (
          <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-r border-border bg-muted/25 p-4">
              <div className="px-2 pb-3 pr-8">
                <h2 className="truncate text-xl font-semibold tracking-tight">{server.name}</h2>
                <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                  {transportLabel(server.server.transport)}
                </p>
              </div>
              <nav className="mt-4 space-y-1">
                <McpDetailNav
                  active={section === 'overview'}
                  icon={CircleGauge}
                  label="概览"
                  onClick={() => onSectionChange('overview')}
                />
                <McpDetailNav
                  active={section === 'tools'}
                  count={tools.length}
                  icon={Wrench}
                  label="远端工具"
                  onClick={() => onSectionChange('tools')}
                />
                <McpDetailNav
                  active={section === 'config'}
                  icon={FileJson}
                  label="连接配置"
                  onClick={() => onSectionChange('config')}
                />
              </nav>
              <div className="mt-auto space-y-2">
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() => onDiscover(server.id)}
                  size="sm"
                  variant="outline"
                >
                  {busy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  重新探测
                </Button>
                <Button
                  className="w-full text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => onDelete(server)}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="size-3.5" />
                  删除服务
                </Button>
              </div>
            </aside>

            <main className="app-scrollbar min-h-0 overflow-y-auto px-8 py-7">
              <p className="text-xs font-medium text-muted-foreground">
                {transportLabel(server.server.transport)} SERVER
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                {section === 'overview'
                  ? '概览'
                  : section === 'tools'
                    ? '远端工具'
                    : '连接配置'}
              </h2>

              {section === 'overview' ? (
                <div className="mt-6 space-y-6">
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {server.description || '此服务未填写描述。'}
                  </p>
                  <div className="divide-y divide-border rounded-lg border border-border">
                    <McpInfoRow label="连接状态" value={statusLabel} />
                    <McpInfoRow
                      label="服务状态"
                      value={server.enabled ? '已启用' : '已停用'}
                      control={
                        <Switch
                          checked={server.enabled}
                          disabled={busy}
                          onCheckedChange={(enabled) =>
                            onToggleServer(server.id, enabled)
                          }
                        />
                      }
                    />
                    <McpInfoRow label="工具数量" value={`${tools.length} 个`} />
                    <McpInfoRow
                      label="最近更新"
                      value={formatTimestamp(server.updatedAt)}
                    />
                  </div>
                  {server.installCheck?.message ? (
                    <div
                      className={cn(
                        'rounded-lg border px-4 py-3 text-sm',
                        server.installCheck.status === 'failed'
                          ? 'border-destructive/30 bg-destructive/10 text-destructive'
                          : 'border-border bg-muted/25 text-muted-foreground'
                      )}
                    >
                      {server.installCheck.message}
                    </div>
                  ) : null}
                </div>
              ) : section === 'tools' ? (
                tools.length > 0 ? (
                  <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {tools.map((tool) => {
                      const enabled = !disabledTools.has(tool.name)
                      return (
                        <li className="flex items-center gap-4 px-4 py-3" key={tool.name}>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {tool.title || tool.name}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                              {tool.name}
                            </p>
                            {tool.description ? (
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                                {tool.description}
                              </p>
                            ) : null}
                          </div>
                          <Switch
                            checked={enabled}
                            disabled={busy}
                            aria-label={`启用 ${tool.title || tool.name}`}
                            onCheckedChange={(next) =>
                              onToggleTool(server.id, tool.name, next)
                            }
                          />
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="mt-6 rounded-lg border border-dashed border-border px-5 py-12 text-center">
                    <Wrench className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">尚未发现工具</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      重新探测服务后，工具会显示在这里。
                    </p>
                  </div>
                )
              ) : (
                <div className="mt-6 space-y-6">
                  <div className="divide-y divide-border rounded-lg border border-border">
                    <McpInfoRow label="传输协议" value={transportLabel(server.server.transport)} />
                    <McpInfoRow label="服务地址" value={server.server.url} mono />
                    <McpInfoRow
                      label="请求头"
                      value={
                        server.server.headers && Object.keys(server.server.headers).length > 0
                          ? `${Object.keys(server.server.headers).length} 项`
                          : '未配置'
                      }
                    />
                    <McpInfoRow label="备注" value={server.notes || '未填写'} />
                  </div>

                  <section>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-semibold">原始 JSON 配置</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          修改后保存会更新连接并重新探测远端工具。
                        </p>
                      </div>
                    </div>
                    <Textarea
                      className="app-scrollbar mt-3 min-h-[260px] resize-y font-mono text-xs leading-5"
                      onChange={(event) => {
                        setRawConfig(event.target.value)
                        if (configError) setConfigError(null)
                        if (configMessage) setConfigMessage(null)
                      }}
                      spellCheck={false}
                      value={rawConfig}
                    />
                    {configError ? (
                      <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {configError}
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-between gap-4">
                      <p className="text-xs text-muted-foreground">
                        {configMessage || '支持 HTTP、Streamable HTTP 与 SSE。'}
                      </p>
                      <Button
                        disabled={configSaving || busy || !rawConfig.trim()}
                        onClick={() => void saveRawConfig()}
                        size="sm"
                      >
                        {configSaving ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Save className="size-3.5" />
                        )}
                        保存并重新配置
                      </Button>
                    </div>
                  </section>
                </div>
              )}
            </main>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function McpDetailNav({
  active,
  count,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  count?: number
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className={cn(
        'flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        active
          ? 'bg-black/[0.06] font-medium text-foreground dark:bg-white/[0.08]'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {typeof count === 'number' ? (
        <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
      ) : null}
    </button>
  )
}

function McpInfoRow({
  control,
  label,
  mono = false,
  value
}: {
  control?: React.ReactNode
  label: string
  mono?: boolean
  value: string
}): React.JSX.Element {
  return (
    <div className="grid min-h-12 grid-cols-[120px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 break-all text-right', mono && 'font-mono text-xs')}>
        {value}
      </span>
      {control ?? null}
    </div>
  )
}

function formatTimestamp(value?: number): string {
  if (!value) return '未知'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(value)
}

function formatRawMcpConfig(server: McpServerConfig): string {
  return JSON.stringify(
    {
      mcpServers: {
        [server.id]: {
          type: server.server.transport === 'streamable-http' ? 'http' : 'sse',
          url: server.server.url,
          ...(server.server.headers && Object.keys(server.server.headers).length > 0
            ? { headers: server.server.headers }
            : {}),
          name: server.name,
          ...(server.description ? { description: server.description } : {}),
          enabled: server.enabled,
          ...(server.notes ? { notes: server.notes } : {})
        }
      }
    },
    null,
    2
  )
}

function parseRawMcpConfig(server: McpServerConfig, rawConfig: string): McpUpsertInput {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawConfig)
  } catch (error) {
    throw new Error(`JSON 格式错误：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('MCP 配置必须是 JSON 对象。')
  }

  const envelope = parsed as Record<string, unknown>
  const collection = envelope.mcpServers
  if (!collection || typeof collection !== 'object' || Array.isArray(collection)) {
    throw new Error('配置需要包含 mcpServers 对象。')
  }
  const entries = Object.entries(collection as Record<string, unknown>)
  const entry = entries.find(([id]) => id === server.id) ?? entries[0]
  if (!entry || !entry[1] || typeof entry[1] !== 'object' || Array.isArray(entry[1])) {
    throw new Error('mcpServers 中需要包含一个有效服务配置。')
  }

  const value = entry[1] as Record<string, unknown>
  const url = typeof value.url === 'string' ? value.url.trim() : ''
  if (!url) throw new Error('服务配置缺少有效的 url。')

  const transportValue = value.type ?? value.transport ?? server.server.transport
  if (typeof transportValue !== 'string') {
    throw new Error('type 或 transport 必须是字符串。')
  }
  const normalizedTransport = transportValue.toLowerCase().replace(/[^a-z0-9]/g, '')
  const transport: McpTransport =
    normalizedTransport === 'sse'
      ? 'sse'
      : normalizedTransport === 'http' ||
          normalizedTransport === 'streamablehttp' ||
          normalizedTransport === 'streamhttp'
        ? 'streamable-http'
        : (() => {
            throw new Error('仅支持 http、streamable-http 或 sse。')
          })()

  let headers: Record<string, string> | undefined
  if (value.headers != null) {
    if (typeof value.headers !== 'object' || Array.isArray(value.headers)) {
      throw new Error('headers 必须是 JSON 对象。')
    }
    headers = {}
    for (const [key, headerValue] of Object.entries(value.headers)) {
      if (typeof headerValue !== 'string') {
        throw new Error(`headers.${key} 必须是字符串。`)
      }
      headers[key] = headerValue
    }
  }

  return {
    id: server.id,
    name:
      typeof value.name === 'string' && value.name.trim() ? value.name.trim() : server.name,
    description:
      typeof value.description === 'string' ? value.description : server.description,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : server.enabled,
    notes: typeof value.notes === 'string' ? value.notes : server.notes,
    server: { transport, url, headers },
    discover: true
  }
}

function transportLabel(t: McpTransport): string {
  return t === 'sse' ? 'SSE' : 'HTTP'
}

function Badge({
  children,
  tone = 'muted'
}: {
  children: React.ReactNode
  tone?: 'muted' | 'ok' | 'bad'
}): React.JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
        tone === 'ok' && 'bg-foreground text-background',
        tone === 'bad' && 'bg-destructive/15 text-destructive',
        tone === 'muted' && 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}
