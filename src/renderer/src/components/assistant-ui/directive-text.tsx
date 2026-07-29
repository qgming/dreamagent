/**
 * 用户消息 directive 渲染：:type[label]{name=id} → 内联胶囊
 * 与输入区插入预览共用 directive-chip 色板（bubble / surface）
 */
"use client";

import { memo } from "react";
import type { TextMessagePartComponent } from "@assistant-ui/react";
import type { Unstable_DirectiveFormatter } from "@assistant-ui/react";
import { unstable_defaultDirectiveFormatter } from "@assistant-ui/react";
import { parseUserMessage } from "@/components/create/assistant/composer-context";
import { DirectiveChip } from "./directive-chip-ui";

export type CreateDirectiveTextOptions = {
  // 预留：自定义图标映射（当前统一走 DirectiveChip）
  iconMap?: Record<string, unknown>;
  fallbackIcon?: unknown;
};

/** 工厂：绑定 formatter */
export function createDirectiveText(
  formatter: Unstable_DirectiveFormatter,
  _options?: CreateDirectiveTextOptions,
): TextMessagePartComponent {
  const Component: TextMessagePartComponent = ({ text }) => {
    const raw = text ?? "";

    // 兼容旧 [上下文]…[用户] 块
    const legacy = parseUserMessage(raw);
    if (legacy.hasContext) {
      return (
        <div className="select-text space-y-2" data-message-selectable>
          {legacy.items.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {legacy.items.map((item) => (
                <DirectiveChip
                  key={`${item.kind}:${item.id}`}
                  type={item.kind}
                  label={item.label}
                  id={item.id}
                  surface="bubble"
                />
              ))}
            </div>
          ) : null}
          {legacy.body ? (
            <p className="whitespace-pre-wrap leading-relaxed select-text">
              {legacy.body}
            </p>
          ) : null}
        </div>
      );
    }

    const segments = formatter.parse(raw);
    if (segments.length === 1 && segments[0]!.kind === "text") {
      return (
        <p
          className="whitespace-pre-wrap leading-relaxed select-text"
          data-message-selectable
        >
          {raw}
        </p>
      );
    }

    return (
      <p
        className="whitespace-pre-wrap leading-relaxed select-text"
        data-message-selectable
      >
        {segments.map((seg, i) => {
          if (seg.kind === "text") {
            return (
              <span key={i} className="whitespace-pre-wrap">
                {seg.text}
              </span>
            );
          }
          return (
            <DirectiveChip
              key={i}
              type={seg.type}
              label={seg.label}
              id={seg.id}
              surface="bubble"
              className="mx-[0.1em]"
            />
          );
        })}
      </p>
    );
  };
  Component.displayName = "DirectiveText";
  return Component;
}

const DirectiveTextImpl = createDirectiveText(
  unstable_defaultDirectiveFormatter,
);

/** 用户消息 Text part：directive 胶囊 */
export const DirectiveText: TextMessagePartComponent = memo(DirectiveTextImpl);
