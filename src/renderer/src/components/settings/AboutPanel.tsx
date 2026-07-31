import { useEffect, useState } from 'react'
import { Download, ExternalLink, Loader2, RefreshCw, RotateCcw } from 'lucide-react'
import type { UpdateStatus } from '@shared/updates'
import { BrandLogo } from '@/components/BrandLogo'
import { Button } from '@/components/ui/button'
import { PageTitle } from './settings-shared'
import { promptForUpdateRestart } from '@/lib/update-utils'

/** 关于与软件更新面板。 */
export function AboutPanel(): React.JSX.Element {
  const [version, setVersion] = useState('...')
  const [status, setStatus] = useState<UpdateStatus | null>(null)

  useEffect(() => {
    let active = true
    void Promise.all([window.api.app.getVersion(), window.api.updates.getStatus()]).then(
      ([appVersion, updateStatus]) => {
        if (!active) return
        setVersion(appVersion)
        setStatus(updateStatus)
      }
    )
    const unsubscribe = window.api.updates.onStatus((nextStatus) => {
      if (active) setStatus(nextStatus)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const runPrimaryAction = async (): Promise<void> => {
    if (!status) return
    if (status.phase === 'available') {
      const next = await window.api.updates.download()
      setStatus(next)
      await promptForUpdateRestart(next)
      return
    }
    if (status.phase === 'downloaded') {
      await promptForUpdateRestart(status)
      return
    }
    setStatus(await window.api.updates.check())
  }

  const busy = status?.phase === 'checking' || status?.phase === 'downloading'
  const primaryDisabled = !status || !status.enabled || busy

  return (
    <section>
      <PageTitle title="关于" description="应用信息、版本发布与软件更新。" />

      <BrandLogo className="mt-6" />

      <div className="mt-5 divide-y divide-border rounded-lg border border-border bg-card">
        <InfoRow description="Dream Agent" label="应用名称" value="造梦师" />
        <InfoRow description="当前安装版本" label="版本" value={`v${version}`} />
        <div className="px-5 py-4">
          <div className="flex items-start justify-between gap-5">
            <div className="min-w-0">
              <h3 className="text-sm font-medium">软件更新</h3>
              <p aria-live="polite" className="mt-1 text-xs text-muted-foreground">
                {status?.message ?? '正在读取更新状态...'}
              </p>
              {status?.latestVersion && status.latestVersion !== version ? (
                <p className="mt-1 text-xs text-foreground">
                  最新版本 v{status.latestVersion}
                  {status.releaseDate ? ` · ${formatReleaseDate(status.releaseDate)}` : ''}
                </p>
              ) : null}
              {status?.error ? (
                <p className="mt-2 max-w-xl break-words text-xs text-destructive">
                  {status.error}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                onClick={() => void window.api.updates.openReleases()}
                size="sm"
                type="button"
                variant="outline"
              >
                <ExternalLink />
                发布页面
              </Button>
              <Button
                disabled={primaryDisabled}
                onClick={() => void runPrimaryAction()}
                size="sm"
                type="button"
              >
                <PrimaryActionContent status={status} />
              </Button>
            </div>
          </div>

          {status?.phase === 'downloading' ? (
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-300"
                style={{ width: `${Math.max(0, Math.min(100, status.downloadPercent ?? 0))}%` }}
              />
            </div>
          ) : null}

          {status?.releaseNotes &&
          (status.phase === 'available' || status.phase === 'downloaded') ? (
            <details className="mt-4 border-t border-border pt-3">
              <summary className="cursor-pointer text-xs font-medium text-foreground">
                查看更新说明
              </summary>
              <div className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground app-scrollbar">
                {status.releaseNotes}
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function InfoRow({
  label,
  description,
  value
}: {
  label: string
  description: string
  value: string
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <h3 className="text-sm font-medium">{label}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  )
}

function PrimaryActionContent({ status }: { status: UpdateStatus | null }): React.JSX.Element {
  if (!status) {
    return (
      <>
        <Loader2 className="animate-spin" />
        读取中
      </>
    )
  }
  if (status.phase === 'checking') {
    return (
      <>
        <Loader2 className="animate-spin" />
        检查中
      </>
    )
  }
  if (status.phase === 'downloading') {
    return (
      <>
        <Loader2 className="animate-spin" />
        下载 {Math.round(status.downloadPercent ?? 0)}%
      </>
    )
  }
  if (status.phase === 'available') {
    return (
      <>
        <Download />
        下载更新
      </>
    )
  }
  if (status.phase === 'downloaded') {
    return (
      <>
        <RotateCcw />
        重启安装
      </>
    )
  }
  return (
    <>
      <RefreshCw />
      检查更新
    </>
  )
}

function formatReleaseDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN')
}
