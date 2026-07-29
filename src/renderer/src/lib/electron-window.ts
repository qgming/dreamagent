/**
 * 窗口控制相关工具（对接 preload 暴露的 window API）
 */

/** 获取窗口 API，非 Electron 环境返回 null */
export function getWindowApi(): Window['api']['window'] | null {
  return window.api?.window ?? null
}

/** 执行窗口操作（无 API 时静默跳过） */
export async function runWindowAction(
  action: (api: NonNullable<ReturnType<typeof getWindowApi>>) => Promise<void>
): Promise<void> {
  const api = getWindowApi()
  if (!api) return
  await action(api)
}

/** 刷新最大化状态 */
export async function refreshMaximizedState(
  setMaximized: (value: boolean) => void
): Promise<void> {
  try {
    setMaximized((await window.api?.window.isMaximized()) ?? false)
  } catch {
    setMaximized(false)
  }
}
