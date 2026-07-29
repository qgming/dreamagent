import { contextBridge, ipcRenderer } from 'electron'

/**
 * 应用信息 API
 */
const appApi = {
  /** 获取应用版本号 */
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  /** 获取应用名称 */
  getName: (): Promise<string> => ipcRenderer.invoke('app:getName')
}

/**
 * 窗口控制 API
 */
const windowApi = {
  /** 最小化窗口 */
  minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  /** 切换最大化 / 还原 */
  toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('window:toggle-maximize'),
  /** 关闭窗口 */
  close: (): Promise<void> => ipcRenderer.invoke('window:close'),
  /** 查询是否最大化 */
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  /** 设置窗口标题 */
  setTitle: (title: string): Promise<void> => ipcRenderer.invoke('window:set-title', title),
  /**
   * 监听最大化状态变化
   * @returns 取消订阅函数
   */
  onMaximizedChange: (handler: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, value: boolean): void => {
      handler(Boolean(value))
    }
    ipcRenderer.on('window:maximized-change', listener)
    return () => {
      ipcRenderer.removeListener('window:maximized-change', listener)
    }
  }
}

/**
 * 暴露给渲染进程的统一 API 命名空间
 */
const api = {
  app: appApi,
  window: windowApi
}

// 通过 contextBridge 安全暴露 API 到渲染进程
try {
  contextBridge.exposeInMainWorld('api', api)
} catch (error) {
  console.error('暴露 preload API 失败:', error)
}
