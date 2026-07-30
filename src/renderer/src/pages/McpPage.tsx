/**
 * 云端 MCP 管理页：添加 / 探测 / 启停 HTTP·SSE MCP server
 */
import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalTitle
} from '@/components/ui/modal'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { useMcpStore } from '@/stores/mcp-store'
import type { McpServerConfig, McpTransport } from '@shared/mcp'

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

  const [expandedIds, setExpandedIds] = useState<string[]>([])
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

  const toggleExpand = (id: string): void => {
    setExpandedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

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
    })()
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">云端 MCP</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            添加 Streamable HTTP / SSE 远程 MCP，工具会自动注册到 Agent（pi-agent）。
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

      <div className="min-h-0 flex-1 overflow-y-auto app-scrollbar p-6">
        {errorMessage ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        {status === 'loading' && sorted.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载中…
          </div>
        ) : null}

        {status === 'ready' && sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
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

        <div className="grid gap-3 md:grid-cols-1 xl:grid-cols-2">
          {sorted.map((server) => {
            const expanded = expandedIds.includes(server.id)
            const busy = busyId === server.id
            const disabledSet = new Set(server.disabledToolNames ?? [])
            const tools = server.discoveredTools ?? []
            const statusLabel =
              server.installCheck?.status === 'installed'
                ? `已探测 · ${server.installCheck.toolCount ?? tools.length} 工具`
                : server.installCheck?.status === 'failed'
                  ? '探测失败'
                  : '未探测'

            return (
              <Card key={server.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">{server.name}</CardTitle>
                      <CardDescription className="mt-1 line-clamp-2">
                        {server.description || server.server.url}
                      </CardDescription>
                    </div>
                    <Switch
                      checked={server.enabled}
                      disabled={busy}
                      onCheckedChange={(v) => void setEnabled(server.id, v)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{transportLabel(server.server.transport)}</Badge>
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
                    {!server.enabled ? <Badge tone="muted">已禁用</Badge> : null}
                  </div>
                  <p className="truncate font-mono text-[11px]">{server.server.url}</p>
                  {server.installCheck?.message ? (
                    <p className="line-clamp-2 text-[11px]">{server.installCheck.message}</p>
                  ) : null}

                  {tools.length > 0 ? (
                    <div className="pt-1">
                      <button
                        className="flex items-center gap-1 text-[11px] font-medium text-foreground hover:underline"
                        onClick={() => toggleExpand(server.id)}
                        type="button"
                      >
                        {expanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                        远端工具（{tools.length}）
                      </button>
                      {expanded ? (
                        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 app-scrollbar">
                          {tools.map((tool) => {
                            const on = !disabledSet.has(tool.name)
                            return (
                              <li
                                className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-muted/60"
                                key={tool.name}
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-[11px] font-medium text-foreground">
                                    {tool.title || tool.name}
                                  </p>
                                  {tool.description ? (
                                    <p className="truncate text-[10px] text-muted-foreground">
                                      {tool.description}
                                    </p>
                                  ) : null}
                                </div>
                                <Switch
                                  checked={on}
                                  disabled={busy}
                                  onCheckedChange={(v) =>
                                    void toggleRemoteTool(server.id, tool.name, v)
                                  }
                                />
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  <Button
                    disabled={busy}
                    onClick={() => void discover(server.id)}
                    size="sm"
                    variant="outline"
                  >
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    重新探测
                  </Button>
                  <Button
                    disabled={busy}
                    onClick={() => handleDelete(server)}
                    size="sm"
                    variant="outline"
                  >
                    <Trash2 className="size-3.5" />
                    删除
                  </Button>
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>

      <Modal onOpenChange={setEditorOpen} open={editorOpen}>
        <ModalContent className="max-w-2xl" size="2xl">
          <ModalTitle>添加云端 MCP</ModalTitle>
          <ModalBody className="space-y-4">
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
                <textarea
                  className="min-h-[280px] w-full resize-y rounded-lg border border-border bg-background px-3 py-3 font-mono text-xs leading-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
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
                  <select
                    className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none"
                    onChange={(e) => setFormTransport(e.target.value as McpTransport)}
                    value={formTransport}
                  >
                    <option value="streamable-http">Streamable HTTP</option>
                    <option value="sse">SSE</option>
                  </select>
                </Field>
                <Field label="URL">
                  <Input
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://mcp.example.com/mcp"
                    value={formUrl}
                  />
                </Field>
                <Field label="Headers（可选，JSON 对象）">
                  <textarea
                    className="min-h-[88px] w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
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
          </ModalBody>
          <ModalFooter>
            <Button disabled={saving} onClick={() => setEditorOpen(false)} variant="outline">
              取消
            </Button>
            <Button disabled={saving} onClick={() => void submitEditor()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              保存并探测
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
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
        tone === 'ok' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
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
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}
