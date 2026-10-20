import { Popover as R } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

export const Popover = R.Root;
export const PopoverTrigger = R.Trigger;
export const PopoverAnchor = R.Anchor;
export const PopoverClose = R.Close;

export function PopoverContent({
  children,
  width = 300,
  ...rest
}: { children: ReactNode; width?: number } & ComponentProps<typeof R.Content>) {
  return (
    <R.Portal>
      <R.Content className="ld-popover ld-surface" sideOffset={8} collisionPadding={12} style={{ width }} {...rest}>
        {children}
      </R.Content>
    </R.Portal>
  );
}
