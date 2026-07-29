import { useEffect, useState, type ReactNode } from 'react'
import {
  CopyMinus,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Square as SquareIcon,
  X
} from 'lucide-react'
import { IconButton } from '@/components/IconButton'
import {
  getWindowApi,
  refreshMaximizedState,
  runWindowAction
} from '@/lib/electron-window'
import { cn } from '@/lib/utils'

interface TitleBarProps {
  /** 侧边栏是否收起 */
  sidebarCollapsed: boolean
  /** 切换侧边栏开合 */
  onToggleSidebar: () => void
}

/**
 * 自定义顶部栏
 * 左：侧边栏开关；右：窗口控制（最小化 / 最大化·还原 / 关闭）
 * 应用名称已移至侧边栏顶部
 */
export function TitleBar({
  sidebarCollapsed,
  onToggleSidebar
}: TitleBarProps): React.JSX.Element {
  return (
    <header
      data-electron-drag-region
      className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-background"
    >
      {/* 左侧：侧边栏开关 */}
      <div className="flex h-full items-center gap-1 px-2">
        <IconButton
          className="size-8"
          label={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
          onClick={onToggleSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </IconButton>
      </div>

      {/* 右侧：窗口控制 */}
      <WindowControls />
    </header>
  )
}

/**
 * 窗口控制按钮组
 */
function WindowControls(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const windowApi = getWindowApi()
    if (!windowApi) return

    void refreshMaximizedState(setMaximized)
    return windowApi.onMaximizedChange(setMaximized)
  }, [])

  const minimize = (): void => {
    void runWindowAction((api) => api.minimize())
  }

  const toggleMaximize = (): void => {
    void runWindowAction(async (api) => {
      await api.toggleMaximize()
      await refreshMaximizedState(setMaximized)
    })
  }

  const close = (): void => {
    void runWindowAction((api) => api.close())
  }

  return (
    <div className="flex h-full items-center">
      <WindowButton label="最小化" onClick={minimize}>
        <Minus className="size-4" />
      </WindowButton>
      <WindowButton label={maximized ? '还原' : '最大化'} onClick={toggleMaximize}>
        {maximized ? <CopyMinus className="size-4" /> : <SquareIcon className="size-3.5" />}
      </WindowButton>
      <WindowButton close label="关闭" onClick={close}>
        <X className="size-4" />
      </WindowButton>
    </div>
  )
}

/**
 * 单个窗口控制按钮
 */
function WindowButton({
  children,
  close,
  label,
  onClick
}: {
  children: ReactNode
  close?: boolean
  label: string
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      className={cn(
        'flex h-full w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
        close && 'hover:bg-destructive hover:text-white'
      )}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  )
}
