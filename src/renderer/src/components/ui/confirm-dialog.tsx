import { create } from 'zustand'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'

interface ConfirmOptions {
  /** 标题，默认「确认删除」 */
  title?: string
  /** 说明文案 */
  description: string
  /** 确认按钮，默认「删除」 */
  confirmLabel?: string
  /** 取消按钮，默认「取消」 */
  cancelLabel?: string
  /** 危险操作样式，默认 true */
  destructive?: boolean
}

interface ConfirmState {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  cancelLabel: string
  destructive: boolean
  resolve: ((ok: boolean) => void) | null
  /** 弹出确认框，返回用户是否确认 */
  confirm: (options: ConfirmOptions | string) => Promise<boolean>
  close: (ok: boolean) => void
}

/**
 * 全局确认对话框 store（替代 window.confirm）
 */
export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  title: '确认删除',
  description: '',
  confirmLabel: '删除',
  cancelLabel: '取消',
  destructive: true,
  resolve: null,

  confirm: (options) => {
    const opts: ConfirmOptions =
      typeof options === 'string' ? { description: options } : options

    return new Promise<boolean>((resolve) => {
      // 若已有未完成确认，先取消它
      get().resolve?.(false)
      set({
        open: true,
        title: opts.title ?? '确认删除',
        description: opts.description,
        confirmLabel: opts.confirmLabel ?? '删除',
        cancelLabel: opts.cancelLabel ?? '取消',
        destructive: opts.destructive ?? true,
        resolve
      })
    })
  },

  close: (ok) => {
    const { resolve } = get()
    set({ open: false, resolve: null })
    resolve?.(ok)
  }
}))

/** 便捷调用 */
export function confirmDelete(options: ConfirmOptions | string): Promise<boolean> {
  return useConfirmStore.getState().confirm(options)
}

/**
 * 全局删除确认（使用 shadcn AlertDialog，挂载一次即可）
 */
export function ConfirmDialog(): React.JSX.Element {
  const open = useConfirmStore((s) => s.open)
  const title = useConfirmStore((s) => s.title)
  const description = useConfirmStore((s) => s.description)
  const confirmLabel = useConfirmStore((s) => s.confirmLabel)
  const cancelLabel = useConfirmStore((s) => s.cancelLabel)
  const destructive = useConfirmStore((s) => s.destructive)
  const close = useConfirmStore((s) => s.close)

  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (!next) close(false)
      }}
      open={open}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => close(false)}>
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => close(true)}
            variant={destructive ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
