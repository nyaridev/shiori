import { Dialog as R } from "radix-ui";
import type { ReactNode } from "react";
import { IconButton } from "./Button.tsx";
import { ScrollArea } from "./Scrollbar.tsx";

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
   * a card in the middle of the window for a picture, no title bar, a round close button over its corner. */
  size?: "md" | "lg" | "wide" | "palette" | "viewer";
  children: ReactNode;
}) {
  return (
    <R.Portal>
      <R.Overlay className="sh-overlay" />
      <R.Content className="sh-dialog sh-surface" data-size={size}>
        {size === "palette" ? (
          <R.Title className="sh-sr-only">{title}</R.Title>
        ) : size === "viewer" ? (
          <>
            <R.Title className="sh-sr-only">{title}</R.Title>
            <R.Close asChild>
              <IconButton icon="close" label="Close" size="sm" className="sh-dialog-float-close" />
            </R.Close>
          </>
        ) : (
          <header className="sh-dialog-head">
            <R.Title className="sh-dialog-title">{title}</R.Title>
            <R.Close asChild>
              <IconButton icon="close" label="Close" size="sm" />
            </R.Close>
          </header>
        )}
        {size === "palette" || size === "viewer" ? (
          <>
            <R.Description className="sh-sr-only">{description ?? title}</R.Description>
            {children}
          </>
        ) : (
          // Under the title, the rest scrolls when the window is too short for it (a phone on its side).
          <ScrollArea className="sh-dialog-scroll" viewClassName="sh-dialog-body">
            {description ? (
              <R.Description className="sh-dialog-description">{description}</R.Description>
            ) : (
              <R.Description className="sh-sr-only">{title}</R.Description>
            )}
            {children}
          </ScrollArea>
        )}
      </R.Content>
    </R.Portal>
  );
}
