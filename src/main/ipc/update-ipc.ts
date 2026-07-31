import { ipcMain } from 'electron'
import type { UpdateService } from '../services/update-service'

export function registerUpdateIpc(updates: UpdateService): void {
  ipcMain.handle('updates:getStatus', () => updates.getStatus())
  ipcMain.handle('updates:check', () => updates.checkForUpdates())
  ipcMain.handle('updates:download', () => updates.downloadUpdate())
  ipcMain.handle('updates:quitAndInstall', () => updates.quitAndInstall())
  ipcMain.handle('updates:openReleases', () => updates.openReleasesPage())
}
