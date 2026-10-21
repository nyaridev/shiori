import { HoverCard as R } from "radix-ui";
import type { ReactNode } from "react";

/** A card that opens while the pointer rests on its trigger (a link preview). The trigger keeps working as itself. */
export function HoverCard({
  trigger,
  side = "bottom",
  children,
}: {
  trigger: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  children: ReactNode;
}) {
  return (
    <R.Root openDelay={400} closeDelay={120}>
      <R.Trigger asChild>{trigger}</R.Trigger>
      <R.Portal>
        <R.Content className="sh-hovercard sh-surface" side={side} sideOffset={6} collisionPadding={12}>
          {children}
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}
