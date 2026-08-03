import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'

export interface NamePromptDialogProps {
  /** 是否打开 */
  open: boolean
  /** 关闭 / 开关 */
  onOpenChange: (open: boolean) => void
  /** 标题，如「新建项目」 */
  title: string
  /** 输入框标签 */
  label?: string
  /** 占位符 */
  placeholder?: string
  /** 可选最大长度 */
  maxLength?: number
  /** 初始值（编辑时灌入；打开时重置） */
  initialValue?: string
  /** 确认按钮文案，默认「创建」或有 initialValue 时「保存」 */
  confirmLabel?: string
  /** 提交中按钮文案 */
  submittingLabel?: string
  /** 表单校验错误 */
  error?: React.ReactNode
  /** 提交回调；返回 Promise 时自动处理 loading；成功后关闭 */
  onSubmit: (value: string) => void | Promise<void>
}

/**
 * 通用单行名称输入模态
 * 用于新建/编辑项目、节点等只需填一个名称的场景
 */
export function NamePromptDialog({
  open,
  onOpenChange,
  title,
  label = '名称',
  placeholder,
  maxLength,
  initialValue = '',
  confirmLabel,
  submittingLabel = '保存中…',
  error,
  onSubmit
}: NamePromptDialogProps): React.JSX.Element {
  const [value, setValue] = useState(initialValue)
  const [submitting, setSubmitting] = useState(false)

  // 每次打开时重置为 initialValue
  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setSubmitting(false)
    }
  }, [open, initialValue])

  const resolvedConfirm = confirmLabel ?? (initialValue.trim() ? '保存' : '创建')

  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed || submitting) return

    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      onOpenChange(false)
    } catch {
      // 错误由调用方 store 处理；保持打开便于修改
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form className="grid gap-5" onSubmit={(e) => void handleSubmit(e)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>填写名称后继续。</DialogDescription>
          </DialogHeader>

          <div>
            <div className="grid gap-2">
              <Label htmlFor="name-prompt-input">{label}</Label>
              <Input
                id="name-prompt-input"
                autoFocus
                disabled={submitting}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                value={value}
                maxLength={maxLength}
              />
            </div>
            {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={submitting || !value.trim()} type="submit">
              {submitting ? submittingLabel : resolvedConfirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
