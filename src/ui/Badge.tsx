import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "bad";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className="sh-badge" data-tone={tone}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="sh-kbd">{children}</kbd>;
}
