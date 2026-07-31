import { app, BrowserWindow, shell } from 'electron'
import {
  autoUpdater,
  type ProgressInfo,
  type UpdateInfo
} from 'electron-updater'
import type { UpdateStatus } from '../../shared/updates'

const RELEASES_URL = 'https://github.com/qgming/dreamagent/releases'
const AUTO_CHECK_DELAY_MS = 5_000
const AUTO_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1_000

function normalizeReleaseNotes(
  notes: UpdateInfo['releaseNotes']
): string | null {
  if (typeof notes === 'string') return notes.trim() || null
  if (!Array.isArray(notes)) return null
  const value = notes
    .map((note) => [note.version, note.note].filter(Boolean).join('\n\n'))
    .filter(Boolean)
    .join('\n\n')
    .trim()
  return value || null
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误')
}

export class UpdateService {
  private status: UpdateStatus
  private autoCheckTimer: NodeJS.Timeout | null = null
  private intervalTimer: NodeJS.Timeout | null = null

  constructor() {
    const enabled = app.isPackaged
    this.status = {
      phase: enabled ? 'idle' : 'disabled',
      enabled,
      currentVersion: app.getVersion(),
      latestVersion: null,
      releaseName: null,
      releaseDate: null,
      releaseNotes: null,
      releaseUrl: RELEASES_URL,
      message: enabled ? '可以检查新版本' : '开发环境不连接更新服务',
      error: null,
      downloadPercent: null,
      transferred: null,
      total: null
    }

    if (!enabled) return

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false

    autoUpdater.on('checking-for-update', () => {
      this.setStatus({
        phase: 'checking',
        message: '正在检查更新...',
        error: null
      })
    })
    autoUpdater.on('update-available', (info) => {
      this.setStatusFromInfo(info, {
        phase: 'available',
        message: `发现新版本 v${info.version}`,
        error: null
      })
    })
    autoUpdater.on('update-not-available', (info) => {
      this.setStatusFromInfo(info, {
        phase: 'not-available',
        message: '当前已是最新版本',
        error: null
      })
    })
    autoUpdater.on('download-progress', (progress) => {
      this.handleDownloadProgress(progress)
    })
    autoUpdater.on('update-downloaded', (info) => {
      this.setStatusFromInfo(info, {
        phase: 'downloaded',
        message: '更新已下载，重启后安装',
        error: null,
        downloadPercent: 100
      })
    })
    autoUpdater.on('error', (error) => {
      this.setStatus({
        phase: 'error',
        message: '更新服务暂时不可用',
        error: errorMessage(error)
      })
    })
  }

  getStatus(): UpdateStatus {
    return { ...this.status }
  }

  async checkForUpdates(): Promise<UpdateStatus> {
    if (!this.status.enabled) return this.getStatus()
    if (this.status.phase === 'checking' || this.status.phase === 'downloading') {
      return this.getStatus()
    }

    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.setStatus({
        phase: 'error',
        message: '检查更新失败',
        error: errorMessage(error)
      })
    }
    return this.getStatus()
  }

  async downloadUpdate(): Promise<UpdateStatus> {
    if (!this.status.enabled || this.status.phase !== 'available') return this.getStatus()

    this.setStatus({
      phase: 'downloading',
      message: '正在下载更新...',
      error: null,
      downloadPercent: 0,
      transferred: 0
    })
    try {
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.setStatus({
        phase: 'error',
        message: '下载更新失败',
        error: errorMessage(error)
      })
    }
    return this.getStatus()
  }

  quitAndInstall(): void {
    if (this.status.phase !== 'downloaded') return
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
  }

  async openReleasesPage(): Promise<void> {
    await shell.openExternal(RELEASES_URL)
  }

  startAutomaticChecks(): void {
    if (!this.status.enabled || this.autoCheckTimer) return
    this.autoCheckTimer = setTimeout(() => {
      void this.checkForUpdates()
      this.intervalTimer = setInterval(() => void this.checkForUpdates(), AUTO_CHECK_INTERVAL_MS)
    }, AUTO_CHECK_DELAY_MS)
  }

  dispose(): void {
    if (this.autoCheckTimer) clearTimeout(this.autoCheckTimer)
    if (this.intervalTimer) clearInterval(this.intervalTimer)
    this.autoCheckTimer = null
    this.intervalTimer = null
  }

  private setStatusFromInfo(info: UpdateInfo, patch: Partial<UpdateStatus>): void {
    this.setStatus({
      latestVersion: info.version || null,
      releaseName: info.releaseName || null,
      releaseDate: info.releaseDate || null,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes),
      ...patch
    })
  }

  private handleDownloadProgress(progress: ProgressInfo): void {
    this.setStatus({
      phase: 'downloading',
      message: `正在下载更新 ${Math.round(progress.percent)}%`,
      downloadPercent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      error: null
    })
  }

  private setStatus(patch: Partial<UpdateStatus>): void {
    this.status = {
      ...this.status,
      ...patch,
      currentVersion: app.getVersion(),
      enabled: app.isPackaged,
      releaseUrl: RELEASES_URL
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('updates:status', this.getStatus())
    }
  }
}
