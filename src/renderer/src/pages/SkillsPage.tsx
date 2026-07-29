import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  FileArchive,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Zap
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/animated-tabs'
import { confirmDelete } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { skillLabel, useSkillsStore } from '@/stores/skills-store'
import type { SkillSummary } from '@shared/skills'

type SkillTab = 'builtin' | 'custom'

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

  return (
    <div className="app-scrollbar h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[960px] px-6 py-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-foreground">
              <Zap className="size-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight">技能库</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              管理内置与自定义技能。可新建、编辑、导入 ZIP、卸载；启用后创作助手可读取。
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

        <div className="mt-4 flex flex-wrap items-center gap-3">
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

        <Tabs className="mt-4" value={tab} onValueChange={(v) => setTab(v as SkillTab)}>
          <TabsList className="h-9 bg-transparent p-0">
            <TabsTrigger value="builtin">
              内置
              <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px]">
                {builtin.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="custom">
              已安装
              <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px]">
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
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            正在加载技能…
          </div>
        ) : visible.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-border px-6 py-12 text-center">
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
          <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((skill) => (
              <SkillCard
                key={skill.id}
                busy={busyId === skill.id}
                editable={skill.sourceKind === 'custom'}
                removable={skill.sourceKind === 'custom'}
                skill={skill}
                onDetail={() => void openDetail(skill.id)}
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
      <Modal
        open={detail !== null || detailLoading}
        onOpenChange={(open) => !open && closeDetail()}
      >
        <ModalContent className="max-h-[85vh]" size="lg" showCloseButton>
          <ModalTitle className="sr-only">技能详情</ModalTitle>
          <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
            <Zap className="size-4 text-muted-foreground" />
            <span className="truncate text-sm font-medium">
              {detail ? skillLabel(detail) : '加载中…'}
            </span>
            {detail?.name ? (
              <span className="truncate text-xs text-muted-foreground">· {detail.name}</span>
            ) : null}
            {detail?.sourceKind === 'custom' ? (
              <Button
                className="ml-auto"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!detail) return
                  closeDetail()
                  void openEdit(detail)
                }}
              >
                <Pencil className="size-3.5" />
                编辑
              </Button>
            ) : null}
          </header>
          <ModalBody className="app-scrollbar max-h-[calc(85vh-3rem)] space-y-4 overflow-y-auto">
            {detailLoading && !detail ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                读取技能…
              </div>
            ) : detail ? (
              <>
                <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {detail.description}
                </p>
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
                {detail.references.length > 0 ? (
                  <div>
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      References
                    </h3>
                    <ul className="mt-2 space-y-1 text-sm">
                      {detail.references.map((ref) => (
                        <li
                          key={ref.path}
                          className="rounded-md bg-muted/50 px-2 py-1 font-mono text-xs"
                        >
                          {ref.path}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    SKILL.md
                  </h3>
                  <pre className="mt-2 max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-3 text-xs leading-5">
                    {detail.rawMarkdown}
                  </pre>
                </div>
              </>
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* 新建 */}
      <Modal open={createOpen} onOpenChange={setCreateOpen}>
        <ModalContent size="md" showCloseButton>
          <ModalTitle className="sr-only">新建技能</ModalTitle>
          <header className="flex h-11 items-center border-b border-border px-4 text-sm font-medium">
            新建自定义技能
          </header>
          <ModalBody className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                id（kebab-case）*
              </label>
              <Input
                placeholder="my-writing-flow"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">中文名</label>
              <Input
                placeholder="我的写作流程"
                value={createDisplayName}
                onChange={(e) => setCreateDisplayName(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">描述 *</label>
              <textarea
                className="min-h-[100px] w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                placeholder="做什么、何时用…"
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
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
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 编辑 SKILL.md */}
      <Modal
        open={editOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditOpen(false)
            setEditId(null)
          }
        }}
      >
        <ModalContent className="max-h-[90vh]" size="xl" showCloseButton>
          <ModalTitle className="sr-only">编辑技能</ModalTitle>
          <header className="flex h-11 items-center gap-2 border-b border-border px-4 text-sm font-medium">
            编辑 SKILL.md
            {editId ? (
              <span className="font-mono text-xs text-muted-foreground">{editId}</span>
            ) : null}
          </header>
          <ModalBody className="flex min-h-0 flex-1 flex-col">
            {editLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                加载…
              </div>
            ) : (
              <textarea
                className="app-scrollbar min-h-[50vh] w-full flex-1 resize-y rounded-md border border-border bg-muted/20 px-3 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35"
                spellCheck={false}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
              />
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              frontmatter 的 name 必须等于技能 id；保存前会自动备份旧版 SKILL.md。
            </p>
          </ModalBody>
          <ModalFooter>
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
          </ModalFooter>
        </ModalContent>
      </Modal>
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
  const showId = label !== skill.name

  return (
    <Card
      className={cn(
        'h-full transition-colors hover:border-border/90 hover:bg-muted/20',
        !skill.enabled && 'opacity-80'
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Zap className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate">
              <button
                className="truncate text-left hover:underline"
                type="button"
                onClick={onDetail}
              >
                {label}
              </button>
            </CardTitle>
            {showId ? (
              <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                {skill.name}
              </p>
            ) : null}
          </div>
        </div>
        {!skill.isValid ? (
          <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-md border border-destructive/20 bg-destructive/8 px-1.5 py-0.5 text-[11px] text-destructive">
            <AlertCircle className="size-3" />
            校验异常
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        <CardDescription className="line-clamp-3 min-h-[3.75rem]">
          {skill.description || '暂无描述'}
        </CardDescription>
        {skill.version ? (
          <p className="mt-2 text-[11px] text-muted-foreground">v{skill.version}</p>
        ) : null}
      </CardContent>
      <CardFooter className="justify-between">
        <div className="flex items-center gap-0.5">
          <Button size="sm" type="button" variant="ghost" onClick={onDetail}>
            详情
          </Button>
          {editable && onEdit ? (
            <Button
              disabled={busy}
              size="icon-sm"
              title="编辑"
              type="button"
              variant="ghost"
              onClick={onEdit}
            >
              <Pencil className="size-4 text-muted-foreground" />
            </Button>
          ) : null}
          {removable && onUninstall ? (
            <Button
              disabled={busy}
              size="icon-sm"
              title="卸载"
              type="button"
              variant="ghost"
              onClick={onUninstall}
            >
              <Trash2 className="size-4 text-muted-foreground" />
            </Button>
          ) : null}
        </div>
        <Switch
          checked={skill.enabled}
          disabled={busy || !skill.isValid}
          label={`启用 ${label}`}
          onCheckedChange={onToggle}
        />
      </CardFooter>
    </Card>
  )
}
