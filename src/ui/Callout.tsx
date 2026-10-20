import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

export type CalloutTone = "note" | "tip" | "warning" | "danger";

const ICONS: Record<CalloutTone, IconName> = { note: "info", tip: "tip", warning: "warning", danger: "danger" };

export function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <aside className="sh-callout" data-tone={tone}>
      <span className="sh-callout-icon">
        <Icon name={ICONS[tone] ?? "info"} size={18} />
      </span>
      <div className="sh-callout-body">
        {title && <p className="sh-callout-title">{title}</p>}
        {children}
      </div>
    </aside>
  );
}
