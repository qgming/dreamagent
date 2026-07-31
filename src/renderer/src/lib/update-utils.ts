import type { UpdateStatus } from '@shared/updates'
import { useConfirmStore } from '@/components/ui/confirm-dialog'

/** 下载完成后询问安装时机；选择下次启动时交给 autoInstallOnAppQuit。 */
export async function promptForUpdateRestart(status: UpdateStatus): Promise<void> {
  if (status.phase !== 'downloaded') return
  const restartNow = await useConfirmStore.getState().confirm({
    title: '更新已准备就绪',
    description: `新版本 v${status.latestVersion ?? ''} 已下载完成。是否立即重启并安装？`,
    confirmLabel: '立即重启',
    cancelLabel: '下次启动',
    destructive: false
  })
  if (restartNow) await window.api.updates.quitAndInstall()
}
