import { Separator as RSeparator } from "radix-ui";
import type { HTMLAttributes } from "react";
import { cx } from "./Button.tsx";

/** A raised panel: cards, popovers, the infobox. */
export function Surface({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("sh-surface", className)} {...rest} />;
}

export function Separator({ vertical = false }: { vertical?: boolean }) {
  return <RSeparator.Root className="sh-separator" orientation={vertical ? "vertical" : "horizontal"} />;
}
