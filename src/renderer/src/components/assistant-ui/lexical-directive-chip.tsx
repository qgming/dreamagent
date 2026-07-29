/**
 * Lexical 行内 directive 胶囊（输入框内）
 * 与用户消息 DirectiveChip 共用色板；surface 适配输入区浅/深色
 */
import type { DirectiveChipProps } from '@assistant-ui/react-lexical'
import { DIRECTIVE_ICON_MAP, directiveChipClassName } from './directive-chip'

/** LexicalComposerInput 的 directiveChip 渲染器 */
export function LexicalDirectiveChip({
  directiveId,
  directiveType,
  label
}: DirectiveChipProps): React.JSX.Element {
  const Icon = DIRECTIVE_ICON_MAP[directiveType]

  return (
    <span
      className={directiveChipClassName(directiveType, {
        surface: 'surface',
        // 行内原子：不可选中内部，高度跟正文
        className:
          'mx-[0.1em] select-none align-baseline [&_svg]:pointer-events-none'
      })}
      data-slot="directive-text-chip"
      data-directive-type={directiveType}
      data-directive-id={directiveId}
      contentEditable={false}
      aria-label={`${directiveType}: ${label}`}
      title={label}
    >
      {Icon ? <Icon /> : null}
      <span className="aui-directive-chip-label min-w-0 truncate">{label}</span>
    </span>
  )
}
