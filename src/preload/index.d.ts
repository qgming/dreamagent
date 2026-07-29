/**
 * 应用信息 API
 */
export interface AppApi {
  getVersion: () => Promise<string>
  getName: () => Promise<string>
}

/**
 * 窗口控制 API
 */
export interface WindowApi {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<boolean>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  setTitle: (title: string) => Promise<void>
  onMaximizedChange: (handler: (maximized: boolean) => void) => () => void
}

/**
 * 渲染进程可调用的统一 API
 */
export interface DreamAgentApi {
  app: AppApi
  window: WindowApi
}

declare global {
  interface Window {
    api: DreamAgentApi
  }
}

export {}
