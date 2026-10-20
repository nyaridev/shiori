import { Tooltip as R } from "radix-ui";
import type { ReactNode } from "react";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <R.Provider delayDuration={350} skipDelayDuration={150}>
    {children}
  </R.Provider>
);

export function Tooltip({
  content,
  side = "top",
  children,
}: {
  content: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <R.Root>
      <R.Trigger asChild>{children}</R.Trigger>
      <R.Portal>
        <R.Content className="sh-tooltip" side={side} sideOffset={6}>
          {content}
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}
