import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "bad";

export function Badge({
  tone = "neutral",
  title,
  children,
}: {
  tone?: BadgeTone;
  /** What the badge means, on hover. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <span className="sh-badge" data-tone={tone} title={title}>
      {children}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="sh-kbd">{children}</kbd>;
}
