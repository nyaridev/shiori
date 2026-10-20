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
      <R.Overlay className="sh-overlay" />
      <R.Content className="sh-dialog sh-surface">
        <header className="sh-dialog-head">
          <R.Title className="sh-dialog-title">{title}</R.Title>
          <R.Close asChild>
            <IconButton icon="close" label="Close" size="sm" />
          </R.Close>
        </header>
        {description ? (
          <R.Description className="sh-dialog-description">{description}</R.Description>
        ) : (
          <R.Description className="sh-sr-only">{title}</R.Description>
        )}
        {children}
      </R.Content>
    </R.Portal>
  );
}
