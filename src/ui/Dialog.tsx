import { Dialog as R } from "radix-ui";
import type { ReactNode } from "react";
import { IconButton } from "./Button.tsx";

export const Dialog = R.Root;
export const DialogTrigger = R.Trigger;
export const DialogClose = R.Close;

export function DialogContent({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <R.Portal>
      <R.Overlay className="ld-overlay" />
      <R.Content className="ld-dialog ld-surface">
        <header className="ld-dialog-head">
          <R.Title className="ld-dialog-title">{title}</R.Title>
          <R.Close asChild>
            <IconButton icon="close" label="Close" size="sm" />
          </R.Close>
        </header>
        {description ? (
          <R.Description className="ld-dialog-description">{description}</R.Description>
        ) : (
          <R.Description className="ld-sr-only">{title}</R.Description>
        )}
        {children}
      </R.Content>
    </R.Portal>
  );
}
