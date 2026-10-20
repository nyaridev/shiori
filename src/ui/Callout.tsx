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
    <aside className="ld-callout" data-tone={tone}>
      <span className="ld-callout-icon">
        <Icon name={ICONS[tone] ?? "info"} size={18} />
      </span>
      <div className="ld-callout-body">
        {title && <p className="ld-callout-title">{title}</p>}
        {children}
      </div>
    </aside>
  );
}
