import { PageTitle } from './settings-shared'

/**
 * 关于面板
 */
export function AboutPanel(): React.JSX.Element {
  return (
    <section>
      <PageTitle title="关于" description="造梦师应用信息。" />

      <div className="mt-8 divide-y divide-border rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">应用名称</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">Dream Agent</p>
          </div>
          <span className="text-sm text-foreground">造梦师</span>
        </div>
        <div className="flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="min-w-0">
            <h3 className="text-sm font-medium">版本</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">当前应用版本号</p>
          </div>
          <span className="text-sm text-foreground">0.1.0</span>
        </div>
      </div>
    </section>
  )
}
