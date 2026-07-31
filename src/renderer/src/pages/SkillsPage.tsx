import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileArchive,
  FileText,
  Info,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { TooltipHint } from '@/components/ui/tooltip'
import { skillLabel, useSkillsStore } from '@/stores/skills-store'
import type { SkillSummary } from '@shared/skills'

type SkillTab = 'builtin' | 'custom'
type SkillDetailSection = 'overview' | 'references' | 'source'

/**
 * 技能库全页：内置 / 已安装、启用、导入、新建、编辑、卸载
 */
export function SkillsPage(): React.JSX.Element {
  const skills = useSkillsStore((s) => s.skills)
  const status = useSkillsStore((s) => s.status)
  const errorMessage = useSkillsStore((s) => s.errorMessage)
  const detail = useSkillsStore((s) => s.detail)
  const detailLoading = useSkillsStore((s) => s.detailLoading)
  const load = useSkillsStore((s) => s.load)
  const reload = useSkillsStore((s) => s.reload)
  const toggle = useSkillsStore((s) => s.toggle)
  const importZip = useSkillsStore((s) => s.importZip)
  const uninstall = useSkillsStore((s) => s.uninstall)
  const create = useSkillsStore((s) => s.create)
  const writeFile = useSkillsStore((s) => s.writeFile)
  const openDetail = useSkillsStore((s) => s.openDetail)
  const closeDetail = useSkillsStore((s) => s.closeDetail)

  const [tab, setTab] = useState<SkillTab>('builtin')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [detailSection, setDetailSection] = useState<SkillDetailSection>('overview')
  const [referencesExpanded, setReferencesExpanded] = useState(false)
  const [selectedReferencePath, setSelectedReferencePath] = useState<string | null>(null)
  const [referenceContent, setReferenceContent] = useState('')
  const [referenceLoading, setReferenceLoading] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [createDescription, setCreateDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (status === 'idle') void load()
  }, [status, load])

  const builtin = useMemo(
    () => skills.filter((s) => s.sourceKind === 'builtin'),
    [skills]
  )
  const custom = useMemo(
    () => skills.filter((s) => s.sourceKind === 'custom'),
    [skills]
  )

  const visible = useMemo(() => {
    const list = tab === 'builtin' ? builtin : custom
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((s) => {
      const hay = `${s.displayName ?? ''} ${s.name} ${s.description}`.toLowerCase()
      return hay.includes(q)
    })
  }, [tab, builtin, custom, search])

  const handleToggle = async (skill: SkillSummary, enabled: boolean): Promise<void> => {
    setBusyId(skill.id)
    try {
      await toggle(skill.id, enabled)
    } finally {
      setBusyId(null)
    }
  }

  const handleImport = async (): Promise<void> => {
    setImporting(true)
    try {
      const ok = await importZip()
      if (ok) setTab('custom')
    } catch {
      // errorMessage 已写入 store
    } finally {
      setImporting(false)
    }
  }

  const handleUninstall = async (skill: SkillSummary): Promise<void> => {
    const ok = await confirmDelete({
      title: '卸载技能',
      description: `确定卸载「${skillLabel(skill)}」？将删除本地技能目录。`
    })
    if (!ok) return
    setBusyId(skill.id)
    try {
      await uninstall(skill.id)
    } finally {
      setBusyId(null)
    }
  }

  const handleCreate = async (): Promise<void> => {
    const name = createName.trim()
    const description = createDescription.trim()
    if (!name || !description) return
    setCreating(true)
    try {
      const id = await create({
        name,
        description,
        displayName: createDisplayName.trim() || undefined
      })
      setCreateOpen(false)
      setCreateName('')
      setCreateDisplayName('')
      setCreateDescription('')
      setTab('custom')
      void openDetail(id)
    } catch {
      // store 已记 error
    } finally {
      setCreating(false)
    }
  }

  const openEdit = async (skill: SkillSummary): Promise<void> => {
    if (skill.sourceKind !== 'custom') return
    setEditId(skill.id)
    setEditOpen(true)
    setEditLoading(true)
    try {
      const content = await window.api.skills.readFile(skill.id, 'SKILL.md')
      setEditContent(content)
    } catch (error) {
      setEditContent(`# 读取失败\n${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setEditLoading(false)
    }
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editId) return
    setEditSaving(true)
    try {
      await writeFile({
        id: editId,
        relativePath: 'SKILL.md',
        content: editContent
      })
      setEditOpen(false)
      setEditId(null)
    } catch {
      // store error
    } finally {
      setEditSaving(false)
    }
  }

  const openReference = async (skillId: string, relativePath: string): Promise<void> => {
    setSelectedReferencePath(relativePath)
    setReferenceLoading(true)
    setReferenceError(null)
    try {
      const content = await window.api.skills.readFile(skillId, relativePath)
      setReferenceContent(content)
    } catch (error) {
      setReferenceContent('')
      setReferenceError(error instanceof Error ? error.message : String(error))
    } finally {
      setReferenceLoading(false)
    }
  }

  const openReferenceSection = (): void => {
    if (!detail) return
    const nextExpanded = detailSection !== 'references' || !referencesExpanded
    setDetailSection('references')
    setReferencesExpanded(nextExpanded)
    if (nextExpanded && !selectedReferencePath && detail.references[0]) {
      void openReference(detail.id, detail.references[0].path)
    }
  }

  return (
    <div className="app-scrollbar h-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 py-10">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">SKILLS</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">技能库</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              管理创作助手可调用的内置与自定义技能。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={status === 'loading'}
              size="sm"
              variant="outline"
              onClick={() => void reload()}
            >
              {status === 'loading' ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              刷新
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setCreateOpen(true)
                setTab('custom')
              }}
            >
              <Plus className="size-4" />
              新建
            </Button>
            <Button disabled={importing} size="sm" onClick={() => void handleImport()}>
              {importing ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileArchive className="size-4" />
              )}
              导入 ZIP
            </Button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
              placeholder="搜索技能…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as SkillTab)}>
          <TabsList className="h-9">
            <TabsTrigger value="builtin">
              内置
              <span className="ml-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px]">
                {builtin.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="custom">
              已安装
              <span className="ml-1.5 rounded-md bg-muted px-2 py-0.5 text-[11px]">
                {custom.length}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {errorMessage ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </div>
        ) : null}

        {status === 'loading' && skills.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在加载技能…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
            <h2 className="text-base font-medium text-foreground">
              {tab === 'builtin' ? '暂无内置技能' : '暂无已安装技能'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {tab === 'builtin'
                ? '请确认 resources/skills 已打包，并点击刷新重新同步。'
                : '可「新建」或「导入 ZIP」添加自定义技能。'}
            </p>
            {tab === 'custom' ? (
              <div className="mt-4 flex items-center justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" />
                  新建
                </Button>
                <Button size="sm" onClick={() => void handleImport()}>
                  <FileArchive className="size-4" />
                  导入 ZIP
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <section className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {visible.map((skill) => (
              <SkillCard
                key={skill.id}
                busy={busyId === skill.id}
                editable={skill.sourceKind === 'custom'}
                removable={skill.sourceKind === 'custom'}
                skill={skill}
                onDetail={() => {
                  setDetailSection('overview')
                  setReferencesExpanded(false)
                  setSelectedReferencePath(null)
                  setReferenceContent('')
                  setReferenceError(null)
                  void openDetail(skill.id)
                }}
                onEdit={
                  skill.sourceKind === 'custom' ? () => void openEdit(skill) : undefined
                }
                onToggle={(enabled) => void handleToggle(skill, enabled)}
                onUninstall={
                  skill.sourceKind === 'custom'
                    ? () => void handleUninstall(skill)
                    : undefined
                }
              />
            ))}
          </section>
        )}
      </div>

      {/* 详情（只读） */}
      <Dialog
        open={detail !== null || detailLoading}
        onOpenChange={(open) => !open && closeDetail()}
      >
        <DialogContent className="h-[min(760px,calc(100vh-3rem))] w-[min(960px,calc(100vw-3rem))] max-w-none overflow-hidden p-0 sm:max-w-none">
          <DialogTitle className="sr-only">技能详情</DialogTitle>
          <div className="grid min-h-0 grid-cols-[220px_minmax(0,1fr)]">
            <aside className="flex min-h-0 flex-col border-r border-border bg-muted/25 p-4">
              <div className="px-2 pb-3 pr-8">
                <h2 className="truncate text-xl font-semibold tracking-tight">
                  {detail ? skillLabel(detail) : '加载中…'}
                </h2>
                {detail?.name ? (
                  <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                    {detail.name}
                  </p>
                ) : null}
              </div>
              <nav className="mt-4 space-y-1">
                <DetailNavButton
                  active={detailSection === 'overview'}
                  icon={Info}
                  label="概览"
                  onClick={() => setDetailSection('overview')}
                />
                <DetailNavButton
                  active={detailSection === 'references'}
                  count={detail?.references.length}
                  expanded={referencesExpanded}
                  expandable
                  icon={FileArchive}
                  label="参考文件"
                  onClick={openReferenceSection}
                />
                {referencesExpanded && detail?.references.length ? (
                  <div className="ml-4 mt-1 space-y-0.5 border-l border-border pl-2">
                    {detail.references.map((ref) => (
                      <TooltipHint key={ref.path} label={ref.path} side="right">
                        <button
                          className={cn(
                            'flex min-h-8 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                            selectedReferencePath === ref.path
                              ? 'bg-black/[0.06] text-foreground dark:bg-white/[0.08]'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                          onClick={() => {
                            setDetailSection('references')
                            void openReference(detail.id, ref.path)
                          }}
                          type="button"
                        >
                          <FileText className="size-3.5 shrink-0" />
                          <span className="min-w-0 truncate">{ref.name}</span>
                        </button>
                      </TooltipHint>
                    ))}
                  </div>
                ) : null}
                <DetailNavButton
                  active={detailSection === 'source'}
                  icon={FileText}
                  label="源文件"
                  onClick={() => setDetailSection('source')}
                />
              </nav>
              {detail?.sourceKind === 'custom' ? (
                <Button
                  className="mt-auto w-full"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    closeDetail()
                    void openEdit(detail)
                  }}
                >
                  <Pencil className="size-3.5" />
                  编辑技能
                </Button>
              ) : null}
            </aside>
            <main className="app-scrollbar min-h-0 overflow-y-auto px-8 py-7">
            {detailLoading && !detail ? (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                读取技能…
              </div>
            ) : detail ? (
              <section>
                <p className="text-xs font-medium text-muted-foreground">
                  {detail.sourceKind === 'builtin' ? '内置技能' : '已安装技能'}
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {detailSection === 'overview'
                    ? '概览'
                    : detailSection === 'references'
                      ? detail.references.find((ref) => ref.path === selectedReferencePath)?.name ||
                        '参考文件'
                      : 'SKILL.md'}
                </h2>
                {detailSection === 'overview' ? (
                  <div className="mt-6 space-y-5">
                    <p className="max-w-2xl whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                      {detail.description}
                    </p>
                    <div className="divide-y divide-border rounded-lg border border-border">
                      <InfoRow label="技能 ID" value={detail.name} mono />
                      <InfoRow
                        label="状态"
                        value={detail.enabled ? '已启用' : '已停用'}
                      />
                      <InfoRow label="版本" value={detail.version || '未标注'} />
                      <InfoRow label="安装位置" value={detail.installPath} mono />
                    </div>
                {!detail.isValid ? (
                  <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <div>
                      <p className="font-medium">校验异常</p>
                      <ul className="mt-1 list-disc pl-4">
                        {detail.errors.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : null}
                  </div>
                ) : detailSection === 'references' ? (
                  referenceLoading ? (
                    <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                      正在读取参考文件…
                    </div>
                  ) : referenceError ? (
                    <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                      {referenceError}
                    </div>
                  ) : selectedReferencePath ? (
                    <div className="mt-6">
                      <p className="mb-2 break-all font-mono text-[11px] text-muted-foreground">
                        {selectedReferencePath}
                      </p>
                      <pre className="select-text overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/25 p-4 text-xs leading-5">
                        {referenceContent}
                      </pre>
                    </div>
                  ) : (
                    <p className="mt-6 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                      {detail.references.length > 0
                        ? '从左侧展开参考文件并选择一项。'
                        : '这个技能没有参考文件。'}
                    </p>
                  )
                ) : (
                  <pre className="select-text mt-6 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/25 p-4 text-xs leading-5">
                    {detail.rawMarkdown}
                  </pre>
                )}
              </section>
            ) : null}
            </main>
          </div>
        </DialogContent>
      </Dialog>

      {/* 新建 */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建自定义技能</DialogTitle>
            <DialogDescription>填写技能标识和触发说明。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="skill-id">ID（kebab-case）</Label>
              <Input
                id="skill-id"
                placeholder="my-writing-flow"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-display-name">中文名</Label>
              <Input
                id="skill-display-name"
                placeholder="我的写作流程"
                value={createDisplayName}
                onChange={(e) => setCreateDisplayName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="skill-description">描述</Label>
              <Textarea
                id="skill-description"
                className="min-h-[100px]"
                placeholder="做什么、何时用…"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              disabled={creating || !createName.trim() || !createDescription.trim()}
              onClick={() => void handleCreate()}
            >
              {creating ? <Loader2 className="size-4 animate-spin" /> : null}
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑 SKILL.md */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditOpen(false)
            setEditId(null)
          }
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>编辑 SKILL.md</DialogTitle>
            <DialogDescription className="font-mono">{editId}</DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col">
            {editLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载…
              </div>
            ) : (
              <Textarea
                className="app-scrollbar min-h-[50vh] flex-1 resize-y font-mono text-xs leading-5"
                spellCheck={false}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              frontmatter 的 name 必须等于技能 id；保存前会自动备份旧版 SKILL.md。
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false)
                setEditId(null)
              }}
            >
              取消
            </Button>
            <Button
              disabled={editSaving || editLoading || !editId}
              onClick={() => void handleSaveEdit()}
            >
              {editSaving ? <Loader2 className="size-4 animate-spin" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SkillCard({
  skill,
  busy,
  removable,
  editable,
  onToggle,
  onDetail,
  onEdit,
  onUninstall
}: {
  skill: SkillSummary
  busy: boolean
  removable: boolean
  editable: boolean
  onToggle: (enabled: boolean) => void
  onDetail: () => void
  onEdit?: () => void
  onUninstall?: () => void
}): React.JSX.Element {
  const label = skillLabel(skill)
  return (
    <article
      className={cn(
        'group flex min-h-[96px] items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/35',
        !skill.enabled && 'opacity-80'
      )}
    >
      <button
        className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        type="button"
        onClick={onDetail}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="truncate text-sm font-semibold">{label}</h2>
          <span className="max-w-[240px] truncate rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            {skill.name}
          </span>
          {!skill.isValid ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              <AlertCircle className="size-3" />
              校验异常
            </span>
          ) : null}
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
          {skill.description || '暂无描述'}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-1">
          {editable && onEdit ? (
            <TooltipHint label="编辑">
              <Button
                disabled={busy}
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={onEdit}
              >
                <Pencil className="size-4 text-muted-foreground" />
              </Button>
            </TooltipHint>
          ) : null}
          {removable && onUninstall ? (
            <TooltipHint label="卸载">
              <Button
                disabled={busy}
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={onUninstall}
              >
                <Trash2 className="size-4 text-muted-foreground" />
              </Button>
            </TooltipHint>
          ) : null}
        <Switch
          checked={skill.enabled}
          disabled={busy || !skill.isValid}
          aria-label={`启用 ${label}`}
          onCheckedChange={onToggle}
        />
        <Button
          aria-label={`查看 ${label} 详情`}
          size="icon-sm"
          type="button"
          variant="ghost"
          onClick={onDetail}
        >
          <ChevronRight className="size-4 text-muted-foreground" />
        </Button>
      </div>
    </article>
  )
}

function DetailNavButton({
  active,
  count,
  expandable = false,
  expanded = false,
  icon: Icon,
  label,
  onClick
}: {
  active: boolean
  count?: number
  expandable?: boolean
  expanded?: boolean
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
      {expandable ? (
        expanded ? (
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
        )
      ) : null}
    </button>
  )
}

function InfoRow({
  label,
  mono = false,
  value
}: {
  label: string
  mono?: boolean
  value: string
}): React.JSX.Element {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-4 px-4 py-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('min-w-0 break-all text-right', mono && 'font-mono text-xs')}>
        {value}
      </span>
    </div>
  )
}
