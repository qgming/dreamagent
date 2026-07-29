import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle
} from '@/components/ui/modal'

export interface NamePromptModalProps {
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
  /** 初始值（编辑时灌入；打开时重置） */
  initialValue?: string
  /** 确认按钮文案，默认「创建」或有 initialValue 时「保存」 */
  confirmLabel?: string
  /** 提交中按钮文案 */
  submittingLabel?: string
  /** 提交回调；返回 Promise 时自动处理 loading；成功后关闭 */
  onSubmit: (value: string) => void | Promise<void>
}

/**
 * 通用单行名称输入模态
 * 用于新建/编辑项目、节点等只需填一个名称的场景
 */
export function NamePromptModal({
  open,
  onOpenChange,
  title,
  label = '名称',
  placeholder,
  initialValue = '',
  confirmLabel,
  submittingLabel = '保存中…',
  onSubmit
}: NamePromptModalProps): React.JSX.Element {
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
    <Modal onOpenChange={onOpenChange} open={open}>
      <ModalContent showCloseButton size="sm">
        <form onSubmit={(e) => void handleSubmit(e)}>
          <ModalHeader>
            <ModalTitle>{title}</ModalTitle>
          </ModalHeader>

          <ModalBody>
            <label className="flex flex-col gap-1.5 text-xs text-muted-foreground">
              {label}
              <Input
                autoFocus
                disabled={submitting}
                onChange={(e) => setValue(e.target.value)}
                placeholder={placeholder}
                value={value}
              />
            </label>
          </ModalBody>

          <ModalFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="ghost"
            >
              取消
            </Button>
            <Button disabled={submitting || !value.trim()} type="submit">
              {submitting ? submittingLabel : resolvedConfirm}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}
