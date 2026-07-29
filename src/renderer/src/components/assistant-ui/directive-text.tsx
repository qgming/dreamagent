/**
 * 用户消息 directive 渲染：:type[label]{name=id} → 内联 chip
 * 官方 createDirectiveText + 项目图标 / 气泡色 / 旧 [上下文] 兼容
 */
"use client";

import { memo, type FC } from "react";
import type { TextMessagePartComponent } from "@assistant-ui/react";
import type { Unstable_DirectiveFormatter } from "@assistant-ui/react";
import { unstable_defaultDirectiveFormatter } from "@assistant-ui/react";
import { CircleDot, FileText, Users, Wrench, Zap } from "lucide-react";
import { Badge } from "./badge";
import { parseUserMessage } from "@/components/create/assistant/composer-context";
import { cn } from "@/lib/utils";

type IconComponent = FC<{ className?: string }>;

export type CreateDirectiveTextOptions = {
  /** 按 directive type 映射图标 */
  iconMap?: Record<string, IconComponent>;
  /** 未命中 iconMap 时的兜底图标 */
  fallbackIcon?: IconComponent;
};

const DEFAULT_ICON_MAP: Record<string, IconComponent> = {
  skill: Zap,
  beat: CircleDot,
  entity: Users,
  tool: Wrench,
  article: FileText,
  chapter: FileText,
};

/** 用户 primary 气泡上的 chip 色 */
const chipTone = (type: string): string => {
  switch (type) {
    case "skill":
      return "border-violet-500/40 bg-violet-500/20 text-violet-50";
    case "beat":
      return "border-sky-500/40 bg-sky-500/20 text-sky-50";
    case "entity":
      return "border-rose-500/40 bg-rose-500/20 text-rose-50";
    case "tool":
      return "border-amber-500/40 bg-amber-500/20 text-amber-50";
    case "article":
    case "chapter":
      return "border-emerald-500/40 bg-emerald-500/20 text-emerald-50";
    default:
      return "border-white/20 bg-white/15 text-primary-foreground";
  }
};

/** 工厂：绑定 formatter + 图标 */
export function createDirectiveText(
  formatter: Unstable_DirectiveFormatter,
  options?: CreateDirectiveTextOptions,
): TextMessagePartComponent {
  const iconMap = { ...DEFAULT_ICON_MAP, ...options?.iconMap };
  const fallbackIcon = options?.fallbackIcon;

  const Component: TextMessagePartComponent = ({ text }) => {
    const raw = text ?? "";

    // 兼容旧 [上下文]…[用户] 块
    const legacy = parseUserMessage(raw);
    if (legacy.hasContext) {
      return (
        <div className="select-text space-y-2" data-message-selectable>
          {legacy.items.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {legacy.items.map((item) => {
                const Icon = iconMap[item.kind] ?? fallbackIcon;
                return (
                  <Badge
                    key={`${item.kind}:${item.id}`}
                    size="sm"
                    className={cn(
                      "aui-directive-chip items-baseline border text-[12px] leading-none [&_svg]:self-center",
                      chipTone(item.kind),
                    )}
                    data-directive-type={item.kind}
                    data-directive-id={item.id}
                    aria-label={`${item.kind}: ${item.label}`}
                  >
                    {Icon ? <Icon /> : null}
                    {item.label}
                  </Badge>
                );
              })}
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
          const Icon = iconMap[seg.type] ?? fallbackIcon;
          return (
            <Badge
              key={i}
              size="sm"
              data-slot="directive-text-chip"
              data-directive-type={seg.type}
              data-directive-id={seg.id}
              aria-label={`${seg.type}: ${seg.label}`}
              className={cn(
                "aui-directive-chip mx-0.5 inline-flex translate-y-[-1px] items-baseline border text-[12px] leading-none [&_svg]:self-center",
                chipTone(seg.type),
              )}
            >
              {Icon ? <Icon /> : null}
              {seg.label}
            </Badge>
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

/** 用户消息 Text part：directive chip */
export const DirectiveText: TextMessagePartComponent = memo(DirectiveTextImpl);
