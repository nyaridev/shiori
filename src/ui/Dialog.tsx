import { Dialog as R } from "radix-ui";
import type { ReactNode } from "react";
import { IconButton } from "./Button.tsx";

export const Dialog = R.Root;
export const DialogTrigger = R.Trigger;
export const DialogClose = R.Close;

export function DialogContent({
  title,
  description,
  size = "md",
  children,
}: {
  title: string;
  description?: string;
  /** `wide` for media: an image at a readable size. `palette`: near the top, no title bar (the title is for screen
   * readers), for a search box and its results. `lg`: a form with lists under it, scrolling when tall. `viewer`:
   * the whole window, for looking through pictures. */
  size?: "md" | "lg" | "wide" | "palette" | "viewer";
  children: ReactNode;
}) {
  return (
    <R.Portal>
      <R.Overlay className="sh-overlay" />
      <R.Content className="sh-dialog sh-surface" data-size={size}>
        {size === "palette" ? (
          <R.Title className="sh-sr-only">{title}</R.Title>
        ) : (
          <header className="sh-dialog-head">
            <R.Title className="sh-dialog-title">{title}</R.Title>
            <R.Close asChild>
              <IconButton icon="close" label="Close" size="sm" />
            </R.Close>
          </header>
        )}
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
